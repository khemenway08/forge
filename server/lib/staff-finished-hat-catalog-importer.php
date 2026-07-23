<?php
declare(strict_types=1);

namespace Forge\Server;

final class StaffFinishedHatCatalogImporter
{
    private StaffFinishedHatCatalogImportRepositoryInterface $repository;
    private string $uploadDirectory;

    public function __construct(StaffFinishedHatCatalogImportRepositoryInterface $repository, string $uploadDirectory)
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
     *   manual_review:int,
     *   alternate_skipped:int,
     *   imported_records:array<int, array<string, mixed>>,
     *   skipped_records:array<int, array<string, mixed>>,
     *   failed_records:array<int, array<string, mixed>>,
     *   collision_records:array<int, array<string, mixed>>,
     *   manual_review_records:array<int, array<string, mixed>>,
     *   alternate_groups:array<int, array<string, mixed>>,
     *   alternate_skipped_records:array<int, array<string, mixed>>
     * }
     */
    public function importDirectory(string $sourceDirectory, bool $dryRun = true): array
    {
        $normalizedSourceDirectory = rtrim(trim($sourceDirectory), '/');
        if ($normalizedSourceDirectory === '' || !is_dir($normalizedSourceDirectory)) {
            throw new \InvalidArgumentException('A valid source directory is required.');
        }

        $existingRecords = $this->repository->listFinishedHats();
        $existingByName = [];
        foreach ($existingRecords as $record) {
            $key = normalizeStaffCatalogFinishedHatImportNameKey((string) ($record['finished_hat_name'] ?? ''));
            if ($key !== '') {
                $existingByName[$key] = $record;
            }
        }

        $linkOptions = $this->repository->listFinishedHatImportLinkOptions();
        $designOptions = buildFinishedHatImportDesignIndex($linkOptions['designs'] ?? []);
        $hatOptions = buildFinishedHatImportHatIndex($linkOptions['hats'] ?? []);
        $materialOptions = buildFinishedHatImportMaterialIndex($linkOptions['materials'] ?? []);

        $summary = [
            'source_directory' => $normalizedSourceDirectory,
            'dry_run' => $dryRun,
            'imported' => 0,
            'skipped' => 0,
            'failed' => 0,
            'collisions' => 0,
            'manual_review' => 0,
            'alternate_skipped' => 0,
            'imported_records' => [],
            'skipped_records' => [],
            'failed_records' => [],
            'collision_records' => [],
            'manual_review_records' => [],
            'alternate_groups' => [],
            'alternate_skipped_records' => [],
        ];

        $entries = scandir($normalizedSourceDirectory);
        if ($entries === false) {
            throw new \RuntimeException('Source directory could not be read.');
        }
        sort($entries, SORT_NATURAL | SORT_FLAG_CASE);

        $validFiles = [];
        $opaqueFiles = [];
        foreach ($entries as $fileName) {
            if ($fileName === '.' || $fileName === '..') {
                continue;
            }
            if (!isSupportedStaffCatalogFinishedHatImportFile($fileName)) {
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

            if (isOpaqueFinishedHatImportFileName($fileName)) {
                $opaqueFiles[] = $fileName;
                continue;
            }

            $validFiles[] = $fileName;
        }

        foreach ($opaqueFiles as $fileName) {
            $summary['manual_review']++;
            $summary['manual_review_records'][] = [
                'file' => $fileName,
                'reason' => 'opaque_filename_requires_manual_review',
            ];
        }

        $groups = [];
        foreach ($validFiles as $fileName) {
            $groupKey = normalizeStaffCatalogFinishedHatGroupingKey($fileName);
            $groups[$groupKey][] = $fileName;
        }

        foreach ($groups as $groupKey => $groupFiles) {
            sort($groupFiles, SORT_NATURAL | SORT_FLAG_CASE);

            if (count($groupFiles) > 1) {
                $primary = selectPrimaryFinishedHatImportFile($groupFiles);
                $alternates = array_values(array_filter(
                    $groupFiles,
                    static fn(string $fileName): bool => $fileName !== $primary
                ));
                $summary['alternate_groups'][] = [
                    'group_key' => $groupKey,
                    'primary_file' => $primary,
                    'alternate_files' => $alternates,
                ];
                foreach ($alternates as $alternate) {
                    $summary['alternate_skipped']++;
                    $summary['alternate_skipped_records'][] = [
                        'file' => $alternate,
                        'primary_file' => $primary,
                        'reason' => 'alternate_view_skipped',
                    ];
                }
                $groupFiles = [$primary];
            }

            foreach ($groupFiles as $fileName) {
                $sourcePath = $normalizedSourceDirectory . '/' . $fileName;
                $finishedHatName = deriveStaffCatalogFinishedHatNameFromFileName($fileName);
                $nameKey = normalizeStaffCatalogFinishedHatImportNameKey($finishedHatName);
                if ($nameKey === '') {
                    $summary['failed']++;
                    $summary['failed_records'][] = [
                        'file' => $fileName,
                        'reason' => 'empty_finished_hat_name',
                    ];
                    continue;
                }

                $existing = $existingByName[$nameKey] ?? null;
                if (is_array($existing) && is_string($existing['photo_path'] ?? null) && trim((string) $existing['photo_path']) !== '') {
                    $summary['skipped']++;
                    $summary['skipped_records'][] = [
                        'file' => $fileName,
                        'finished_hat_name' => $finishedHatName,
                        'reason' => 'already_imported',
                    ];
                    continue;
                }

                if (is_array($existing)) {
                    $summary['collisions']++;
                    $summary['collision_records'][] = [
                        'file' => $fileName,
                        'finished_hat_name' => $finishedHatName,
                        'reason' => 'existing_finished_hat_name_conflict',
                    ];
                    continue;
                }

                $imageInfo = inspectStaffCatalogFinishedHatImage($sourcePath);
                $proposal = proposeStaffCatalogFinishedHatImportMetadataFromFileName(
                    $fileName,
                    $designOptions,
                    $hatOptions,
                    $materialOptions
                );
                $needsLinking = $proposal['design_id'] === null || $proposal['hat_id'] === null || $proposal['material_id'] === null;
                $recordInput = [
                    'finished_hat_name' => $finishedHatName,
                    'design_id' => $proposal['design_id'],
                    'hat_id' => $proposal['hat_id'],
                    'material_id' => $proposal['material_id'],
                    'patch_shape' => $proposal['patch_shape'],
                    'patch_size' => $proposal['patch_size'],
                    'placement_status' => $proposal['placement_status'],
                    'location_label' => null,
                    'retail_price' => null,
                    'status' => 'review',
                    'notes' => null,
                    'image_width' => $imageInfo['width'],
                    'image_height' => $imageInfo['height'],
                ];
                $relativePath = buildStaffCatalogFinishedHatManagedRelativePath($fileName);

                if ($dryRun) {
                    $summary['imported']++;
                    $summary['imported_records'][] = [
                        'file' => $fileName,
                        'finished_hat_name' => $finishedHatName,
                        'photo_path' => $relativePath,
                        'image_width' => $imageInfo['width'],
                        'image_height' => $imageInfo['height'],
                        'design_match' => $proposal['design_name'],
                        'hat_match' => $proposal['hat_summary'],
                        'material_match' => $proposal['material_name'],
                        'placement_status' => $proposal['placement_status'],
                        'needs_linking' => $needsLinking,
                    ];
                    continue;
                }

                try {
                    if (!is_dir($this->uploadDirectory) && !@mkdir($this->uploadDirectory, 0775, true) && !is_dir($this->uploadDirectory)) {
                        throw new \RuntimeException('Managed finished hat upload directory could not be created.');
                    }

                    $destinationPath = $this->uploadDirectory . '/' . basename($relativePath);
                    if (!copy($sourcePath, $destinationPath)) {
                        throw new \RuntimeException('Managed finished hat photo could not be copied.');
                    }

                    try {
                        $created = $this->repository->createImportedFinishedHat($recordInput, $relativePath);
                    } catch (\Throwable $exception) {
                        @unlink($destinationPath);
                        throw $exception;
                    }

                    $existingByName[$nameKey] = $created;
                    $summary['imported']++;
                    $summary['imported_records'][] = [
                        'file' => $fileName,
                        'finished_hat_name' => $finishedHatName,
                        'photo_path' => $relativePath,
                        'design_match' => $proposal['design_name'],
                        'hat_match' => $proposal['hat_summary'],
                        'material_match' => $proposal['material_name'],
                        'placement_status' => $proposal['placement_status'],
                        'needs_linking' => $needsLinking,
                    ];
                } catch (\Throwable $exception) {
                    $summary['failed']++;
                    $summary['failed_records'][] = [
                        'file' => $fileName,
                        'finished_hat_name' => $finishedHatName,
                        'reason' => 'import_failed',
                        'message' => $exception->getMessage(),
                    ];
                }
            }
        }

        return $summary;
    }
}

