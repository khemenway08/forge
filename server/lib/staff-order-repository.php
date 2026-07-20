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

final class ProductionOrderItemNotFoundException extends \RuntimeException
{
}

final class ProductionOrderItemConflictException extends \RuntimeException
{
}

final class ProductionOrderItemNotCompletableException extends \RuntimeException
{
}

final class PdoStaffOrderRepository
{
    private const ORDER_STATUS_SUBMITTED = 'submitted';
    private const ORDER_STATUS_TRAY_ASSIGNED = 'tray_assigned';
    private const ORDER_STATUS_IN_PRODUCTION = 'in_production';
    private const ORDER_STATUS_READY_TO_PACK = 'ready_to_pack';
    private const TRAY_STATUS_AVAILABLE = 'available';
    private const TRAY_STATUS_ASSIGNED = 'assigned';
    private const TRAY_STATUS_OUT_OF_SERVICE = 'out_of_service';
    private const ITEM_STATUS_PENDING = 'pending';
    private const ITEM_STATUS_IN_PRODUCTION = 'in_production';
    private const ITEM_STATUS_COMPLETE = 'complete';
    private const ITEM_STATUS_BLOCKED = 'blocked';
    private const ITEM_STATUS_CANCELLED = 'cancelled';

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
                    current_tray_number,
                    ready_to_pack_at
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

        $recordsByOrderUuid = [];
        $orderUuids = [];
        foreach ($records as $record) {
            $orderUuid = is_array($record) ? trim((string) ($record['forge_order_uuid'] ?? '')) : '';
            if ($orderUuid !== '') {
                $recordsByOrderUuid[$orderUuid] = $record;
                $orderUuids[] = $orderUuid;
            }
        }

        $itemProductionRowsByOrder = $this->loadItemProductionRowsForOrders($orderUuids);
        $normalized = [];
        foreach ($recordsByOrderUuid as $orderUuid => $record) {
            $normalized[] = normalizeStoredStaffOrderRecord($record, $itemProductionRowsByOrder[$orderUuid] ?? []);
        }

        return $normalized;
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
                    current_tray_number,
                    ready_to_pack_at
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

        return normalizeStoredStaffOrderRecord($record, $this->loadItemProductionRowsForOrder($orderUuid));
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

