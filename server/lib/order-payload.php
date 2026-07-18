<?php
declare(strict_types=1);

namespace Forge\Server;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use JsonException;

final class OrderPayload
{
    public const MAX_REQUEST_BYTES = 1048576;
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';
    private const ISO_8601_PATTERN = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+\-]\d{2}:\d{2})$/';

    public static function isJsonContentType(?string $contentType): bool
    {
        if (!is_string($contentType)) {
            return false;
        }

        $normalized = strtolower(trim(explode(';', $contentType, 2)[0]));
        return $normalized === 'application/json';
    }

    public static function decodeJsonObject(string $rawBody): array
    {
        try {
            $decoded = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new ApiProblem(
                422,
                'invalid_json',
                'The request body must contain valid JSON.',
                [],
                $exception
            );
        }

        if (!is_array($decoded) || self::isListArray($decoded)) {
            throw new ApiProblem(
                422,
                'invalid_order',
                'The submitted order is missing required Forge fields.'
            );
        }

        return $decoded;
    }

    public static function validatePayload(array $payload): void
    {
        $forgeOrderUuid = self::trimmedString($payload['forge_order_uuid'] ?? null);
        if ($forgeOrderUuid === '' || !preg_match(self::UUID_PATTERN, $forgeOrderUuid)) {
            throw new ApiProblem(422, 'invalid_order', 'The submitted order is missing required Forge fields.');
        }

        $submittedAt = self::trimmedString($payload['submitted_at'] ?? null);
        if ($submittedAt === '' || !self::isValidDateTimeValue($submittedAt)) {
            throw new ApiProblem(422, 'invalid_order', 'The submitted order is missing required Forge fields.');
        }

        $source = self::trimmedString($payload['source'] ?? null);
        if ($source === '') {
            throw new ApiProblem(422, 'invalid_order', 'The submitted order is missing required Forge fields.');
        }

        $items = $payload['items'] ?? null;
        if (!is_array($items) || $items === []) {
            throw new ApiProblem(422, 'invalid_order', 'The submitted order is missing required Forge fields.');
        }

        $customer = $payload['customer'] ?? null;
        if (!is_array($customer) || self::isListArray($customer)) {
            throw new ApiProblem(422, 'invalid_order', 'The submitted order is missing required Forge fields.');
        }

        try {
            self::canonicalizeToJson($payload);
        } catch (JsonException $exception) {
            throw new ApiProblem(
                422,
                'invalid_order',
                'The submitted order is missing required Forge fields.',
                [],
                $exception
            );
        }
    }

    public static function canonicalizeToJson(array $payload): string
    {
        $canonicalValue = self::canonicalizeValue($payload);

        return json_encode(
            $canonicalValue,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR
        );
    }

    public static function hashCanonicalPayload(array $payload): string
    {
        return hash('sha256', self::canonicalizeToJson($payload));
    }

    public static function extractMetadata(array $payload): array
    {
        $event = $payload['event'] ?? null;
        $eventId = is_array($event) ? self::nullableTrimmedString($event['event_id'] ?? null) : null;

        return [
            'forge_order_uuid' => self::trimmedString($payload['forge_order_uuid'] ?? null),
            'record_version' => self::trimmedString($payload['schema_version'] ?? null) ?: '1.0',
            'source' => self::trimmedString($payload['source'] ?? null),
            'submitted_at' => self::normalizeIso8601Utc($payload['submitted_at'] ?? null),
            'device_id' => self::nullableTrimmedString($payload['device_id'] ?? null),
            'event_id' => $eventId,
        ];
    }

    public static function normalizeIso8601Utc($value): string
    {
        $date = self::createDateTime($value);
        return $date->setTimezone(new DateTimeZone('UTC'))->format(DateTimeInterface::ATOM);
    }

    public static function normalizeDatabaseDateTime(string $iso8601Utc): string
    {
        $date = self::createDateTime($iso8601Utc);
        return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    }

    public static function databaseDateTimeToIso8601(string $databaseDateTime): string
    {
        $date = self::createDatabaseDateTime($databaseDateTime);
        return $date->setTimezone(new DateTimeZone('UTC'))->format(DateTimeInterface::ATOM);
    }

    private static function canonicalizeValue($value)
    {
        if (!is_array($value)) {
            return $value;
        }

        if (self::isListArray($value)) {
            $output = [];
            foreach ($value as $entry) {
                $output[] = self::canonicalizeValue($entry);
            }
            return $output;
        }

        $output = [];
        $keys = array_keys($value);
        sort($keys, SORT_STRING);

        foreach ($keys as $key) {
            $output[(string) $key] = self::canonicalizeValue($value[$key]);
        }

        return $output;
    }

    private static function isListArray(array $value): bool
    {
        $expectedIndex = 0;
        foreach ($value as $key => $_entry) {
            if ($key !== $expectedIndex) {
                return false;
            }
            $expectedIndex++;
        }
        return true;
    }

    private static function isValidDateTimeValue(string $value): bool
    {
        try {
            self::createDateTime($value);
            return true;
        } catch (\Throwable $exception) {
            return false;
        }
    }

    private static function createDateTime($value): DateTimeImmutable
    {
        $normalized = self::trimmedString($value);
        if ($normalized === '') {
            throw new \InvalidArgumentException('A valid date-time value is required.');
        }
        if (!preg_match(self::ISO_8601_PATTERN, $normalized)) {
            throw new \InvalidArgumentException('A valid ISO-8601 date-time value is required.');
        }

        return new DateTimeImmutable($normalized, new DateTimeZone('UTC'));
    }

    private static function createDatabaseDateTime($value): DateTimeImmutable
    {
        $normalized = self::trimmedString($value);
        if ($normalized === '') {
            throw new \InvalidArgumentException('A valid database date-time value is required.');
        }

        $utc = new DateTimeZone('UTC');
        foreach (['Y-m-d H:i:s.u', 'Y-m-d H:i:s'] as $format) {
            $date = DateTimeImmutable::createFromFormat('!' . $format, $normalized, $utc);
            $lastErrors = DateTimeImmutable::getLastErrors();

            if ($date === false) {
                continue;
            }

            if (is_array($lastErrors)) {
                if (($lastErrors['warning_count'] ?? 0) !== 0 || ($lastErrors['error_count'] ?? 0) !== 0) {
                    continue;
                }
            }

            if ($date->format($format) !== $normalized) {
                continue;
            }

            return $date;
        }

        throw new \InvalidArgumentException('A valid database date-time value is required.');
    }

    private static function trimmedString($value): string
    {
        return is_string($value) ? trim($value) : '';
    }

    private static function nullableTrimmedString($value): ?string
    {
        $normalized = self::trimmedString($value);
        return $normalized === '' ? null : $normalized;
    }
}
