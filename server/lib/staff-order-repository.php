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

final class InternalOrderNoteTooLongException extends \RuntimeException
{
}

final class CancelOrderNotAllowedException extends \RuntimeException
{
}

final class CompleteOrderNotAllowedException extends \RuntimeException
{
}

final class TestOrderDeletionNotAllowedException extends \RuntimeException
{
}

final class LegacyTestCleanupConflictException extends \RuntimeException
{
}

final class ShippingExportEventNotFoundException extends \RuntimeException
{
}

final class PdoStaffOrderRepository
{
    private const INTERNAL_NOTE_MAX_LENGTH = 4000;
    public const LEGACY_TEST_CLEANUP_TIMEZONE = 'America/Chicago';
    public const LEGACY_TEST_CLEANUP_CUTOFF_LOCAL = '2026-07-25 00:00:00';
    public const LEGACY_TEST_CLEANUP_EXCLUDED_PREVIEW_LIMIT = 5;
    public const LEGACY_TEST_CLEANUP_RELEASE_REASON = 'legacy_test_cleanup';
    public const CANCELLED_RELEASE_REASON = 'cancelled';
    public const COMPLETED_RELEASE_REASON = 'completed';
    public const DELETE_TEST_ORDER_RELEASE_REASON = 'deleted_test_order';
    public const TEST_ORDER_DELETE_CONFIRMATION_TEXT = 'DELETE TEST ORDER';
    public const SHIPPING_EXPORT_REQUIRED_ADDRESS_FIELDS = [
        'address_1',
        'city',
        'state',
        'postal_code',
        'country',
    ];
    private const ORDER_STATUS_SUBMITTED = 'submitted';
    private const ORDER_STATUS_TRAY_ASSIGNED = 'tray_assigned';
    private const ORDER_STATUS_IN_PRODUCTION = 'in_production';
    private const ORDER_STATUS_READY_TO_PACK = 'ready_to_pack';
    private const ORDER_STATUS_COMPLETED = 'completed';
    private const ORDER_STATUS_CANCELLED = 'cancelled';
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
    private ?PdoOutboundMessageRepository $outboundMessageRepository;

