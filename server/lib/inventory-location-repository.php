<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

/** Location-tracked inventory for reusable subjects. Blank Hat global inventory remains in PdoInventoryRepository. */
final class PdoInventoryLocationRepository
{
    public const SUBJECT_TYPE_CATALOG_FINISHED_HAT = 'catalog_finished_hat';
    public const TRACKING_MODE = 'by_location';
    public const HILLTOP_LOCATION_CODE = 'hilltop_internal';
    public const REASONS = ['initial_count', 'received_built', 'sold', 'correction', 'returned'];

    private PDO $pdo;
    public function __construct(PDO $pdo) { $this->pdo = $pdo; }

    /** @return array<int,array<string,mixed>> */
    public function listLocations(bool $includeInactive = false): array
    {
        $sql = 'SELECT id, location_code, location_name, location_type, status, notes, sort_order, created_at, updated_at FROM forge_inventory_locations'
            . ($includeInactive ? '' : " WHERE status = 'active'") . ' ORDER BY sort_order ASC, location_name ASC, id ASC';
        try { $rows = $this->pdo->query($sql)->fetchAll(); } catch (PDOException $e) { throw new StorageUnavailableException('Inventory storage is currently unavailable.', 0, $e); }
        return is_array($rows) ? array_map(__NAMESPACE__ . '\\normalizeInventoryLocation', $rows) : [];
    }

    /** @param array<string,mixed> $input @return array<string,mixed> */
    public function saveLocation(array $input, ?string $id = null): array
    {
        $code = normalizeInventoryLocationCode($input['location_code'] ?? null);
        $name = normalizeInventoryLocationName($input['location_name'] ?? null);
        $type = normalizeInventoryLocationType($input['location_type'] ?? null);
        $status = normalizeInventoryLocationStatus($input['status'] ?? 'active');
        $notes = normalizeInventoryNote($input['notes'] ?? null);
        if ($code === null || $name === null || $type === null || $status === null) throw new InventoryValidationException('Review the inventory location and try again.');
        $timestamp = gmdate('Y-m-d H:i:s.u');
        try {
            if ($id === null) {
                $id = createInventoryUuid();
                $next = ((int) $this->pdo->query('SELECT COALESCE(MAX(sort_order), 0) + 1000 FROM forge_inventory_locations')->fetchColumn());
                $statement = $this->pdo->prepare('INSERT INTO forge_inventory_locations (id, location_code, location_name, location_type, status, notes, sort_order, created_at, updated_at) VALUES (:id,:code,:name,:type,:status,:notes,:sort_order,:created_at,:updated_at)');
                $statement->execute([':id'=>$id, ':code'=>$code, ':name'=>$name, ':type'=>$type, ':status'=>$status, ':notes'=>$notes, ':sort_order'=>$next, ':created_at'=>$timestamp, ':updated_at'=>$timestamp]);
            } else {
                $statement = $this->pdo->prepare('UPDATE forge_inventory_locations SET location_code=:code, location_name=:name, location_type=:type, status=:status, notes=:notes, updated_at=:updated_at WHERE id=:id');
                $statement->execute([':id'=>$id, ':code'=>$code, ':name'=>$name, ':type'=>$type, ':status'=>$status, ':notes'=>$notes, ':updated_at'=>$timestamp]);
                if ($statement->rowCount() === 0 && $this->location($id) === null) throw new InventoryNotFoundException('That inventory location could not be found.');
            }
        } catch (PDOException $e) { throw new StorageUnavailableException('Inventory storage is currently unavailable.', 0, $e); }
        $location = $this->location($id); if ($location === null) throw new StorageUnavailableException('Inventory storage is currently unavailable.'); return $location;
    }

    /** @return array<string,mixed> */
    public function getFinishedHatInventory(string $subjectId, int $historyLimit = 100): array
    {
        $this->assertSubject($subjectId); $item = $this->item($subjectId, false);
        if ($item === null) return $this->emptySnapshot($subjectId);
        return $this->snapshot($item, $historyLimit);
    }

