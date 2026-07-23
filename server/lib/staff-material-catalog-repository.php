<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class StaffMaterialCatalogNotFoundException extends \RuntimeException
{
}
final class StaffMaterialCatalogValidationException extends \RuntimeException
{
    /** @var array<string, string> */
    private array $fieldErrors;

    /**
     * @param array<string, string> $fieldErrors
     */
    public function __construct(array $fieldErrors, string $message = 'Review the material fields and try again.')
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

interface StaffMaterialCatalogImportRepositoryInterface
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function listMaterials(): array;

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedMaterial(array $input, string $swatchPath): array;
}

final class PdoStaffMaterialCatalogRepository implements StaffMaterialCatalogImportRepositoryInterface
{
    public const STATUS_OPTIONS = [
        'review',
        'active',
        'retired',
    ];

    public const COST_BASIS_OPTIONS = [
        'per_patch',
        'per_sheet',
        'per_pack',
        'per_square_inch',
        'other',
    ];

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listMaterials(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT
                    id,
                    material_name,
                    swatch_path,
                    material_type,
                    color,
                    supplier,
                    production_method,
                    purchase_cost,
                    purchase_quantity,
                    cost_basis,
                    status,
                    notes,
                    image_width,
                    image_height,
                    sort_order,
                    created_at,
                    updated_at
                 FROM forge_catalog_materials
                 ORDER BY
                    CASE WHEN sort_order > 0 THEN 0 ELSE 1 END ASC,
                    sort_order ASC,
                    material_name ASC,
                    created_at ASC,
                    id ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($records)) {
            return [];
        }