function isSupportedStaffCatalogFinishedHatImportFile(string $fileName): bool
{
    $normalized = trim($fileName);
    if ($normalized === '' || str_starts_with($normalized, '.') || str_starts_with($normalized, '~$')) {
        return false;
    }

    return preg_match('/\.(png|jpe?g|webp)$/i', $normalized) === 1;
}

function isOpaqueFinishedHatImportFileName(string $fileName): bool
{
    $baseName = strtolower((string) preg_replace('/\.[^.]+$/', '', trim($fileName)));
    return preg_match('/^img_\d+$/', $baseName) === 1;
}

function deriveStaffCatalogFinishedHatNameFromFileName(string $fileName): string
{
    $baseName = preg_replace('/\.[^.]+$/', '', trim($fileName)) ?? '';
    $baseName = str_replace(['_', '-'], ' ', $baseName);
    $baseName = preg_replace('/\bmain\b/i', ' ', $baseName) ?? $baseName;
    $baseName = preg_replace('/\s+/', ' ', $baseName) ?? $baseName;
    $baseName = trim($baseName);
    if ($baseName === '') {
        return '';
    }

    $tokens = preg_split('/\s+/', $baseName) ?: [];
    $tokens = array_map(
        static function (string $token): string {
            $lower = strtolower($token);
            if (preg_match('/^\d+$/', $token) === 1) {
                return $token;
            }
            if ($lower === 'img') {
                return 'IMG';
            }
            return ucwords($lower);
        },
        $tokens
    );

    return trim(implode(' ', $tokens));
}