    /** Explicitly assigns a location, initially Not Counted. @return array<string,mixed> */
    public function assignLocation(string $subjectId, string $locationId): array
    {
        $this->assertSubject($subjectId); $this->assertActiveLocation($locationId); $time = gmdate('Y-m-d H:i:s.u');
        try { $this->pdo->beginTransaction(); $item = $this->ensureItem($subjectId, $time); $balance = $this->balance($item['id'], $locationId, true);
            if ($balance === null) { $s=$this->pdo->prepare('INSERT INTO forge_inventory_location_balances (id,inventory_item_id,inventory_location_id,on_hand_quantity,version,created_at,updated_at) VALUES (:id,:item,:location,NULL,0,:created,:updated)'); $s->execute([':id'=>createInventoryUuid(),':item'=>$item['id'],':location'=>$locationId,':created'=>$time,':updated'=>$time]); }
            $this->pdo->commit(); return $this->snapshot($item, 100);
        } catch (InventoryNotFoundException|InventoryValidationException|StorageUnavailableException $e) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw $e; } catch (PDOException $e) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw new StorageUnavailableException('Inventory storage is currently unavailable.',0,$e); }
    }

    /** Atomically assigns an untracked location and records its first physical count. @return array<string,mixed> */
    public function initialCountLocation(string $subjectId, string $locationId, $targetQuantity): array
    {
        $this->assertSubject($subjectId); $this->assertActiveLocation($locationId); $target = normalizeInventoryTargetQuantity($targetQuantity);
        if ($target === null) throw new InventoryValidationException('Enter a whole-number physical quantity of zero or more.');
        $time = gmdate('Y-m-d H:i:s.u');
        try { $this->pdo->beginTransaction(); $item = $this->ensureItem($subjectId, $time); $balance = $this->balance($item['id'], $locationId, true);
            if ($balance !== null && $balance['on_hand_quantity'] !== null) throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.');
            if ($balance === null) {
                $statement = $this->pdo->prepare('INSERT INTO forge_inventory_location_balances (id,inventory_item_id,inventory_location_id,on_hand_quantity,version,created_at,updated_at) VALUES (:id,:item,:location,:quantity,1,:created,:updated)');
                $statement->execute([':id'=>createInventoryUuid(), ':item'=>$item['id'], ':location'=>$locationId, ':quantity'=>$target, ':created'=>$time, ':updated'=>$time]);
            } else {
                $this->updateBalance($balance, $target, $time);
            }
            $this->movement($item['id'], $locationId, null, $target, 'initial_count', null, null, $time); $this->pdo->commit(); return $this->snapshot($item, 100);
        } catch (InventoryConflictException|InventoryValidationException|InventoryNotFoundException|StorageUnavailableException $e) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw $e; } catch (PDOException $e) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw new StorageUnavailableException('Inventory storage is currently unavailable.', 0, $e); }
    }

    /** @return array<string,mixed> */
    public function adjustLocation(string $subjectId, string $locationId, $expectedQuantity, $expectedVersion, $targetQuantity, $reasonCode, $note = null): array
    {
        $this->assertSubject($subjectId); $expected=normalizeInventoryExpectedQuantity($expectedQuantity); $version=normalizeInventoryVersion($expectedVersion); $target=normalizeInventoryTargetQuantity($targetQuantity); $reason=is_string($reasonCode)?trim($reasonCode):''; $note=normalizeInventoryNote($note);
        if ($version===null || $target===null || ($expectedQuantity!==null && $expected===null) || !in_array($reason,self::REASONS,true)) throw new InventoryValidationException('Review the inventory adjustment and try again.');
        $time=gmdate('Y-m-d H:i:s.u');
        try { $this->pdo->beginTransaction(); $item=$this->ensureItem($subjectId,$time); $balance=$this->balance($item['id'],$locationId,true); if ($balance===null) throw new InventoryValidationException('Assign this location before recording inventory.');
            $current=$balance['on_hand_quantity']; if ($current!==$expected || $balance['version']!==$version) throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.');
            if ($current===null && $reason!=='initial_count') throw new InventoryValidationException('Use Physical Stock Count to record this location for the first time.'); if ($current!==null && $reason==='initial_count') throw new InventoryValidationException('Initial Count is only available while this location is Not Counted.');
            $s=$this->pdo->prepare('UPDATE forge_inventory_location_balances SET on_hand_quantity=:quantity, version=version+1, updated_at=:updated WHERE id=:id AND version=:version'); $s->execute([':quantity'=>$target,':updated'=>$time,':id'=>$balance['id'],':version'=>$version]); if($s->rowCount()!==1) throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.');
            $this->movement($item['id'],$locationId,$current,$target,$reason,$note,null,$time); $this->pdo->commit(); return $this->snapshot($item,100);
        } catch (InventoryConflictException|InventoryValidationException|InventoryNotFoundException|StorageUnavailableException $e) { if($this->pdo->inTransaction())$this->pdo->rollBack(); throw $e; } catch(PDOException $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw new StorageUnavailableException('Inventory storage is currently unavailable.',0,$e);}
    }

    /** @return array<string,mixed> */
    public function transfer(string $subjectId, string $sourceId, string $destinationId, $expectedSourceQuantity, $expectedSourceVersion, $expectedDestinationQuantity, $expectedDestinationVersion, $quantity, $note = null): array
    {
        $this->assertSubject($subjectId); $qty=normalizeInventoryTargetQuantity($quantity); $sq=normalizeInventoryExpectedQuantity($expectedSourceQuantity); $dq=normalizeInventoryExpectedQuantity($expectedDestinationQuantity); $sv=normalizeInventoryVersion($expectedSourceVersion); $dv=normalizeInventoryVersion($expectedDestinationVersion); $note=normalizeInventoryNote($note);
        if($sourceId===$destinationId || $qty===null || $qty<1 || $sq===null || $dq===null || $sv===null || $dv===null) throw new InventoryValidationException('Review the inventory transfer and try again.');
        $time=gmdate('Y-m-d H:i:s.u'); $transferId=createInventoryUuid();
        try {$this->pdo->beginTransaction(); $item=$this->ensureItem($subjectId,$time); $ids=[$sourceId,$destinationId];sort($ids,SORT_STRING);$locked=[];foreach($ids as $id){$locked[$id]=$this->balance($item['id'],$id,true);}
            $source=$locked[$sourceId]??null;$destination=$locked[$destinationId]??null;if($source===null||$destination===null||$source['on_hand_quantity']===null||$destination['on_hand_quantity']===null)throw new InventoryValidationException('Both transfer locations must have a confirmed physical count.');
            if($source['on_hand_quantity']!==$sq||$source['version']!==$sv||$destination['on_hand_quantity']!==$dq||$destination['version']!==$dv)throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.'); if($source['on_hand_quantity']<$qty)throw new InventoryValidationException('Insufficient inventory at the source location.');
            $this->updateBalance($source,$source['on_hand_quantity']-$qty,$time);$this->updateBalance($destination,$destination['on_hand_quantity']+$qty,$time);$this->movement($item['id'],$sourceId,$source['on_hand_quantity'],$source['on_hand_quantity']-$qty,'transfer_out',$note,$transferId,$time);$this->movement($item['id'],$destinationId,$destination['on_hand_quantity'],$destination['on_hand_quantity']+$qty,'transfer_in',$note,$transferId,$time);$this->pdo->commit();return $this->snapshot($item,100);
        }catch(InventoryConflictException|InventoryValidationException|InventoryNotFoundException|StorageUnavailableException $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}catch(PDOException $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw new StorageUnavailableException('Inventory storage is currently unavailable.',0,$e);}
    }

    private function assertSubject(string $id): void { if(normalizeStaffCatalogFinishedHatId($id)===null)throw new InventoryNotFoundException('That inventory record could not be found.'); try{$s=$this->pdo->prepare('SELECT id FROM forge_catalog_finished_hats WHERE id=:id LIMIT 1');$s->execute([':id'=>$id]);if(!$s->fetch())throw new InventoryNotFoundException('That inventory record could not be found.');}catch(PDOException $e){throw new StorageUnavailableException('Inventory storage is currently unavailable.',0,$e);} }
    /** @return array<string,mixed>|null */ private function item(string $subjectId,bool $lock):?array{$s=$this->pdo->prepare('SELECT id,subject_type,subject_id,tracking_mode,created_at,updated_at FROM forge_inventory_items WHERE subject_type=:type AND subject_id=:id LIMIT 1'.($lock?' FOR UPDATE':''));$s->execute([':type'=>self::SUBJECT_TYPE_CATALOG_FINISHED_HAT,':id'=>$subjectId]);$r=$s->fetch();return is_array($r)?$r:null;}
    /** @return array<string,mixed> */ private function ensureItem(string $subjectId,string $time):array{$item=$this->item($subjectId,true);if($item!==null)return $item;$id=createInventoryUuid();$s=$this->pdo->prepare("INSERT INTO forge_inventory_items (id,subject_type,subject_id,tracking_mode,on_hand_quantity,version,created_at,updated_at) VALUES (:id,:type,:subject,'by_location',NULL,0,:created,:updated)");$s->execute([':id'=>$id,':type'=>self::SUBJECT_TYPE_CATALOG_FINISHED_HAT,':subject'=>$subjectId,':created'=>$time,':updated'=>$time]);return $this->item($subjectId,false)??throw new StorageUnavailableException('Inventory storage is currently unavailable.');}
    /** @return array<string,mixed>|null */ private function balance(string $item,string $location,bool $lock):?array{$s=$this->pdo->prepare('SELECT id,inventory_location_id,on_hand_quantity,version,created_at,updated_at FROM forge_inventory_location_balances WHERE inventory_item_id=:item AND inventory_location_id=:location LIMIT 1'.($lock?' FOR UPDATE':''));$s->execute([':item'=>$item,':location'=>$location]);$r=$s->fetch();return is_array($r)?normalizeInventoryLocationBalance($r):null;}
    private function updateBalance(array $balance,int $target,string $time):void{$s=$this->pdo->prepare('UPDATE forge_inventory_location_balances SET on_hand_quantity=:quantity,version=version+1,updated_at=:updated WHERE id=:id AND version=:version');$s->execute([':quantity'=>$target,':updated'=>$time,':id'=>$balance['id'],':version'=>$balance['version']]);if($s->rowCount()!==1)throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.');}
    private function movement(string $item,string $location,?int $before,int $after,string $reason,?string $note,?string $transfer,string $time):void{$s=$this->pdo->prepare('INSERT INTO forge_inventory_movements (id,inventory_item_id,inventory_location_id,movement_type,reason_code,quantity_before,quantity_after,quantity_delta,note,transfer_id,created_at) VALUES (:id,:item,:location,:type,:reason,:before,:after,:delta,:note,:transfer,:created)');$s->execute([':id'=>createInventoryUuid(),':item'=>$item,':location'=>$location,':type'=>$before===null?'count':($transfer===null?'adjustment':'transfer'),':reason'=>$reason,':before'=>$before,':after'=>$after,':delta'=>$before===null?null:$after-$before,':note'=>$note,':transfer'=>$transfer,':created'=>$time]);}
    /** @return array<string,mixed> */ private function snapshot(array $item,int $limit):array{$s=$this->pdo->prepare("SELECT b.id,b.inventory_location_id,b.on_hand_quantity,b.version,b.created_at,b.updated_at,l.location_code,l.location_name,l.location_type,l.status FROM forge_inventory_location_balances b JOIN forge_inventory_locations l ON l.id=b.inventory_location_id WHERE b.inventory_item_id=:item ORDER BY l.sort_order,l.location_name,l.id");$s->execute([':item'=>$item['id']]);$balances=array_map(__NAMESPACE__.'\\normalizeInventoryLocationBalance',$s->fetchAll()?:[]);$counted=array_filter($balances,static fn($b)=>$b['on_hand_quantity']!==null);$uncounted=count($balances)-count($counted);$sum=array_sum(array_map(static fn($b)=>(int)$b['on_hand_quantity'],$counted));$m=$this->pdo->prepare('SELECT m.id,m.movement_type,m.reason_code,m.quantity_before,m.quantity_after,m.quantity_delta,m.note,m.transfer_id,m.created_at,m.inventory_location_id,l.location_name FROM forge_inventory_movements m JOIN forge_inventory_locations l ON l.id=m.inventory_location_id WHERE m.inventory_item_id=:item ORDER BY m.created_at DESC,m.id DESC LIMIT '.max(1,min(200,$limit)));$m->execute([':item'=>$item['id']]);return ['subject_type'=>self::SUBJECT_TYPE_CATALOG_FINISHED_HAT,'subject_id'=>$item['subject_id'],'tracking_mode'=>self::TRACKING_MODE,'assigned_location_count'=>count($balances),'counted_location_count'=>count($counted),'not_counted_location_count'=>$uncounted,'derived_quantity'=>$sum,'completeness'=>$balances===[]?'not_counted':($uncounted>0?'partial':'complete'),'balances'=>$balances,'movements'=>array_map(__NAMESPACE__.'\\normalizeInventoryMovement',$m->fetchAll()?:[])];}
    /** @return array<string,mixed> */ private function emptySnapshot(string $id):array{return ['subject_type'=>self::SUBJECT_TYPE_CATALOG_FINISHED_HAT,'subject_id'=>$id,'tracking_mode'=>self::TRACKING_MODE,'assigned_location_count'=>0,'counted_location_count'=>0,'not_counted_location_count'=>0,'derived_quantity'=>null,'completeness'=>'not_counted','balances'=>[],'movements'=>[]];}
    /** @return array<string,mixed>|null */ private function location(string $id):?array{try{$s=$this->pdo->prepare('SELECT id,location_code,location_name,location_type,status,notes,sort_order,created_at,updated_at FROM forge_inventory_locations WHERE id=:id LIMIT 1');$s->execute([':id'=>$id]);$r=$s->fetch();return is_array($r)?normalizeInventoryLocation($r):null;}catch(PDOException $e){throw new StorageUnavailableException('Inventory storage is currently unavailable.',0,$e);}}
    private function assertActiveLocation(string $id):void{$l=$this->location($id);if($l===null||$l['status']!=='active')throw new InventoryValidationException('Select an active inventory location.');}
}