    /**
     * @param array{FORGE_TRAY_NUMBERS?: mixed} $trayConfig
     */
    public function __construct(PDO $pdo, array $trayConfig = [], ?PdoOutboundMessageRepository $outboundMessageRepository = null)
    {
        $this->pdo = $pdo;
        $this->trayConfig = $trayConfig;
        $this->outboundMessageRepository = $outboundMessageRepository;
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
                    forge_order_number,
                    record_version,
                    source,
                    submitted_at,
                    received_at,
                    updated_at,
                    device_id,
                    event_id,
                    internal_note,
                    payload_json,
                    payload_sha256,
                    production_status,
                    current_tray_number,
                    ready_to_pack_at,
                    cancelled_at,
                    completed_at
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
        $emailStatusesByOrderUuid = $this->loadOrderConfirmationMetadata($orderUuids);
        $completedTrayReleaseByOrderUuid = $this->loadCompletedTrayReleaseHistory($orderUuids);
        $normalized = [];
        foreach ($recordsByOrderUuid as $orderUuid => $record) {
            $normalized[] = normalizeStoredStaffOrderRecord(
                $record,
                $itemProductionRowsByOrder[$orderUuid] ?? [],
                $emailStatusesByOrderUuid[$orderUuid] ?? null,
                $completedTrayReleaseByOrderUuid[$orderUuid] ?? null
            );
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
                    forge_order_number,
                    record_version,
                    source,
                    submitted_at,
                    received_at,
                    updated_at,
                    device_id,
                    event_id,
                    internal_note,
                    payload_json,
                    payload_sha256,
                    production_status,
                    current_tray_number,
                    ready_to_pack_at,
                    cancelled_at,
                    completed_at
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

        return normalizeStoredStaffOrderRecord(
            $record,
            $this->loadItemProductionRowsForOrder($orderUuid),
            $this->loadOrderConfirmationMetadata([$orderUuid])[$orderUuid] ?? null,
            $this->loadCompletedTrayReleaseHistory([$orderUuid])[$orderUuid] ?? null
        );
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
        $timestamp = currentUtcDatabaseDateTime();

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
            $payloadItems = is_array($payload['items'] ?? null) ? $payload['items'] : [];
            $itemIndex = findStaffPayloadItemIndexByLineId($payloadItems, $normalizedLineId);
            if ($itemIndex < 0) {
                throw new ProductionOrderItemNotFoundException('That saved item could not be found.');
            }

            $this->ensureItemProductionRowsForOrder($orderUuid, $payloadItems, $timestamp);
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
            if ($derivedOrderStatus === self::ORDER_STATUS_READY_TO_PACK && $readyToPackAt === null) {
                $readyToPackAt = OrderPayload::databaseDateTimeToIso8601($timestamp);
            }
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

    /**
     * @return array{
     *   order: array<string, mixed>,
     *   internal_note: ?string
     * }
     */
    public function updateInternalNote(string $forgeOrderUuid, ?string $internalNote): array
    {
        $orderUuid = trim($forgeOrderUuid);
        if ($orderUuid === '') {
            throw new StaffOrderNotFoundException('That order could not be found.');
        }

        $normalizedInternalNote = normalizeInternalOrderNoteForStorage($internalNote, self::INTERNAL_NOTE_MAX_LENGTH);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $this->pdo->beginTransaction();

            $orderRow = $this->loadOrderRowForUpdate($orderUuid);
            if ($orderRow === null) {
                throw new StaffOrderNotFoundException('That order could not be found.');
            }

            $updateOrder = $this->pdo->prepare(
                'UPDATE forge_orders
                 SET internal_note = :internal_note,
                     updated_at = :updated_at
                 WHERE forge_order_uuid = :forge_order_uuid'
            );
            $updateOrder->bindValue(':internal_note', $normalizedInternalNote, $normalizedInternalNote === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $updateOrder->bindValue(':updated_at', $timestamp, PDO::PARAM_STR);
            $updateOrder->bindValue(':forge_order_uuid', $orderUuid, PDO::PARAM_STR);
            $updateOrder->execute();

            $updatedOrderRow = $this->loadOrderRowForUpdate($orderUuid);
            if (!is_array($updatedOrderRow)) {
                throw new StorageUnavailableException('Internal notes are currently unavailable.');
            }

            $this->pdo->commit();

            $normalizedOrder = normalizeStoredStaffOrderRecord(
                $updatedOrderRow,
                $this->loadItemProductionRowsForOrder($orderUuid)
            );

            return [
                'order' => $normalizedOrder,
                'internal_note' => $normalizedOrder['internal_note'] ?? null,
            ];
        } catch (
            StaffOrderNotFoundException
            | InternalOrderNoteTooLongException
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
            throw new StorageUnavailableException('Internal notes are currently unavailable.', 0, $exception);
        }
    }

    /**
     * @return array{
     *   already_applied: bool,
     *   order: array<string, mixed>,
     *   tray: ?array<string, mixed>,
     *   assignment_history: ?array<string, mixed>
     * }
     */
    public function completeOrder(string $forgeOrderUuid): array
    {
        $orderUuid = trim($forgeOrderUuid);
        if ($orderUuid === '') {
            throw new StaffOrderNotFoundException('That order could not be found.');
        }

        $timestamp = currentUtcDatabaseDateTime();

        try {
            $this->pdo->beginTransaction();

            $orderRow = $this->loadOrderRowForUpdate($orderUuid);
            if ($orderRow === null) {
                throw new StaffOrderNotFoundException('That order could not be found.');
            }

            $lockedOrder = normalizeStoredStaffOrderRecord(
                $orderRow,
                $this->loadItemProductionRowsForOrderForUpdate($orderUuid),
                $this->loadOrderConfirmationMetadata([$orderUuid])[$orderUuid] ?? null
            );
            $productionStatus = is_string($lockedOrder['production_status'] ?? null)
                ? $lockedOrder['production_status']
                : self::ORDER_STATUS_SUBMITTED;

            if ($productionStatus === self::ORDER_STATUS_COMPLETED) {
                $this->pdo->commit();
                return [
                    'already_applied' => true,
                    'order' => $lockedOrder,
                    'tray' => null,
                    'assignment_history' => null,
                ];
            }

            if ($productionStatus === self::ORDER_STATUS_CANCELLED) {
                throw new CompleteOrderNotAllowedException('Cancelled orders cannot be completed.');
            }

            if ($productionStatus !== self::ORDER_STATUS_READY_TO_PACK) {
                throw new CompleteOrderNotAllowedException('Only ready-to-pack orders can be completed.');
            }

            $currentTrayNumber = normalizeNullableTrayNumber($lockedOrder['current_tray_number'] ?? null);
            if ($currentTrayNumber === null) {
                throw new CompleteOrderNotAllowedException('This order no longer has an assigned tray.');
            }

            $counts = deriveStaffOrderCompletionCounts($lockedOrder['payload']['items'] ?? []);
            if ($counts['total_item_count'] <= 0 || $counts['completed_item_count'] !== $counts['total_item_count']) {
                throw new CompleteOrderNotAllowedException('Every required item must be complete before finishing this order.');
            }
            if (staffOrderHasBlockingFlags($lockedOrder['payload'] ?? [])) {
                throw new CompleteOrderNotAllowedException('Resolve every open flag before finishing this order.');
            }

            $trayRow = $this->loadTrayRowForUpdate($currentTrayNumber);
            if ($trayRow === null) {
                throw new CompleteOrderNotAllowedException(sprintf('Tray %d could not be found.', $currentTrayNumber));
            }

            $normalizedTray = normalizeStoredTrayRecord($trayRow);
            if (($normalizedTray['tray_status'] ?? '') !== self::TRAY_STATUS_ASSIGNED) {
                throw new CompleteOrderNotAllowedException(sprintf('Tray %d is no longer assigned.', $currentTrayNumber));
            }
            if (trim((string) ($normalizedTray['current_order_uuid'] ?? '')) !== $orderUuid) {
                throw new CompleteOrderNotAllowedException(sprintf('Tray %d is assigned to a different order.', $currentTrayNumber));
            }

            $activeHistory = $this->loadActiveAssignmentHistoryForUpdate($orderUuid, $currentTrayNumber);
            if (!is_array($activeHistory)) {
                throw new CompleteOrderNotAllowedException(sprintf('Tray %d does not have an active assignment record for this order.', $currentTrayNumber));
            }

            $updateOrder = $this->pdo->prepare(
                'UPDATE forge_orders
                 SET production_status = :production_status,
                     current_tray_number = NULL,
                     completed_at = :completed_at,
                     updated_at = :updated_at
                 WHERE forge_order_uuid = :forge_order_uuid'
            );
            $updateOrder->execute([
                ':production_status' => self::ORDER_STATUS_COMPLETED,
                ':completed_at' => $timestamp,
                ':updated_at' => $timestamp,
                ':forge_order_uuid' => $orderUuid,
            ]);

            $updateTray = $this->pdo->prepare(
                'UPDATE forge_production_trays
                 SET tray_status = :tray_status,
                     current_order_uuid = NULL,
                     assigned_at = NULL,
                     updated_at = :updated_at
                 WHERE tray_number = :tray_number'
            );
            $updateTray->execute([
                ':tray_status' => self::TRAY_STATUS_AVAILABLE,
                ':updated_at' => $timestamp,
                ':tray_number' => $currentTrayNumber,
            ]);

            $updateHistory = $this->pdo->prepare(
                'UPDATE forge_tray_assignment_history
                 SET released_at = :released_at,
                     release_reason = :release_reason
                 WHERE tray_assignment_id = :tray_assignment_id'
            );
            $updateHistory->execute([
                ':released_at' => $timestamp,
                ':release_reason' => self::COMPLETED_RELEASE_REASON,
                ':tray_assignment_id' => $activeHistory['tray_assignment_id'],
            ]);

            $updatedOrderRow = $this->loadOrderRowForUpdate($orderUuid);
            $updatedTrayRow = $this->loadTrayRowForUpdate($currentTrayNumber);
            $releasedHistory = $this->loadAssignmentHistoryById((string) $activeHistory['tray_assignment_id']);
            if (!is_array($updatedOrderRow) || !is_array($updatedTrayRow) || !is_array($releasedHistory)) {
                throw new StorageUnavailableException('Order completion is currently unavailable.');
            }

            $this->pdo->commit();

            return [
                'already_applied' => false,
                'order' => normalizeStoredStaffOrderRecord(
                    $updatedOrderRow,
                    $this->loadItemProductionRowsForOrder($orderUuid),
                    $this->loadOrderConfirmationMetadata([$orderUuid])[$orderUuid] ?? null,
                    $releasedHistory
                ),
                'tray' => normalizeStoredTrayRecord($updatedTrayRow),
                'assignment_history' => normalizeStoredTrayAssignmentHistoryRecord($releasedHistory),
            ];
        } catch (
            StaffOrderNotFoundException
            | CompleteOrderNotAllowedException
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
            throw new StorageUnavailableException('Order completion is currently unavailable.', 0, $exception);
        }
    }

    /**
     * @return array{
     *   order: array<string, mixed>,
     *   tray: ?array<string, mixed>,
     *   assignment_history: ?array<string, mixed>
     * }
     */
    public function cancelOrder(string $forgeOrderUuid): array
    {
        $orderUuid = trim($forgeOrderUuid);
        if ($orderUuid === '') {
            throw new StaffOrderNotFoundException('That order could not be found.');
        }

        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $this->pdo->beginTransaction();

            $orderRow = $this->loadOrderRowForUpdate($orderUuid);
            if ($orderRow === null) {
                throw new StaffOrderNotFoundException('That order could not be found.');
            }

            $lockedOrder = normalizeStoredStaffOrderRecord($orderRow, $this->loadItemProductionRowsForOrderForUpdate($orderUuid));
            $eventSnapshot = is_array($lockedOrder['payload']['event'] ?? null) ? $lockedOrder['payload']['event'] : null;
            if (($eventSnapshot['event_type'] ?? null) === 'test_session') {
                throw new CancelOrderNotAllowedException('Test Session orders must be deleted with Delete Test Order.');
            }

            $productionStatus = is_string($lockedOrder['production_status'] ?? null)
                ? $lockedOrder['production_status']
                : self::ORDER_STATUS_SUBMITTED;
            if ($productionStatus === self::ORDER_STATUS_CANCELLED) {
                throw new CancelOrderNotAllowedException('This order has already been cancelled.');
            }

            $currentTrayNumber = normalizeNullableTrayNumber($lockedOrder['current_tray_number'] ?? null);
            $releasedTray = null;
            $releasedHistory = null;

            $updateOrder = $this->pdo->prepare(
                'UPDATE forge_orders
                 SET production_status = :production_status,
                     current_tray_number = NULL,
                     cancelled_at = :cancelled_at,
                     ready_to_pack_at = NULL,
                     updated_at = :updated_at
                 WHERE forge_order_uuid = :forge_order_uuid'
            );
            $updateOrder->execute([
                ':production_status' => self::ORDER_STATUS_CANCELLED,
                ':cancelled_at' => $timestamp,
                ':updated_at' => $timestamp,
                ':forge_order_uuid' => $orderUuid,
            ]);

            if ($currentTrayNumber !== null) {
                $trayRow = $this->loadTrayRowForUpdate($currentTrayNumber);
                if ($trayRow !== null) {
                    $updateTray = $this->pdo->prepare(
                        'UPDATE forge_production_trays
                         SET tray_status = :tray_status,
                             current_order_uuid = NULL,
                             assigned_at = NULL,
                             updated_at = :updated_at
                         WHERE tray_number = :tray_number'
                    );
                    $updateTray->execute([
                        ':tray_status' => self::TRAY_STATUS_AVAILABLE,
                        ':updated_at' => $timestamp,
                        ':tray_number' => $currentTrayNumber,
                    ]);
                }

                $activeHistory = $this->loadActiveAssignmentHistoryForUpdate($orderUuid, $currentTrayNumber);
                if (is_array($activeHistory)) {
                    $updateHistory = $this->pdo->prepare(
                        'UPDATE forge_tray_assignment_history
                         SET released_at = :released_at,
                             release_reason = :release_reason
                         WHERE tray_assignment_id = :tray_assignment_id'
                    );
                    $updateHistory->execute([
                        ':released_at' => $timestamp,
                        ':release_reason' => self::CANCELLED_RELEASE_REASON,
                        ':tray_assignment_id' => $activeHistory['tray_assignment_id'],
                    ]);
                    $releasedHistory = $this->loadAssignmentHistoryById((string) $activeHistory['tray_assignment_id']);
                }

                $updatedTrayRow = $this->loadTrayRowForUpdate($currentTrayNumber);
                $releasedTray = is_array($updatedTrayRow) ? normalizeStoredTrayRecord($updatedTrayRow) : null;
            }

            $updatedOrderRow = $this->loadOrderRowForUpdate($orderUuid);
            if (!is_array($updatedOrderRow)) {
                throw new StorageUnavailableException('Order cancellation is currently unavailable.');
            }

            $this->pdo->commit();

            return [
                'order' => normalizeStoredStaffOrderRecord($updatedOrderRow, $this->loadItemProductionRowsForOrder($orderUuid)),
                'tray' => $releasedTray,
                'assignment_history' => is_array($releasedHistory) ? normalizeStoredTrayAssignmentHistoryRecord($releasedHistory) : null,
            ];
        } catch (
            StaffOrderNotFoundException
            | CancelOrderNotAllowedException
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
            throw new StorageUnavailableException('Order cancellation is currently unavailable.', 0, $exception);
        }
    }

    /**
     * @return array{
     *   deleted_order_uuid: string,
     *   deleted_order_number: ?int,
     *   released_tray_number: ?int
     * }
     */
    public function deleteTestOrder(string $forgeOrderUuid, string $confirmationText): array
    {
        $orderUuid = trim($forgeOrderUuid);
        $normalizedConfirmationText = trim($confirmationText);
        if ($orderUuid === '') {
            throw new StaffOrderNotFoundException('That order could not be found.');
        }
        if ($normalizedConfirmationText !== self::TEST_ORDER_DELETE_CONFIRMATION_TEXT) {
            throw new \InvalidArgumentException('Enter DELETE TEST ORDER before deleting this order.');
        }

        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $this->pdo->beginTransaction();

            $orderRow = $this->loadOrderRowForUpdate($orderUuid);
            if ($orderRow === null) {
                throw new StaffOrderNotFoundException('That order could not be found.');
            }

            $lockedOrder = normalizeStoredStaffOrderRecord($orderRow, $this->loadItemProductionRowsForOrderForUpdate($orderUuid));
            $eventSnapshot = is_array($lockedOrder['payload']['event'] ?? null) ? $lockedOrder['payload']['event'] : null;
            if (($eventSnapshot['event_type'] ?? null) !== 'test_session') {
                throw new TestOrderDeletionNotAllowedException('Only Test Session orders can be permanently deleted.');
            }

            $orderNumber = normalizeNullableOrderNumber($lockedOrder['forge_order_number'] ?? null);
            $releasedTrayNumber = normalizeNullableTrayNumber($lockedOrder['current_tray_number'] ?? null);

            if ($releasedTrayNumber !== null) {
                $updateTray = $this->pdo->prepare(
                    'UPDATE forge_production_trays
                     SET tray_status = :tray_status,
                         current_order_uuid = NULL,
                         assigned_at = NULL,
                         updated_at = :updated_at
                     WHERE current_order_uuid = :forge_order_uuid'
                );
                $updateTray->execute([
                    ':tray_status' => self::TRAY_STATUS_AVAILABLE,
                    ':updated_at' => $timestamp,
                    ':forge_order_uuid' => $orderUuid,
                ]);

                $updateHistory = $this->pdo->prepare(
                    'UPDATE forge_tray_assignment_history
                     SET released_at = :released_at,
                         release_reason = :release_reason
                     WHERE forge_order_uuid = :forge_order_uuid
                       AND released_at IS NULL'
                );
                $updateHistory->execute([
                    ':released_at' => $timestamp,
                    ':release_reason' => self::DELETE_TEST_ORDER_RELEASE_REASON,
                    ':forge_order_uuid' => $orderUuid,
                ]);
            }

            $this->executeUuidBatchMutation(
                'DELETE FROM forge_order_item_production WHERE forge_order_uuid IN (%s)',
                [$orderUuid]
            );
            $this->executeUuidBatchMutation(
                'DELETE FROM forge_tray_assignment_history WHERE forge_order_uuid IN (%s)',
                [$orderUuid]
            );

            $insertTombstone = $this->pdo->prepare(
                'INSERT INTO forge_order_cleanup_tombstones (
                    forge_order_uuid,
                    deleted_at
                 ) VALUES (
                    :forge_order_uuid,
                    :deleted_at
                 )'
            );
            $insertTombstone->execute([
                ':forge_order_uuid' => $orderUuid,
                ':deleted_at' => $timestamp,
            ]);

            $deleteOrder = $this->pdo->prepare(
                'DELETE FROM forge_orders WHERE forge_order_uuid = :forge_order_uuid'
            );
            $deleteOrder->execute([
                ':forge_order_uuid' => $orderUuid,
            ]);

            $this->pdo->commit();

            return [
                'deleted_order_uuid' => $orderUuid,
                'deleted_order_number' => $orderNumber,
                'released_tray_number' => $releasedTrayNumber,
            ];
        } catch (
            StaffOrderNotFoundException
            | TestOrderDeletionNotAllowedException
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
            throw new StorageUnavailableException('Test order deletion is currently unavailable.', 0, $exception);
        }
    }

    /**
     * @return array{
     *   cutoff_timezone: string,
     *   cutoff_local: string,
     *   cutoff_utc: string,
     *   eligible_count: int,
     *   confirmation_text: string,
     *   preview_signature: string,
     *   eligible_orders: array<int, array<string, mixed>>,
     *   protected_orders: array<int, array<string, mixed>>
     * }
     */
    public function previewLegacyTestCleanup(): array
    {
        $cutoffDatabase = legacyTestCleanupCutoffDatabase();

        try {
            $eligibleRows = $this->loadLegacyCleanupRows($cutoffDatabase, true, false);
            $protectedRows = $this->loadLegacyCleanupRows($cutoffDatabase, false, false, self::LEGACY_TEST_CLEANUP_EXCLUDED_PREVIEW_LIMIT);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Legacy test cleanup is currently unavailable.', 0, $exception);
        }

        $eligibleCount = count($eligibleRows);

        return [
            'cutoff_timezone' => self::LEGACY_TEST_CLEANUP_TIMEZONE,
            'cutoff_local' => legacyTestCleanupCutoffLocalIso8601(),
            'cutoff_utc' => OrderPayload::databaseDateTimeToIso8601($cutoffDatabase),
            'eligible_count' => $eligibleCount,
            'confirmation_text' => buildLegacyTestCleanupConfirmationText($eligibleCount),
            'preview_signature' => buildLegacyTestCleanupPreviewSignature($eligibleRows),
            'eligible_orders' => array_map(__NAMESPACE__ . '\\normalizeLegacyTestCleanupPreviewRow', $eligibleRows),
            'protected_orders' => array_map(__NAMESPACE__ . '\\normalizeLegacyTestCleanupPreviewRow', $protectedRows),
        ];
    }

    /**
     * @return array{
     *   deleted_count: int,
     *   released_tray_numbers: array<int, int>,
     *   deleted_order_uuids: array<int, string>
     * }
     */
    public function applyLegacyTestCleanup(string $previewSignature, int $expectedCount, string $confirmationText): array
    {
        $normalizedSignature = trim($previewSignature);
        $normalizedExpectedCount = max(0, $expectedCount);
        $normalizedConfirmationText = trim($confirmationText);
        $cutoffDatabase = legacyTestCleanupCutoffDatabase();

        if ($normalizedSignature === '') {
            throw new \InvalidArgumentException('A valid cleanup preview signature is required.');
        }

        $expectedConfirmationText = buildLegacyTestCleanupConfirmationText($normalizedExpectedCount);
        if ($normalizedConfirmationText !== $expectedConfirmationText) {
            throw new \InvalidArgumentException('Enter the exact cleanup confirmation text before deleting anything.');
        }

        try {
            $this->pdo->beginTransaction();

            $eligibleRows = $this->loadLegacyCleanupRows($cutoffDatabase, true, true);
            $currentCount = count($eligibleRows);
            $currentSignature = buildLegacyTestCleanupPreviewSignature($eligibleRows);

            if ($currentCount !== $normalizedExpectedCount || !hash_equals($normalizedSignature, $currentSignature)) {
                throw new LegacyTestCleanupConflictException('Eligible orders changed. Run a new preview before deleting anything.');
            }

            if ($currentCount === 0) {
                throw new LegacyTestCleanupConflictException('No legacy test orders are currently eligible for cleanup.');
            }

            $timestamp = gmdate('Y-m-d H:i:s.u');
            $deletedOrderUuids = [];
            $releasedTrayNumbers = [];

            foreach ($eligibleRows as $row) {
                $orderUuid = trim((string) ($row['forge_order_uuid'] ?? ''));
                if ($orderUuid === '') {
                    throw new StorageUnavailableException('Legacy test cleanup could not be completed safely.');
                }

                $submittedAtDatabase = is_string($row['submitted_at'] ?? null) ? $row['submitted_at'] : '';
                if ($submittedAtDatabase === '' || strcmp($submittedAtDatabase, $cutoffDatabase) >= 0) {
                    throw new LegacyTestCleanupConflictException('Eligible orders changed. Run a new preview before deleting anything.');
                }

                $deletedOrderUuids[] = $orderUuid;
                $trayNumber = normalizeNullableTrayNumber($row['current_tray_number'] ?? null);
                if ($trayNumber !== null) {
                    $releasedTrayNumbers[] = $trayNumber;
                }
            }

            foreach ($deletedOrderUuids as $orderUuid) {
                $statement = $this->pdo->prepare(
                    'UPDATE forge_production_trays
                     SET tray_status = :tray_status,
                         current_order_uuid = NULL,
                         assigned_at = NULL,
                         updated_at = :updated_at
                     WHERE current_order_uuid = :forge_order_uuid'
                );
                $statement->execute([
                    ':tray_status' => self::TRAY_STATUS_AVAILABLE,
                    ':updated_at' => $timestamp,
                    ':forge_order_uuid' => $orderUuid,
                ]);

                $statement = $this->pdo->prepare(
                    'UPDATE forge_tray_assignment_history
                     SET released_at = :released_at,
                         release_reason = :release_reason
                     WHERE forge_order_uuid = :forge_order_uuid
                       AND released_at IS NULL'
                );
                $statement->execute([
                    ':released_at' => $timestamp,
                    ':release_reason' => self::LEGACY_TEST_CLEANUP_RELEASE_REASON,
                    ':forge_order_uuid' => $orderUuid,
                ]);
            }

            $this->executeUuidBatchMutation(
                'DELETE FROM forge_order_item_production WHERE forge_order_uuid IN (%s)',
                $deletedOrderUuids
            );
            $this->executeUuidBatchMutation(
                'DELETE FROM forge_tray_assignment_history WHERE forge_order_uuid IN (%s)',
                $deletedOrderUuids
            );

            $insertTombstone = $this->pdo->prepare(
                'INSERT INTO forge_order_cleanup_tombstones (
                    forge_order_uuid,
                    deleted_at
                 ) VALUES (
                    :forge_order_uuid,
                    :deleted_at
                 )'
            );
            foreach ($deletedOrderUuids as $orderUuid) {
                $insertTombstone->execute([
                    ':forge_order_uuid' => $orderUuid,
                    ':deleted_at' => $timestamp,
                ]);
            }

            $this->executeUuidBatchMutation(
                'DELETE FROM forge_orders WHERE forge_order_uuid IN (%s)',
                $deletedOrderUuids
            );

            $this->pdo->commit();

            $releasedTrayNumbers = array_values(array_unique(array_map('intval', $releasedTrayNumbers)));
            sort($releasedTrayNumbers, SORT_NUMERIC);

            return [
                'deleted_count' => count($deletedOrderUuids),
                'released_tray_numbers' => $releasedTrayNumbers,
                'deleted_order_uuids' => $deletedOrderUuids,
            ];
        } catch (
            LegacyTestCleanupConflictException
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
            throw new StorageUnavailableException('Legacy test cleanup is currently unavailable.', 0, $exception);
        }
    }

    /**
     * @return array{
     *   event: array<string, mixed>,
     *   included_count: int,
     *   excluded_count: int,
     *   shipping_order_count: int,
     *   has_exportable_rows: bool,
     *   csv_filename: string,
     *   included_orders: array<int, array<string, mixed>>,
     *   excluded_orders: array<int, array<string, mixed>>
     * }
     */
    public function previewShippingExportForEvent(string $eventId): array
    {
        $event = $this->loadShippingExportEvent($eventId);
        $rows = $this->loadShippingExportRows($event['event_id']);
        $preview = buildShippingExportPreview($event, $rows);

        return [
            'event' => $preview['event'],
            'included_count' => count($preview['included_orders']),
            'excluded_count' => count($preview['excluded_orders']),
            'shipping_order_count' => $preview['shipping_order_count'],
            'has_exportable_rows' => count($preview['included_orders']) > 0,
            'csv_filename' => $preview['csv_filename'],
            'included_orders' => $preview['included_orders'],
            'excluded_orders' => $preview['excluded_orders'],
        ];
    }

    /**
     * @return array{filename: string, csv: string}
     */
    public function generateShippingExportCsvForEvent(string $eventId): array
    {
        $preview = $this->previewShippingExportForEvent($eventId);
        $includedOrders = is_array($preview['included_orders'] ?? null) ? $preview['included_orders'] : [];
        if ($includedOrders === []) {
            throw new \InvalidArgumentException('No shipping orders with complete addresses are available for that event.');
        }

        return [
            'filename' => (string) $preview['csv_filename'],
            'csv' => buildShippingExportCsv($includedOrders),
        ];
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
                forge_order_number,
                record_version,
                source,
                submitted_at,
                received_at,
                updated_at,
                device_id,
                event_id,
                internal_note,
                payload_json,
                payload_sha256,
                    production_status,
                    current_tray_number,
                    ready_to_pack_at,
                    cancelled_at,
                    completed_at
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

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadLegacyCleanupRows(string $cutoffDatabase, bool $eligible, bool $forUpdate, ?int $limit = null): array
    {
        $comparison = $eligible ? '<' : '>=';
        $orderDirection = 'submitted_at ASC, forge_order_uuid ASC';
        $limitClause = $limit !== null ? ' LIMIT :limit' : '';
        $forUpdateClause = $forUpdate ? ' FOR UPDATE' : '';

        $statement = $this->pdo->prepare(
            "SELECT
                forge_order_uuid,
                forge_order_number,
                submitted_at,
                updated_at,
                event_id,
                current_tray_number,
                payload_json
             FROM forge_orders
             WHERE submitted_at {$comparison} :cutoff_submitted_at
             ORDER BY {$orderDirection}{$limitClause}{$forUpdateClause}"
        );
        $statement->bindValue(':cutoff_submitted_at', $cutoffDatabase, PDO::PARAM_STR);
        if ($limit !== null) {
            $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
        }
        $statement->execute();

        $rows = $statement->fetchAll();
        return is_array($rows) ? $rows : [];
    }

    /**
     * @return array<string, mixed>
     */
    private function loadShippingExportEvent(string $eventId): array
    {
        $normalizedEventId = trim($eventId);
        if ($normalizedEventId === '') {
            throw new ShippingExportEventNotFoundException('That event could not be found.');
        }

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    event_id,
                    public_order_token,
                    event_name,
                    event_type,
                    start_date,
                    end_date,
                    event_location,
                    event_status
                 FROM forge_events
                 WHERE event_id = :event_id
                 LIMIT 1'
            );
            $statement->execute([
                ':event_id' => $normalizedEventId,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Shipping export is currently unavailable.', 0, $exception);
        }

        if (!is_array($record)) {
            throw new ShippingExportEventNotFoundException('That event could not be found.');
        }

        return [
            'event_id' => trim((string) ($record['event_id'] ?? '')),
            'public_order_token' => normalizeNullableString($record['public_order_token'] ?? null),
            'event_name' => trim((string) ($record['event_name'] ?? '')),
            'event_type' => trim((string) ($record['event_type'] ?? '')),
            'start_date' => trim((string) ($record['start_date'] ?? '')),
            'end_date' => trim((string) ($record['end_date'] ?? '')),
            'event_location' => normalizeNullableString($record['event_location'] ?? null),
            'event_status' => trim((string) ($record['event_status'] ?? '')),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadShippingExportRows(string $eventId): array
    {
        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    forge_order_uuid,
                    forge_order_number,
                    submitted_at,
                    event_id,
                    payload_json,
                    production_status,
                    cancelled_at
                 FROM forge_orders
                 WHERE event_id = :event_id
                 ORDER BY submitted_at ASC, forge_order_uuid ASC'
            );
            $statement->execute([
                ':event_id' => $eventId,
            ]);
            $rows = $statement->fetchAll();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Shipping export is currently unavailable.', 0, $exception);
        }

        return is_array($rows) ? $rows : [];
    }

    /**
     * @param array<int, string> $orderUuids
     */
    private function executeUuidBatchMutation(string $sqlTemplate, array $orderUuids): void
    {
        $normalizedOrderUuids = array_values(array_filter(array_map(static function ($value): string {
            return is_string($value) ? trim($value) : '';
        }, $orderUuids), static function (string $value): bool {
            return $value !== '';
        }));

        if ($normalizedOrderUuids === []) {
            return;
        }

        $placeholders = implode(', ', array_fill(0, count($normalizedOrderUuids), '?'));
        $statement = $this->pdo->prepare(sprintf($sqlTemplate, $placeholders));
        foreach ($normalizedOrderUuids as $index => $orderUuid) {
            $statement->bindValue($index + 1, $orderUuid, PDO::PARAM_STR);
        }
        $statement->execute();
    }

    /**
     * @param array<int, string> $orderUuids
     * @return array<string, array{status: string, sent_at: ?string, last_attempt_at: ?string}>
     */
    private function loadOrderConfirmationMetadata(array $orderUuids): array
    {
        if ($this->outboundMessageRepository === null) {
            return [];
        }

        return $this->outboundMessageRepository->listLatestOrderConfirmationMetadataByOrderUuid($orderUuids);
    }

    /**
     * @param array<int, string> $orderUuids
     * @return array<string, array<string, mixed>>
     */
    private function loadCompletedTrayReleaseHistory(array $orderUuids): array
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
                    tray_assignment_id,
                    tray_number,
                    forge_order_uuid,
                    assigned_at,
                    released_at,
                    release_reason
                 FROM forge_tray_assignment_history
                 WHERE forge_order_uuid IN ({$placeholders})
                   AND release_reason = ?
                   AND released_at IS NOT NULL
                 ORDER BY forge_order_uuid ASC, released_at DESC, tray_assignment_id DESC"
            );
            foreach ($normalizedOrderUuids as $index => $orderUuid) {
                $statement->bindValue($index + 1, $orderUuid, PDO::PARAM_STR);
            }
            $statement->bindValue(count($normalizedOrderUuids) + 1, PdoStaffOrderRepository::COMPLETED_RELEASE_REASON, PDO::PARAM_STR);
            $statement->execute();
            $rows = $statement->fetchAll();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
        }

        $historyByOrderUuid = [];
        if (!is_array($rows)) {
            return $historyByOrderUuid;
        }

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $orderUuid = trim((string) ($row['forge_order_uuid'] ?? ''));
            if ($orderUuid === '' || array_key_exists($orderUuid, $historyByOrderUuid)) {
                continue;
            }
            $historyByOrderUuid[$orderUuid] = $row;
        }

        return $historyByOrderUuid;
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
 * @param array<string, mixed>|null $completedTrayRelease
 * @return array<string, mixed>
 */