    /**
     * @return array{
     *   already_applied: bool,
     *   order: array<string, mixed>,
     *   item: array<string, mixed>
     * }
     */
    public function completeItemQuantity(
        string $forgeOrderUuid,
        string $lineId,
        int $expectedCompletedQuantity,
        int $targetCompletedQuantity
    ): array {
        $orderUuid = trim($forgeOrderUuid);
        $normalizedLineId = trim($lineId);
        if ($orderUuid === '') {
            throw new StaffOrderNotFoundException('That order could not be found.');
        }
        if ($normalizedLineId === '') {
            throw new ProductionOrderItemNotFoundException('That saved item could not be found.');
        }
        if ($expectedCompletedQuantity < 0) {
            throw new \InvalidArgumentException('A valid current completed quantity is required.');
        }
        if ($targetCompletedQuantity < 0 || $targetCompletedQuantity !== $expectedCompletedQuantity + 1) {
            throw new \InvalidArgumentException('A valid target completed quantity is required.');
        }

        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $this->pdo->beginTransaction();

            $orderRow = $this->loadOrderRowForUpdate($orderUuid);
            if ($orderRow === null) {
                throw new StaffOrderNotFoundException('That order could not be found.');
            }

            $lockedOrder = normalizeStoredStaffOrderRecord($orderRow, $this->loadItemProductionRowsForOrderForUpdate($orderUuid));
            $currentTrayNumber = normalizeNullableTrayNumber($lockedOrder['current_tray_number'] ?? null);
            if ($currentTrayNumber === null) {
                throw new ProductionOrderItemNotCompletableException('Assign a production tray before marking completed pieces.');
            }

            $orderStatus = is_string($lockedOrder['production_status'] ?? null)
                ? $lockedOrder['production_status']
                : self::ORDER_STATUS_SUBMITTED;
            if (in_array($orderStatus, ['packed', 'shipped', 'picked_up', 'cancelled'], true)) {
                throw new ProductionOrderItemNotCompletableException('This order can no longer be updated from the production queue.');
            }

            $payload = is_array($lockedOrder['payload'] ?? null) ? $lockedOrder['payload'] : [];
            $normalizedItems = normalizeStaffPayloadItems($payload, $orderUuid);
            $itemIndex = findStaffPayloadItemIndexByLineId($normalizedItems, $normalizedLineId);
            if ($itemIndex < 0) {
                throw new ProductionOrderItemNotFoundException('That saved item could not be found.');
            }

            $this->ensureItemProductionRowsForOrder($orderUuid, $normalizedItems, $timestamp);
            $itemProductionRows = $this->loadItemProductionRowsForOrderForUpdate($orderUuid);
            $normalizedOrder = normalizeStoredStaffOrderRecord($orderRow, $itemProductionRows);
            $items = is_array($normalizedOrder['payload']['items'] ?? null) ? $normalizedOrder['payload']['items'] : [];
            $itemIndex = findStaffPayloadItemIndexByLineId($items, $normalizedLineId);
            if ($itemIndex < 0) {
                throw new ProductionOrderItemNotFoundException('That saved item could not be found.');
            }

            $item = $items[$itemIndex];
            $itemStatus = normalizeStaffItemProductionStatus($item['production_status'] ?? null, 0, 1);
            if ($itemStatus === self::ITEM_STATUS_BLOCKED) {
                throw new ProductionOrderItemNotCompletableException('Blocked items cannot be marked complete until the issue is resolved.');
            }
            if ($itemStatus === self::ITEM_STATUS_CANCELLED) {
                throw new ProductionOrderItemNotCompletableException('Cancelled items cannot be marked complete.');
            }

            $requiredQuantity = normalizeStaffQuantity($item['quantity'] ?? 1);
            $currentCompletedQuantity = normalizeStaffCompletedQuantity(
                $item['completed_quantity'] ?? 0,
                $requiredQuantity,
                $item['production_status'] ?? null
            );

            if ($targetCompletedQuantity > $requiredQuantity) {
                throw new ProductionOrderItemConflictException('That item is already complete.');
            }

            if ($currentCompletedQuantity !== $expectedCompletedQuantity) {
                if ($currentCompletedQuantity === $targetCompletedQuantity) {
                    $this->pdo->commit();
                    return [
                        'already_applied' => true,
                        'order' => $normalizedOrder,
                        'item' => $item,
                    ];
                }

                throw new ProductionOrderItemConflictException('That item was updated by another device. Refresh the order and try again.');
            }

            $nextItemStatus = deriveStaffItemProductionStatus(
                $item['production_status'] ?? null,
                $targetCompletedQuantity,
                $requiredQuantity
            );
            $completedAt = $targetCompletedQuantity >= $requiredQuantity
                ? (normalizeNullableIso8601Value($item['completed_at'] ?? null) ?? OrderPayload::databaseDateTimeToIso8601($timestamp))
                : null;

            $upsertItemState = $this->pdo->prepare(
                'INSERT INTO forge_order_item_production (
                    forge_order_uuid,
                    line_id,
                    required_quantity,
                    completed_quantity,
                    production_status,
                    completed_at,
                    updated_at
                 ) VALUES (
                    :forge_order_uuid,
                    :line_id,
                    :required_quantity,
                    :completed_quantity,
                    :production_status,
                    :completed_at,
                    :updated_at
                 )
                 ON DUPLICATE KEY UPDATE
                    required_quantity = VALUES(required_quantity),
                    completed_quantity = VALUES(completed_quantity),
                    production_status = VALUES(production_status),
                    completed_at = VALUES(completed_at),
                    updated_at = VALUES(updated_at)'
            );
            $upsertItemState->execute([
                ':forge_order_uuid' => $orderUuid,
                ':line_id' => $normalizedLineId,
                ':required_quantity' => $requiredQuantity,
                ':completed_quantity' => $targetCompletedQuantity,
                ':production_status' => $nextItemStatus,
                ':completed_at' => $completedAt === null ? null : OrderPayload::normalizeDatabaseDateTime($completedAt),
                ':updated_at' => $timestamp,
            ]);