        return array_map(
            static function ($record): array {
                return normalizeStaffCatalogMaterialRecord($record);
            },
            $records
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getMaterial(string $id): ?array
    {
        $normalizedId = normalizeStaffCatalogMaterialId($id);
        if ($normalizedId === null) {
            return null;
        }

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    id,
                    material_name,
                    swatch_path,
                    material_type,
                    color,
                    supplier,
                    production_method,
                    purchase_cost,
                    purchase_quantity,
                    cost_basis,
                    status,
                    notes,
                    image_width,
                    image_height,
                    sort_order,
                    created_at,
                    updated_at
                 FROM forge_catalog_materials
                 WHERE id = :id
                 LIMIT 1'
            );
            $statement->execute([
                ':id' => $normalizedId,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.', 0, $exception);
        }

        return is_array($record) ? normalizeStaffCatalogMaterialRecord($record) : null;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createMaterial(array $input): array
    {
        $normalized = validateAndNormalizeStaffCatalogMaterialInput($input);
        $id = createStaffCatalogMaterialUuid();
        $timestamp = gmdate('Y-m-d H:i:s.u');
        $sortOrder = getNextStaffCatalogSortOrder($this->pdo, 'forge_catalog_materials');

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_catalog_materials (
                    id,
                    material_name,
                    swatch_path,
                    material_type,
                    color,
                    supplier,
                    production_method,
                    purchase_cost,
                    purchase_quantity,
                    cost_basis,
                    status,
                    notes,
                    image_width,
                    image_height,
                    sort_order,
                    created_at,
                    updated_at
                 ) VALUES (
                    :id,
                    :material_name,
                    :swatch_path,
                    :material_type,
                    :color,
                    :supplier,
                    :production_method,
                    :purchase_cost,
                    :purchase_quantity,
                    :cost_basis,
                    :status,
                    :notes,
                    :image_width,
                    :image_height,
                    :sort_order,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':id' => $id,
                ':material_name' => $normalized['material_name'],
                ':swatch_path' => $normalized['swatch_path'],
                ':material_type' => $normalized['material_type'],
                ':color' => $normalized['color'],
                ':supplier' => $normalized['supplier'],
                ':production_method' => $normalized['production_method'],
                ':purchase_cost' => $normalized['purchase_cost'],
                ':purchase_quantity' => $normalized['purchase_quantity'],
                ':cost_basis' => $normalized['cost_basis'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':image_width' => $normalized['image_width'],
                ':image_height' => $normalized['image_height'],
                ':sort_order' => $sortOrder,
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.', 0, $exception);
        }

        $created = $this->getMaterial($id);
        if ($created === null) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.');
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedMaterial(array $input, string $swatchPath): array
    {
        $normalized = validateAndNormalizeStaffCatalogMaterialInput($input);
        $normalizedSwatchPath = normalizeStaffCatalogMaterialSwatchPath($swatchPath);
        $id = createStaffCatalogMaterialUuid();
        $timestamp = gmdate('Y-m-d H:i:s.u');
        $sortOrder = getNextStaffCatalogSortOrder($this->pdo, 'forge_catalog_materials');

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_catalog_materials (
                    id,
                    material_name,
                    swatch_path,
                    material_type,
                    color,
                    supplier,
                    production_method,
                    purchase_cost,
                    purchase_quantity,
                    cost_basis,
                    status,
                    notes,
                    image_width,
                    image_height,
                    sort_order,
                    created_at,
                    updated_at
                 ) VALUES (
                    :id,
                    :material_name,
                    :swatch_path,
                    :material_type,
                    :color,
                    :supplier,
                    :production_method,
                    :purchase_cost,
                    :purchase_quantity,
                    :cost_basis,
                    :status,
                    :notes,
                    :image_width,
                    :image_height,
                    :sort_order,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':id' => $id,
                ':material_name' => $normalized['material_name'],
                ':swatch_path' => $normalizedSwatchPath,
                ':material_type' => $normalized['material_type'],
                ':color' => $normalized['color'],
                ':supplier' => $normalized['supplier'],
                ':production_method' => $normalized['production_method'],
                ':purchase_cost' => $normalized['purchase_cost'],
                ':purchase_quantity' => $normalized['purchase_quantity'],
                ':cost_basis' => $normalized['cost_basis'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':image_width' => $normalized['image_width'],
                ':image_height' => $normalized['image_height'],
                ':sort_order' => $sortOrder,
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.', 0, $exception);
        }

        $created = $this->getMaterial($id);
        if ($created === null) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.');
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateMaterial(string $id, array $input): array
    {
        $normalizedId = normalizeStaffCatalogMaterialId($id);
        if ($normalizedId === null) {
            throw new StaffMaterialCatalogNotFoundException('That material could not be found.');
        }

        if ($this->getMaterial($normalizedId) === null) {
            throw new StaffMaterialCatalogNotFoundException('That material could not be found.');
        }

        $normalized = validateAndNormalizeStaffCatalogMaterialInput($input);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_materials
                 SET
                    material_name = :material_name,
                    material_type = :material_type,
                    color = :color,
                    supplier = :supplier,
                    production_method = :production_method,
                    purchase_cost = :purchase_cost,
                    purchase_quantity = :purchase_quantity,
                    cost_basis = :cost_basis,
                    status = :status,
                    notes = :notes,
                    updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':material_name' => $normalized['material_name'],
                ':material_type' => $normalized['material_type'],
                ':color' => $normalized['color'],
                ':supplier' => $normalized['supplier'],
                ':production_method' => $normalized['production_method'],
                ':purchase_cost' => $normalized['purchase_cost'],
                ':purchase_quantity' => $normalized['purchase_quantity'],
                ':cost_basis' => $normalized['cost_basis'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':updated_at' => $timestamp,
                ':id' => $normalizedId,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getMaterial($normalizedId);
        if ($updated === null) {
            throw new StaffMaterialCatalogNotFoundException('That material could not be found.');
        }

        return $updated;
    }

    /**
     * @param array<int, string> $orderedIds
     * @return array<int, array<string, mixed>>
     */
    public function reorderMaterials(array $orderedIds): array
    {
        saveStaffCatalogSortOrder($this->pdo, 'forge_catalog_materials', $orderedIds);
        return $this->listMaterials();
    }

    /**
     * @return array{material: array<string, mixed>, previous_swatch_path: ?string}
     */
    public function updateSwatchMedia(string $id, string $swatchPath, int $imageWidth, int $imageHeight): array
    {
        $normalizedId = normalizeStaffCatalogMaterialId($id);
        if ($normalizedId === null) {
            throw new StaffMaterialCatalogNotFoundException('That material could not be found.');
        }

        $existing = $this->getMaterial($normalizedId);
        if ($existing === null) {
            throw new StaffMaterialCatalogNotFoundException('That material could not be found.');
        }

        $normalizedSwatchPath = normalizeStaffCatalogMaterialSwatchPath($swatchPath);
        $normalizedImageWidth = normalizeStaffCatalogMaterialImageDimension($imageWidth);
        $normalizedImageHeight = normalizeStaffCatalogMaterialImageDimension($imageHeight);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_materials
                 SET
                    swatch_path = :swatch_path,
                    image_width = :image_width,
                    image_height = :image_height,
                    updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':swatch_path' => $normalizedSwatchPath,
                ':image_width' => $normalizedImageWidth,
                ':image_height' => $normalizedImageHeight,
                ':updated_at' => $timestamp,
                ':id' => $normalizedId,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Material catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getMaterial($normalizedId);
        if ($updated === null) {
            throw new StaffMaterialCatalogNotFoundException('That material could not be found.');
        }

        return [
            'material' => $updated,
            'previous_swatch_path' => is_string($existing['swatch_path'] ?? null)
                ? $existing['swatch_path']
                : null,
        ];
    }
}

/**
 * @return array<int, string>
 */
function getStaffCatalogMaterialStatusOptions(): array
{
    return PdoStaffMaterialCatalogRepository::STATUS_OPTIONS;
}

/**
 * @return array<int, string>
 */
function getStaffCatalogMaterialCostBasisOptions(): array
{
    return PdoStaffMaterialCatalogRepository::COST_BASIS_OPTIONS;
}

/**
 * @param mixed $id
 */
function normalizeStaffCatalogMaterialId($id): ?string
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
 *   material_name: string,
 *   swatch_path: ?string,
 *   material_type: ?string,
 *   color: ?string,
 *   supplier: ?string,
 *   production_method: ?string,
 *   purchase_cost: ?string,
 *   purchase_quantity: ?int,
 *   cost_basis: ?string,
 *   status: string,
 *   notes: ?string,
 *   image_width: ?int,
 *   image_height: ?int
 * }
 */
function validateAndNormalizeStaffCatalogMaterialInput(array $input): array
{
    $fieldErrors = [];

    $materialName = normalizeStaffCatalogMaterialRequiredText($input['material_name'] ?? null, 160);
    if ($materialName === null) {
        $fieldErrors['material_name'] = 'Material name is required.';
    }

    $status = normalizeStaffCatalogMaterialEnumValue($input['status'] ?? null, getStaffCatalogMaterialStatusOptions());
    if ($status === null) {
        $fieldErrors['status'] = 'Select a valid status.';
    }

    $costBasis = normalizeStaffCatalogMaterialEnumValue($input['cost_basis'] ?? null, getStaffCatalogMaterialCostBasisOptions());
    if (($input['cost_basis'] ?? null) !== null && trim((string) $input['cost_basis']) !== '' && $costBasis === null) {
        $fieldErrors['cost_basis'] = 'Select a valid cost basis.';
    }

    $materialType = normalizeStaffCatalogMaterialOptionalText($input['material_type'] ?? null, 160);
    $color = normalizeStaffCatalogMaterialOptionalText($input['color'] ?? null, 160);
    $supplier = normalizeStaffCatalogMaterialOptionalText($input['supplier'] ?? null, 160);
    $productionMethod = normalizeStaffCatalogMaterialOptionalText($input['production_method'] ?? null, 160);
    $notes = normalizeStaffCatalogMaterialOptionalText($input['notes'] ?? null, 4000);
    $purchaseCost = normalizeStaffCatalogMaterialPurchaseCost($input['purchase_cost'] ?? null);
    $purchaseQuantity = normalizeStaffCatalogMaterialPurchaseQuantity($input['purchase_quantity'] ?? null);
    $imageWidth = normalizeStaffCatalogMaterialImageDimension($input['image_width'] ?? null);
    $imageHeight = normalizeStaffCatalogMaterialImageDimension($input['image_height'] ?? null);

    if (is_string($input['material_type'] ?? null) && mb_strlen(trim((string) $input['material_type'])) > 160) {
        $fieldErrors['material_type'] = 'Material type must be 160 characters or fewer.';
    }
    if (is_string($input['color'] ?? null) && mb_strlen(trim((string) $input['color'])) > 160) {
        $fieldErrors['color'] = 'Color must be 160 characters or fewer.';
    }
    if (is_string($input['supplier'] ?? null) && mb_strlen(trim((string) $input['supplier'])) > 160) {
        $fieldErrors['supplier'] = 'Supplier must be 160 characters or fewer.';
    }
    if (is_string($input['production_method'] ?? null) && mb_strlen(trim((string) $input['production_method'])) > 160) {
        $fieldErrors['production_method'] = 'Production method must be 160 characters or fewer.';
    }
    if (is_string($input['notes'] ?? null) && mb_strlen(trim((string) $input['notes'])) > 4000) {
        $fieldErrors['notes'] = 'Notes must be 4000 characters or fewer.';
    }
    if (($input['purchase_cost'] ?? null) !== null && trim((string) $input['purchase_cost']) !== '' && $purchaseCost === null) {
        $fieldErrors['purchase_cost'] = 'Purchase cost must be a nonnegative amount with up to two decimals.';
    }
    if (($input['purchase_quantity'] ?? null) !== null && trim((string) $input['purchase_quantity']) !== '' && $purchaseQuantity === null) {
        $fieldErrors['purchase_quantity'] = 'Purchase quantity must be a positive whole number.';
    }
    if (($input['image_width'] ?? null) !== null && trim((string) $input['image_width']) !== '' && $imageWidth === null) {
        $fieldErrors['image_width'] = 'Image width must be a positive whole number.';
    }
    if (($input['image_height'] ?? null) !== null && trim((string) $input['image_height']) !== '' && $imageHeight === null) {
        $fieldErrors['image_height'] = 'Image height must be a positive whole number.';
    }

    if ($fieldErrors !== []) {
        throw new StaffMaterialCatalogValidationException($fieldErrors);
    }

    return [
        'material_name' => $materialName,
        'swatch_path' => null,
        'material_type' => $materialType,
        'color' => $color,
        'supplier' => $supplier,
        'production_method' => $productionMethod,
        'purchase_cost' => $purchaseCost,
        'purchase_quantity' => $purchaseQuantity,
        'cost_basis' => $costBasis,
        'status' => $status,
        'notes' => $notes,
        'image_width' => $imageWidth,
        'image_height' => $imageHeight,
    ];
}

/**
 * @param mixed $record
 * @return array<string, mixed>
 */
function normalizeStaffCatalogMaterialRecord($record): array
{
    $normalized = is_array($record) ? $record : [];

    return [
        'id' => normalizeStaffCatalogMaterialNullableString($normalized['id'] ?? '') ?? '',
        'material_name' => normalizeStaffCatalogMaterialNullableString($normalized['material_name'] ?? '') ?? '',
        'swatch_path' => normalizeStaffCatalogMaterialNullableString($normalized['swatch_path'] ?? null),
        'material_type' => normalizeStaffCatalogMaterialNullableString($normalized['material_type'] ?? null),
        'color' => normalizeStaffCatalogMaterialNullableString($normalized['color'] ?? null),
        'supplier' => normalizeStaffCatalogMaterialNullableString($normalized['supplier'] ?? null),
        'production_method' => normalizeStaffCatalogMaterialNullableString($normalized['production_method'] ?? null),
        'purchase_cost' => normalizeStaffCatalogMaterialPurchaseCostString($normalized['purchase_cost'] ?? null),
        'purchase_quantity' => normalizeStaffCatalogMaterialImageDimension($normalized['purchase_quantity'] ?? null),
        'cost_basis' => normalizeStaffCatalogMaterialNullableString($normalized['cost_basis'] ?? null),
        'status' => normalizeStaffCatalogMaterialNullableString($normalized['status'] ?? '') ?? '',
        'notes' => normalizeStaffCatalogMaterialNullableString($normalized['notes'] ?? null),
        'image_width' => normalizeStaffCatalogMaterialImageDimension($normalized['image_width'] ?? null),
        'image_height' => normalizeStaffCatalogMaterialImageDimension($normalized['image_height'] ?? null),
        'sort_order' => max(0, (int) ($normalized['sort_order'] ?? 0)),
        'created_at' => normalizeStaffCatalogMaterialDateTime($normalized['created_at'] ?? ''),
        'updated_at' => normalizeStaffCatalogMaterialDateTime($normalized['updated_at'] ?? ''),
    ];
}

function createStaffCatalogMaterialUuid(): string
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
function normalizeStaffCatalogMaterialSwatchPath($value): string
{
    if (!is_string($value)) {
        throw new StaffMaterialCatalogValidationException([
            'swatch' => 'Material swatch upload could not be saved.',
        ]);
    }

    $normalized = trim($value);
    if ($normalized === '' || strlen($normalized) > 255 || str_contains($normalized, '..')) {
        throw new StaffMaterialCatalogValidationException([
            'swatch' => 'Material swatch upload could not be saved.',
        ]);
    }

    return $normalized;
}

/**
 * @param mixed $value
 * @param array<int, string> $allowedValues
 */
function normalizeStaffCatalogMaterialEnumValue($value, array $allowedValues): ?string
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
function normalizeStaffCatalogMaterialRequiredText($value, int $maxLength): ?string
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
function normalizeStaffCatalogMaterialOptionalText($value, int $maxLength): ?string
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
function normalizeStaffCatalogMaterialPurchaseCost($value): ?string
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
function normalizeStaffCatalogMaterialPurchaseCostString($value): ?string
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
function normalizeStaffCatalogMaterialPurchaseQuantity($value): ?int
{
    if ($value === null) {
        return null;
    }

    if (is_string($value)) {
        $normalized = trim($value);
        if ($normalized === '') {
            return null;
        }
        if (!preg_match('/^[1-9]\d*$/', $normalized)) {
            return null;
        }
        return (int) $normalized;
    }

    if (is_int($value)) {
        return $value > 0 ? $value : null;
    }

    return null;
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogMaterialImageDimension($value): ?int
{
    if ($value === null) {
        return null;
    }

    if (is_string($value)) {
        $normalized = trim($value);
        if ($normalized === '') {
            return null;
        }
        if (!preg_match('/^[1-9]\d*$/', $normalized)) {
            return null;
        }
        return (int) $normalized;
    }

    if (is_int($value)) {
        return $value > 0 ? $value : null;
    }

    return null;
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogMaterialDateTime($value): string
{
    return is_string($value) ? trim($value) : '';
}

/**
 * @param mixed $value
 */
function normalizeStaffCatalogMaterialNullableString($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim($value);
    return $normalized === '' ? null : $normalized;
}

function formatStaffCatalogMaterialCostBasisLabel(?string $value): string
{
    return match ($value) {
        'per_patch' => 'Per Patch',
        'per_sheet' => 'Per Sheet',
        'per_pack' => 'Per Pack',
        'per_square_inch' => 'Per Square Inch',
        'other' => 'Other',
        default => '',
    };
}
