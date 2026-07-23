<?php
declare(strict_types=1);

namespace Forge\Server;

final class StaffMaterialCatalogImporter
{
    private StaffMaterialCatalogImportRepositoryInterface $repository;
    private string $uploadDirectory;

    public function __construct(StaffMaterialCatalogImportRepositoryInterface $repository, string $uploadDirectory)
    {
        $this->repository = $repository;
        $this->uploadDirectory = rtrim($uploadDirectory, '/');
    }

    /**
     * @return array{
     *   source_directory:string,
     *   dry_run:bool,
     *   imported:int,
     *   skipped:int,
     *   failed:int,
     *   collisions:int,
     *   portrait:int,
     *   landscape:int,
     *   approximately_square:int,
     *   imported_records:array<int, array<string, mixed>>,
     *   skipped_records:array<int, array<string, mixed>>,
     *   failed_records:array<int, array<string, mixed>>,
     *   collision_records:array<int, array<string, mixed>>
     * }
     */
    public function importDirectory(string $sourceDirectory, bool $dryRun = true): array
    {
        $normalizedSourceDirectory = rtrim(trim($sourceDirectory), '/');
        if ($normalizedSourceDirectory === '' || !is_dir($normalizedSourceDirectory)) {
            throw new \InvalidArgumentException('A valid source directory is required.');
        }

        $existingRecords = $this->repository->listMaterials();
        $existingByName = [];
        foreach ($existingRecords as $record) {
            $normalizedName = normalizeStaffCatalogMaterialImportNameKey((string) ($record['material_name'] ?? ''));
            if ($normalizedName !== '') {
                $existingByName[$normalizedName] = $record;
            }
        }

        $summary = [
            'source_directory' => $normalizedSourceDirectory,
            'dry_run' => $dryRun,
            'imported' => 0,
            'skipped' => 0,
            'failed' => 0,
            'collisions' => 0,
            'portrait' => 0,
            'landscape' => 0,
            'approximately_square' => 0,
            'imported_records' => [],
            'skipped_records' => [],
            'failed_records' => [],
            'collision_records' => [],
        ];

        $directoryEntries = scandir($normalizedSourceDirectory);
        if ($directoryEntries === false) {
            throw new \RuntimeException('Source directory could not be read.');
        }

        sort($directoryEntries, SORT_NATURAL | SORT_FLAG_CASE);

        foreach ($directoryEntries as $fileName) {
            if ($fileName === '.' || $fileName === '..') {
                continue;
            }

            if (!isSupportedStaffCatalogMaterialImportFile($fileName)) {
                $summary['skipped']++;
                $summary['skipped_records'][] = [
                    'file' => $fileName,
                    'reason' => 'unsupported_or_hidden_file',
                ];
                continue;
            }

            $sourcePath = $normalizedSourceDirectory . '/' . $fileName;
            if (!is_file($sourcePath)) {
                continue;
            }

            $materialName = deriveStaffCatalogMaterialNameFromFileName($fileName);
            $nameKey = normalizeStaffCatalogMaterialImportNameKey($materialName);
            if ($nameKey === '') {
                $summary['failed']++;
                $summary['failed_records'][] = [
                    'file' => $fileName,
                    'reason' => 'empty_material_name',
                ];
                continue;
            }

            $existing = $existingByName[$nameKey] ?? null;
            if (is_array($existing) && is_string($existing['swatch_path'] ?? null) && trim((string) $existing['swatch_path']) !== '') {
                $summary['skipped']++;
                $summary['skipped_records'][] = [
                    'file' => $fileName,
                    'material_name' => $materialName,
                    'reason' => 'already_imported',
                ];
                continue;
            }

            if (is_array($existing)) {
                $summary['collisions']++;
                $summary['collision_records'][] = [
                    'file' => $fileName,
                    'material_name' => $materialName,
                    'reason' => 'existing_material_name_conflict',
                ];
                continue;
            }

            $imageInfo = inspectStaffCatalogMaterialImage($sourcePath);
            $shape = classifyStaffCatalogMaterialAspectRatio((int) $imageInfo['width'], (int) $imageInfo['height']);
            $summary[$shape]++;

            $proposal = proposeStaffCatalogMaterialImportMetadataFromFileName($fileName);
            $recordInput = [
                'material_name' => $materialName,
                'material_type' => $proposal['material_type'],
                'color' => $proposal['color'],
                'supplier' => null,
                'production_method' => $proposal['production_method'],
                'purchase_cost' => null,
                'purchase_quantity' => null,
                'cost_basis' => null,
                'status' => 'review',
                'notes' => null,
                'image_width' => $imageInfo['width'],
                'image_height' => $imageInfo['height'],
            ];

            $relativePath = buildStaffCatalogMaterialManagedRelativePath($fileName);

            if ($dryRun) {
                $summary['imported']++;
                $summary['imported_records'][] = [
                    'file' => $fileName,
                    'material_name' => $materialName,
                    'material_type' => $proposal['material_type'],
                    'color' => $proposal['color'],
                    'production_method' => $proposal['production_method'],
                    'swatch_path' => $relativePath,
                    'image_width' => $imageInfo['width'],
                    'image_height' => $imageInfo['height'],
                    'shape' => $shape,
                ];
                continue;
            }

            try {
                if (!is_dir($this->uploadDirectory) && !@mkdir($this->uploadDirectory, 0775, true) && !is_dir($this->uploadDirectory)) {
                    throw new \RuntimeException('Managed swatch upload directory could not be created.');
                }

                $destinationPath = $this->uploadDirectory . '/' . basename($relativePath);
                if (!copy($sourcePath, $destinationPath)) {
                    throw new \RuntimeException('Managed swatch image could not be copied.');
                }

                try {
                    $created = $this->repository->createImportedMaterial($recordInput, $relativePath);
                } catch (\Throwable $exception) {
                    @unlink($destinationPath);
                    throw $exception;
                }

                $existingByName[$nameKey] = $created;
                $summary['imported']++;
                $summary['imported_records'][] = [
                    'file' => $fileName,
                    'material_name' => $materialName,
                    'swatch_path' => $relativePath,
                    'image_width' => $imageInfo['width'],
                    'image_height' => $imageInfo['height'],
                    'shape' => $shape,
                ];
            } catch (\Throwable $exception) {
                $summary['failed']++;
                $summary['failed_records'][] = [
                    'file' => $fileName,
                    'material_name' => $materialName,
                    'reason' => 'import_failed',
                    'message' => $exception->getMessage(),
                ];
            }
        }

        return $summary;
    }
}