            $updatedItemRows = $this->loadItemProductionRowsForOrderForUpdate($orderUuid);
            $updatedOrder = normalizeStoredStaffOrderRecord($orderRow, $updatedItemRows);
            $updatedItems = is_array($updatedOrder['payload']['items'] ?? null) ? $updatedOrder['payload']['items'] : [];
            $updatedItemIndex = findStaffPayloadItemIndexByLineId($updatedItems, $normalizedLineId);
            if ($updatedItemIndex < 0) {
                throw new ProductionOrderItemNotFoundException('That saved item could not be found.');
            }

            $derivedOrderStatus = is_string($updatedOrder['production_status'] ?? null)
                ? $updatedOrder['production_status']
                : self::ORDER_STATUS_SUBMITTED;
            $readyToPackAt = normalizeNullableIso8601Value($updatedOrder['ready_to_pack_at'] ?? null);
            $updateOrder = $this->pdo->prepare(
                'UPDATE forge_orders
                 SET production_status = :production_status,
                     ready_to_pack_at = :ready_to_pack_at,
                     updated_at = :updated_at
                 WHERE forge_order_uuid = :forge_order_uuid'
            );
            $updateOrder->execute([
                ':production_status' => $derivedOrderStatus,
                ':ready_to_pack_at' => $readyToPackAt === null ? null : OrderPayload::normalizeDatabaseDateTime($readyToPackAt),
                ':updated_at' => $timestamp,
                ':forge_order_uuid' => $orderUuid,
            ]);

            $refreshedOrderRow = $this->loadOrderRowForUpdate($orderUuid);
            if (!is_array($refreshedOrderRow)) {
                throw new StorageUnavailableException('Item completion could not be saved.');
            }
            $refreshedOrder = normalizeStoredStaffOrderRecord($refreshedOrderRow, $this->loadItemProductionRowsForOrderForUpdate($orderUuid));
            $refreshedItems = is_array($refreshedOrder['payload']['items'] ?? null) ? $refreshedOrder['payload']['items'] : [];
            $refreshedItemIndex = findStaffPayloadItemIndexByLineId($refreshedItems, $normalizedLineId);
            if ($refreshedItemIndex < 0) {
                throw new ProductionOrderItemNotFoundException('That saved item could not be found.');
            }

            $this->pdo->commit();

