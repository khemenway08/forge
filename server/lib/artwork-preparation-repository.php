<?php
declare(strict_types=1);

namespace Forge\Server;

use InvalidArgumentException;
use JsonException;
use PDO;
use PDOException;

final class ArtworkPreparationNotReadyException extends \RuntimeException {}
final class ArtworkPreparationConflictException extends \RuntimeException {}

final class PdoArtworkPreparationRepository
{
    private PDO $pdo;
    private PdoArtworkTemplateRepository $templates;

    public function __construct(PDO $pdo, ?PdoArtworkTemplateRepository $templates = null)
    {
        $this->pdo = $pdo;
        $this->templates = $templates ?? new PdoArtworkTemplateRepository($pdo);
    }

    /** @return array{prepare_token:string,expires_at:string,association:array<string,mixed>} */
    public function issuePrepareToken(string $orderUuid, string $lineId, int $ttlSeconds = 300): array
    {
        $orderUuid = trim($orderUuid); $lineId = trim($lineId);
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $orderUuid) || $lineId === '') {
            throw new InvalidArgumentException('A valid Forge order and line item are required.');
        }
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        try {
            $this->pdo->beginTransaction();
            $sql = 'SELECT forge_order_uuid,forge_order_number,submitted_at,payload_json,production_status FROM forge_orders WHERE forge_order_uuid=:uuid';
            if ($this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') $sql .= ' FOR UPDATE';
            $statement = $this->pdo->prepare($sql); $statement->execute([':uuid'=>$orderUuid]); $order = $statement->fetch();
            if (!is_array($order)) throw new StaffOrderNotFoundException('That order could not be found.');
            if (in_array(strtolower(trim((string)$order['production_status'])), ['cancelled','completed'], true)) throw new ArtworkPreparationConflictException('Artwork cannot be prepared for a completed or cancelled order.');
            $payload = json_decode((string)$order['payload_json'], true, 512, JSON_THROW_ON_ERROR);
            $item = null;
            foreach (is_array($payload['items'] ?? null) ? $payload['items'] : [] as $candidate) if (is_array($candidate) && trim((string)($candidate['line_id'] ?? '')) === $lineId) {$item=$candidate;break;}
            if ($item === null) throw new ProductionOrderItemNotFoundException('That saved item could not be found.');
            $registrations = $this->templates->listActiveRegistrationsByProduct();
            $readiness = resolveArtworkTemplateReadiness($item, $registrations);
            if ($readiness === null || ($readiness['state'] ?? '') !== ARTWORK_READY) throw new ArtworkPreparationNotReadyException(artworkPreparationReadinessMessage($readiness));
            $productId = trim((string)($item['product_definition_id'] ?? ''));
            $registration = $registrations[$productId] ?? null;
            if (!is_array($registration)) throw new ArtworkPreparationNotReadyException('Artwork template is not configured.');
            $variantKey = trim((string)($readiness['variant_key'] ?? ''));
            $association = $this->loadAssociationForLine($orderUuid, $lineId);
            if ($association === null) {
                [$year,$folder,$baseFilename] = buildArtworkDestinationParts($order, $payload, $item, $variantKey);
                $filename = $this->reserveFilename($year, $folder, $baseFilename);
                $association = [
                    'artwork_file_id'=>createArtworkUuid(),'forge_order_uuid'=>$orderUuid,'line_id'=>$lineId,
                    'registration_id'=>$registration['registration_id'],'product_definition_id'=>$productId,'variant_key'=>$variantKey,
                    'configuration_revision'=>(int)$registration['configuration_revision'],'configuration_digest'=>(string)$registration['configuration_digest'],
                    'order_year'=>$year,'customer_folder_name'=>$folder,'live_filename'=>$filename,
                    'relative_live_path'=>$year.'/'.$folder.'/'.$filename,'preparation_status'=>'pending','created_at'=>artworkFormatDate($now),'updated_at'=>artworkFormatDate($now),
                ];
                $insert=$this->pdo->prepare('INSERT INTO forge_order_artwork_files (artwork_file_id,forge_order_uuid,line_id,registration_id,product_definition_id,variant_key,configuration_revision,configuration_digest,order_year,customer_folder_name,live_filename,relative_live_path,preparation_status,created_at,updated_at) VALUES (:id,:uuid,:line,:registration,:product,:variant,:revision,:digest,:year,:folder,:filename,:path,:status,:created,:updated)');
                $insert->execute([':id'=>$association['artwork_file_id'],':uuid'=>$orderUuid,':line'=>$lineId,':registration'=>$association['registration_id'],':product'=>$productId,':variant'=>$variantKey,':revision'=>$association['configuration_revision'],':digest'=>$association['configuration_digest'],':year'=>$year,':folder'=>$folder,':filename'=>$filename,':path'=>$association['relative_live_path'],':status'=>'pending',':created'=>$association['created_at'],':updated'=>$association['updated_at']]);
            } elseif ($association['registration_id'] !== $registration['registration_id'] || (int)$association['configuration_revision'] !== (int)$registration['configuration_revision'] || !hash_equals((string)$association['configuration_digest'], (string)$registration['configuration_digest']) || $association['variant_key'] !== $variantKey) {
                throw new ArtworkPreparationConflictException('The existing LIVE artwork association does not match the current template configuration.');
            }
            $token=bin2hex(random_bytes(32)); $expires=$now->modify('+'.max(30,min(600,$ttlSeconds)).' seconds');
            $insert=$this->pdo->prepare('INSERT INTO forge_artwork_prepare_tokens (token_hash,artwork_file_id,configuration_revision,configuration_digest,expires_at,consumed_at,created_at) VALUES (:hash,:id,:revision,:digest,:expires,NULL,:created)');
            $insert->execute([':hash'=>hash('sha256',$token),':id'=>$association['artwork_file_id'],':revision'=>$association['configuration_revision'],':digest'=>$association['configuration_digest'],':expires'=>artworkFormatDate($expires),':created'=>artworkFormatDate($now)]);
            $this->pdo->commit();
            return ['prepare_token'=>$token,'expires_at'=>$expires->format(\DateTimeInterface::ATOM),'association'=>publicArtworkAssociation($association)];
        } catch (StaffOrderNotFoundException|ProductionOrderItemNotFoundException|ArtworkPreparationNotReadyException|ArtworkPreparationConflictException|InvalidArgumentException $e) {if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}
        catch (PDOException|JsonException $e) {if($this->pdo->inTransaction())$this->pdo->rollBack();throw new StorageUnavailableException('Artwork preparation could not be started.',0,$e);}
    }

    /** @return array{report_token:string,expires_at:string,preparation:array<string,mixed>} */
    public function exchangePrepareToken(string $token, int $ttlSeconds = 900): array
    {
        $hash=hash('sha256',normalizeArtworkToken($token)); $now=new \DateTimeImmutable('now',new \DateTimeZone('UTC'));
        try{$this->pdo->beginTransaction();$select=$this->pdo->prepare('SELECT * FROM forge_artwork_prepare_tokens WHERE token_hash=:hash');$select->execute([':hash'=>$hash]);$row=$select->fetch();
            if(!is_array($row)||$row['consumed_at']!==null||(string)$row['expires_at']<=artworkFormatDate($now))throw new InvalidArgumentException('The artwork preparation token is invalid or expired.');
            $association=$this->loadAssociationById((string)$row['artwork_file_id']);if($association===null||!artworkAssociationMatchesToken($association,$row))throw new ArtworkPreparationConflictException('The artwork preparation association changed. Start again.');
            $registrations=$this->templates->listActiveRegistrationsByProduct();$registration=$registrations[$association['product_definition_id']]??null;
            if(!is_array($registration)||$registration['registration_id']!==$association['registration_id']||(int)$registration['configuration_revision']!==(int)$association['configuration_revision']||!hash_equals((string)$registration['configuration_digest'],(string)$association['configuration_digest']))throw new ArtworkPreparationNotReadyException('The configured artwork template changed. Validate it and start again.');
            $validation=$registration['validations'][$association['variant_key']]??null;if(!is_array($validation)||($validation['validation_status']??'')!=='valid'||(int)($validation['configuration_revision']??-1)!==(int)$association['configuration_revision']||!hash_equals((string)$association['configuration_digest'],(string)($validation['configuration_digest']??'')))throw new ArtworkPreparationNotReadyException('The configured artwork master is not currently valid.');
            $consume=$this->pdo->prepare('UPDATE forge_artwork_prepare_tokens SET consumed_at=:now WHERE token_hash=:hash AND consumed_at IS NULL');$consume->execute([':now'=>artworkFormatDate($now),':hash'=>$hash]);if($consume->rowCount()!==1)throw new InvalidArgumentException('The artwork preparation token has already been used.');
            $reportToken=bin2hex(random_bytes(32));$expires=$now->modify('+'.max(60,min(1800,$ttlSeconds)).' seconds');$insert=$this->pdo->prepare('INSERT INTO forge_artwork_prepare_report_tokens (token_hash,artwork_file_id,configuration_revision,configuration_digest,expires_at,consumed_at,created_at) VALUES (:hash,:id,:revision,:digest,:expires,NULL,:created)');$insert->execute([':hash'=>hash('sha256',$reportToken),':id'=>$association['artwork_file_id'],':revision'=>$association['configuration_revision'],':digest'=>$association['configuration_digest'],':expires'=>artworkFormatDate($expires),':created'=>artworkFormatDate($now)]);
            $this->pdo->commit();return ['report_token'=>$reportToken,'expires_at'=>$expires->format(\DateTimeInterface::ATOM),'preparation'=>array_merge(publicArtworkAssociation($association),['launcher_family_id'=>$registration['launcher_family_id'],'configuration_revision'=>(int)$association['configuration_revision'],'configuration_digest'=>(string)$association['configuration_digest'],'expected_master_filename'=>resolveArtworkMasterFilename($registration,$association['variant_key'])])];
        }catch(InvalidArgumentException|ArtworkPreparationConflictException|ArtworkPreparationNotReadyException $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}catch(PDOException $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw new StorageUnavailableException('Artwork preparation could not be verified.',0,$e);}
    }

    /** @return array<string,mixed> */
    public function reportPreparation(string $token,string $profile,string $status,?string $masterHash,?string $liveHash,?string $errorCode): array
    {
        $hash=hash('sha256',normalizeArtworkToken($token));$profile=normalizeArtworkSafeLabel($profile,128,'A launcher profile label is required.');$status=strtolower(trim($status));if(!in_array($status,['prepared','failed'],true))throw new InvalidArgumentException('A valid artwork preparation result is required.');
        $masterHash=normalizeOptionalArtworkHash($masterHash);$liveHash=normalizeOptionalArtworkHash($liveHash);$errorCode=$status==='failed'?normalizeArtworkPreparationError($errorCode):null;if($status==='prepared'&&($masterHash===null||$liveHash===null||!hash_equals($masterHash,$liveHash)))throw new InvalidArgumentException('The LIVE copy must match the configured master.');
        $now=new \DateTimeImmutable('now',new \DateTimeZone('UTC'));
        try{$this->pdo->beginTransaction();$select=$this->pdo->prepare('SELECT * FROM forge_artwork_prepare_report_tokens WHERE token_hash=:hash');$select->execute([':hash'=>$hash]);$row=$select->fetch();if(!is_array($row)||$row['consumed_at']!==null||(string)$row['expires_at']<=artworkFormatDate($now))throw new InvalidArgumentException('The artwork preparation report token is invalid or expired.');$association=$this->loadAssociationById((string)$row['artwork_file_id']);if($association===null||!artworkAssociationMatchesToken($association,$row))throw new ArtworkPreparationConflictException('The artwork preparation association changed. Start again.');
            $update=$this->pdo->prepare('UPDATE forge_order_artwork_files SET preparation_status=:status,launcher_profile_label=:profile,master_sha256=:master,live_sha256=:live,prepared_at=:prepared,last_error_code=:error,updated_at=:updated WHERE artwork_file_id=:id');$update->execute([':status'=>$status,':profile'=>$profile,':master'=>$masterHash,':live'=>$liveHash,':prepared'=>$status==='prepared'?artworkFormatDate($now):null,':error'=>$errorCode,':updated'=>artworkFormatDate($now),':id'=>$association['artwork_file_id']]);$consume=$this->pdo->prepare('UPDATE forge_artwork_prepare_report_tokens SET consumed_at=:now WHERE token_hash=:hash AND consumed_at IS NULL');$consume->execute([':now'=>artworkFormatDate($now),':hash'=>$hash]);if($consume->rowCount()!==1)throw new InvalidArgumentException('The artwork preparation report token has already been used.');$this->pdo->commit();return publicArtworkAssociation($this->loadAssociationById($association['artwork_file_id'])??$association);
        }catch(InvalidArgumentException|ArtworkPreparationConflictException $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}catch(PDOException $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw new StorageUnavailableException('Artwork preparation result could not be saved.',0,$e);}
    }

    /** @return array<string,array<string,array<string,mixed>>> */
    public function listAssociationsForOrders(array $orderUuids): array
    { $ids=array_values(array_unique(array_filter(array_map('trim',$orderUuids))));if($ids===[])return[];$marks=implode(',',array_fill(0,count($ids),'?'));try{$s=$this->pdo->prepare('SELECT * FROM forge_order_artwork_files WHERE forge_order_uuid IN ('.$marks.')');$s->execute($ids);$rows=$s->fetchAll();}catch(PDOException $e){throw new StorageUnavailableException('Artwork file associations could not be loaded.',0,$e);}$out=[];foreach(is_array($rows)?$rows:[] as $row)$out[$row['forge_order_uuid']][$row['line_id']]=publicArtworkAssociation($row);return$out; }
    private function loadAssociationForLine(string $uuid,string $line):?array{$s=$this->pdo->prepare('SELECT * FROM forge_order_artwork_files WHERE forge_order_uuid=:uuid AND line_id=:line LIMIT 1');$s->execute([':uuid'=>$uuid,':line'=>$line]);$r=$s->fetch();return is_array($r)?$r:null;}
    private function loadAssociationById(string $id):?array{$s=$this->pdo->prepare('SELECT * FROM forge_order_artwork_files WHERE artwork_file_id=:id LIMIT 1');$s->execute([':id'=>$id]);$r=$s->fetch();return is_array($r)?$r:null;}
    private function reserveFilename(int $year,string $folder,string $base):string{$stem=substr($base,0,-8);$suffix='_LIVE.ai';$candidate=$base;$n=2;while(true){$s=$this->pdo->prepare('SELECT COUNT(*) FROM forge_order_artwork_files WHERE relative_live_path=:path');$s->execute([':path'=>$year.'/'.$folder.'/'.$candidate]);if((int)$s->fetchColumn()===0)return$candidate;$candidate=$stem.'-'.$n.$suffix;$n++;if($n>999)throw new ArtworkPreparationConflictException('A unique LIVE artwork filename could not be reserved.');}}
}

