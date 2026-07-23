<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class StaffFinishedHatCatalogNotFoundException extends \RuntimeException
{
}

final class StaffFinishedHatCatalogValidationException extends \RuntimeException
{
    /** @var array<string, string> */
    private array $fieldErrors;

    /**
     * @param array<string, string> $fieldErrors
     */
    public function __construct(array $fieldErrors, string $message = 'Review the finished hat fields and try again.')
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

interface StaffFinishedHatCatalogImportRepositoryInterface
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function listFinishedHats(): array;

    /**
     * @return array{
     *   designs:array<int, array<string, mixed>>,
     *   hats:array<int, array<string, mixed>>,
     *   materials:array<int, array<string, mixed>>
     * }
     */
    public function listFinishedHatImportLinkOptions(): array;

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedFinishedHat(array $input, string $photoPath): array;
}

final class PdoStaffFinishedHatCatalogRepository implements StaffFinishedHatCatalogImportRepositoryInterface
{
    public const STATUS_OPTIONS = [
        'review',
        'active',
        'retired',
    ];

    public const PLACEMENT_STATUS_OPTIONS = [
        'unassigned',
        'sample',
        'currently_at_boutique',
        'sold',
        'past_build',
    ];

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listFinishedHats(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT
                    finished_hats.id,
                    finished_hats.finished_hat_name,
                    finished_hats.photo_path,
                    finished_hats.image_width,
                    finished_hats.image_height,
                    finished_hats.design_id,
                    finished_hats.hat_id,
                    finished_hats.material_id,
                    finished_hats.patch_shape,
                    finished_hats.patch_size,
                    finished_hats.placement_status,
                    finished_hats.location_label,
                    finished_hats.retail_price,
                    finished_hats.status,
                    finished_hats.notes,
                    finished_hats.created_at,
                    finished_hats.updated_at,
                    designs.design_name,
                    hats.hat_name,
                    hats.manufacturer AS hat_manufacturer,
                    hats.model AS hat_model,
                    hats.color AS hat_color,
                    materials.material_name,
                    materials.material_type,
                    materials.color AS material_color
                 FROM forge_catalog_finished_hats AS finished_hats
                 LEFT JOIN forge_catalog_designs AS designs
                    ON designs.id = finished_hats.design_id
                 LEFT JOIN forge_catalog_hats AS hats
                    ON hats.id = finished_hats.hat_id
                 LEFT JOIN forge_catalog_materials AS materials
                    ON materials.id = finished_hats.material_id
                 ORDER BY finished_hats.updated_at DESC, finished_hats.finished_hat_name ASC, finished_hats.id ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        if (!is_array($records)) {
            return [];
        }

        return array_map(
            static function ($record): array {
                return normalizeStaffCatalogFinishedHatRecord($record);
            },
            $records
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getFinishedHat(string $id): ?array
    {
        $normalizedId = normalizeStaffCatalogFinishedHatId($id);
        if ($normalizedId === null) {
            return null;
        }

        try {
            $statement = $this->pdo->prepare(
                'SELECT
                    finished_hats.id,
                    finished_hats.finished_hat_name,
                    finished_hats.photo_path,
                    finished_hats.image_width,
                    finished_hats.image_height,
                    finished_hats.design_id,
                    finished_hats.hat_id,
                    finished_hats.material_id,
                    finished_hats.patch_shape,
                    finished_hats.patch_size,
                    finished_hats.placement_status,
                    finished_hats.location_label,
                    finished_hats.retail_price,
                    finished_hats.status,
                    finished_hats.notes,
                    finished_hats.created_at,
                    finished_hats.updated_at,
                    designs.design_name,
                    hats.hat_name,
                    hats.manufacturer AS hat_manufacturer,
                    hats.model AS hat_model,
                    hats.color AS hat_color,
                    materials.material_name,
                    materials.material_type,
                    materials.color AS material_color
                 FROM forge_catalog_finished_hats AS finished_hats
                 LEFT JOIN forge_catalog_designs AS designs
                    ON designs.id = finished_hats.design_id
                 LEFT JOIN forge_catalog_hats AS hats
                    ON hats.id = finished_hats.hat_id
                 LEFT JOIN forge_catalog_materials AS materials
                    ON materials.id = finished_hats.material_id
                 WHERE finished_hats.id = :id
                 LIMIT 1'
            );
            $statement->execute([
                ':id' => $normalizedId,
            ]);
            $record = $statement->fetch();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        return is_array($record) ? normalizeStaffCatalogFinishedHatRecord($record) : null;
    }

    /**
     * @return array{
     *   designs:array<int, array<string, mixed>>,
     *   hats:array<int, array<string, mixed>>,
     *   materials:array<int, array<string, mixed>>
     * }
     */
    public function listFinishedHatImportLinkOptions(): array
    {
        return [
            'designs' => $this->listDesignLinkOptions(),
            'hats' => $this->listHatLinkOptions(),
            'materials' => $this->listMaterialLinkOptions(),
        ];
    }

    /**
     * @return array{
     *   designs:array<int, array<string, mixed>>,
     *   hats:array<int, array<string, mixed>>,
     *   materials:array<int, array<string, mixed>>
     * }
     */
    public function listFinishedHatSelectionOptions(): array
    {
        return $this->listFinishedHatImportLinkOptions();
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createFinishedHat(array $input): array
    {
        $normalized = $this->validateAndNormalizeInput($input);
        $id = createStaffCatalogFinishedHatUuid();
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO forge_catalog_finished_hats (
                    id,
                    finished_hat_name,
                    photo_path,
                    image_width,
                    image_height,
                    design_id,
                    hat_id,
                    material_id,
                    patch_shape,
                    patch_size,
                    placement_status,
                    location_label,
                    retail_price,
                    status,
                    notes,
                    created_at,
                    updated_at
                 ) VALUES (
                    :id,
                    :finished_hat_name,
                    :photo_path,
                    :image_width,
                    :image_height,
                    :design_id,
                    :hat_id,
                    :material_id,
                    :patch_shape,
                    :patch_size,
                    :placement_status,
                    :location_label,
                    :retail_price,
                    :status,
                    :notes,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':id' => $id,
                ':finished_hat_name' => $normalized['finished_hat_name'],
                ':photo_path' => $normalized['photo_path'],
                ':image_width' => $normalized['image_width'],
                ':image_height' => $normalized['image_height'],
                ':design_id' => $normalized['design_id'],
                ':hat_id' => $normalized['hat_id'],
                ':material_id' => $normalized['material_id'],
                ':patch_shape' => $normalized['patch_shape'],
                ':patch_size' => $normalized['patch_size'],
                ':placement_status' => $normalized['placement_status'],
                ':location_label' => $normalized['location_label'],
                ':retail_price' => $normalized['retail_price'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':created_at' => $timestamp,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        $created = $this->getFinishedHat($id);
        if ($created === null) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.');
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedFinishedHat(array $input, string $photoPath): array
    {
        $normalized = $this->validateAndNormalizeInput($input);
        $normalized['photo_path'] = normalizeStaffCatalogFinishedHatPhotoPath($photoPath);

        return $this->createFinishedHat($normalized);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateFinishedHat(string $id, array $input): array
    {
        $normalizedId = normalizeStaffCatalogFinishedHatId($id);
        if ($normalizedId === null) {
            throw new StaffFinishedHatCatalogNotFoundException('That finished hat could not be found.');
        }

        $existing = $this->getFinishedHat($normalizedId);
        if ($existing === null) {
            throw new StaffFinishedHatCatalogNotFoundException('That finished hat could not be found.');
        }

        $normalized = $this->validateAndNormalizeInput(array_merge($existing, $input));
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_finished_hats
                 SET
                    finished_hat_name = :finished_hat_name,
                    photo_path = :photo_path,
                    image_width = :image_width,
                    image_height = :image_height,
                    design_id = :design_id,
                    hat_id = :hat_id,
                    material_id = :material_id,
                    patch_shape = :patch_shape,
                    patch_size = :patch_size,
                    placement_status = :placement_status,
                    location_label = :location_label,
                    retail_price = :retail_price,
                    status = :status,
                    notes = :notes,
                    updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':id' => $normalizedId,
                ':finished_hat_name' => $normalized['finished_hat_name'],
                ':photo_path' => $normalized['photo_path'],
                ':image_width' => $normalized['image_width'],
                ':image_height' => $normalized['image_height'],
                ':design_id' => $normalized['design_id'],
                ':hat_id' => $normalized['hat_id'],
                ':material_id' => $normalized['material_id'],
                ':patch_shape' => $normalized['patch_shape'],
                ':patch_size' => $normalized['patch_size'],
                ':placement_status' => $normalized['placement_status'],
                ':location_label' => $normalized['location_label'],
                ':retail_price' => $normalized['retail_price'],
                ':status' => $normalized['status'],
                ':notes' => $normalized['notes'],
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getFinishedHat($normalizedId);
        if ($updated === null) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.');
        }

        return $updated;
    }

    /**
     * @return array{finished_hat:array<string,mixed>,previous_photo_path:?string}
     */
    public function updatePhotoPath(string $id, string $photoPath, ?int $imageWidth = null, ?int $imageHeight = null): array
    {
        $normalizedId = normalizeStaffCatalogFinishedHatId($id);
        if ($normalizedId === null) {
            throw new StaffFinishedHatCatalogNotFoundException('That finished hat could not be found.');
        }

        $existing = $this->getFinishedHat($normalizedId);
        if ($existing === null) {
            throw new StaffFinishedHatCatalogNotFoundException('That finished hat could not be found.');
        }

        $normalizedPhotoPath = normalizeStaffCatalogFinishedHatPhotoPath($photoPath);
        $normalizedImageWidth = normalizeStaffCatalogFinishedHatImageDimension($imageWidth);
        $normalizedImageHeight = normalizeStaffCatalogFinishedHatImageDimension($imageHeight);
        $timestamp = gmdate('Y-m-d H:i:s.u');

        try {
            $statement = $this->pdo->prepare(
                'UPDATE forge_catalog_finished_hats
                 SET
                    photo_path = :photo_path,
                    image_width = :image_width,
                    image_height = :image_height,
                    updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':id' => $normalizedId,
                ':photo_path' => $normalizedPhotoPath,
                ':image_width' => $normalizedImageWidth,
                ':image_height' => $normalizedImageHeight,
                ':updated_at' => $timestamp,
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        $updated = $this->getFinishedHat($normalizedId);
        if ($updated === null) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.');
        }

        return [
            'finished_hat' => $updated,
            'previous_photo_path' => is_string($existing['photo_path'] ?? null) ? $existing['photo_path'] : null,
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private function validateAndNormalizeInput(array $input): array
    {
        $fieldErrors = [];

        $finishedHatName = normalizeStaffCatalogFinishedHatRequiredText($input['finished_hat_name'] ?? null);
        if ($finishedHatName === null) {
            $fieldErrors['finished_hat_name'] = 'Finished hat name is required.';
        }

        $photoPath = normalizeStaffCatalogFinishedHatPhotoPath($input['photo_path'] ?? null);
        $imageWidth = normalizeStaffCatalogFinishedHatImageDimension($input['image_width'] ?? null);
        $imageHeight = normalizeStaffCatalogFinishedHatImageDimension($input['image_height'] ?? null);
        $patchShape = normalizeStaffCatalogFinishedHatOptionalText($input['patch_shape'] ?? null);
        $patchSize = normalizeStaffCatalogFinishedHatOptionalText($input['patch_size'] ?? null);
        $locationLabel = normalizeStaffCatalogFinishedHatOptionalText($input['location_label'] ?? null);
        $notes = normalizeStaffCatalogFinishedHatOptionalText($input['notes'] ?? null);
        $status = normalizeStaffCatalogFinishedHatEnumValue($input['status'] ?? null, self::STATUS_OPTIONS);
        $placementStatus = normalizeStaffCatalogFinishedHatEnumValue($input['placement_status'] ?? null, self::PLACEMENT_STATUS_OPTIONS);
        $retailPrice = normalizeStaffCatalogFinishedHatRetailPrice($input['retail_price'] ?? null, $fieldErrors);

        if ($status === null) {
            $fieldErrors['status'] = 'Select a valid status.';
        }
        if ($placementStatus === null) {
            $fieldErrors['placement_status'] = 'Select a valid placement status.';
        }

        $rawDesignId = is_string($input['design_id'] ?? null) ? trim((string) $input['design_id']) : '';
        $rawHatId = is_string($input['hat_id'] ?? null) ? trim((string) $input['hat_id']) : '';
        $rawMaterialId = is_string($input['material_id'] ?? null) ? trim((string) $input['material_id']) : '';

        $designId = normalizeStaffCatalogFinishedHatLinkedId($input['design_id'] ?? null);
        $hatId = normalizeStaffCatalogFinishedHatLinkedId($input['hat_id'] ?? null);
        $materialId = normalizeStaffCatalogFinishedHatLinkedId($input['material_id'] ?? null);

        if ($rawDesignId !== '' && $designId === null) {
            $fieldErrors['design_id'] = 'Select a valid design.';
        } elseif ($designId !== null && !$this->recordExists('forge_catalog_designs', $designId)) {
            $fieldErrors['design_id'] = 'Select a valid design.';
        }
        if ($rawHatId !== '' && $hatId === null) {
            $fieldErrors['hat_id'] = 'Select a valid hat.';
        } elseif ($hatId !== null && !$this->recordExists('forge_catalog_hats', $hatId)) {
            $fieldErrors['hat_id'] = 'Select a valid hat.';
        }
        if ($rawMaterialId !== '' && $materialId === null) {
            $fieldErrors['material_id'] = 'Select a valid material.';
        } elseif ($materialId !== null && !$this->recordExists('forge_catalog_materials', $materialId)) {
            $fieldErrors['material_id'] = 'Select a valid material.';
        }

        if ($fieldErrors !== []) {
            throw new StaffFinishedHatCatalogValidationException($fieldErrors);
        }

        return [
            'finished_hat_name' => $finishedHatName,
            'photo_path' => $photoPath,
            'image_width' => $imageWidth,
            'image_height' => $imageHeight,
            'design_id' => $designId,
            'hat_id' => $hatId,
            'material_id' => $materialId,
            'patch_shape' => $patchShape,
            'patch_size' => $patchSize,
            'placement_status' => $placementStatus,
            'location_label' => $locationLabel,
            'retail_price' => $retailPrice,
            'status' => $status,
            'notes' => $notes,
        ];
    }

    private function recordExists(string $tableName, string $id): bool
    {
        try {
            $statement = $this->pdo->prepare(sprintf('SELECT id FROM %s WHERE id = :id LIMIT 1', $tableName));
            $statement->execute([
                ':id' => $id,
            ]);
            $record = $statement->fetchColumn();
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        return is_string($record) && trim($record) !== '';
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function listDesignLinkOptions(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT id, design_name
                 FROM forge_catalog_designs
                 ORDER BY design_name ASC, id ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        return is_array($records) ? array_map(
            static function ($record): array {
                return [
                    'id' => is_string($record['id'] ?? null) ? trim($record['id']) : '',
                    'design_name' => is_string($record['design_name'] ?? null) ? trim($record['design_name']) : '',
                ];
            },
            $records
        ) : [];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function listHatLinkOptions(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT id, hat_name, manufacturer, model, color
                 FROM forge_catalog_hats
                 ORDER BY hat_name ASC, id ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        return is_array($records) ? array_map(
            static function ($record): array {
                return [
                    'id' => is_string($record['id'] ?? null) ? trim($record['id']) : '',
                    'hat_name' => is_string($record['hat_name'] ?? null) ? trim($record['hat_name']) : '',
                    'manufacturer' => normalizeStaffCatalogFinishedHatNullableString($record['manufacturer'] ?? null),
                    'model' => normalizeStaffCatalogFinishedHatNullableString($record['model'] ?? null),
                    'color' => normalizeStaffCatalogFinishedHatNullableString($record['color'] ?? null),
                ];
            },
            $records
        ) : [];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function listMaterialLinkOptions(): array
    {
        try {
            $statement = $this->pdo->query(
                'SELECT id, material_name, material_type, color
                 FROM forge_catalog_materials
                 ORDER BY material_name ASC, id ASC'
            );
            $records = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Finished hat catalog storage is currently unavailable.', 0, $exception);
        }

        return is_array($records) ? array_map(
            static function ($record): array {
                return [
                    'id' => is_string($record['id'] ?? null) ? trim($record['id']) : '',
                    'material_name' => is_string($record['material_name'] ?? null) ? trim($record['material_name']) : '',
                    'material_type' => normalizeStaffCatalogFinishedHatNullableString($record['material_type'] ?? null),
                    'color' => normalizeStaffCatalogFinishedHatNullableString($record['color'] ?? null),
                ];
            },
            $records
        ) : [];
    }
}

function normalizeStaffCatalogFinishedHatId($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = strtolower(trim($value));
    if ($normalized === '' || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $normalized)) {
        return null;
    }

    return $normalized;
}

function createStaffCatalogFinishedHatUuid(): string
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
 * @param array<string, mixed>|mixed $record
 * @return array<string, mixed>
 */
function normalizeStaffCatalogFinishedHatRecord($record): array
{
    $normalized = is_array($record) ? $record : [];
    $designId = normalizeStaffCatalogFinishedHatLinkedId($normalized['design_id'] ?? null);
    $hatId = normalizeStaffCatalogFinishedHatLinkedId($normalized['hat_id'] ?? null);
    $materialId = normalizeStaffCatalogFinishedHatLinkedId($normalized['material_id'] ?? null);

    return [
        'id' => is_string($normalized['id'] ?? null) ? trim($normalized['id']) : '',
        'finished_hat_name' => is_string($normalized['finished_hat_name'] ?? null) ? trim($normalized['finished_hat_name']) : '',
        'photo_path' => normalizeStaffCatalogFinishedHatPhotoPath($normalized['photo_path'] ?? null),
        'image_width' => normalizeStaffCatalogFinishedHatImageDimension($normalized['image_width'] ?? null),
        'image_height' => normalizeStaffCatalogFinishedHatImageDimension($normalized['image_height'] ?? null),
        'design_id' => $designId,
        'hat_id' => $hatId,
        'material_id' => $materialId,
        'patch_shape' => normalizeStaffCatalogFinishedHatNullableString($normalized['patch_shape'] ?? null),
        'patch_size' => normalizeStaffCatalogFinishedHatNullableString($normalized['patch_size'] ?? null),
        'placement_status' => normalizeStaffCatalogFinishedHatEnumValue($normalized['placement_status'] ?? null, PdoStaffFinishedHatCatalogRepository::PLACEMENT_STATUS_OPTIONS) ?? 'unassigned',
        'location_label' => normalizeStaffCatalogFinishedHatNullableString($normalized['location_label'] ?? null),
        'retail_price' => normalizeStaffCatalogFinishedHatRetailPriceString($normalized['retail_price'] ?? null),
        'status' => normalizeStaffCatalogFinishedHatEnumValue($normalized['status'] ?? null, PdoStaffFinishedHatCatalogRepository::STATUS_OPTIONS) ?? 'review',
        'notes' => normalizeStaffCatalogFinishedHatNullableString($normalized['notes'] ?? null),
        'created_at' => normalizeStaffCatalogFinishedHatDateTime($normalized['created_at'] ?? null),
        'updated_at' => normalizeStaffCatalogFinishedHatDateTime($normalized['updated_at'] ?? null),
        'design_name' => normalizeStaffCatalogFinishedHatNullableString($normalized['design_name'] ?? null),
        'hat_name' => normalizeStaffCatalogFinishedHatNullableString($normalized['hat_name'] ?? null),
        'hat_manufacturer' => normalizeStaffCatalogFinishedHatNullableString($normalized['hat_manufacturer'] ?? null),
        'hat_model' => normalizeStaffCatalogFinishedHatNullableString($normalized['hat_model'] ?? null),
        'hat_color' => normalizeStaffCatalogFinishedHatNullableString($normalized['hat_color'] ?? null),
        'material_name' => normalizeStaffCatalogFinishedHatNullableString($normalized['material_name'] ?? null),
        'material_type' => normalizeStaffCatalogFinishedHatNullableString($normalized['material_type'] ?? null),
        'material_color' => normalizeStaffCatalogFinishedHatNullableString($normalized['material_color'] ?? null),
        'needs_linking' => $designId === null || $hatId === null || $materialId === null,
    ];
}

function normalizeStaffCatalogFinishedHatLinkedId($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = strtolower(trim($value));
    if ($normalized === '') {
        return null;
    }

    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $normalized)) {
        return null;
    }

    return $normalized;
}

function normalizeStaffCatalogFinishedHatPhotoPath($value): ?string
{
    $normalized = normalizeStaffCatalogFinishedHatOptionalText($value);
    return $normalized === null ? null : '/' . ltrim($normalized, '/');
}

function normalizeStaffCatalogFinishedHatRequiredText($value): ?string
{
    $normalized = normalizeStaffCatalogFinishedHatOptionalText($value);
    return $normalized === null ? null : $normalized;
}

function normalizeStaffCatalogFinishedHatOptionalText($value): ?string
{
    if ($value === null) {
        return null;
    }

    $normalized = trim((string) $value);
    return $normalized === '' ? null : preg_replace('/\s+/', ' ', $normalized);
}

/**
 * @param array<int, string> $allowedValues
 */
function normalizeStaffCatalogFinishedHatEnumValue($value, array $allowedValues): ?string
{
    $normalized = normalizeStaffCatalogFinishedHatOptionalText($value);
    if ($normalized === null) {
        return null;
    }

    $key = strtolower(str_replace([' ', '-'], '_', $normalized));
    return in_array($key, $allowedValues, true) ? $key : null;
}

/**
 * @param array<string, string> $fieldErrors
 */
function normalizeStaffCatalogFinishedHatRetailPrice($value, array &$fieldErrors): ?string
{
    $normalized = normalizeStaffCatalogFinishedHatOptionalText($value);
    if ($normalized === null) {
        return null;
    }

    if (preg_match('/^\d+(?:\.\d{1,2})?$/', $normalized) !== 1) {
        $fieldErrors['retail_price'] = 'Retail price must be a nonnegative amount with up to two decimals.';
        return null;
    }

    return number_format((float) $normalized, 2, '.', '');
}

function normalizeStaffCatalogFinishedHatRetailPriceString($value): ?string
{
    $normalized = normalizeStaffCatalogFinishedHatOptionalText($value);
    if ($normalized === null || preg_match('/^\d+(?:\.\d{1,2})?$/', $normalized) !== 1) {
        return null;
    }

    return number_format((float) $normalized, 2, '.', '');
}

function normalizeStaffCatalogFinishedHatImageDimension($value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    if (is_int($value)) {
        return $value > 0 ? $value : null;
    }

    if (is_string($value) && preg_match('/^\d+$/', trim($value)) === 1) {
        $normalized = (int) trim($value);
        return $normalized > 0 ? $normalized : null;
    }

    return null;
}

function normalizeStaffCatalogFinishedHatDateTime($value): string
{
    if (!is_string($value)) {
        return '';
    }

    return trim($value);
}

function normalizeStaffCatalogFinishedHatNullableString($value): ?string
{
    return normalizeStaffCatalogFinishedHatOptionalText($value);
}
