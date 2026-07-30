<?php
declare(strict_types=1);

namespace Forge\Server;

use JsonException;
use PDO;
use PDOException;

final class OutboundMessageStatus
{
    public const PENDING = 'pending';
    public const SENT = 'sent';
    public const FAILED = 'failed';
    public const SKIPPED_TEST = 'skipped_test';

    /** @return array<int, string> */
    public static function all(): array
    {
        return [
            self::PENDING,
            self::SENT,
            self::FAILED,
            self::SKIPPED_TEST,
        ];
    }
}

final class OutboundMessageType
{
    public const ORDER_CONFIRMATION = 'order_confirmation';
    public const CUSTOM_REQUEST_ACK = 'custom_request_ack';
}

final class OutboundMessageEntityType
{
    public const FORGE_ORDER = 'forge_order';
    public const CUSTOM_REQUEST = 'custom_request';
}

final class OutboundMessageRecord
{
    public string $messageId;
    public string $entityType;
    public string $entityUuid;
    public string $messageType;
    public string $recipientEmail;
    public string $status;
    public int $attemptCount;
    public ?string $lastAttemptAt;
    public ?string $sentAt;
    public ?string $lastErrorSafe;
    public string $idempotencyKey;
    /** @var array<string, mixed> */
    public array $renderContext;
    public string $createdAt;
    public string $updatedAt;

