<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class StaffHatCatalogNotFoundException extends \RuntimeException
{
}

final class StaffHatCatalogValidationException extends \RuntimeException
{
    /** @var array<string, string> */
    private array $fieldErrors;

    /**
     * @param array<string, string> $fieldErrors
     */
    public function __construct(array $fieldErrors, string $message = 'Review the hat fields and try again.')
    {
        parent::__construct($message);
        $this->fieldErrors = $fieldErrors;
    }

    /**
     * @return array<string, string>
     */
    public function getFieldErrors(): array
    {
        return $this->fieldErrors;
    }
}

interface StaffHatCatalogImportRepositoryInterface
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function listHats(): array;

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedHat(array $input, string $photoPath): array;
}

final class PdoStaffHatCatalogRepository implements StaffHatCatalogImportRepositoryInterface
{
    public const STATUS_OPTIONS = [
        'review',
        'active',
        'retired',
    ];

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listHats(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT
                    id,
                    hat_name,
                    photo_path,
                    manufacturer,
                    model,
                    color,
                    vendor,
                    base_cost,
                    status,
                    notes,
                    created_at,
                    updated_at
                 FROM forge_catalog_hats
                 ORDER BY updated_at DESC, hat_name ASC, id ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($records)) {
            return [];
        }

        return array_map(
            static function ($record): array {
                return normalizeStaffCatalogHatRecord($record);
            },
            $records
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getHat(string $id): ?array
    {
        $normalizedId = normalizeStaffCatalogHatId($id);
        if ($normalizedId === null) {
            return null;
        }

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    id,
                    hat_name,
                    photo_path,
                    manufacturer,
                    model,
                    color,
                    vendor,
                    base_cost,
                    status,
                    notes,
                    created_at,
                    updated_at
                 FROM forge_catalog_hats
                 WHERE id = :id
                 LIMIT 1'
            );
            $statement->execute([
                ':id' => $normalizedId,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.', 0, $exception);
        }

        return is_array($record) ? normalizeStaffCatalogHatRecord($record) : null;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createHat(array $input): array
    {
        $normalized = validateAndNormalizeStaffCatalogHatInput($input);
        $id = createStaffCatalogHatUuid();
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_catalog_hats (
                    id,
                    hat_name,
                    photo_path,
                    manufacturer,
                    model,
                    color,
                    vendor,
                    base_cost,
                    status,
                    notes,
                    created_at,
                    updated_at
                 ) VALUES (
                    :id,
                    :hat_name,
                    :photo_path,
                    :manufacturer,
                    :model,
                    :color,
                    :vendor,
                    :base_cost,
                    :status,
                    :notes,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':id' => $id,
                ':hat_name' => $normalized['hat_name'],
                ':photo_path' => $normalized['photo_path'],
                ':manufacturer' => $normalized['manufacturer'],
                ':model' => $normalized['model'],
                ':color' => $normalized['color'],
                ':vendor' => $normalized['vendor'],
                ':base_cost' => $normalized['base_cost'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.', 0, $exception);
        }

        $created = $this->getHat($id);
        if ($created === null) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.');
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedHat(array $input, string $photoPath): array
    {
        $normalized = validateAndNormalizeStaffCatalogHatInput($input);
        $normalizedPhotoPath = normalizeStaffCatalogHatPhotoPath($photoPath);
        $id = createStaffCatalogHatUuid();
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_catalog_hats (
                    id,
                    hat_name,
                    photo_path,
                    manufacturer,
                    model,
                    color,
                    vendor,
                    base_cost,
                    status,
                    notes,
                    created_at,
                    updated_at
                 ) VALUES (
                    :id,
                    :hat_name,
                    :photo_path,
                    :manufacturer,
                    :model,
                    :color,
                    :vendor,
                    :base_cost,
                    :status,
                    :notes,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':id' => $id,
                ':hat_name' => $normalized['hat_name'],
                ':photo_path' => $normalizedPhotoPath,
                ':manufacturer' => $normalized['manufacturer'],
                ':model' => $normalized['model'],
                ':color' => $normalized['color'],
                ':vendor' => $normalized['vendor'],
                ':base_cost' => $normalized['base_cost'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.', 0, $exception);
        }

        $created = $this->getHat($id);
        if ($created === null) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.');
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateHat(string $id, array $input): array
    {
        $normalizedId = normalizeStaffCatalogHatId($id);
        if ($normalizedId === null) {
            throw new StaffHatCatalogNotFoundException('That hat could not be found.');
        }

        if ($this->getHat($normalizedId) === null) {
            throw new StaffHatCatalogNotFoundException('That hat could not be found.');
        }

        $normalized = validateAndNormalizeStaffCatalogHatInput($input);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_hats
                 SET
                    hat_name = :hat_name,
                    manufacturer = :manufacturer,
                    model = :model,
                    color = :color,
                    vendor = :vendor,
                    base_cost = :base_cost,
                    status = :status,
                    notes = :notes,
                    updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':hat_name' => $normalized['hat_name'],
                ':manufacturer' => $normalized['manufacturer'],
                ':model' => $normalized['model'],
                ':color' => $normalized['color'],
                ':vendor' => $normalized['vendor'],
                ':base_cost' => $normalized['base_cost'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':updated_at' => $timestamp,
                ':id' => $normalizedId,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getHat($normalizedId);
        if ($updated === null) {
            throw new StaffHatCatalogNotFoundException('That hat could not be found.');
        }

        return $updated;
    }

    /**
     * @return array{hat: array<string, mixed>, previous_photo_path: ?string}
     */
    public function updatePhotoPath(string $id, string $photoPath): array
    {
        $normalizedId = normalizeStaffCatalogHatId($id);
        if ($normalizedId === null) {
            throw new StaffHatCatalogNotFoundException('That hat could not be found.');
        }

        $existing = $this->getHat($normalizedId);
        if ($existing === null) {
            throw new StaffHatCatalogNotFoundException('That hat could not be found.');
        }

        $normalizedPhotoPath = normalizeStaffCatalogHatPhotoPath($photoPath);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_hats
                 SET photo_path = :photo_path, updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':photo_path' => $normalizedPhotoPath,
                ':updated_at' => $timestamp,
                ':id' => $normalizedId,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Hat catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getHat($normalizedId);
        if ($updated === null) {
            throw new StaffHatCatalogNotFoundException('That hat could not be found.');
        }

        return [
            'hat' => $updated,
            'previous_photo_path' => is_string($existing['photo_path'] ?? null)
                ? $existing['photo_path']
                : null,
        ];
    }
}

/**
 * @return array<int, string>
 */
function getStaffCatalogHatStatusOptions(): array
{
    return PdoStaffHatCatalogRepository::STATUS_OPTIONS;
}

/**
 * @param mixed $id
 */
function normalizeStaffCatalogHatId($id): ?string
{
    if (!is_string($id)) {
        return null;
    }

    $normalized = strtolower(trim($id));
    if ($normalized === '' || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $normalized)) {
        return null;
    }

    return $normalized;
}

/**
 * @param array<string, mixed> $input
 * @return array{
 *   hat_name: string,
 *   photo_path: ?string,
 *   manufacturer: ?string,
 *   model: ?string,
 *   color: ?string,
 *   vendor: ?string,
 *   base_cost: ?string,
 *   status: string,
 *   notes: ?string
 * }
 */
function validateAndNormalizeStaffCatalogHatInput(array $input): array
{
    $fieldErrors = [];

    $hatName = normalizeStaffCatalogHatRequiredText($input['hat_name'] ?? null, 160);
    if ($hatName === null) {
        $fieldErrors['hat_name'] = 'Hat name is required.';
    }

    $status = normalizeStaffCatalogHatEnumValue($input['status'] ?? null, getStaffCatalogHatStatusOptions());
    if ($status === null) {
        $fieldErrors['status'] = 'Select a valid status.';
    }

    $manufacturer = normalizeStaffCatalogHatOptionalText($input['manufacturer'] ?? null, 160);
    $model = normalizeStaffCatalogHatOptionalText($input['model'] ?? null, 160);
    $color = normalizeStaffCatalogHatOptionalText($input['color'] ?? null, 160);
    $vendor = normalizeStaffCatalogHatOptionalText($input['vendor'] ?? null, 160);
    $notes = normalizeStaffCatalogHatOptionalText($input['notes'] ?? null, 4000);
    $baseCost = normalizeStaffCatalogHatBaseCost($input['base_cost'] ?? null);

    if (is_string($input['manufacturer'] ?? null) && mb_strlen(trim((string) $input['manufacturer'])) > 160) {
        $fieldErrors['manufacturer'] = 'Manufacturer must be 160 characters or fewer.';
    }
    if (is_string($input['model'] ?? null) && mb_strlen(trim((string) $input['model'])) > 160) {
        $fieldErrors['model'] = 'Model must be 160 characters or fewer.';
    }
    if (is_string($input['color'] ?? null) && mb_strlen(trim((string) $input['color'])) > 160) {
        $fieldErrors['color'] = 'Color must be 160 characters or fewer.';
    }
    if (is_string($input['vendor'] ?? null) && mb_strlen(trim((string) $input['vendor'])) > 160) {
        $fieldErrors['vendor'] = 'Vendor must be 160 characters or fewer.';
    }
    if (is_string($input['notes'] ?? null) && mb_strlen(trim((string) $input['notes'])) > 4000) {
        $fieldErrors['notes'] = 'Notes must be 4000 characters or fewer.';
    }
    if (($input['base_cost'] ?? null) !== null && trim((string) $input['base_cost']) !== '' && $baseCost === null) {
        $fieldErrors['base_cost'] = 'Base cost must be a nonnegative amount with up to two decimals.';
    }

    if ($fieldErrors !== []) {
        throw new StaffHatCatalogValidationException($fieldErrors);
    }

    return [
        'hat_name' => $hatName,
        'photo_path' => null,
        'manufacturer' => $manufacturer,
        'model' => $model,
        'color' => $color,
        'vendor' => $vendor,
        'base_cost' => $baseCost,
        'status' => $status,
        'notes' => $notes,
    ];
}

/**
 * @param mixed $record
 * @return array<string, mixed>
 */
function normalizeStaffCatalogHatRecord($record): array
{
    $normalized = is_array($record) ? $record : [];

    return [
        'id' => normalizeStaffCatalogHatNullableString($normalized['id'] ?? '') ?? '',
        'hat_name' => normalizeStaffCatalogHatNullableString($normalized['hat_name'] ?? '') ?? '',
        'photo_path' => normalizeStaffCatalogHatNullableString($normalized['photo_path'] ?? null),
        'manufacturer' => normalizeStaffCatalogHatNullableString($normalized['manufacturer'] ?? null),
        'model' => normalizeStaffCatalogHatNullableString($normalized['model'] ?? null),
        'color' => normalizeStaffCatalogHatNullableString($normalized['color'] ?? null),
        'vendor' => normalizeStaffCatalogHatNullableString($normalized['vendor'] ?? null),
        'base_cost' => normalizeStaffCatalogHatBaseCostString($normalized['base_cost'] ?? null),
        'status' => normalizeStaffCatalogHatNullableString($normalized['status'] ?? '') ?? '',
        'notes' => normalizeStaffCatalogHatNullableString($normalized['notes'] ?? null),
        'created_at' => normalizeStaffCatalogHatDateTime($normalized['created_at'] ?? ''),
        'updated_at' => normalizeStaffCatalogHatDateTime($normalized['updated_at'] ?? ''),
    ];
}

function createStaffCatalogHatUuid(): string
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
 * @param mixed $value
 */
function normalizeStaffCatalogHatPhotoPath($value): string
{
    if (!is_string($value)) {
        throw new StaffHatCatalogValidationException([
            'photo' => 'Hat photo upload could not be saved.',
        ]);
    }

    $normalized = trim($value);
    if ($normalized === '' || strlen($normalized) > 255 || str_contains($normalized, '..')) {
        throw new StaffHatCatalogValidationException([
            'photo' => 'Hat photo upload could not be saved.',
        ]);
    }

    return $normalized;
}

/**
 * @param mixed $value
 * @param array<int, string> $allowedValues
 */
function normalizeStaffCatalogHatEnumValue($value, array $allowedValues): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim($value);
    return in_array($normalized, $allowedValues, true) ? $normalized : null;
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogHatRequiredText($value, int $maxLength): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    if ($normalized === '' || mb_strlen($normalized) > $maxLength) {
        return null;
    }

    return $normalized;
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogHatOptionalText($value, int $maxLength): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    if ($normalized === '') {
        return null;
    }
    if (mb_strlen($normalized) > $maxLength) {
        return null;
    }

    return $normalized;
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogHatBaseCost($value): ?string
{
    if ($value === null) {
        return null;
    }

    if (is_string($value)) {
        $normalized = trim($value);
        if ($normalized === '') {
            return null;
        }

        if (!preg_match('/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/', $normalized)) {
            return null;
        }

        return number_format((float) $normalized, 2, '.', '');
    }

    if (is_int($value) || is_float($value)) {
        if ($value < 0) {
            return null;
        }
        return number_format((float) $value, 2, '.', '');
    }

    return null;
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogHatBaseCostString($value): ?string
{
    if ($value === null) {
        return null;
    }

    if (is_string($value)) {
        $normalized = trim($value);
        return $normalized === '' ? null : $normalized;
    }

    if (is_int($value) || is_float($value)) {
        return number_format((float) $value, 2, '.', '');
    }

    return null;
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogHatDateTime($value): string
{
    return is_string($value) ? trim($value) : '';
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogHatNullableString($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim($value);
    return $normalized === '' ? null : $normalized;
}
