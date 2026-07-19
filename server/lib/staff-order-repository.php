<?php
declare(strict_types=1);

namespace Forge\Server;

use JsonException;
use PDO;
use PDOException;

final class PdoStaffOrderRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
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
                    payload_sha256
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
