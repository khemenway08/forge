<?php
declare(strict_types=1);

namespace Forge\Server;

use JsonException;
use PDO;
use PDOException;

final class StaffOrderNotFoundException extends \RuntimeException
{
}

final class ProductionTrayNotFoundException extends \RuntimeException
{
}

final class ProductionTrayUnavailableException extends \RuntimeException
{
}

final class ProductionTrayConfigurationException extends \RuntimeException
{
}

final class ProductionOrderAlreadyAssignedException extends \RuntimeException
{
}

final class ProductionOrderNotAssignableException extends \RuntimeException
{
}

final class PdoStaffOrderRepository
{
    private const ORDER_STATUS_SUBMITTED = 'submitted';
    private const ORDER_STATUS_TRAY_ASSIGNED = 'tray_assigned';
    private const TRAY_STATUS_AVAILABLE = 'available';
    private const TRAY_STATUS_ASSIGNED = 'assigned';
    private const TRAY_STATUS_OUT_OF_SERVICE = 'out_of_service';

    private PDO $pdo;
    /** @var array{FORGE_TRAY_NUMBERS?: mixed} */
    private array $trayConfig;

    /**
     * @param array{FORGE_TRAY_NUMBERS?: mixed} $trayConfig
     */
    public function __construct(PDO $pdo, array $trayConfig = [])
    {
        $this->pdo = $pdo;
        $this->trayConfig = $trayConfig;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listOrders(int $limit = 50, int $offset = 0): array
    {
        $normalizedLimit = normalizeStaffOrderLimit($limit);
        $normalizedOffset = max(0, $offset);

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    forge_order_uuid,
                    record_version,
                    source,
                    submitted_at,
                    received_at,
                    updated_at,
                    device_id,
                    event_id,
                    payload_json,
                    payload_sha256,
                    production_status,
                    current_tray_number
                 FROM forge_orders
                 ORDER BY received_at DESC, forge_order_uuid DESC
                 LIMIT :limit OFFSET :offset'
            );
            $statement->bindValue(':limit', $normalizedLimit, PDO::PARAM_INT);
            $statement->bindValue(':offset', $normalizedOffset, PDO::PARAM_INT);
            $statement->execute();
            $records = $statement->fetchAll();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($records)) {
            return [];
        }

