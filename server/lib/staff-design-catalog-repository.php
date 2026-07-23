<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class StaffDesignCatalogNotFoundException extends \RuntimeException
{
}

final class StaffDesignCatalogValidationException extends \RuntimeException
{
    /** @var array<string, string> */
    private array $fieldErrors;

    /**
     * @param array<string, string> $fieldErrors
     */
    public function __construct(array $fieldErrors, string $message = 'Review the design fields and try again.')
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

final class PdoStaffDesignCatalogRepository implements StaffDesignCatalogImportRepositoryInterface
{
    public const CATEGORY_OPTIONS = [
        'boutique_womens',
        'texas_local_pride',
        'hunting_outdoors',
        'patriotic_military',
        'western_rodeo',
        'america_250',
        'business_corporate',
        'sports',
        'seasonal',
        'other',
    ];
    public const STORE_FIT_OPTIONS = [
        'boutique',
        'feed_western',
        'gift_shop',
        'military',
        'outdoor',
        'business_corporate',
        'multiple',
        'undecided',
    ];
    public const STATUS_OPTIONS = [
        'review',
        'idea',
        'approved',
        'active',
        'seasonal',
        'retired',
    ];
    public const PRODUCTION_METHOD_OPTIONS = [
        'leatherette_engraving',
        'uv_print',
        'acrylic',
        'other',
        'tbd',
    ];
    public const MADE_ON_HAT_OPTIONS = [
        'yes',
        'no',
        'unknown',
    ];

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listDesigns(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT
                    id,
                    design_name,
                    thumbnail_path,
                    category,
                    store_fit,
                    status,
                    production_method,
                    production_file_location,
                    made_on_hat,
                    notes,
                    sort_order,
                    created_at,
                    updated_at
                 FROM forge_catalog_designs
                 ORDER BY
                    CASE WHEN sort_order > 0 THEN 0 ELSE 1 END ASC,
                    sort_order ASC,
                    design_name ASC,
                    created_at ASC,
                    id ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($records)) {
            return [];
        }