    /**
     * @param array<string, mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $record = new self();
        $record->messageId = trim((string) ($row['message_id'] ?? ''));
        $record->entityType = trim((string) ($row['entity_type'] ?? ''));
        $record->entityUuid = trim((string) ($row['entity_uuid'] ?? ''));
        $record->messageType = trim((string) ($row['message_type'] ?? ''));
        $record->recipientEmail = trim((string) ($row['recipient_email'] ?? ''));
        $record->status = trim((string) ($row['status'] ?? ''));
        $record->attemptCount = max(0, (int) ($row['attempt_count'] ?? 0));
        $record->lastAttemptAt = normalizeNullableDatabaseDateTime($row['last_attempt_at'] ?? null);
        $record->sentAt = normalizeNullableDatabaseDateTime($row['sent_at'] ?? null);
        $record->lastErrorSafe = normalizeNullableString($row['last_error_safe'] ?? null);
        $record->idempotencyKey = trim((string) ($row['idempotency_key'] ?? ''));
        $record->renderContext = decodeOutboundMessageRenderContext($row['render_context_json'] ?? '{}');
        $record->createdAt = OrderPayload::databaseDateTimeToIso8601((string) ($row['created_at'] ?? ''));
        $record->updatedAt = OrderPayload::databaseDateTimeToIso8601((string) ($row['updated_at'] ?? ''));

        return $record;
    }
}

final class CreateOutboundMessageResult
{
    public OutboundMessageRecord $record;
    public bool $created;

    public function __construct(OutboundMessageRecord $record, bool $created)
    {
        $this->record = $record;
        $this->created = $created;
    }
}

final class PdoOutboundMessageRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @param array<string, mixed> $orderPayload
     */
    public function createOrderConfirmationMessage(array $orderPayload): CreateOutboundMessageResult
    {
        $orderUuid = trim((string) ($orderPayload['forge_order_uuid'] ?? ''));
        if ($orderUuid === '') {
            throw new \InvalidArgumentException('A Forge order UUID is required.');
        }

        $recipientEmail = trim((string) (($orderPayload['customer'] ?? [])['email'] ?? ''));
        if ($recipientEmail === '') {
            throw new \InvalidArgumentException('A customer email address is required.');
        }

        $renderContext = [
            'order' => sanitizeOutboundMessageOrderContext($orderPayload),
        ];
        $status = outboundMessageOrderUsesTestSession($orderPayload)
            ? OutboundMessageStatus::SKIPPED_TEST
            : OutboundMessageStatus::PENDING;
        $timestampIso = OrderPayload::normalizeIso8601Utc(gmdate(\DateTimeInterface::ATOM));
        $timestampDatabase = OrderPayload::normalizeDatabaseDateTime($timestampIso);
        $messageId = generateOutboundMessageId();
        $idempotencyKey = buildOrderConfirmationIdempotencyKey($orderUuid);
        $renderContextJson = encodeOutboundMessageRenderContext($renderContext);

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_outbound_messages (
                    message_id,
                    entity_type,
                    entity_uuid,
                    message_type,
                    recipient_email,
                    status,
                    attempt_count,
                    last_attempt_at,
                    sent_at,
                    last_error_safe,
                    idempotency_key,
                    render_context_json,
                    created_at,
                    updated_at
                ) VALUES (
                    :message_id,
                    :entity_type,
                    :entity_uuid,
                    :message_type,
                    :recipient_email,
                    :status,
                    0,
                    NULL,
                    NULL,
                    NULL,
                    :idempotency_key,
                    :render_context_json,
                    :created_at,
                    :updated_at
                )'
            );
            $statement->execute([
                ':message_id' => $messageId,
                ':entity_type' => OutboundMessageEntityType::FORGE_ORDER,
                ':entity_uuid' => $orderUuid,
                ':message_type' => OutboundMessageType::ORDER_CONFIRMATION,
                ':recipient_email' => $recipientEmail,
                ':status' => $status,
                ':idempotency_key' => $idempotencyKey,
                ':render_context_json' => $renderContextJson,
                ':created_at' => $timestampDatabase,
                ':updated_at' => $timestampDatabase,
            ]);
        } catch (PDOException $exception) {
            if (!$this->isDuplicateKeyException($exception)) {
                throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.', 0, $exception);
            }

            $existing = $this->getMessageByIdempotencyKey($idempotencyKey);
            if ($existing === null) {
                throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.', 0, $exception);
            }

            return new CreateOutboundMessageResult($existing, false);
        }

        $record = $this->getMessageByIdempotencyKey($idempotencyKey);
        if ($record === null) {
            throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.');
        }

        return new CreateOutboundMessageResult($record, true);
    }

    public function getMessageByIdempotencyKey(string $idempotencyKey): ?OutboundMessageRecord
    {
        $normalized = trim($idempotencyKey);
        if ($normalized === '') {
            return null;
        }

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    message_id,
                    entity_type,
                    entity_uuid,
                    message_type,
                    recipient_email,
                    status,
                    attempt_count,
                    last_attempt_at,
                    sent_at,
                    last_error_safe,
                    idempotency_key,
                    render_context_json,
                    created_at,
                    updated_at
                 FROM forge_outbound_messages
                 WHERE idempotency_key = :idempotency_key
                 LIMIT 1'
            );
            $statement->execute([
                ':idempotency_key' => $normalized,
            ]);
            $row = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.', 0, $exception);
        }

        return is_array($row) ? OutboundMessageRecord::fromRow($row) : null;
    }

    public function markSent(string $messageId, string $sentAtIso8601): OutboundMessageRecord
    {
        return $this->updateDeliveryAttempt($messageId, OutboundMessageStatus::SENT, $sentAtIso8601, null, true);
    }

    public function markFailed(string $messageId, string $safeErrorMessage, string $attemptedAtIso8601): OutboundMessageRecord
    {
        return $this->updateDeliveryAttempt($messageId, OutboundMessageStatus::FAILED, $attemptedAtIso8601, sanitizeOutboundMessageError($safeErrorMessage), false);
    }

    /**
     * @return array<string, array{status: string, sent_at: ?string, last_attempt_at: ?string}>
     */
    public function listLatestOrderConfirmationMetadataByOrderUuid(array $orderUuids): array
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
                sprintf(
                    'SELECT entity_uuid, status, sent_at, last_attempt_at
                     FROM forge_outbound_messages
                     WHERE entity_type = %s
                       AND message_type = %s
                       AND entity_uuid IN (%s)
                     ORDER BY updated_at DESC, message_id DESC',
                    $this->pdo->quote(OutboundMessageEntityType::FORGE_ORDER),
                    $this->pdo->quote(OutboundMessageType::ORDER_CONFIRMATION),
                    $placeholders
                )
            );
            foreach ($normalizedOrderUuids as $index => $orderUuid) {
                $statement->bindValue($index + 1, $orderUuid, PDO::PARAM_STR);
            }
            $statement->execute();
            $rows = $statement->fetchAll();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.', 0, $exception);
        }

        $statuses = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $entityUuid = trim((string) ($row['entity_uuid'] ?? ''));
            if ($entityUuid === '' || array_key_exists($entityUuid, $statuses)) {
                continue;
            }
            $status = trim((string) ($row['status'] ?? ''));
            if (!in_array($status, OutboundMessageStatus::all(), true)) {
                continue;
            }
            $statuses[$entityUuid] = [
                'status' => $status,
                'sent_at' => normalizeNullableDatabaseDateTime($row['sent_at'] ?? null),
                'last_attempt_at' => normalizeNullableDatabaseDateTime($row['last_attempt_at'] ?? null),
            ];
        }

        return $statuses;
    }

    /**
     * @return array<string, string>
     */
    public function listLatestOrderConfirmationStatusesByOrderUuid(array $orderUuids): array
    {
        $metadata = $this->listLatestOrderConfirmationMetadataByOrderUuid($orderUuids);
        $statuses = [];
        foreach ($metadata as $orderUuid => $record) {
            $status = trim((string) ($record['status'] ?? ''));
            if ($status === '') {
                continue;
            }
            $statuses[$orderUuid] = $status;
        }

        return $statuses;
    }

    private function updateDeliveryAttempt(
        string $messageId,
        string $status,
        string $attemptedAtIso8601,
        ?string $safeErrorMessage,
        bool $markSent
    ): OutboundMessageRecord
    {
        $normalizedMessageId = trim($messageId);
        if ($normalizedMessageId === '') {
            throw new \InvalidArgumentException('A message ID is required.');
        }

        $attemptedAtDatabase = OrderPayload::normalizeDatabaseDateTime($attemptedAtIso8601);

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_outbound_messages
                 SET status = :status,
                     attempt_count = attempt_count + 1,
                     last_attempt_at = :last_attempt_at,
                     sent_at = :sent_at,
                     last_error_safe = :last_error_safe,
                     updated_at = :updated_at
                 WHERE message_id = :message_id'
            );
            $statement->bindValue(':status', $status, PDO::PARAM_STR);
            $statement->bindValue(':last_attempt_at', $attemptedAtDatabase, PDO::PARAM_STR);
            $statement->bindValue(':sent_at', $markSent ? $attemptedAtDatabase : null, $markSent ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $statement->bindValue(':last_error_safe', $safeErrorMessage, $safeErrorMessage === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $statement->bindValue(':updated_at', $attemptedAtDatabase, PDO::PARAM_STR);
            $statement->bindValue(':message_id', $normalizedMessageId, PDO::PARAM_STR);
            $statement->execute();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.', 0, $exception);
        }

        $record = $this->getMessageByMessageId($normalizedMessageId);
        if ($record === null) {
            throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.');
        }

        return $record;
    }

    private function getMessageByMessageId(string $messageId): ?OutboundMessageRecord
    {
        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    message_id,
                    entity_type,
                    entity_uuid,
                    message_type,
                    recipient_email,
                    status,
                    attempt_count,
                    last_attempt_at,
                    sent_at,
                    last_error_safe,
                    idempotency_key,
                    render_context_json,
                    created_at,
                    updated_at
                 FROM forge_outbound_messages
                 WHERE message_id = :message_id
                 LIMIT 1'
            );
            $statement->execute([
                ':message_id' => $messageId,
            ]);
            $row = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge outbound message storage is currently unavailable.', 0, $exception);
        }

        return is_array($row) ? OutboundMessageRecord::fromRow($row) : null;
    }

    private function isDuplicateKeyException(PDOException $exception): bool
    {
        $sqlState = (string) $exception->getCode();
        $driverCode = isset($exception->errorInfo[1]) ? (int) $exception->errorInfo[1] : null;
        $driverMessage = isset($exception->errorInfo[2]) ? (string) $exception->errorInfo[2] : $exception->getMessage();

        if ($sqlState === '23000' && $driverCode === 1062) {
            return true;
        }

        return $sqlState === '23000' || stripos($driverMessage, 'unique constraint') !== false;
    }
}