function normalizeStaffCatalogFinishedHatImportNameKey(string $name): string
{
    $normalized = strtolower(trim($name));
    $normalized = preg_replace('/[^a-z0-9]+/', ' ', $normalized) ?? $normalized;
    $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;
    return trim($normalized);
}

function normalizeStaffCatalogFinishedHatGroupingKey(string $fileName): string
{
    $normalized = normalizeStaffCatalogFinishedHatImportNameKey((string) preg_replace('/\.[^.]+$/', '', $fileName));
    $normalized = preg_replace('/\b(front|side|back|angle|detail|closeup|photo|image|view|main)\b/', ' ', $normalized) ?? $normalized;
    $normalized = preg_replace('/\b([123])\b/', ' ', $normalized) ?? $normalized;
    $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;
    return trim($normalized);
}

/**
 * @param array<int, string> $fileNames
 */
function selectPrimaryFinishedHatImportFile(array $fileNames): string
{
    usort(
        $fileNames,
        static function (string $left, string $right): int {
            $leftScore = str_contains(strtolower($left), 'front') ? 0 : (str_contains(strtolower($left), 'main') ? 1 : 2);
            $rightScore = str_contains(strtolower($right), 'front') ? 0 : (str_contains(strtolower($right), 'main') ? 1 : 2);
            if ($leftScore !== $rightScore) {
                return $leftScore <=> $rightScore;
            }
            return strcasecmp($left, $right);
        }
    );

    return $fileNames[0];
}

/**
 * @return array{width:int,height:int}
 */
function inspectStaffCatalogFinishedHatImage(string $sourcePath): array
{
    $imageInfo = @getimagesize($sourcePath);
    if (!is_array($imageInfo)) {
        throw new \RuntimeException('Finished hat image metadata could not be read.');
    }

    $width = isset($imageInfo[0]) ? (int) $imageInfo[0] : 0;
    $height = isset($imageInfo[1]) ? (int) $imageInfo[1] : 0;
    if ($width <= 0 || $height <= 0) {
        throw new \RuntimeException('Finished hat image dimensions are invalid.');
    }

    return [
        'width' => $width,
        'height' => $height,
    ];
}

/**
 * @param array<int, array<string, mixed>> $designs
 * @return array<int, array<string, mixed>>
 */
function buildFinishedHatImportDesignIndex(array $designs): array
{
    return array_map(
        static function (array $record): array {
            $name = is_string($record['design_name'] ?? null) ? trim($record['design_name']) : '';
            return [
                'id' => is_string($record['id'] ?? null) ? trim($record['id']) : '',
                'design_name' => $name,
                'match_key' => normalizeStaffCatalogFinishedHatImportNameKey($name),
            ];
        },
        $designs
    );
}

/**
 * @param array<int, array<string, mixed>> $hats
 * @return array<int, array<string, mixed>>
 */
function buildFinishedHatImportHatIndex(array $hats): array
{
    return array_map(
        static function (array $record): array {
            $manufacturer = normalizeStaffCatalogFinishedHatImportNameKey((string) ($record['manufacturer'] ?? ''));
            $model = normalizeStaffCatalogFinishedHatImportNameKey((string) ($record['model'] ?? ''));
            $color = normalizeStaffCatalogFinishedHatImportNameKey((string) ($record['color'] ?? ''));
            return [
                'id' => is_string($record['id'] ?? null) ? trim($record['id']) : '',
                'hat_name' => is_string($record['hat_name'] ?? null) ? trim($record['hat_name']) : '',
                'manufacturer' => $manufacturer,
                'model' => $model,
                'color' => $color,
                'summary' => trim(implode(' / ', array_filter([
                    is_string($record['manufacturer'] ?? null) ? trim($record['manufacturer']) : '',
                    is_string($record['model'] ?? null) ? trim($record['model']) : '',
                    is_string($record['color'] ?? null) ? trim($record['color']) : '',
                ]))),
            ];
        },
        $hats
    );
}

