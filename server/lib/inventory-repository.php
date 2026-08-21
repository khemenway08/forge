<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class InventoryNotFoundException extends \RuntimeException {}
final class InventoryConflictException extends \RuntimeException {}
final class InventoryValidationException extends \RuntimeException {}

final class PdoInventoryRepository
{
    public const SUBJECT_TYPE_CATALOG_HAT = 'catalog_hat';
    public const REASON_INITIAL_COUNT = 'initial_count';
    public const REASON_RECEIVED = 'received';
    public const REASON_USED_REMOVED = 'used_removed';
    public const REASON_CORRECTION = 'correction';

    private PDO $pdo;

    public function __construct(PDO $pdo) { $this->pdo = $pdo; }

    /** @return array<string, mixed> */
    public function getSubjectInventory(string $subjectType, string $subjectId, int $historyLimit = 100): array
    {
        $this->assertSubjectExists($subjectType, $subjectId);
        $item = $this->loadItem($subjectType, $subjectId, false);
        if ($item === null) {
            return $this->virtualSnapshot($subjectType, $subjectId);
        }
        return $this->snapshotForItem($item, $historyLimit);
    }

    /** @return array<string, mixed> */
    public function adjustSubjectInventory(string $subjectType, string $subjectId, $expectedQuantity, $expectedVersion, $targetQuantity, $reasonCode, $note = null): array
    {
        $this->assertSubjectExists($subjectType, $subjectId);
        $expected = normalizeInventoryExpectedQuantity($expectedQuantity);
        $version = normalizeInventoryVersion($expectedVersion);
        $target = normalizeInventoryTargetQuantity($targetQuantity);
        $reason = normalizeInventoryReasonCode($reasonCode);
        $normalizedNote = normalizeInventoryNote($note);
        if ($version === null || $target === null || $reason === null || ($expectedQuantity !== null && $expected === null)) {
            throw new InventoryValidationException('Review the inventory adjustment and try again.');
        }

        $timestamp = gmdate('Y-m-d H:i:s.u');
        try {
            $this->pdo->beginTransaction();
            $item = $this->loadItem($subjectType, $subjectId, true);
            if ($item === null) {
                if ($expected !== null || $version !== 0) {
                    throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.');
                }
                $item = $this->insertItem($subjectType, $subjectId, $target, $timestamp);
                $this->insertMovement($item['id'], null, $target, self::REASON_INITIAL_COUNT, $normalizedNote, $timestamp);
                $this->pdo->commit();
                return $this->snapshotForItem($item, 100);
            }

            $current = $item['on_hand_quantity'];
            if ($current !== $expected || (int) $item['version'] !== $version) {
                throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.');
            }
            if ($current === null && $reason !== self::REASON_INITIAL_COUNT) {
                throw new InventoryValidationException('Use Physical Stock Count to record this hat for the first time.');
            }
            if ($current !== null && $reason === self::REASON_INITIAL_COUNT) {
                throw new InventoryValidationException('Initial Count is only available while this hat is Not Counted.');
            }

            $update = $this->pdo->prepare(
                'UPDATE forge_inventory_items
                 SET on_hand_quantity = :target, version = version + 1, updated_at = :updated_at
                 WHERE id = :id AND version = :version'
            );
            $update->execute([':target' => $target, ':updated_at' => $timestamp, ':id' => $item['id'], ':version' => $version]);
            if ($update->rowCount() !== 1) {
                throw new InventoryConflictException('This inventory record was updated elsewhere. Reload and try again.');
            }
            $this->insertMovement($item['id'], $current, $target, $reason, $normalizedNote, $timestamp);
            $updated = $this->loadItemById($item['id'], false);
            if ($updated === null) {
                throw new StorageUnavailableException('Inventory storage is currently unavailable.');
            }
            $this->pdo->commit();
            return $this->snapshotForItem($updated, 100);
        } catch (InventoryConflictException | InventoryValidationException | InventoryNotFoundException | StorageUnavailableException $exception) {
            if ($this->pdo->inTransaction()) { $this->pdo->rollBack(); }
            throw $exception;
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) { $this->pdo->rollBack(); }
            throw new StorageUnavailableException('Inventory storage is currently unavailable.', 0, $exception);
        }
    }

    /** @return array<string, mixed>|null */
    private function loadItem(string $subjectType, string $subjectId, bool $forUpdate): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, subject_type, subject_id, on_hand_quantity, version, created_at, updated_at
             FROM forge_inventory_items WHERE subject_type = :subject_type AND subject_id = :subject_id LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $statement->execute([':subject_type' => $subjectType, ':subject_id' => $subjectId]);
        $row = $statement->fetch();
        return is_array($row) ? normalizeInventoryItem($row) : null;
    }

    /** @return array<string, mixed>|null */
    private function loadItemById(string $id, bool $forUpdate): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, subject_type, subject_id, on_hand_quantity, version, created_at, updated_at
             FROM forge_inventory_items WHERE id = :id LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $statement->execute([':id' => $id]);
        $row = $statement->fetch();
        return is_array($row) ? normalizeInventoryItem($row) : null;
    }

    /** @return array<string, mixed> */
    private function insertItem(string $subjectType, string $subjectId, int $target, string $timestamp): array
    {
        $id = createInventoryUuid();
        $statement = $this->pdo->prepare(
            'INSERT INTO forge_inventory_items (id, subject_type, subject_id, on_hand_quantity, version, created_at, updated_at)
             VALUES (:id, :subject_type, :subject_id, :on_hand_quantity, 1, :created_at, :updated_at)'
        );
        $statement->execute([':id' => $id, ':subject_type' => $subjectType, ':subject_id' => $subjectId, ':on_hand_quantity' => $target, ':created_at' => $timestamp, ':updated_at' => $timestamp]);
        $item = $this->loadItemById($id, false);
        if ($item === null) { throw new StorageUnavailableException('Inventory storage is currently unavailable.'); }
        return $item;
    }

    private function insertMovement(string $itemId, ?int $before, int $after, string $reason, ?string $note, string $timestamp): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO forge_inventory_movements (id, inventory_item_id, movement_type, reason_code, quantity_before, quantity_after, quantity_delta, note, created_at)
             VALUES (:id, :inventory_item_id, :movement_type, :reason_code, :quantity_before, :quantity_after, :quantity_delta, :note, :created_at)'
        );
        $statement->execute([
            ':id' => createInventoryUuid(), ':inventory_item_id' => $itemId,
            ':movement_type' => $before === null ? 'count' : 'adjustment', ':reason_code' => $reason,
            ':quantity_before' => $before, ':quantity_after' => $after,
            ':quantity_delta' => $before === null ? null : $after - $before,
            ':note' => $note, ':created_at' => $timestamp,
        ]);
    }

    /** @return array<string, mixed> */
    private function snapshotForItem(array $item, int $historyLimit): array
    {
        $limit = max(1, min(200, $historyLimit));
        $statement = $this->pdo->prepare(
            'SELECT id, movement_type, reason_code, quantity_before, quantity_after, quantity_delta, note, created_at
             FROM forge_inventory_movements WHERE inventory_item_id = :id ORDER BY created_at DESC, id DESC LIMIT ' . $limit
        );
        $statement->execute([':id' => $item['id']]);
        $rows = $statement->fetchAll();
        return ['subject_type' => $item['subject_type'], 'subject_id' => $item['subject_id'], 'counted' => $item['on_hand_quantity'] !== null,
            'on_hand_quantity' => $item['on_hand_quantity'], 'version' => $item['version'], 'updated_at' => $item['updated_at'],
            'movements' => is_array($rows) ? array_map('Forge\\Server\\normalizeInventoryMovement', $rows) : []];
    }

    /** @return array<string, mixed> */
    private function virtualSnapshot(string $subjectType, string $subjectId): array
    {
        return ['subject_type' => $subjectType, 'subject_id' => $subjectId, 'counted' => false, 'on_hand_quantity' => null, 'version' => 0, 'updated_at' => null, 'movements' => []];
    }

    private function assertSubjectExists(string $subjectType, string $subjectId): void
    {
        if ($subjectType !== self::SUBJECT_TYPE_CATALOG_HAT || normalizeStaffCatalogHatId($subjectId) === null) {
            throw new InventoryNotFoundException('That inventory record could not be found.');
        }
        $statement = $this->pdo->prepare('SELECT id FROM forge_catalog_hats WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $subjectId]);
        if (!$statement->fetch()) { throw new InventoryNotFoundException('That inventory record could not be found.'); }
    }
}

