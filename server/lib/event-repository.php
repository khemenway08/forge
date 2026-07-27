<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class EventNotFoundException extends \RuntimeException
{
}

final class EventValidationException extends \RuntimeException
{
}

final class EventStateConflictException extends \RuntimeException
{
}

final class PdoEventRepository
{
    private const EVENT_TYPE_LIVE = 'live_event';
    private const EVENT_TYPE_TEST = 'test_session';
    private const STATUS_SCHEDULED = 'scheduled';
    private const STATUS_ACTIVE = 'active';
    private const STATUS_ENDED = 'ended';

    private const PUBLIC_ORDER_TOKEN_BYTES = 32;

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listEvents(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT
                    event_id,
                    public_order_token,
                    event_name,
                    event_type,
                    start_date,
                    end_date,
                    event_location,
                    event_status,
                    started_at,
                    ended_at,
                    created_at,
                    updated_at
                 FROM forge_events
                 ORDER BY
                    CASE event_status
                        WHEN \'active\' THEN 0
                        WHEN \'scheduled\' THEN 1
                        ELSE 2
                    END,
                    start_date DESC,
                    created_at DESC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge event storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($records)) {
            return [];
        }

        return array_map([$this, 'normalizeEventRecord'], $records);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createEvent(array $input): array
    {
        $normalized = $this->normalizeEventInput($input);
        $timestamp = gmdate('Y-m-d H:i:s.u');
        $eventId = $this->generateUuidV4();
        $publicOrderToken = self::generatePublicOrderToken();

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_events (
                    event_id,
                    public_order_token,
                    event_name,
                    event_type,
                    start_date,
                    end_date,
                    event_location,
                    event_status,
                    started_at,
                    ended_at,
                    created_at,
                    updated_at
                ) VALUES (
                    :event_id,
                    :public_order_token,
                    :event_name,
                    :event_type,
                    :start_date,
                    :end_date,
                    :event_location,
                    :event_status,
                    NULL,
                    NULL,
                    :created_at,
                    :updated_at
                )'
            );
            $statement->execute([
                ':event_id' => $eventId,
                ':public_order_token' => $publicOrderToken,
                ':event_name' => $normalized['event_name'],
                ':event_type' => $normalized['event_type'],
                ':start_date' => $normalized['start_date'],
                ':end_date' => $normalized['end_date'],
                ':event_location' => $normalized['event_location'],
                ':event_status' => self::STATUS_SCHEDULED,
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge event storage is currently unavailable.', 0, $exception);
        }

        return $this->getEvent($eventId);
    }

    /**
     * @return array<string, mixed>
     */
    public function startEvent(string $eventId): array
    {
        $normalizedEventId = $this->normalizeEventId($eventId);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $this->pdo->beginTransaction();
            $target = $this->loadEventRowForUpdate($normalizedEventId);
            if ($target === null) {
                throw new EventNotFoundException('That event could not be found.');
            }

            $activeStatement = $this->pdo->prepare(
                'SELECT event_id
                 FROM forge_events
                 WHERE event_status = :event_status
                 FOR UPDATE'
            );
            $activeStatement->execute([
                ':event_status' => self::STATUS_ACTIVE,
            ]);
            $activeRows = $activeStatement->fetchAll();

            foreach ($activeRows as $activeRow) {
                $activeId = is_array($activeRow) ? trim((string) ($activeRow['event_id'] ?? '')) : '';
                if ($activeId !== '' && $activeId !== $normalizedEventId) {
                    throw new EventStateConflictException('Only one event may be active at a time.');
                }
            }

            $targetStatus = trim((string) ($target['event_status'] ?? ''));
            if ($targetStatus === self::STATUS_ENDED) {
                throw new EventStateConflictException('Ended events cannot be started again.');
            }

            if ($targetStatus !== self::STATUS_ACTIVE) {
                $statement = $this->pdo->prepare(
                    'UPDATE forge_events
                     SET event_status = :event_status,
                         started_at = COALESCE(started_at, :started_at),
                         ended_at = NULL,
                         updated_at = :updated_at
                     WHERE event_id = :event_id'
                );
                $statement->execute([
                    ':event_status' => self::STATUS_ACTIVE,
                    ':started_at' => $timestamp,
                    ':updated_at' => $timestamp,
                    ':event_id' => $normalizedEventId,
                ]);
            }

            $this->pdo->commit();
        } catch (\Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ($exception instanceof EventNotFoundException || $exception instanceof EventStateConflictException) {
                throw $exception;
            }
            if ($exception instanceof PDOException) {
                throw new StorageUnavailableException('Forge event storage is currently unavailable.', 0, $exception);
            }
            throw $exception;
        }