function artworkPreparationReadinessMessage(?array $readiness):string{$state=$readiness['state']??'';if($state===ARTWORK_TEMPLATE_NOT_CONFIGURED)return'Artwork template is not configured.';if($state===ARTWORK_UNSUPPORTED_VARIANT)return'This artwork variant is not supported.';return'The configured artwork template has a validation problem.';}
function resolveArtworkMasterFilename(array $registration,string $variant):string{$selector=$registration['selector_type']??'';$config=is_array($registration['resolution_config']??null)?$registration['resolution_config']:[];if($selector==='none')$name=$config['filename']??'';elseif($selector==='size')$name=is_array($config['filenames']??null)?($config['filenames'][$variant]??''):'';else $name=str_replace('{count}',$variant,(string)($config['pattern']??''));return normalizeArtworkMasterFilename($name);}
function buildArtworkDestinationParts(array $order,array $payload,array $item,string $variant):array{$customer=is_array($payload['customer']??null)?$payload['customer']:[];$first=trim((string)($customer['first_name']??''));$last=trim((string)($customer['last_name']??''));if($first===''||$last===''){ $parts=preg_split('/\s+/',trim((string)($customer['full_name']??'')))?:[];if(count($parts)>=2){$first=$first!==''?$first:(string)array_shift($parts);$last=$last!==''?$last:implode(' ',$parts);}}if($first===''||$last==='')throw new ArtworkPreparationConflictException('A customer first and last name are required to prepare artwork.');$number=(int)($order['forge_order_number']??($payload['forge_order_number']??0));if($number<1)throw new ArtworkPreparationConflictException('A Forge order number is required to prepare artwork.');try{$date=new \DateTimeImmutable((string)($order['submitted_at']??($payload['submitted_at']??'')));}catch(\Throwable $e){throw new ArtworkPreparationConflictException('A valid submitted date is required to prepare artwork.');}$year=(int)$date->format('Y');$first=artworkFilenameComponent($first);$last=artworkFilenameComponent($last);$type=artworkProductFilenameComponent((string)($item['product_definition_id']??''),$variant);$folder=$last.'_'.$first.'_'.$number;return[$year,$folder,$last.'_'.$first.'_'.$type.'_LIVE.ai'];}
function artworkFilenameComponent(string $value):string{$v=strtoupper(trim($value));$v=preg_replace('/[^A-Z0-9]+/','-',$v)??'';$v=trim($v,'-');if($v==='')throw new ArtworkPreparationConflictException('Customer artwork naming data is invalid.');return$v;}
function artworkProductFilenameComponent(string $product,string $variant):string{$map=['tree_ornament'=>'CHRISTMAS-TREE','antler_ornament'=>'ANTLER','babys_first_christmas'=>'BABYS-FIRST-CHRISTMAS','mr_and_mrs_christmas'=>'MR-AND-MRS-CHRISTMAS','little_reindeer_letter'=>'LITTLE-REINDEER-LETTER','present_stack'=>'PRESENT-STACK','grinch_tree'=>'GRINCH-TREE','large_tree_frame'=>'LARGE-TREE-FRAME','veteran_flag'=>'VETERAN-FLAG'];if(!isset($map[$product]))throw new ArtworkPreparationConflictException('This product has no approved artwork filename mapping.');$base=$map[$product];if($product==='tree_ornament')$base.='-'.artworkFilenameComponent($variant);if($product==='antler_ornament')$base.='-'.artworkFilenameComponent($variant).'-NAME';return$base;}
function publicArtworkAssociation(array $row):array{return['artwork_file_id'=>(string)$row['artwork_file_id'],'line_id'=>(string)$row['line_id'],'product_definition_id'=>(string)$row['product_definition_id'],'variant_key'=>(string)$row['variant_key'],'order_year'=>(int)$row['order_year'],'customer_folder_name'=>(string)$row['customer_folder_name'],'live_filename'=>(string)$row['live_filename'],'relative_live_path'=>(string)$row['relative_live_path'],'status'=>(string)$row['preparation_status'],'prepared_at'=>normalizeArtworkValidationTimestamp($row['prepared_at']??null),'last_error_code'=>normalizeArtworkErrorCode($row['last_error_code']??null)];}
function artworkAssociationMatchesToken(array $association,array $token):bool{return(int)$association['configuration_revision']===(int)$token['configuration_revision']&&hash_equals((string)$association['configuration_digest'],(string)$token['configuration_digest']);}
function normalizeOptionalArtworkHash(?string $hash):?string{$v=strtolower(trim((string)$hash));if($v==='')return null;if(!preg_match('/^[a-f0-9]{64}$/',$v))throw new InvalidArgumentException('A valid artwork SHA-256 value is required.');return$v;}
function normalizeArtworkPreparationError(?string $value):string{$v=normalizeArtworkErrorCode($value);$allowed=['master_missing','configuration_mismatch','outside_approved_root','symlink_rejected','not_regular_file','not_readable','destination_unavailable','destination_exists','copy_failed','copy_verification_failed','open_failed','bridge_unavailable'];return$v!==null&&in_array($v,$allowed,true)?$v:'preparation_failed';}
function applyArtworkAssociationsToStaffOrderRecord(array $record,array $byLine):array{$payload=is_array($record['payload']??null)?$record['payload']:[];$items=[];foreach(is_array($payload['items']??null)?$payload['items']:[] as $item){if(is_array($item)){ $line=trim((string)($item['line_id']??''));if(isset($byLine[$line]))$item['artwork_file']=$byLine[$line];}$items[]=$item;}$payload['items']=$items;$record['payload']=$payload;return$record;}
