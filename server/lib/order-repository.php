<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

interface OrderRepositoryInterface
{
    public function storeOrder(array $payload, string $canonicalJson, string $payloadSha256, string $receivedAt): StoreOrderResult;
}

final class StoreOrderResult
{
    public string $forgeOrderUuid;
    public bool $created;
    public string $receivedAt;
    public string $payloadSha256;

    public function __construct(string $forgeOrderUuid, bool $created, string $receivedAt, string $payloadSha256)
    {
        $this->forgeOrderUuid = $forgeOrderUuid;
        $this->created = $created;
        $this->receivedAt = $receivedAt;
        $this->payloadSha256 = $payloadSha256;
    }
}

final class PdoOrderRepository implements OrderRepositoryInterface
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function storeOrder(array $payload, string $canonicalJson, string $payloadSha256, string $receivedAt): StoreOrderResult
    {
        $metadata = OrderPayload::extractMetadata($payload);
        $receivedAtIso = OrderPayload::normalizeIso8601Utc($receivedAt);
        $receivedAtDatabase = OrderPayload::normalizeDatabaseDateTime($receivedAtIso);

        $insertValues = [
            ':forge_order_uuid' => $metadata['forge_order_uuid'],
            ':record_version' => $metadata['record_version'],
            ':source' => $metadata['source'],
            ':submitted_at' => OrderPayload::normalizeDatabaseDateTime($metadata['submitted_at']),
            ':received_at' => $receivedAtDatabase,
            ':updated_at' => $receivedAtDatabase,
            ':device_id' => $metadata['device_id'],
            ':event_id' => $metadata['event_id'],
            ':payload_json' => $canonicalJson,
            ':payload_sha256' => $payloadSha256,
        ];

        try {
            $this->pdo->beginTransaction();
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_orders (
                    forge_order_uuid,
                    record_version,
                    source,
                    submitted_at,
                    received_at,
                    updated_at,
                    device_id,
                    event_id,
                    payload_json,
                    payload_sha256
                ) VALUES (
                    :forge_order_uuid,
                    :record_version,
                    :source,
                    :submitted_at,
                    :received_at,
                    :updated_at,
                    :device_id,
                    :event_id,
                    :payload_json,
                    :payload_sha256
                )'
            );
            $statement->execute($insertValues);
            $this->pdo->commit();

            return new StoreOrderResult(
                $metadata['forge_order_uuid'],
                true,
                $receivedAtIso,
                $payloadSha256
            );
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            if (!$this->isDuplicateKeyException($exception)) {
                throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
            }

            $existing = $this->loadStoredOrderMetadata($metadata['forge_order_uuid']);
            if ($existing === null) {
                throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
            }

            if (hash_equals($existing['payload_sha256'], $payloadSha256)) {
                return new StoreOrderResult(
                    $metadata['forge_order_uuid'],
                    false,
                    OrderPayload::databaseDateTimeToIso8601($existing['received_at']),
                    $existing['payload_sha256']
                );
            }

            throw new OrderConflictException('The immutable Forge order UUID is already stored with a different payload.', 0, $exception);
        }
    }

    private function loadStoredOrderMetadata(string $forgeOrderUuid): ?array
    {
        try {
            $statement = $this->pdo->prepare(
                'SELECT forge_order_uuid, received_at, payload_sha256
                 FROM forge_orders
                 WHERE forge_order_uuid = :forge_order_uuid
                 LIMIT 1'
            );
            $statement->execute([':forge_order_uuid' => $forgeOrderUuid]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
        }

        return is_array($record) ? $record : null;
    }

    private function isDuplicateKeyException(PDOException $exception): bool
    {
        $sqlState = (string) $exception->getCode();
        $driverCode = isset($exception->errorInfo[1]) ? (int) $exception->errorInfo[1] : null;

        return $sqlState === '23000' && $driverCode === 1062;
    }
}