            return [
                'already_applied' => false,
                'order' => $refreshedOrder,
                'item' => $refreshedItems[$refreshedItemIndex],
            ];
        } catch (
            StaffOrderNotFoundException
            | ProductionOrderItemNotFoundException
            | ProductionOrderItemConflictException
            | ProductionOrderItemNotCompletableException
            | StorageUnavailableException
            | \InvalidArgumentException $exception
        ) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw new StorageUnavailableException('Item completion is currently unavailable.', 0, $exception);
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
                current_tray_number,
                ready_to_pack_at
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

    /**
     * @param array<int, array<string, mixed>> $items
     */
    private function ensureItemProductionRowsForOrder(string $forgeOrderUuid, array $items, string $timestamp): void
    {
        if ($items === []) {
            return;
        }

        $statement = $this->pdo->prepare(
            'INSERT INTO forge_order_item_production (
                forge_order_uuid,
                line_id,
                required_quantity,
                completed_quantity,
                production_status,
                completed_at,
                updated_at
             ) VALUES (
                :forge_order_uuid,
                :line_id,
                :required_quantity,
                :completed_quantity,
                :production_status,
                NULL,
                :updated_at
             )
             ON DUPLICATE KEY UPDATE
                required_quantity = VALUES(required_quantity),
                updated_at = updated_at'
        );

        foreach ($items as $item) {
            $statement->execute([
                ':forge_order_uuid' => $forgeOrderUuid,
                ':line_id' => trim((string) ($item['line_id'] ?? '')),
                ':required_quantity' => normalizeStaffQuantity($item['quantity'] ?? 1),
                ':completed_quantity' => normalizeStaffCompletedQuantity(
                    $item['completed_quantity'] ?? 0,
                    normalizeStaffQuantity($item['quantity'] ?? 1),
                    $item['production_status'] ?? null
                ),
                ':production_status' => normalizeStaffItemProductionStatus(
                    $item['production_status'] ?? null,
                    normalizeStaffCompletedQuantity(
                        $item['completed_quantity'] ?? 0,
                        normalizeStaffQuantity($item['quantity'] ?? 1),
                        $item['production_status'] ?? null
                    ),
                    normalizeStaffQuantity($item['quantity'] ?? 1)
                ),
                ':updated_at' => $timestamp,
            ]);
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadItemProductionRowsForOrder(string $forgeOrderUuid): array
    {
        return $this->loadItemProductionRowsForOrders([$forgeOrderUuid])[$forgeOrderUuid] ?? [];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadItemProductionRowsForOrderForUpdate(string $forgeOrderUuid): array
    {
        $statement = $this->pdo->prepare(
            'SELECT
                forge_order_uuid,
                line_id,
                required_quantity,
                completed_quantity,
                production_status,
                completed_at,
                updated_at
             FROM forge_order_item_production
             WHERE forge_order_uuid = :forge_order_uuid
             ORDER BY line_id ASC
             FOR UPDATE'
        );
        $statement->execute([
            ':forge_order_uuid' => $forgeOrderUuid,
        ]);

        $records = $statement->fetchAll();
        return is_array($records) ? $records : [];
    }

    /**
     * @param array<int, string> $orderUuids
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function loadItemProductionRowsForOrders(array $orderUuids): array
    {
        $normalizedOrderUuids = array_values(array_filter(array_map(static function ($value): string {
            return is_string($value) ? trim($value) : '';
        }, $orderUuids), static function (string $value): bool {
            return $value !== '';
        }));

        if ($normalizedOrderUuids === []) {
            return [];
        }

        $placeholders = implode(', ', array_fill(0, count($normalizedOrderUuids), '?'));

        try {
            $statement = $this->pdo->prepare(
                "SELECT
                    forge_order_uuid,
                    line_id,
                    required_quantity,
                    completed_quantity,
                    production_status,
                    completed_at,
                    updated_at
                 FROM forge_order_item_production
                 WHERE forge_order_uuid IN ({$placeholders})
                 ORDER BY forge_order_uuid ASC, line_id ASC"
            );
            foreach ($normalizedOrderUuids as $index => $orderUuid) {
                $statement->bindValue($index + 1, $orderUuid, PDO::PARAM_STR);
            }
            $statement->execute();
            $rows = $statement->fetchAll();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
        }

        $grouped = [];
        foreach ($normalizedOrderUuids as $orderUuid) {
            $grouped[$orderUuid] = [];
        }
        if (!is_array($rows)) {
            return $grouped;
        }

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $orderUuid = trim((string) ($row['forge_order_uuid'] ?? ''));
            if ($orderUuid === '') {
                continue;
            }
            if (!array_key_exists($orderUuid, $grouped)) {
                $grouped[$orderUuid] = [];
            }
            $grouped[$orderUuid][] = $row;
        }

        return $grouped;
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
 * @param array<int, array<string, mixed>> $itemProductionRows
 * @return array<string, mixed>
 */
function normalizeStoredStaffOrderRecord($record, array $itemProductionRows = []): array
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
    $normalizedPayload = normalizeStaffPayloadForProductionState(
        $payload,
        trim((string) ($record['forge_order_uuid'] ?? '')),
        $itemProductionRows
    );
    $hasOpenFlags = staffOrderHasBlockingFlags($normalizedPayload);
    $counts = deriveStaffOrderCompletionCounts($normalizedPayload['items'] ?? []);
    $productionStatus = deriveStaffOrderProductionStatus(
        $record['production_status'] ?? null,
        $currentTrayNumber,
        $counts['completed_item_count'],
        $counts['total_item_count'],
        $hasOpenFlags
    );
    $readyToPackAt = normalizeStaffReadyToPackAt($record['ready_to_pack_at'] ?? null, $productionStatus);

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
        'payload' => $normalizedPayload,
        'production_status' => $productionStatus,
        'current_tray_number' => $currentTrayNumber,
        'total_item_count' => $counts['total_item_count'],
        'completed_item_count' => $counts['completed_item_count'],
        'ready_to_pack_at' => $readyToPackAt,
        'has_open_flags' => $hasOpenFlags,
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

/**
 * @param array<string, mixed> $payload
 * @param array<int, array<string, mixed>> $itemProductionRows
 * @return array<string, mixed>
 */
function normalizeStaffPayloadForProductionState(array $payload, string $forgeOrderUuid, array $itemProductionRows = []): array
{
    $normalizedItems = normalizeStaffPayloadItems($payload, $forgeOrderUuid, $itemProductionRows);
    $normalizedPayload = $payload;
    $normalizedPayload['items'] = $normalizedItems;
    $normalizedPayload['has_open_flags'] = staffOrderHasBlockingFlags($normalizedPayload);

    return $normalizedPayload;
}

/**
 * @param array<string, mixed> $payload
 * @param array<int, array<string, mixed>> $itemProductionRows
 * @return array<int, array<string, mixed>>
 */
function normalizeStaffPayloadItems(array $payload, string $forgeOrderUuid, array $itemProductionRows = []): array
{
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $rowsByLineId = [];
    foreach ($itemProductionRows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $lineId = trim((string) ($row['line_id'] ?? ''));
        if ($lineId !== '') {
            $rowsByLineId[$lineId] = $row;
        }
    }

    $normalized = [];
    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized[] = normalizeStaffPayloadItem(
            $item,
            $index,
            $forgeOrderUuid,
            $rowsByLineId
        );
    }

    return $normalized;
}

/**
 * @param array<string, mixed> $item
 * @param array<string, array<string, mixed>> $itemProductionRowsByLineId
 * @return array<string, mixed>
 */
function normalizeStaffPayloadItem(array $item, int $index, string $forgeOrderUuid, array $itemProductionRowsByLineId = []): array
{
    $lineNumber = normalizeStaffLineNumber($item['line_number'] ?? null, $index + 1);
    $lineId = normalizeStaffLineId($item['line_id'] ?? null, $forgeOrderUuid, $lineNumber);
    $quantity = normalizeStaffQuantity($item['quantity'] ?? 1);
    $stateRow = $itemProductionRowsByLineId[$lineId] ?? null;
    $explicitStatus = firstNonEmptyStaffString([
        is_array($stateRow) ? ($stateRow['production_status'] ?? null) : null,
        $item['production_status'] ?? null,
        is_array($item['structured_attributes'] ?? null) ? ($item['structured_attributes']['production_status'] ?? null) : null,
    ]);
    $completedQuantity = normalizeStaffCompletedQuantity(
        is_array($stateRow) ? ($stateRow['completed_quantity'] ?? null) : ($item['completed_quantity'] ?? null),
        $quantity,
        $explicitStatus
    );
    $productionStatus = deriveStaffItemProductionStatus($explicitStatus, $completedQuantity, $quantity);
    $completedAt = $completedQuantity >= $quantity
        ? normalizeNullableDatabaseDateTimeValue(
            is_array($stateRow) ? ($stateRow['completed_at'] ?? null) : ($item['completed_at'] ?? null)
        )
        : null;
    $structuredAttributes = is_array($item['structured_attributes'] ?? null) ? $item['structured_attributes'] : [];
    $structuredAttributes['production_status'] = $productionStatus;
    $structuredAttributes['has_open_flags'] = BooleanOrArrayHasValues($structuredAttributes['has_open_flags'] ?? null)
        || staffItemHasBlockingFlags($item);

    $normalizedItem = $item;
    $normalizedItem['line_id'] = $lineId;
    $normalizedItem['line_number'] = $lineNumber;
    $normalizedItem['quantity'] = $quantity;
    $normalizedItem['completed_quantity'] = $completedQuantity;
    $normalizedItem['production_status'] = $productionStatus;
    $normalizedItem['completed_at'] = $completedAt;
    $normalizedItem['structured_attributes'] = $structuredAttributes;
    $normalizedItem['open_flags'] = is_array($item['open_flags'] ?? null) ? $item['open_flags'] : [];
    $normalizedItem['production_note'] = normalizeNullableString($item['production_note'] ?? null);

    return $normalizedItem;
}

/**
 * @param array<int, array<string, mixed>> $items
 * @return array{total_item_count: int, completed_item_count: int}
 */
function deriveStaffOrderCompletionCounts(array $items): array
{
    $summary = [
        'total_item_count' => 0,
        'completed_item_count' => 0,
    ];

    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $quantity = normalizeStaffQuantity($item['quantity'] ?? 1);
        $status = normalizeStaffItemProductionStatus($item['production_status'] ?? null, 0, $quantity);
        if ($status === 'cancelled') {
            continue;
        }
        $completedQuantity = normalizeStaffCompletedQuantity($item['completed_quantity'] ?? null, $quantity, $status);
        $summary['total_item_count'] += $quantity;
        $summary['completed_item_count'] += min($completedQuantity, $quantity);
    }

    return $summary;
}