function createInventoryUuid(): string { $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40); $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80); $hex = bin2hex($bytes); return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20); }
function normalizeInventoryExpectedQuantity($value): ?int { if ($value === null) { return null; } return normalizeInventoryTargetQuantity($value); }
function normalizeInventoryTargetQuantity($value): ?int { if (is_int($value) && $value >= 0) { return $value; } if (is_string($value) && preg_match('/^\d+$/', trim($value))) { return (int) trim($value); } return null; }
function normalizeInventoryVersion($value): ?int { return normalizeInventoryTargetQuantity($value); }
function normalizeInventoryReasonCode($value): ?string { $code = is_string($value) ? trim($value) : ''; return in_array($code, [PdoInventoryRepository::REASON_INITIAL_COUNT, PdoInventoryRepository::REASON_RECEIVED, PdoInventoryRepository::REASON_USED_REMOVED, PdoInventoryRepository::REASON_CORRECTION], true) ? $code : null; }
function normalizeInventoryNote($value): ?string { if (!is_string($value)) { return null; } $note = trim($value); if ($note === '') { return null; } if (mb_strlen($note) > 4000) { throw new InventoryValidationException('Inventory notes must be 4000 characters or fewer.'); } return $note; }
/** @param mixed $row @return array<string, mixed> */
function normalizeInventoryItem($row): array { $record = is_array($row) ? $row : []; return ['id' => trim((string) ($record['id'] ?? '')), 'subject_type' => trim((string) ($record['subject_type'] ?? '')), 'subject_id' => trim((string) ($record['subject_id'] ?? '')), 'on_hand_quantity' => isset($record['on_hand_quantity']) ? (int) $record['on_hand_quantity'] : null, 'version' => (int) ($record['version'] ?? 0), 'updated_at' => isset($record['updated_at']) ? trim((string) $record['updated_at']) : null]; }
/** @param mixed $row @return array<string, mixed> */
function normalizeInventoryMovement($row): array { $record = is_array($row) ? $row : []; return ['id' => trim((string) ($record['id'] ?? '')), 'movement_type' => trim((string) ($record['movement_type'] ?? '')), 'reason_code' => trim((string) ($record['reason_code'] ?? '')), 'quantity_before' => isset($record['quantity_before']) ? (int) $record['quantity_before'] : null, 'quantity_after' => (int) ($record['quantity_after'] ?? 0), 'quantity_delta' => isset($record['quantity_delta']) ? (int) $record['quantity_delta'] : null, 'note' => isset($record['note']) && trim((string) $record['note']) !== '' ? trim((string) $record['note']) : null, 'transfer_id' => isset($record['transfer_id']) && trim((string) $record['transfer_id']) !== '' ? trim((string) $record['transfer_id']) : null, 'inventory_location_id' => isset($record['inventory_location_id']) && trim((string) $record['inventory_location_id']) !== '' ? trim((string) $record['inventory_location_id']) : null, 'location_name' => isset($record['location_name']) && trim((string) $record['location_name']) !== '' ? trim((string) $record['location_name']) : null, 'created_at' => trim((string) ($record['created_at'] ?? ''))]; }