        return $this->getEvent($normalizedEventId);
    }

    /**
     * @return array<string, mixed>
     */
    public function endEvent(string $eventId): array
    {
        $normalizedEventId = $this->normalizeEventId($eventId);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $this->pdo->beginTransaction();
            $target = $this->loadEventRowForUpdate($normalizedEventId);
            if ($target === null) {
                throw new EventNotFoundException('That event could not be found.');
            }

            $targetStatus = trim((string) ($target['event_status'] ?? ''));
            if ($targetStatus === self::STATUS_SCHEDULED) {
                throw new EventStateConflictException('Only an active event can be ended.');
            }

            if ($targetStatus !== self::STATUS_ENDED) {
                $statement = $this->pdo->prepare(
                    'UPDATE forge_events
                     SET event_status = :event_status,
                         ended_at = COALESCE(ended_at, :ended_at),
                         updated_at = :updated_at
                     WHERE event_id = :event_id'
                );
                $statement->execute([
                    ':event_status' => self::STATUS_ENDED,
                    ':ended_at' => $timestamp,
                    ':updated_at' => $timestamp,
                    ':event_id' => $normalizedEventId,
                ]);
            }

            $this->pdo->commit();
        } catch (\Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ($exception instanceof EventNotFoundException || $exception instanceof EventStateConflictException) {
                throw $exception;
            }
            if ($exception instanceof PDOException) {
                throw new StorageUnavailableException('Forge event storage is currently unavailable.', 0, $exception);
            }
            throw $exception;
        }

        return $this->getEvent($normalizedEventId);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getActiveEvent(): ?array
    {
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
                    event_status,
                    started_at,
                    ended_at,
                    created_at,
                    updated_at
                 FROM forge_events
                 WHERE event_status = :event_status
                 ORDER BY started_at DESC, created_at DESC
                 LIMIT 1'
            );
            $statement->execute([
                ':event_status' => self::STATUS_ACTIVE,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge event storage is currently unavailable.', 0, $exception);
        }

        return is_array($record) ? $this->normalizeEventRecord($record) : null;
    }

    /**
     * @return array<string, mixed>
     */
    public function getPublicOrderingStatus(?string $requestedPublicOrderToken = null): array
    {
        $token = $this->normalizeNullablePublicOrderToken($requestedPublicOrderToken);
        if ($token !== null) {
            return $this->getTokenScopedPublicOrderingStatus($token);
        }

        $activeEvent = $this->getActiveEvent();

        return [
            'ordering_open' => $activeEvent !== null,
            'resolution_scope' => 'active_event',
            'requested_public_order_token' => null,
            'availability' => $activeEvent === null ? 'no_active_event' : 'active',
            'event' => $activeEvent === null ? null : $this->toPublicEvent($activeEvent),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getEvent(string $eventId): array
    {
        $normalizedEventId = $this->normalizeEventId($eventId);

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
                    event_status,
                    started_at,
                    ended_at,
                    created_at,
                    updated_at
                 FROM forge_events
                 WHERE event_id = :event_id
                 LIMIT 1'
            );
            $statement->execute([
                ':event_id' => $normalizedEventId,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge event storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($record)) {
            throw new EventNotFoundException('That event could not be found.');
        }

        return $this->normalizeEventRecord($record);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getEventByPublicOrderToken(string $publicOrderToken): ?array
    {
        $normalizedToken = $this->normalizePublicOrderToken($publicOrderToken);

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
                    event_status,
                    started_at,
                    ended_at,
                    created_at,
                    updated_at
                 FROM forge_events
                 WHERE public_order_token = :public_order_token
                 LIMIT 1'
            );
            $statement->execute([
                ':public_order_token' => $normalizedToken,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge event storage is currently unavailable.', 0, $exception);
        }

        return is_array($record) ? $this->normalizeEventRecord($record) : null;
    }

    /**
     * @param array<string, mixed> $record
     * @return array<string, mixed>
     */
    public function toPublicEvent(array $record): array
    {
        return [
            'event_id' => $record['event_id'],
            'public_order_token' => $record['public_order_token'],
            'event_name' => $record['event_name'],
            'event_type' => $record['event_type'],
            'event_status' => $record['event_status'],
            'start_date' => $record['start_date'],
            'end_date' => $record['end_date'],
            'event_location' => $record['event_location'],
        ];
    }

    /**
     * @param array<string, mixed> $record
     * @return array<string, mixed>
     */
    private function normalizeEventRecord(array $record): array
    {
        return [
            'event_id' => trim((string) ($record['event_id'] ?? '')),
            'public_order_token' => trim((string) ($record['public_order_token'] ?? '')),
            'event_name' => trim((string) ($record['event_name'] ?? '')),
            'event_type' => trim((string) ($record['event_type'] ?? '')),
            'start_date' => trim((string) ($record['start_date'] ?? '')),
            'end_date' => trim((string) ($record['end_date'] ?? '')),
            'event_location' => $this->normalizeNullableString($record['event_location'] ?? null),
            'event_status' => trim((string) ($record['event_status'] ?? '')),
            'started_at' => $this->normalizeNullableDateTime($record['started_at'] ?? null),
            'ended_at' => $this->normalizeNullableDateTime($record['ended_at'] ?? null),
            'created_at' => $this->normalizeNullableDateTime($record['created_at'] ?? null),
            'updated_at' => $this->normalizeNullableDateTime($record['updated_at'] ?? null),
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{event_name: string, event_type: string, start_date: string, end_date: string, event_location: ?string}
     */
    private function normalizeEventInput(array $input): array
    {
        $eventName = trim((string) ($input['event_name'] ?? ''));
        $eventType = trim((string) ($input['event_type'] ?? ''));
        $startDate = trim((string) ($input['start_date'] ?? ''));
        $endDate = trim((string) ($input['end_date'] ?? ''));
        $eventLocation = $this->normalizeNullableString($input['event_location'] ?? null);

        if ($eventName === '') {
            throw new EventValidationException('An event name is required.');
        }

        if (!in_array($eventType, [self::EVENT_TYPE_LIVE, self::EVENT_TYPE_TEST], true)) {
            throw new EventValidationException('A supported event type is required.');
        }

        if (!$this->isValidDateOnly($startDate) || !$this->isValidDateOnly($endDate)) {
            throw new EventValidationException('Valid start and end dates are required.');
        }

        if ($endDate < $startDate) {
            throw new EventValidationException('The end date must be on or after the start date.');
        }

        return [
            'event_name' => $eventName,
            'event_type' => $eventType,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'event_location' => $eventLocation,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadEventRowForUpdate(string $eventId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT
                event_id,
                event_name,
                event_type,
                start_date,
                end_date,
                event_location,
                event_status,
                started_at,
                ended_at,
                created_at,
                updated_at
             FROM forge_events
             WHERE event_id = :event_id
             LIMIT 1
             FOR UPDATE'
        );
        $statement->execute([
            ':event_id' => $eventId,
        ]);
        $record = $statement->fetch();

        return is_array($record) ? $record : null;
    }

    private function normalizeEventId(string $eventId): string
    {
        $normalized = trim($eventId);
        if ($normalized === '') {
            throw new EventNotFoundException('That event could not be found.');
        }
        return $normalized;
    }

    private function normalizePublicOrderToken(string $publicOrderToken): string
    {
        $normalized = trim($publicOrderToken);
        if (!self::isValidPublicOrderToken($normalized)) {
            throw new EventNotFoundException('That event could not be found.');
        }
        return $normalized;
    }

    private function normalizeNullablePublicOrderToken(?string $publicOrderToken): ?string
    {
        if (!is_string($publicOrderToken)) {
            return null;
        }

        $normalized = trim($publicOrderToken);
        if ($normalized === '') {
            return null;
        }

        return $normalized;
    }

    private function normalizeNullableString($value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $normalized = trim($value);
        return $normalized === '' ? null : $normalized;
    }

    private function normalizeNullableDateTime($value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $normalized = trim($value);
        if ($normalized === '') {
            return null;
        }

        return OrderPayload::databaseDateTimeToIso8601($normalized);
    }

    private function isValidDateOnly(string $value): bool
    {
        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $value);
    }

    private function generateUuidV4(): string
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

    /**
     * @return array<string, mixed>
     */
    private function getTokenScopedPublicOrderingStatus(string $publicOrderToken): array
    {
        if (!self::isValidPublicOrderToken($publicOrderToken)) {
            return [
                'ordering_open' => false,
                'resolution_scope' => 'event_token',
                'requested_public_order_token' => $publicOrderToken,
                'availability' => 'invalid_token',
                'event' => null,
            ];
        }

        $event = $this->getEventByPublicOrderToken($publicOrderToken);
        if ($event === null) {
            return [
                'ordering_open' => false,
                'resolution_scope' => 'event_token',
                'requested_public_order_token' => $publicOrderToken,
                'availability' => 'invalid_token',
                'event' => null,
            ];
        }

        $availability = $event['event_status'] === self::STATUS_ACTIVE
            ? 'active'
            : ($event['event_status'] === self::STATUS_SCHEDULED ? 'scheduled' : 'ended');

        return [
            'ordering_open' => $availability === 'active',
            'resolution_scope' => 'event_token',
            'requested_public_order_token' => $publicOrderToken,
            'availability' => $availability,
            'event' => $this->toPublicEvent($event),
        ];
    }

    public static function generatePublicOrderToken(): string
    {
        $token = rtrim(strtr(base64_encode(random_bytes(self::PUBLIC_ORDER_TOKEN_BYTES)), '+/', '-_'), '=');
        if (!self::isValidPublicOrderToken($token)) {
            throw new \RuntimeException('Unable to generate a valid public order token.');
        }
        return $token;
    }

    public static function isValidPublicOrderToken(string $token): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_-]{43}$/', trim($token));
    }
}