        return array_map(
            static function ($record): array {
                return normalizeStaffCatalogDesignRecord($record);
            },
            $records
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getDesign(string $id): ?array
    {
        $normalizedId = normalizeStaffCatalogDesignId($id);
        if ($normalizedId === null) {
            return null;
        }

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    id,
                    design_name,
                    thumbnail_path,
                    category,
                    store_fit,
                    status,
                    production_method,
                    production_file_location,
                    made_on_hat,
                    notes,
                    sort_order,
                    created_at,
                    updated_at
                 FROM forge_catalog_designs
                 WHERE id = :id
                 LIMIT 1'
            );
            $statement->execute([
                ':id' => $normalizedId,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.', 0, $exception);
        }

        return is_array($record) ? normalizeStaffCatalogDesignRecord($record) : null;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createDesign(array $input): array
    {
        $normalized = validateAndNormalizeStaffCatalogDesignInput($input);
        $id = createStaffCatalogDesignUuid();
        $timestamp = gmdate('Y-m-d H:i:s.u');
        $sortOrder = getNextStaffCatalogSortOrder($this->pdo, 'forge_catalog_designs');

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_catalog_designs (
                    id,
                    design_name,
                    thumbnail_path,
                    category,
                    store_fit,
                    status,
                    production_method,
                    production_file_location,
                    made_on_hat,
                    notes,
                    sort_order,
                    created_at,
                    updated_at
                 ) VALUES (
                    :id,
                    :design_name,
                    :thumbnail_path,
                    :category,
                    :store_fit,
                    :status,
                    :production_method,
                    :production_file_location,
                    :made_on_hat,
                    :notes,
                    :sort_order,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':id' => $id,
                ':design_name' => $normalized['design_name'],
                ':thumbnail_path' => $normalized['thumbnail_path'],
                ':category' => $normalized['category'],
                ':store_fit' => $normalized['store_fit'],
                ':status' => $normalized['status'],
                ':production_method' => $normalized['production_method'],
                ':production_file_location' => $normalized['production_file_location'],
                ':made_on_hat' => $normalized['made_on_hat'],
                ':notes' => $normalized['notes'],
                ':sort_order' => $sortOrder,
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.', 0, $exception);
        }

        $created = $this->getDesign($id);
        if ($created === null) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.');
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedDesign(array $input, string $thumbnailPath): array
    {
        $normalized = validateAndNormalizeStaffCatalogDesignInput($input);
        $normalizedThumbnailPath = normalizeStaffCatalogThumbnailPath($thumbnailPath);
        $id = createStaffCatalogDesignUuid();
        $timestamp = gmdate('Y-m-d H:i:s.u');
        $sortOrder = getNextStaffCatalogSortOrder($this->pdo, 'forge_catalog_designs');

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_catalog_designs (
                    id,
                    design_name,
                    thumbnail_path,
                    category,
                    store_fit,
                    status,
                    production_method,
                    production_file_location,
                    made_on_hat,
                    notes,
                    sort_order,
                    created_at,
                    updated_at
                 ) VALUES (
                    :id,
                    :design_name,
                    :thumbnail_path,
                    :category,
                    :store_fit,
                    :status,
                    :production_method,
                    :production_file_location,
                    :made_on_hat,
                    :notes,
                    :sort_order,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':id' => $id,
                ':design_name' => $normalized['design_name'],
                ':thumbnail_path' => $normalizedThumbnailPath,
                ':category' => $normalized['category'],
                ':store_fit' => $normalized['store_fit'],
                ':status' => $normalized['status'],
                ':production_method' => $normalized['production_method'],
                ':production_file_location' => $normalized['production_file_location'],
                ':made_on_hat' => $normalized['made_on_hat'],
                ':notes' => $normalized['notes'],
                ':sort_order' => $sortOrder,
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.', 0, $exception);
        }

        $created = $this->getDesign($id);
        if ($created === null) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.');
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateDesign(string $id, array $input): array
    {
        $normalizedId = normalizeStaffCatalogDesignId($id);
        if ($normalizedId === null) {
            throw new StaffDesignCatalogNotFoundException('That design could not be found.');
        }

        if ($this->getDesign($normalizedId) === null) {
            throw new StaffDesignCatalogNotFoundException('That design could not be found.');
        }

        $normalized = validateAndNormalizeStaffCatalogDesignInput($input);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_designs
                 SET
                    design_name = :design_name,
                    category = :category,
                    store_fit = :store_fit,
                    status = :status,
                    production_method = :production_method,
                    production_file_location = :production_file_location,
                    made_on_hat = :made_on_hat,
                    notes = :notes,
                    updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':design_name' => $normalized['design_name'],
                ':category' => $normalized['category'],
                ':store_fit' => $normalized['store_fit'],
                ':status' => $normalized['status'],
                ':production_method' => $normalized['production_method'],
                ':production_file_location' => $normalized['production_file_location'],
                ':made_on_hat' => $normalized['made_on_hat'],
                ':notes' => $normalized['notes'],
                ':updated_at' => $timestamp,
                ':id' => $normalizedId,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getDesign($normalizedId);
        if ($updated === null) {
            throw new StaffDesignCatalogNotFoundException('That design could not be found.');
        }

        return $updated;
    }

    /**
     * @param array<int, string> $orderedIds
     * @return array<int, array<string, mixed>>
     */
    public function reorderDesigns(array $orderedIds): array
    {
        saveStaffCatalogSortOrder($this->pdo, 'forge_catalog_designs', $orderedIds);
        return $this->listDesigns();
    }

    /**
     * @return array{design: array<string, mixed>, previous_thumbnail_path: ?string}
     */
    public function updateThumbnailPath(string $id, string $thumbnailPath): array
    {
        $normalizedId = normalizeStaffCatalogDesignId($id);
        if ($normalizedId === null) {
            throw new StaffDesignCatalogNotFoundException('That design could not be found.');
        }

        $existing = $this->getDesign($normalizedId);
        if ($existing === null) {
            throw new StaffDesignCatalogNotFoundException('That design could not be found.');
        }

        $normalizedThumbnailPath = normalizeStaffCatalogThumbnailPath($thumbnailPath);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_designs
                 SET thumbnail_path = :thumbnail_path, updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':thumbnail_path' => $normalizedThumbnailPath,
                ':updated_at' => $timestamp,
                ':id' => $normalizedId,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Design catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getDesign($normalizedId);
        if ($updated === null) {
            throw new StaffDesignCatalogNotFoundException('That design could not be found.');
        }

        return [
            'design' => $updated,
            'previous_thumbnail_path' => is_string($existing['thumbnail_path'] ?? null)
                ? $existing['thumbnail_path']
                : null,
        ];
    }

}

/**
 * @return array<int, string>
 */
function getStaffCatalogCategoryOptions(): array
{
    return PdoStaffDesignCatalogRepository::CATEGORY_OPTIONS;
}

/**
 * @return array<int, string>
 */
function getStaffCatalogStoreFitOptions(): array
{
    return PdoStaffDesignCatalogRepository::STORE_FIT_OPTIONS;
}

/**
 * @return array<int, string>
 */
function getStaffCatalogStatusOptions(): array
{
    return PdoStaffDesignCatalogRepository::STATUS_OPTIONS;
}

/**
 * @return array<int, string>
 */
function getStaffCatalogProductionMethodOptions(): array
{
    return PdoStaffDesignCatalogRepository::PRODUCTION_METHOD_OPTIONS;
}

/**
 * @return array<int, string>
 */
function getStaffCatalogMadeOnHatOptions(): array
{
    return PdoStaffDesignCatalogRepository::MADE_ON_HAT_OPTIONS;
}

/**
 * @param mixed $id
 */
function normalizeStaffCatalogDesignId($id): ?string
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
 *   design_name: string,
 *   thumbnail_path: ?string,
 *   category: string,
 *   store_fit: string,
 *   status: string,
 *   production_method: string,
 *   production_file_location: ?string,
 *   made_on_hat: string,
 *   notes: ?string
 * }
 */
function validateAndNormalizeStaffCatalogDesignInput(array $input): array
{
    $fieldErrors = [];

    $designName = normalizeStaffCatalogRequiredText($input['design_name'] ?? null, 160);
    if ($designName === null) {
        $fieldErrors['design_name'] = 'Design name is required.';
    }

    $category = normalizeStaffCatalogEnumValue($input['category'] ?? null, getStaffCatalogCategoryOptions());
    if ($category === null) {
        $fieldErrors['category'] = 'Select a valid category.';
    }

    $storeFit = normalizeStaffCatalogEnumValue($input['store_fit'] ?? null, getStaffCatalogStoreFitOptions());
    if ($storeFit === null) {
        $fieldErrors['store_fit'] = 'Select a valid store fit.';
    }

    $status = normalizeStaffCatalogEnumValue($input['status'] ?? null, getStaffCatalogStatusOptions());
    if ($status === null) {
        $fieldErrors['status'] = 'Select a valid status.';
    }

    $productionMethod = normalizeStaffCatalogEnumValue($input['production_method'] ?? null, getStaffCatalogProductionMethodOptions());
    if ($productionMethod === null) {
        $fieldErrors['production_method'] = 'Select a valid production method.';
    }

    $madeOnHat = normalizeStaffCatalogEnumValue($input['made_on_hat'] ?? null, getStaffCatalogMadeOnHatOptions());
    if ($madeOnHat === null) {
        $fieldErrors['made_on_hat'] = 'Select a valid made-on-hat value.';
    }

    $productionFileLocation = normalizeStaffCatalogOptionalReferenceText($input['production_file_location'] ?? null, 512);
    if (is_string($input['production_file_location'] ?? null) && mb_strlen(trim((string) $input['production_file_location'])) > 512) {
        $fieldErrors['production_file_location'] = 'Production file location must be 512 characters or fewer.';
    }

    $notes = normalizeStaffCatalogOptionalText($input['notes'] ?? null, 4000);
    if (is_string($input['notes'] ?? null) && mb_strlen(trim((string) $input['notes'])) > 4000) {
        $fieldErrors['notes'] = 'Notes must be 4000 characters or fewer.';
    }

    if ($fieldErrors !== []) {
        throw new StaffDesignCatalogValidationException($fieldErrors);
    }

    return [
        'design_name' => $designName,
        'thumbnail_path' => null,
        'category' => $category,
        'store_fit' => $storeFit,
        'status' => $status,
        'production_method' => $productionMethod,
        'production_file_location' => $productionFileLocation,
        'made_on_hat' => $madeOnHat,
        'notes' => $notes,
    ];
}

/**
 * @param mixed $record
 * @return array<string, mixed>
 */
function normalizeStaffCatalogDesignRecord($record): array
{
    $normalized = is_array($record) ? $record : [];

    return [
        'id' => normalizeStaffCatalogNullableString($normalized['id'] ?? '') ?? '',
        'design_name' => normalizeStaffCatalogNullableString($normalized['design_name'] ?? '') ?? '',
        'thumbnail_path' => normalizeStaffCatalogNullableString($normalized['thumbnail_path'] ?? null),
        'category' => normalizeStaffCatalogNullableString($normalized['category'] ?? '') ?? '',
        'store_fit' => normalizeStaffCatalogNullableString($normalized['store_fit'] ?? '') ?? '',
        'status' => normalizeStaffCatalogNullableString($normalized['status'] ?? '') ?? '',
        'production_method' => normalizeStaffCatalogNullableString($normalized['production_method'] ?? '') ?? '',
        'production_file_location' => normalizeStaffCatalogNullableString($normalized['production_file_location'] ?? null),
        'made_on_hat' => normalizeStaffCatalogNullableString($normalized['made_on_hat'] ?? '') ?? '',
        'notes' => normalizeStaffCatalogNullableString($normalized['notes'] ?? null),
        'sort_order' => max(0, (int) ($normalized['sort_order'] ?? 0)),
        'created_at' => normalizeStaffCatalogDateTime($normalized['created_at'] ?? ''),
        'updated_at' => normalizeStaffCatalogDateTime($normalized['updated_at'] ?? ''),
    ];
}

function createStaffCatalogDesignUuid(): string
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
function normalizeStaffCatalogThumbnailPath($value): string
{
    if (!is_string($value)) {
        throw new StaffDesignCatalogValidationException([
            'thumbnail' => 'Thumbnail upload could not be saved.',
        ]);
    }

    $normalized = trim($value);
    if ($normalized === '' || strlen($normalized) > 255 || str_contains($normalized, '..')) {
        throw new StaffDesignCatalogValidationException([
            'thumbnail' => 'Thumbnail upload could not be saved.',
        ]);
    }

    return $normalized;
}

/**
 * @param mixed $value
 * @param array<int, string> $allowedValues
 */
function normalizeStaffCatalogEnumValue($value, array $allowedValues): ?string
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
function normalizeStaffCatalogRequiredText($value, int $maxLength): ?string
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
function normalizeStaffCatalogOptionalText($value, int $maxLength): ?string
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
function normalizeStaffCatalogOptionalReferenceText($value, int $maxLength): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim($value);
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
function normalizeStaffCatalogDateTime($value): string
{
    return is_string($value) ? trim($value) : '';
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogNullableString($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim($value);
    return $normalized === '' ? null : $normalized;
}