function isSupportedStaffCatalogMaterialImportFile(string $fileName): bool
{
    $normalized = trim($fileName);
    if ($normalized === '' || str_starts_with($normalized, '.') || str_starts_with($normalized, '~$')) {
        return false;
    }

    if (preg_match('/\.(png|jpe?g|webp)$/i', $normalized) !== 1) {
        return false;
    }

    return true;
}

function deriveStaffCatalogMaterialNameFromFileName(string $fileName): string
{
    $baseName = preg_replace('/\.[^.]+$/', '', trim($fileName)) ?? '';
    $baseName = preg_replace('/-\d{5,}$/', '', $baseName) ?? $baseName;
    $baseName = preg_replace('/stainlessblack/i', 'stainless black', $baseName) ?? $baseName;
    $baseName = preg_replace('/wadhesive/i', 'w adhesive', $baseName) ?? $baseName;
    $baseName = preg_replace('/(?<=stainless)(?=black)/i', ' ', $baseName) ?? $baseName;
    $baseName = preg_replace('/(?<=w)(?=adhesive)/i', ' ', $baseName) ?? $baseName;
    $baseName = str_replace(['_', '-'], ' ', $baseName);
    $baseName = preg_replace('/(?<=\d)x(?=\d)/i', ' x ', $baseName) ?? $baseName;
    $baseName = preg_replace('/\b(\d+)\s*x\s*(\d+)\b/i', '$1x$2', $baseName) ?? $baseName;
    $baseName = preg_replace('/\s+/', ' ', $baseName) ?? $baseName;
    $baseName = trim($baseName);
    if ($baseName === '') {
        return '';
    }

    $tokens = preg_split('/\s+/', $baseName) ?: [];
    $tokens = array_map(
        static function (string $token): string {
            $lower = strtolower($token);
            return match ($lower) {
                'uv' => 'UV',
                default => preg_match('/^\d+x\d+$/i', $token) === 1
                    ? strtolower($token)
                    : ucwords(strtolower($token)),
            };
        },
        $tokens
    );

    return trim(implode(' ', $tokens));
}