/**
 * @param array<int, array<string, mixed>> $materials
 * @return array<int, array<string, mixed>>
 */
function buildFinishedHatImportMaterialIndex(array $materials): array
{
    return array_map(
        static function (array $record): array {
            $name = is_string($record['material_name'] ?? null) ? trim($record['material_name']) : '';
            return [
                'id' => is_string($record['id'] ?? null) ? trim($record['id']) : '',
                'material_name' => $name,
                'match_key' => normalizeStaffCatalogFinishedHatImportNameKey($name),
            ];
        },
        $materials
    );
}

/**
 * @param array<int, array<string, mixed>> $designOptions
 * @param array<int, array<string, mixed>> $hatOptions
 * @param array<int, array<string, mixed>> $materialOptions
 * @return array{
 *   design_id:?string,
 *   design_name:?string,
 *   hat_id:?string,
 *   hat_summary:?string,
 *   material_id:?string,
 *   material_name:?string,
 *   patch_shape:?string,
 *   patch_size:?string,
 *   placement_status:string
 * }
 */
function proposeStaffCatalogFinishedHatImportMetadataFromFileName(
    string $fileName,
    array $designOptions,
    array $hatOptions,
    array $materialOptions
): array {
    $fileKey = normalizeStaffCatalogFinishedHatImportNameKey((string) preg_replace('/\.[^.]+$/', '', $fileName));

    $designMatch = null;
    foreach ($designOptions as $option) {
        $matchKey = (string) ($option['match_key'] ?? '');
        if ($matchKey !== '' && str_contains($fileKey, $matchKey)) {
            if ($designMatch !== null) {
                $designMatch = null;
                break;
            }
            $designMatch = $option;
        }
    }

    $hatMatch = null;
    foreach ($hatOptions as $option) {
        $manufacturer = (string) ($option['manufacturer'] ?? '');
        $model = (string) ($option['model'] ?? '');
        $color = (string) ($option['color'] ?? '');
        if ($manufacturer === '' || $model === '' || $color === '') {
            continue;
        }
        if (str_contains($fileKey, $manufacturer) && str_contains($fileKey, $model) && str_contains($fileKey, $color)) {
            if ($hatMatch !== null) {
                $hatMatch = null;
                break;
            }
            $hatMatch = $option;
        }
    }

    $materialMatch = null;
    foreach ($materialOptions as $option) {
        $matchKey = (string) ($option['match_key'] ?? '');
        if ($matchKey !== '' && str_contains($fileKey, $matchKey)) {
            if ($materialMatch !== null) {
                $materialMatch = null;
                break;
            }
            $materialMatch = $option;
        }
    }

    $placementStatus = 'unassigned';
    if (preg_match('/\bsample\b/i', $fileName) === 1) {
        $placementStatus = 'sample';
    } elseif (preg_match('/\bboutique\b/i', $fileName) === 1) {
        $placementStatus = 'currently_at_boutique';
    } elseif (preg_match('/\bsold\b/i', $fileName) === 1) {
        $placementStatus = 'sold';
    } elseif (preg_match('/\bpast[-_\s]?build\b/i', $fileName) === 1) {
        $placementStatus = 'past_build';
    }

    return [
        'design_id' => is_array($designMatch) ? (string) ($designMatch['id'] ?? '') : null,
        'design_name' => is_array($designMatch) ? (string) ($designMatch['design_name'] ?? '') : null,
        'hat_id' => is_array($hatMatch) ? (string) ($hatMatch['id'] ?? '') : null,
        'hat_summary' => is_array($hatMatch) ? (string) ($hatMatch['summary'] ?? '') : null,
        'material_id' => is_array($materialMatch) ? (string) ($materialMatch['id'] ?? '') : null,
        'material_name' => is_array($materialMatch) ? (string) ($materialMatch['material_name'] ?? '') : null,
        'patch_shape' => null,
        'patch_size' => null,
        'placement_status' => $placementStatus,
    ];
}

function buildStaffCatalogFinishedHatManagedRelativePath(string $fileName): string
{
    $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $extension = in_array($extension, ['png', 'jpg', 'jpeg', 'webp'], true) ? $extension : 'jpg';
    return '/uploads/finished-hat-photos/finished-hat-' . bin2hex(random_bytes(16)) . '.' . $extension;
}