/**
 * @param mixed $value
 */
function normalizeStaffReadyToPackAt($value, string $productionStatus): ?string
{
    if ($productionStatus !== 'ready_to_pack') {
        return null;
    }

    return normalizeNullableDatabaseDateTimeValue($value);
}

/**
 * @param mixed $explicitStatus
 */
function deriveStaffOrderProductionStatus($explicitStatus, ?int $currentTrayNumber, int $completedItemCount, int $totalItemCount, bool $hasBlockingFlags): string
{
    $normalizedExplicitStatus = normalizeProductionStatusValue($explicitStatus, $currentTrayNumber);
    if (in_array($normalizedExplicitStatus, ['packed', 'shipped', 'picked_up', 'cancelled'], true)) {
        return $normalizedExplicitStatus;
    }
    if ($currentTrayNumber === null) {
        return 'submitted';
    }
    if ($completedItemCount <= 0) {
        return 'tray_assigned';
    }
    if ($totalItemCount > 0 && $completedItemCount >= $totalItemCount && !$hasBlockingFlags) {
        return 'ready_to_pack';
    }

    return 'in_production';
}

/**
 * @param mixed $explicitStatus
 */
function deriveStaffItemProductionStatus($explicitStatus, int $completedQuantity, int $quantity): string
{
    $normalizedExplicitStatus = normalizeStaffItemProductionStatus($explicitStatus, $completedQuantity, $quantity);
    if (in_array($normalizedExplicitStatus, ['blocked', 'cancelled'], true)) {
        return $normalizedExplicitStatus;
    }
    if ($completedQuantity >= $quantity) {
        return 'complete';
    }
    if ($completedQuantity > 0) {
        return 'in_production';
    }

    return 'pending';
}