function normalizeInventoryLocationCode($value): ?string { $v=is_string($value)?strtolower(trim($value)):''; return preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/',$v)?$v:null; }
function normalizeInventoryLocationName($value): ?string { $v=is_string($value)?trim($value):''; return $v!==''&&mb_strlen($v)<=160?$v:null; }
function normalizeInventoryLocationType($value): ?string { $v=is_string($value)?trim($value):''; return in_array($v,['internal','boutique','external','consignment'],true)?$v:null; }
function normalizeInventoryLocationStatus($value): ?string { $v=is_string($value)?trim($value):''; return in_array($v,['active','inactive'],true)?$v:null; }
function normalizeInventoryLocation($row): array { $r=is_array($row)?$row:[];return ['id'=>trim((string)($r['id']??'')),'location_code'=>trim((string)($r['location_code']??'')),'location_name'=>trim((string)($r['location_name']??'')),'location_type'=>trim((string)($r['location_type']??'')),'status'=>trim((string)($r['status']??'')),'notes'=>isset($r['notes'])&&trim((string)$r['notes'])!==''?trim((string)$r['notes']):null,'sort_order'=>(int)($r['sort_order']??0)]; }
function normalizeInventoryLocationBalance($row): array { $r=is_array($row)?$row:[];return ['id'=>trim((string)($r['id']??'')),'inventory_location_id'=>trim((string)($r['inventory_location_id']??'')),'location_code'=>trim((string)($r['location_code']??'')),'location_name'=>trim((string)($r['location_name']??'')),'location_type'=>trim((string)($r['location_type']??'')),'location_status'=>trim((string)($r['status']??'')),'on_hand_quantity'=>isset($r['on_hand_quantity'])?(int)$r['on_hand_quantity']:null,'version'=>(int)($r['version']??0),'updated_at'=>isset($r['updated_at'])?trim((string)$r['updated_at']):null]; }