function normalizeStoredStaffOrderRecord($record, array $itemProductionRows = [], ?array $confirmationEmailStatus = null, ?array $completedTrayRelease = null): array
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
    $completedAt = normalizeStaffCompletedAt($record['completed_at'] ?? null, $productionStatus);
    $confirmationEmailStatusRecord = normalizeStaffOrderConfirmationEmailStatus($confirmationEmailStatus);
    $normalizedCompletedTrayRelease = is_array($completedTrayRelease)
        ? normalizeStoredTrayAssignmentHistoryRecord($completedTrayRelease)
        : null;

    return [
        'forge_order_uuid' => trim((string) ($record['forge_order_uuid'] ?? '')),
        'forge_order_number' => normalizeNullableOrderNumber($record['forge_order_number'] ?? ($payload['forge_order_number'] ?? null)),
        'record_version' => trim((string) ($record['record_version'] ?? '')),
        'source' => trim((string) ($record['source'] ?? '')),
        'submitted_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['submitted_at'] ?? '')),
        'received_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['received_at'] ?? '')),
        'updated_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['updated_at'] ?? '')),
        'device_id' => normalizeNullableString($record['device_id'] ?? null),
        'event_id' => normalizeNullableString($record['event_id'] ?? null),
        'internal_note' => normalizeStoredInternalOrderNote($record['internal_note'] ?? null),
        'has_internal_note' => normalizeStoredInternalOrderNote($record['internal_note'] ?? null) !== null,
        'payload_sha256' => trim((string) ($record['payload_sha256'] ?? '')),
        'payload' => withNormalizedPayloadOrderNumber(
            $normalizedPayload,
            normalizeNullableOrderNumber($record['forge_order_number'] ?? ($payload['forge_order_number'] ?? null))
        ),
        'production_status' => $productionStatus,
        'current_tray_number' => $currentTrayNumber,
        'total_item_count' => $counts['total_item_count'],
        'completed_item_count' => $counts['completed_item_count'],
        'ready_to_pack_at' => $readyToPackAt,
        'cancelled_at' => normalizeNullableDatabaseDateTime($record['cancelled_at'] ?? null),
        'completed_at' => $completedAt,
        'completed_tray_release' => $normalizedCompletedTrayRelease,
        'has_open_flags' => $hasOpenFlags,
        'confirmation_email_status' => $confirmationEmailStatusRecord['label'],
        'confirmation_email_status_key' => $confirmationEmailStatusRecord['status_key'],
        'confirmation_email_timestamp' => $confirmationEmailStatusRecord['timestamp'],
    ];
}