/**
 * @param mixed $value
 */
function normalizeStaffLineNumber($value, int $fallback): int
{
    $number = is_int($value) ? $value : (is_string($value) && preg_match('/^\d+$/', trim($value)) ? (int) trim($value) : 0);
    return $number > 0 ? $number : max(1, $fallback);
}

/**
 * @param mixed $value
 */
function normalizeStaffLineId($value, string $forgeOrderUuid, int $lineNumber): string
{
    if (is_string($value) && trim($value) !== '') {
        return trim($value);
    }

    return sprintf('%s-line-%d', trim($forgeOrderUuid), $lineNumber);
}

/**
 * @param mixed $value
 */
function normalizeStaffQuantity($value): int
{
    $quantity = is_int($value) ? $value : (is_numeric($value) ? (int) $value : 1);
    return $quantity > 0 ? $quantity : 1;
}

/**
 * @param mixed $value
 * @param mixed $explicitStatus
 */
function normalizeStaffCompletedQuantity($value, int $quantity, $explicitStatus = null): int
{
    if (in_array(normalizeStaffItemProductionStatus($explicitStatus, 0, $quantity), ['cancelled', 'complete'], true) && !is_numeric($value)) {
        return normalizeStaffItemProductionStatus($explicitStatus, 0, $quantity) === 'complete' ? $quantity : 0;
    }

    $completed = is_int($value) ? $value : (is_numeric($value) ? (int) $value : 0);
    if ($completed < 0) {
        $completed = 0;
    }

    return min($completed, $quantity);
}