        return array_map(
            static function ($record): array {
                return normalizeStoredStaffOrderRecord($record);
            },
            $records
        );
    }

    public function countOrders(): int
    {
        try {
            $statement = $this->pdo->query('SELECT COUNT(*) FROM forge_orders');
            $count = $statement ? $statement->fetchColumn() : 0;
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
        }

        return max(0, (int) $count);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getOrder(string $forgeOrderUuid): ?array
    {
        $orderUuid = trim($forgeOrderUuid);
        if ($orderUuid === '') {
            return null;
        }

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    forge_order_uuid,
                    record_version,
                    source,
                    submitted_at,
                    received_at,
                    updated_at,
                    device_id,
                    event_id,
                    payload_json,
                    payload_sha256,
                    production_status,
                    current_tray_number
                 FROM forge_orders
                 WHERE forge_order_uuid = :forge_order_uuid
                 LIMIT 1'
            );
            $statement->execute([
                ':forge_order_uuid' => $orderUuid,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($record)) {
            return null;
        }

        return normalizeStoredStaffOrderRecord($record);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listTrays(): array
    {
        $this->ensureConfiguredTrays();

        try {
            $statement = $this->pdo->query(
                'SELECT
                    tray_number,
                    tray_status,
                    current_order_uuid,
                    assigned_at,
                    updated_at
                 FROM forge_production_trays
                 ORDER BY tray_number ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Production trays are currently unavailable.', 0, $exception);
        }

        if (!is_array($records)) {
            return [];
        }

        return array_map(
            static function ($record): array {
                return normalizeStoredTrayRecord($record);
            },
            $records
        );
    }

    /**
     * @return array{
     *   already_assigned: bool,
     *   order: array<string, mixed>,
     *   tray: array<string, mixed>,
     *   assignment_history: array<string, mixed>
     * }
     */
    public function assignTrayToOrder(string $forgeOrderUuid, int $trayNumber): array
    {
        $orderUuid = trim($forgeOrderUuid);
        $normalizedTrayNumber = normalizePositiveTrayNumber($trayNumber);
        if ($orderUuid === '') {
            throw new StaffOrderNotFoundException('That order could not be found.');
        }

        $this->ensureConfiguredTrays();
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $this->pdo->beginTransaction();

            $orderRow = $this->loadOrderRowForUpdate($orderUuid);
            if ($orderRow === null) {
                throw new StaffOrderNotFoundException('That order could not be found.');
            }

            $normalizedOrder = normalizeStoredStaffOrderRecord($orderRow);
            $currentTrayNumber = normalizeNullableTrayNumber($normalizedOrder['current_tray_number'] ?? null);
            $productionStatus = is_string($normalizedOrder['production_status'] ?? null)
                ? $normalizedOrder['production_status']
                : self::ORDER_STATUS_SUBMITTED;

            if ($currentTrayNumber === null && $productionStatus !== self::ORDER_STATUS_SUBMITTED) {
                throw new ProductionOrderNotAssignableException('Only submitted orders can receive a tray.');
            }

            $trayRow = $this->loadTrayRowForUpdate($normalizedTrayNumber);
            if ($trayRow === null) {
                throw new ProductionTrayNotFoundException('That production tray could not be found.');
            }

            $normalizedTray = normalizeStoredTrayRecord($trayRow);
            $activeHistory = $this->loadActiveAssignmentHistoryForUpdate($orderUuid, $normalizedTrayNumber);

            if ($currentTrayNumber !== null) {
                if (
                    $currentTrayNumber === $normalizedTrayNumber
                    && trim((string) ($normalizedTray['current_order_uuid'] ?? '')) === $orderUuid
                    && is_array($activeHistory)
                ) {
                    $this->pdo->commit();
                    return [
                        'already_assigned' => true,
                        'order' => $normalizedOrder,
                        'tray' => $normalizedTray,
                        'assignment_history' => normalizeStoredTrayAssignmentHistoryRecord($activeHistory),
                    ];
                }

                throw new ProductionOrderAlreadyAssignedException('This order already has an assigned tray.');
            }

            if (($normalizedTray['tray_status'] ?? '') === self::TRAY_STATUS_OUT_OF_SERVICE) {
                throw new ProductionTrayUnavailableException('That tray is not available for assignment.');
            }

            if (
                ($normalizedTray['tray_status'] ?? '') !== self::TRAY_STATUS_AVAILABLE
                || trim((string) ($normalizedTray['current_order_uuid'] ?? '')) !== ''
            ) {
                throw new ProductionTrayUnavailableException('That tray is no longer available. Choose another tray.');
            }

            $updateOrder = $this->pdo->prepare(
                'UPDATE forge_orders
                 SET production_status = :production_status,
                     current_tray_number = :current_tray_number,
                     updated_at = :updated_at
                 WHERE forge_order_uuid = :forge_order_uuid'
            );
            $updateOrder->execute([
                ':production_status' => self::ORDER_STATUS_TRAY_ASSIGNED,
                ':current_tray_number' => $normalizedTrayNumber,
                ':updated_at' => $timestamp,
                ':forge_order_uuid' => $orderUuid,
            ]);

            $updateTray = $this->pdo->prepare(
                'UPDATE forge_production_trays
                 SET tray_status = :tray_status,
                     current_order_uuid = :current_order_uuid,
                     assigned_at = :assigned_at,
                     updated_at = :updated_at
                 WHERE tray_number = :tray_number'
            );
            $updateTray->execute([
                ':tray_status' => self::TRAY_STATUS_ASSIGNED,
                ':current_order_uuid' => $orderUuid,
                ':assigned_at' => $timestamp,
                ':updated_at' => $timestamp,
                ':tray_number' => $normalizedTrayNumber,
            ]);

            $assignmentId = generateUuidV4();
            $insertHistory = $this->pdo->prepare(
                'INSERT INTO forge_tray_assignment_history (
                    tray_assignment_id,
                    tray_number,
                    forge_order_uuid,
                    assigned_at,
                    released_at,
                    release_reason
                 ) VALUES (
                    :tray_assignment_id,
                    :tray_number,
                    :forge_order_uuid,
                    :assigned_at,
                    NULL,
                    NULL
                 )'
            );
            $insertHistory->execute([
                ':tray_assignment_id' => $assignmentId,
                ':tray_number' => $normalizedTrayNumber,
                ':forge_order_uuid' => $orderUuid,
                ':assigned_at' => $timestamp,
            ]);

            $updatedOrderRow = $this->loadOrderRowForUpdate($orderUuid);
            $updatedTrayRow = $this->loadTrayRowForUpdate($normalizedTrayNumber);
            $historyRow = $this->loadAssignmentHistoryById($assignmentId);
            if (!is_array($updatedOrderRow) || !is_array($updatedTrayRow) || !is_array($historyRow)) {
                throw new StorageUnavailableException('Production tray assignment could not be saved.');
            }

            $this->pdo->commit();

            return [
                'already_assigned' => false,
                'order' => normalizeStoredStaffOrderRecord($updatedOrderRow),
                'tray' => normalizeStoredTrayRecord($updatedTrayRow),
                'assignment_history' => normalizeStoredTrayAssignmentHistoryRecord($historyRow),
            ];
        } catch (
            StaffOrderNotFoundException
            | ProductionTrayNotFoundException
            | ProductionTrayUnavailableException
            | ProductionOrderAlreadyAssignedException
            | ProductionOrderNotAssignableException
            | ProductionTrayConfigurationException
            | StorageUnavailableException $exception
        ) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw new StorageUnavailableException('Production tray assignment is currently unavailable.', 0, $exception);
        }
    }

    private function ensureConfiguredTrays(): void
    {
        try {
            $configuredTrayNumbers = parseConfiguredTrayNumbers($this->trayConfig['FORGE_TRAY_NUMBERS'] ?? null);
        } catch (\InvalidArgumentException $exception) {
            throw new ProductionTrayConfigurationException('No production trays are configured.', 0, $exception);
        }

        if ($configuredTrayNumbers === []) {
            throw new ProductionTrayConfigurationException('No production trays are configured.');
        }

        try {
            $this->pdo->beginTransaction();
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_production_trays (
                    tray_number,
                    tray_status,
                    current_order_uuid,
                    assigned_at,
                    updated_at
                 ) VALUES (
                    :tray_number,
                    :tray_status,
                    NULL,
                    NULL,
                    :updated_at
                 )
                 ON DUPLICATE KEY UPDATE tray_number = tray_number'
            );
            $timestamp = gmdate('Y-m-d H:i:s.u');

            foreach ($configuredTrayNumbers as $trayNumber) {
                $statement->execute([
                    ':tray_number' => $trayNumber,
                    ':tray_status' => self::TRAY_STATUS_AVAILABLE,
                    ':updated_at' => $timestamp,
                ]);
            }

            $this->pdo->commit();
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw new StorageUnavailableException('Production trays are currently unavailable.', 0, $exception);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadOrderRowForUpdate(string $forgeOrderUuid): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT
                forge_order_uuid,
                record_version,
                source,
                submitted_at,
                received_at,
                updated_at,
                device_id,
                event_id,
                payload_json,
                payload_sha256,
                production_status,
                current_tray_number
             FROM forge_orders
             WHERE forge_order_uuid = :forge_order_uuid
             LIMIT 1
             FOR UPDATE'
        );
        $statement->execute([
            ':forge_order_uuid' => $forgeOrderUuid,
        ]);

        $record = $statement->fetch();
        return is_array($record) ? $record : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadTrayRowForUpdate(int $trayNumber): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT
                tray_number,
                tray_status,
                current_order_uuid,
                assigned_at,
                updated_at
             FROM forge_production_trays
             WHERE tray_number = :tray_number
             LIMIT 1
             FOR UPDATE'
        );
        $statement->execute([
            ':tray_number' => $trayNumber,
        ]);

        $record = $statement->fetch();
        return is_array($record) ? $record : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadActiveAssignmentHistoryForUpdate(string $forgeOrderUuid, int $trayNumber): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT
                tray_assignment_id,
                tray_number,
                forge_order_uuid,
                assigned_at,
                released_at,
                release_reason
             FROM forge_tray_assignment_history
             WHERE forge_order_uuid = :forge_order_uuid
               AND tray_number = :tray_number
               AND released_at IS NULL
             ORDER BY assigned_at DESC, tray_assignment_id DESC
             LIMIT 1
             FOR UPDATE'
        );
        $statement->execute([
            ':forge_order_uuid' => $forgeOrderUuid,
            ':tray_number' => $trayNumber,
        ]);

        $record = $statement->fetch();
        return is_array($record) ? $record : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadAssignmentHistoryById(string $trayAssignmentId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT
                tray_assignment_id,
                tray_number,
                forge_order_uuid,
                assigned_at,
                released_at,
                release_reason
             FROM forge_tray_assignment_history
             WHERE tray_assignment_id = :tray_assignment_id
             LIMIT 1'
        );
        $statement->execute([
            ':tray_assignment_id' => $trayAssignmentId,
        ]);

        $record = $statement->fetch();
        return is_array($record) ? $record : null;
    }
}