/**
 * @param array<string, mixed> $orderPayload
 * @return array<string, mixed>
 */
function sanitizeOutboundMessageOrderContext(array $orderPayload): array
{
    $sanitized = $orderPayload;
    unset(
        $sanitized['internal_note'],
        $sanitized['payload_sha256'],
        $sanitized['current_tray_number'],
        $sanitized['production_status'],
        $sanitized['ready_to_pack_at'],
        $sanitized['cancelled_at'],
        $sanitized['confirmation_email_status']
    );

    if (isset($sanitized['items']) && is_array($sanitized['items'])) {
        $sanitized['items'] = array_map(static function ($item): array {
            if (!is_array($item)) {
                return [];
            }
            unset(
                $item['production_note'],
                $item['production_status'],
                $item['completed_quantity'],
                $item['completed_at'],
                $item['current_tray_number']
            );
            return $item;
        }, $sanitized['items']);
    }

    return $sanitized;
}

function outboundMessageOrderUsesTestSession(array $orderPayload): bool
{
    $eventType = is_array($orderPayload['event'] ?? null)
        ? trim((string) (($orderPayload['event'] ?? [])['event_type'] ?? ''))
        : '';

    return strtolower($eventType) === 'test_session';
}

function buildOrderConfirmationIdempotencyKey(string $forgeOrderUuid): string
{
    $normalized = trim($forgeOrderUuid);
    if ($normalized === '') {
        throw new \InvalidArgumentException('A Forge order UUID is required.');
    }

    return 'order_confirmation:' . $normalized;
}

/**
 * @param mixed $renderContextJson
 * @return array<string, mixed>
 */
function decodeOutboundMessageRenderContext($renderContextJson): array
{
    $normalized = is_string($renderContextJson) ? trim($renderContextJson) : '';
    if ($normalized === '') {
        return [];
    }

    try {
        $decoded = json_decode($normalized, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new \InvalidArgumentException('A valid outbound render context is required.', 0, $exception);
    }

    if (!is_array($decoded)) {
        throw new \InvalidArgumentException('A valid outbound render context is required.');
    }

    return $decoded;
}

/**
 * @param array<string, mixed> $renderContext
 */
function encodeOutboundMessageRenderContext(array $renderContext): string
{
    try {
        return json_encode($renderContext, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new \InvalidArgumentException('A valid outbound render context is required.', 0, $exception);
    }
}

function sanitizeOutboundMessageError(string $message): string
{
    $normalized = preg_replace('/\s+/', ' ', trim($message));
    if (!is_string($normalized) || $normalized === '') {
        return 'Email delivery failed.';
    }

    $normalized = preg_replace('/([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/i', '[redacted-email]', $normalized);
    $normalized = preg_replace('/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i', '[redacted-host]', (string) $normalized);

    if (strlen($normalized) > 200) {
        $normalized = substr($normalized, 0, 197) . '...';
    }

    return $normalized;
}

function generateOutboundMessageId(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

    $hex = bin2hex($bytes);
    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}