/**
 * @param mixed $value
 */
function normalizeStaffItemProductionStatus($value, int $completedQuantity, int $quantity): string
{
    $normalized = is_string($value) ? trim(strtolower($value)) : '';
    if (in_array($normalized, ['pending', 'in_production', 'complete', 'blocked', 'cancelled'], true)) {
        return $normalized;
    }
    if ($completedQuantity >= $quantity && $quantity > 0) {
        return 'complete';
    }
    if ($completedQuantity > 0) {
        return 'in_production';
    }

    return 'pending';
}

/**
 * @param array<int, mixed> $values
 */
function firstNonEmptyStaffString(array $values): ?string
{
    foreach ($values as $value) {
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }
    }

    return null;
}

/**
 * @param mixed $value
 */
function normalizeNullableDatabaseDateTimeValue($value): ?string
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    return OrderPayload::databaseDateTimeToIso8601(trim($value));
}

/**
 * @param mixed $value
 */
function normalizeNullableIso8601Value($value): ?string
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    return OrderPayload::normalizeIso8601Utc(trim($value));
}

/**
 * @param array<string, mixed> $payload
 */
function staffOrderHasBlockingFlags(array $payload): bool
{
    if (BooleanOrArrayHasValues($payload['has_open_flags'] ?? null)) {
        return true;
    }
    if (is_array($payload['open_flags'] ?? null) && $payload['open_flags'] !== []) {
        return true;
    }
    foreach (is_array($payload['items'] ?? null) ? $payload['items'] : [] as $item) {
        if (is_array($item) && staffItemHasBlockingFlags($item)) {
            return true;
        }
    }

    return false;
}

/**
 * @param array<string, mixed> $item
 */
function staffItemHasBlockingFlags(array $item): bool
{
    if (is_array($item['open_flags'] ?? null) && $item['open_flags'] !== []) {
        return true;
    }

    $structuredAttributes = is_array($item['structured_attributes'] ?? null) ? $item['structured_attributes'] : [];
    return BooleanOrArrayHasValues($structuredAttributes['has_open_flags'] ?? null);
}

/**
 * @param mixed $value
 */
function BooleanOrArrayHasValues($value): bool
{
    if (is_bool($value)) {
        return $value;
    }
    return is_array($value) && $value !== [];
}

/**
 * @param array<int, array<string, mixed>> $items
 */
function findStaffPayloadItemIndexByLineId(array $items, string $lineId): int
{
    foreach ($items as $index => $item) {
        if (trim((string) ($item['line_id'] ?? '')) === $lineId) {
            return $index;
        }
    }

    return -1;
}