function normalizeStaffOrderLimit(int $limit): int
{
    if ($limit <= 0) {
        return 50;
    }

    return min($limit, 200);
}

/**
 * @param mixed $record
 * @return array<string, mixed>
 */
function normalizeStoredStaffOrderRecord($record): array
{
    if (!is_array($record)) {
        throw new \InvalidArgumentException('A valid stored staff order record is required.');
    }

    $payloadJson = is_string($record['payload_json'] ?? null) ? $record['payload_json'] : '';
    if ($payloadJson === '') {
        throw new \InvalidArgumentException('A valid stored staff order payload is required.');
    }

    try {
        $payload = json_decode($payloadJson, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new \InvalidArgumentException('A valid stored staff order payload is required.', 0, $exception);
    }

    if (!is_array($payload)) {
        throw new \InvalidArgumentException('A valid stored staff order payload is required.');
    }

    $currentTrayNumber = normalizeNullableTrayNumber($record['current_tray_number'] ?? null);

    return [
        'forge_order_uuid' => trim((string) ($record['forge_order_uuid'] ?? '')),
        'record_version' => trim((string) ($record['record_version'] ?? '')),
        'source' => trim((string) ($record['source'] ?? '')),
        'submitted_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['submitted_at'] ?? '')),
        'received_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['received_at'] ?? '')),
        'updated_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['updated_at'] ?? '')),
        'device_id' => normalizeNullableString($record['device_id'] ?? null),
        'event_id' => normalizeNullableString($record['event_id'] ?? null),
        'payload_sha256' => trim((string) ($record['payload_sha256'] ?? '')),
        'payload' => $payload,
        'production_status' => normalizeProductionStatusValue($record['production_status'] ?? null, $currentTrayNumber),
        'current_tray_number' => $currentTrayNumber,
    ];
}

/**
 * @param mixed $record
 * @return array<string, mixed>
 */
function normalizeStoredTrayRecord($record): array
{
    if (!is_array($record)) {
        throw new \InvalidArgumentException('A valid production tray record is required.');
    }

    $trayNumber = normalizePositiveTrayNumber($record['tray_number'] ?? null);
    $trayStatus = normalizeTrayStatusValue($record['tray_status'] ?? null);
    $currentOrderUuid = trim((string) ($record['current_order_uuid'] ?? ''));

    return [
        'tray_number' => $trayNumber,
        'tray_status' => $trayStatus,
        'current_order_uuid' => $currentOrderUuid === '' ? null : $currentOrderUuid,
        'assigned_at' => normalizeNullableDatabaseDateTime($record['assigned_at'] ?? null),
        'updated_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['updated_at'] ?? '')),
    ];
}

/**
 * @param mixed $record
 * @return array<string, mixed>
 */
function normalizeStoredTrayAssignmentHistoryRecord($record): array
{
    if (!is_array($record)) {
        throw new \InvalidArgumentException('A valid tray assignment history record is required.');
    }

    return [
        'tray_assignment_id' => trim((string) ($record['tray_assignment_id'] ?? '')),
        'tray_number' => normalizePositiveTrayNumber($record['tray_number'] ?? null),
        'forge_order_uuid' => trim((string) ($record['forge_order_uuid'] ?? '')),
        'assigned_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['assigned_at'] ?? '')),
        'released_at' => normalizeNullableDatabaseDateTime($record['released_at'] ?? null),
        'release_reason' => normalizeNullableString($record['release_reason'] ?? null),
    ];
}

/**
 * @param mixed $value
 */
function normalizeNullableString($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim($value);
    return $normalized === '' ? null : $normalized;
}

/**
 * @param mixed $value
 * @return array<int, int>
 */
function parseConfiguredTrayNumbers($value): array
{
    if (!is_string($value)) {
        return [];
    }

    $parts = preg_split('/[\s,]+/', trim($value)) ?: [];
    $numbers = [];
    foreach ($parts as $part) {
        if ($part === '') {
            continue;
        }
        $trayNumber = normalizeNullableTrayNumber($part);
        if ($trayNumber !== null) {
            $numbers[] = $trayNumber;
        }
    }

    $unique = array_values(array_unique($numbers));
    sort($unique, SORT_NUMERIC);
    return $unique;
}

/**
 * @param mixed $value
 */
function normalizeNullableTrayNumber($value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    $normalized = normalizePositiveTrayNumber($value);
    return $normalized > 0 ? $normalized : null;
}

/**
 * @param mixed $value
 */
function normalizePositiveTrayNumber($value): int
{
    if (is_int($value)) {
        $trayNumber = $value;
    } elseif (is_string($value) && preg_match('/^\d+$/', trim($value))) {
        $trayNumber = (int) trim($value);
    } else {
        throw new \InvalidArgumentException('A valid positive tray number is required.');
    }

    if ($trayNumber <= 0) {
        throw new \InvalidArgumentException('A valid positive tray number is required.');
    }

    return $trayNumber;
}

/**
 * @param mixed $value
 */
function normalizeProductionStatusValue($value, ?int $currentTrayNumber): string
{
    $normalized = is_string($value) ? trim(strtolower($value)) : '';
    if (in_array($normalized, [
        'submitted',
        'tray_assigned',
        'in_production',
        'ready_to_pack',
        'packed',
        'shipped',
        'picked_up',
        'cancelled',
    ], true)) {
        return $normalized;
    }

    return $currentTrayNumber !== null ? 'tray_assigned' : 'submitted';
}

/**
 * @param mixed $value
 */
function normalizeTrayStatusValue($value): string
{
    $normalized = is_string($value) ? trim(strtolower($value)) : '';
    if ($normalized === 'assigned') {
        return 'assigned';
    }
    if ($normalized === 'out_of_service') {
        return 'out_of_service';
    }
    return 'available';
}

/**
 * @param mixed $value
 */
function normalizeNullableDatabaseDateTime($value): ?string
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    return OrderPayload::databaseDateTimeToIso8601($value);
}

function generateUuidV4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}