/**
 * @param array{status?: string, sent_at?: ?string, last_attempt_at?: ?string}|null $record
 * @return array{label: string, status_key: string, timestamp: ?string}
 */
function normalizeStaffOrderConfirmationEmailStatus(?array $record): array
{
    $status = is_array($record) ? trim((string) ($record['status'] ?? '')) : '';
    $sentAt = is_array($record) ? normalizeNullableIso8601Value($record['sent_at'] ?? null) : null;
    $lastAttemptAt = is_array($record) ? normalizeNullableIso8601Value($record['last_attempt_at'] ?? null) : null;

    return match ($status) {
        OutboundMessageStatus::SENT => [
            'label' => 'Email Sent',
            'status_key' => 'sent',
            'timestamp' => $sentAt,
        ],
        OutboundMessageStatus::PENDING => [
            'label' => 'Email Pending',
            'status_key' => 'pending',
            'timestamp' => null,
        ],
        OutboundMessageStatus::FAILED => [
            'label' => 'Email Failed',
            'status_key' => 'failed',
            'timestamp' => $lastAttemptAt,
        ],
        OutboundMessageStatus::SKIPPED_TEST => [
            'label' => 'Email Skipped — Test Order',
            'status_key' => 'skipped_test',
            'timestamp' => null,
        ],
        default => [
            'label' => 'Email Not Scheduled',
            'status_key' => 'not_scheduled',
            'timestamp' => null,
        ],
    };
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
 */
function normalizeStoredInternalOrderNote($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = str_replace(["\r\n", "\r"], "\n", $value);
    return trim($normalized) === '' ? null : $normalized;
}

function currentUtcDatabaseDateTime(): string
{
    return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
}

function legacyTestCleanupCutoffDatabase(): string
{
    $cutoff = new \DateTimeImmutable(
        PdoStaffOrderRepository::LEGACY_TEST_CLEANUP_CUTOFF_LOCAL,
        new \DateTimeZone(PdoStaffOrderRepository::LEGACY_TEST_CLEANUP_TIMEZONE)
    );

    return $cutoff
        ->setTimezone(new \DateTimeZone('UTC'))
        ->format('Y-m-d H:i:s.u');
}

function legacyTestCleanupCutoffLocalIso8601(): string
{
    return (new \DateTimeImmutable(
        PdoStaffOrderRepository::LEGACY_TEST_CLEANUP_CUTOFF_LOCAL,
        new \DateTimeZone(PdoStaffOrderRepository::LEGACY_TEST_CLEANUP_TIMEZONE)
    ))->format(\DateTimeInterface::ATOM);
}

function buildLegacyTestCleanupConfirmationText(int $eligibleCount): string
{
    return sprintf('DELETE %d ORDERS BEFORE JULY 25', max(0, $eligibleCount));
}

/**
 * @param array<int, array<string, mixed>> $records
 */
function buildLegacyTestCleanupPreviewSignature(array $records): string
{
    $signatureRows = array_map(static function (array $record): array {
        return [
            'forge_order_uuid' => trim((string) ($record['forge_order_uuid'] ?? '')),
            'submitted_at' => is_string($record['submitted_at'] ?? null) ? $record['submitted_at'] : '',
            'updated_at' => is_string($record['updated_at'] ?? null) ? $record['updated_at'] : '',
            'current_tray_number' => normalizeNullableTrayNumber($record['current_tray_number'] ?? null),
            'event_id' => normalizeNullableString($record['event_id'] ?? null),
        ];
    }, $records);

    try {
        return hash('sha256', json_encode($signatureRows, JSON_THROW_ON_ERROR));
    } catch (JsonException $exception) {
        throw new \InvalidArgumentException('A valid cleanup preview signature could not be generated.', 0, $exception);
    }
}

/**
 * @param array<string, mixed> $record
 * @return array<string, mixed>
 */
function normalizeLegacyTestCleanupPreviewRow(array $record): array
{
    $payloadJson = is_string($record['payload_json'] ?? null) ? $record['payload_json'] : '';
    $payload = [];
    if ($payloadJson !== '') {
        try {
            $decodedPayload = json_decode($payloadJson, true, 512, JSON_THROW_ON_ERROR);
            if (is_array($decodedPayload)) {
                $payload = $decodedPayload;
            }
        } catch (JsonException $exception) {
            unset($exception);
        }
    }

    $eventName = is_array($payload['event'] ?? null) && is_string($payload['event']['event_name'] ?? null)
        ? trim((string) $payload['event']['event_name'])
        : '';
    $eventId = normalizeNullableString($record['event_id'] ?? ($payload['event']['event_id'] ?? null));
    $orderNumber = normalizeNullableOrderNumber($record['forge_order_number'] ?? ($payload['forge_order_number'] ?? null));
    $orderReference = $orderNumber !== null
        ? sprintf('Order %d', $orderNumber)
        : sprintf('Order %s', strtoupper(substr(trim((string) ($record['forge_order_uuid'] ?? '')), 0, 8)));

    return [
        'forge_order_uuid' => trim((string) ($record['forge_order_uuid'] ?? '')),
        'forge_order_number' => $orderNumber,
        'order_reference' => $orderReference,
        'customer_name' => is_array($payload['customer'] ?? null)
            ? trim((string) ($payload['customer']['full_name'] ?? ''))
            : '',
        'submitted_at' => OrderPayload::databaseDateTimeToIso8601((string) ($record['submitted_at'] ?? '')),
        'event_label' => $eventName !== '' ? $eventName : $eventId,
        'tray_number' => normalizeNullableTrayNumber($record['current_tray_number'] ?? null),
    ];
}

/**
 * @param mixed $value
 */
function normalizeInternalOrderNoteForStorage($value, int $maxLength): ?string
{
    if ($value === null) {
        return null;
    }

    if (!is_string($value)) {
        throw new \InvalidArgumentException('A valid internal note is required.');
    }

    $normalized = str_replace(["\r\n", "\r"], "\n", $value);
    if (trim($normalized) === '') {
        return null;
    }

    if (function_exists('mb_strlen')) {
        $noteLength = mb_strlen($normalized, 'UTF-8');
    } else {
        $noteLength = strlen($normalized);
    }

    if ($noteLength > $maxLength) {
        throw new InternalOrderNoteTooLongException(sprintf('Internal notes must be %d characters or fewer.', $maxLength));
    }

    return $normalized;
}

/**
 * @param array<string, mixed> $event
 * @param array<int, array<string, mixed>> $rows
 * @return array{
 *   event: array<string, mixed>,
 *   shipping_order_count: int,
 *   csv_filename: string,
 *   included_orders: array<int, array<string, mixed>>,
 *   excluded_orders: array<int, array<string, mixed>>
 * }
 */
function buildShippingExportPreview(array $event, array $rows): array
{
    $included = [];
    $excluded = [];
    $shippingOrderCount = 0;

    foreach ($rows as $row) {
        $normalized = normalizeShippingExportOrderRow($row, $event);
        if ($normalized === null) {
            continue;
        }

        if ($normalized['is_shipping_order']) {
            $shippingOrderCount += 1;
        }

        if ($normalized['included']) {
            $included[] = $normalized['record'];
            continue;
        }

        if ($normalized['is_shipping_order']) {
            $excluded[] = $normalized['record'];
        }
    }

    return [
        'event' => $event,
        'shipping_order_count' => $shippingOrderCount,
        'csv_filename' => buildShippingExportFilename($event),
        'included_orders' => $included,
        'excluded_orders' => $excluded,
    ];
}

/**
 * @param array<string, mixed> $row
 * @param array<string, mixed> $event
 * @return array{
 *   included: bool,
 *   is_shipping_order: bool,
 *   record: array<string, mixed>
 * }|null
 */
function normalizeShippingExportOrderRow(array $row, array $event): ?array
{
    $payloadJson = is_string($row['payload_json'] ?? null) ? $row['payload_json'] : '';
    if ($payloadJson === '') {
        return null;
    }

    try {
        $payload = json_decode($payloadJson, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        return null;
    }

    if (!is_array($payload)) {
        return null;
    }

    $eventSnapshot = is_array($payload['event'] ?? null) ? $payload['event'] : [];
    $fulfillment = is_array($payload['fulfillment'] ?? null) ? $payload['fulfillment'] : [];
    $shippingAddress = is_array($fulfillment['shipping_address'] ?? null) ? $fulfillment['shipping_address'] : [];
    $customer = is_array($payload['customer'] ?? null) ? $payload['customer'] : [];
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

    $fulfillmentMethod = strtolower(trim((string) ($fulfillment['method'] ?? '')));
    $eventType = trim((string) ($eventSnapshot['event_type'] ?? ($event['event_type'] ?? '')));
    $isCancelled = normalizeNullableDatabaseDateTime($row['cancelled_at'] ?? null) !== null
        || trim((string) ($row['production_status'] ?? '')) === 'cancelled';
    $isShippingOrder = $fulfillmentMethod === 'shipping' && !$isCancelled && $eventType !== 'test_session';

    $orderNumber = normalizeNullableOrderNumber($row['forge_order_number'] ?? ($payload['forge_order_number'] ?? null));
    $orderReference = $orderNumber !== null
        ? sprintf('Order %d', $orderNumber)
        : sprintf('Order %s', strtoupper(substr(trim((string) ($row['forge_order_uuid'] ?? '')), 0, 8)));
    $missingFields = determineShippingExportMissingFields($customer, $shippingAddress);
    $customerName = trim((string) ($customer['full_name'] ?? ''));
    $itemCount = array_reduce($items, static function (int $count, $item): int {
        if (!is_array($item)) {
            return $count;
        }
        $quantity = normalizeStaffQuantity($item['quantity'] ?? 1);
        return $count + $quantity;
    }, 0);

    $record = [
        'forge_order_uuid' => trim((string) ($row['forge_order_uuid'] ?? '')),
        'forge_order_number' => $orderNumber,
        'order_reference' => $orderReference,
        'customer_name' => $customerName,
        'address_line_1' => trim((string) ($shippingAddress['address_1'] ?? '')),
        'address_line_2' => trim((string) ($shippingAddress['address_2'] ?? '')),
        'city' => trim((string) ($shippingAddress['city'] ?? '')),
        'state' => trim((string) ($shippingAddress['state'] ?? '')),
        'postal_code' => trim((string) ($shippingAddress['postal_code'] ?? '')),
        'country' => trim((string) ($shippingAddress['country'] ?? '')),
        'email' => trim((string) ($customer['email'] ?? '')),
        'phone' => trim((string) ($customer['phone'] ?? '')),
        'item_count' => $itemCount,
        'event_name' => trim((string) ($event['event_name'] ?? ($eventSnapshot['event_name'] ?? ''))),
        'submitted_at' => OrderPayload::databaseDateTimeToIso8601((string) ($row['submitted_at'] ?? '')),
        'missing_fields' => $missingFields,
    ];

    return [
        'included' => $isShippingOrder && $missingFields === [],
        'is_shipping_order' => $isShippingOrder,
        'record' => $record,
    ];
}

/**
 * @param array<string, mixed> $customer
 * @param array<string, mixed> $shippingAddress
 * @return array<int, string>
 */
function determineShippingExportMissingFields(array $customer, array $shippingAddress): array
{
    $missing = [];
    $customerName = trim((string) ($customer['full_name'] ?? ''));
    if ($customerName === '') {
        $missing[] = 'customer_name';
    }

    foreach (PdoStaffOrderRepository::SHIPPING_EXPORT_REQUIRED_ADDRESS_FIELDS as $field) {
        $value = trim((string) ($shippingAddress[$field] ?? ''));
        if ($value === '') {
            $missing[] = $field;
        }
    }

    return $missing;
}

/**
 * @param array<int, array<string, mixed>> $includedOrders
 */
function buildShippingExportCsv(array $includedOrders): string
{
    $stream = fopen('php://temp', 'r+');
    if ($stream === false) {
        throw new \RuntimeException('Shipping export could not be prepared.');
    }

    fputcsv($stream, [
        'Forge Order Number',
        'Customer Name',
        'Address Line 1',
        'Address Line 2',
        'City',
        'State',
        'Postal Code',
        'Country',
        'Email',
        'Phone',
        'Item Count',
        'Event Name',
        'Submitted At',
    ]);

    foreach ($includedOrders as $order) {
        fputcsv($stream, [
            normalizeNullableOrderNumber($order['forge_order_number'] ?? null) ?? '',
            neutralizeShippingCsvCell((string) ($order['customer_name'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['address_line_1'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['address_line_2'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['city'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['state'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['postal_code'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['country'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['email'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['phone'] ?? '')),
            (int) ($order['item_count'] ?? 0),
            neutralizeShippingCsvCell((string) ($order['event_name'] ?? '')),
            neutralizeShippingCsvCell((string) ($order['submitted_at'] ?? '')),
        ]);
    }

    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);

    if (!is_string($csv)) {
        throw new \RuntimeException('Shipping export could not be prepared.');
    }

    return $csv;
}

/**
 * @param array<string, mixed> $event
 */
function buildShippingExportFilename(array $event): string
{
    $eventName = trim((string) ($event['event_name'] ?? 'event'));
    $slug = strtolower($eventName);
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? 'event';
    $slug = trim($slug, '-');
    if ($slug === '') {
        $slug = 'event';
    }

    return sprintf(
        'forge-shipping-export-%s-%s.csv',
        $slug,
        trim((string) ($event['start_date'] ?? gmdate('Y-m-d')))
    );
}

function neutralizeShippingCsvCell(string $value): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $value);
    if ($normalized === '') {
        return '';
    }

    $trimmedLeadingWhitespace = ltrim($normalized);
    if ($trimmedLeadingWhitespace === '') {
        return $normalized;
    }

    $firstCharacter = substr($trimmedLeadingWhitespace, 0, 1);
    if (in_array($firstCharacter, ['=', '+', '-', '@'], true)) {
        return "'" . $normalized;
    }

    return $normalized;
}

/**
 * @param mixed $value
 */
function normalizeNullableOrderNumber($value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    if (is_int($value)) {
        return $value > 0 ? $value : null;
    }

    if (is_string($value) && preg_match('/^\d+$/', trim($value))) {
        $normalized = (int) trim($value);
        return $normalized > 0 ? $normalized : null;
    }

    return null;
}

/**
 * @param array<string, mixed> $payload
 * @return array<string, mixed>
 */
function withNormalizedPayloadOrderNumber(array $payload, ?int $forgeOrderNumber): array
{
    $nextPayload = $payload;
    if ($forgeOrderNumber === null) {
        unset($nextPayload['forge_order_number']);
        return $nextPayload;
    }

    $nextPayload['forge_order_number'] = $forgeOrderNumber;
    return $nextPayload;
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
        'completed',
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
    if (!in_array($productionStatus, ['ready_to_pack', 'completed'], true)) {
        return null;
    }

    return normalizeNullableDatabaseDateTimeValue($value);
}

/**
 * @param mixed $value
 */
function normalizeStaffCompletedAt($value, string $productionStatus): ?string
{
    if ($productionStatus !== 'completed') {
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
    if (in_array($normalizedExplicitStatus, ['completed', 'packed', 'shipped', 'picked_up', 'cancelled'], true)) {
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