/**
 * @return array{material_type:?string,color:?string,production_method:?string}
 */
function proposeStaffCatalogMaterialImportMetadataFromFileName(string $fileName): array
{
    $normalized = strtolower(preg_replace('/\.[^.]+$/', '', trim($fileName)) ?? '');
    $normalized = str_replace(['stainlessblack', 'wadhesive'], ['stainless black', 'w adhesive'], $normalized);
    $tokens = preg_split('/[^a-z0-9]+/', $normalized) ?: [];
    $tokens = array_values(array_filter($tokens, static fn(string $token): bool => $token !== ''));

    $materialType = null;
    if (in_array('acrylic', $tokens, true)) {
        $materialType = 'Acrylic';
    } elseif (in_array('leatherette', $tokens, true)) {
        $materialType = 'Leatherette';
    } elseif (in_array('wood', $tokens, true)) {
        $materialType = 'Wood';
    }

    $productionMethod = null;
    if (in_array('laserable', $tokens, true)) {
        $productionMethod = 'Laserable';
    } elseif (in_array('uv', $tokens, true) && in_array('print', $tokens, true)) {
        $productionMethod = 'UV Print';
    }

    $color = null;
    $colorTokens = [];
    $ignoredTokens = [
        '12x24',
        'durra',
        'bull',
        'premium',
        'laserable',
        'panels',
        'sheets',
        'w',
        'wadhesive',
        'adhesive',
        'acrylic',
        'leatherette',
        'wood',
    ];
    foreach ($tokens as $token) {
        if (preg_match('/^\d+x\d+$/', $token) === 1 || preg_match('/\d/', $token) === 1 || ctype_digit($token) || in_array($token, $ignoredTokens, true)) {
            continue;
        }
        $colorTokens[] = $token;
    }

    if ($colorTokens !== []) {
        $color = implode(' / ', array_map(
            static function (string $token): string {
                if ($token === 'camo') {
                    return 'Camo';
                }
                return ucwords(str_replace('_', ' ', $token));
            },
            $colorTokens
        ));
    }

    return [
        'material_type' => $materialType,
        'color' => $color,
        'production_method' => $productionMethod,
    ];
}

/**
 * @return array{width:int,height:int}
 */
function inspectStaffCatalogMaterialImage(string $sourcePath): array
{
    $imageInfo = @getimagesize($sourcePath);
    if (!is_array($imageInfo) || !isset($imageInfo[0], $imageInfo[1])) {
        throw new \RuntimeException('Source swatch dimensions could not be read.');
    }

    $width = (int) $imageInfo[0];
    $height = (int) $imageInfo[1];
    if ($width <= 0 || $height <= 0) {
        throw new \RuntimeException('Source swatch dimensions must be positive.');
    }

    return [
        'width' => $width,
        'height' => $height,
    ];
}

function classifyStaffCatalogMaterialAspectRatio(int $width, int $height): string
{
    if ($width <= 0 || $height <= 0) {
        throw new \InvalidArgumentException('Material image dimensions must be positive.');
    }

    $ratio = $width / $height;
    if ($ratio >= 0.85 && $ratio <= 1.15) {
        return 'approximately_square';
    }

    return $height > $width ? 'portrait' : 'landscape';
}

function shouldUseContainForStaffCatalogMaterialCard(?int $width, ?int $height): bool
{
    if (!is_int($width) || !is_int($height) || $width <= 0 || $height <= 0) {
        return true;
    }

    return classifyStaffCatalogMaterialAspectRatio($width, $height) === 'approximately_square';
}

function buildStaffCatalogMaterialManagedRelativePath(string $fileName): string
{
    $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    if ($extension === 'jpeg') {
        $extension = 'jpg';
    }

    return '/uploads/material-swatches/material-' . bin2hex(random_bytes(16)) . '.' . $extension;
}

function normalizeStaffCatalogMaterialImportNameKey(string $value): string
{
    return strtolower(trim(preg_replace('/\s+/u', ' ', $value) ?? ''));
}
