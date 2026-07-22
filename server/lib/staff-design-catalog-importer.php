<?php
declare(strict_types=1);

namespace Forge\Server;

interface StaffDesignCatalogImportRepositoryInterface
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function listDesigns(): array;

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createImportedDesign(array $input, string $thumbnailPath): array;
}

final class StaffDesignCatalogImporter
{
    private StaffDesignCatalogImportRepositoryInterface $repository;
    private string $uploadDirectory;

    public function __construct(StaffDesignCatalogImportRepositoryInterface $repository, string $uploadDirectory)
    {
        $this->repository = $repository;
        $this->uploadDirectory = rtrim($uploadDirectory, DIRECTORY_SEPARATOR);
    }

    /**
     * @return array{
     *   source_directory:string,
     *   dry_run:bool,
     *   imported:int,
     *   skipped:int,
     *   failed:int,
     *   collisions:int,
     *   imported_records:array<int, array<string, mixed>>,
     *   skipped_records:array<int, array<string, mixed>>,
     *   failed_records:array<int, array<string, mixed>>,
     *   collision_records:array<int, array<string, mixed>>
     * }
     */
    public function importDirectory(string $sourceDirectory, bool $dryRun = false): array
    {
        $normalizedSourceDirectory = trim($sourceDirectory);
        if ($normalizedSourceDirectory === '' || !is_dir($normalizedSourceDirectory)) {
            throw new \InvalidArgumentException('A valid source directory is required.');
        }

        $existingRecords = $this->repository->listDesigns();
        $existingByNormalizedName = [];
        foreach ($existingRecords as $record) {
            $designName = is_string($record['design_name'] ?? null) ? $record['design_name'] : '';
            $normalizedName = normalizeStaffCatalogImportDesignName($designName);
            if ($normalizedName === '') {
                continue;
            }
            $existingByNormalizedName[$normalizedName][] = $record;
        }

        $sourceFiles = listStaffCatalogImportDirectoryEntries($normalizedSourceDirectory);
        $plannedNames = [];
        $summary = [
            'source_directory' => $normalizedSourceDirectory,
            'dry_run' => $dryRun,
            'imported' => 0,
            'skipped' => 0,
            'failed' => 0,
            'collisions' => 0,
            'imported_records' => [],
            'skipped_records' => [],
            'failed_records' => [],
            'collision_records' => [],
        ];

        foreach ($sourceFiles as $sourceFile) {
            $fileName = basename($sourceFile);
            if (shouldSkipStaffCatalogImportFile($fileName)) {
                $summary['skipped']++;
                $summary['skipped_records'][] = [
                    'file' => $fileName,
                    'reason' => 'hidden_or_temporary',
                ];
                continue;
            }

            $designName = deriveStaffCatalogDesignNameFromFileName($fileName);
            $normalizedName = normalizeStaffCatalogImportDesignName($designName);

            $extension = normalizeStaffCatalogPreviewImageExtension(pathinfo($fileName, PATHINFO_EXTENSION));
            if ($extension === null) {
                $summary['skipped']++;
                $summary['skipped_records'][] = [
                    'file' => $fileName,
                    'reason' => 'unsupported_extension',
                ];
                continue;
            }

            if ($normalizedName === '') {
                $summary['failed']++;
                $summary['failed_records'][] = [
                    'file' => $fileName,
                    'reason' => 'invalid_design_name',
                ];
                continue;
            }

            $destinationFileName = buildStaffCatalogManagedThumbnailFileName($sourceFile, $extension);
            $relativeThumbnailPath = buildStaffCatalogManagedThumbnailRelativePath($destinationFileName);
            $absoluteThumbnailPath = $this->uploadDirectory . DIRECTORY_SEPARATOR . $destinationFileName;

            if (isset($plannedNames[$normalizedName])) {
                $summary['collisions']++;
                $summary['collision_records'][] = [
                    'file' => $fileName,
                    'design_name' => $designName,
                    'reason' => 'duplicate_source_design_name',
                    'conflicts_with' => $plannedNames[$normalizedName],
                ];
                continue;
            }

            $matchingExisting = $existingByNormalizedName[$normalizedName] ?? [];
            if (count($matchingExisting) > 1) {
                $summary['collisions']++;
                $summary['collision_records'][] = [
                    'file' => $fileName,
                    'design_name' => $designName,
                    'reason' => 'duplicate_existing_design_name',
                ];
                continue;
            }

            if (count($matchingExisting) === 1) {
                $existingRecord = $matchingExisting[0];
                $existingThumbnailPath = is_string($existingRecord['thumbnail_path'] ?? null)
                    ? trim((string) $existingRecord['thumbnail_path'])
                    : '';
                if ($existingThumbnailPath === $relativeThumbnailPath) {
                    $summary['skipped']++;
                    $summary['skipped_records'][] = [
                        'file' => $fileName,
                        'design_name' => $designName,
                        'reason' => 'already_imported',
                    ];
                    continue;
                }

                $summary['collisions']++;
                $summary['collision_records'][] = [
                    'file' => $fileName,
                    'design_name' => $designName,
                    'reason' => 'existing_design_name_conflict',
                    'existing_thumbnail_path' => $existingThumbnailPath,
                ];
                continue;
            }

            $plannedNames[$normalizedName] = $fileName;

            if ($dryRun) {
                $summary['imported']++;
                $summary['imported_records'][] = [
                    'file' => $fileName,
                    'design_name' => $designName,
                    'thumbnail_path' => $relativeThumbnailPath,
                    'dry_run' => true,
                ];
                continue;
            }

            $copiedFile = false;
            try {
                if (!is_dir($this->uploadDirectory) && !@mkdir($this->uploadDirectory, 0775, true) && !is_dir($this->uploadDirectory)) {
                    throw new \RuntimeException('Managed thumbnail directory could not be created.');
                }

                if (!is_file($absoluteThumbnailPath)) {
                    if (!@copy($sourceFile, $absoluteThumbnailPath)) {
                        throw new \RuntimeException('Preview file could not be copied into managed thumbnail storage.');
                    }
                    $copiedFile = true;
                }

                $created = $this->repository->createImportedDesign([
                    'design_name' => $designName,
                    'category' => 'other',
                    'store_fit' => 'undecided',
                    'status' => 'review',
                    'production_method' => 'tbd',
                    'production_file_location' => '',
                    'made_on_hat' => 'unknown',
                    'notes' => '',
                ], $relativeThumbnailPath);

                $existingByNormalizedName[$normalizedName] = [$created];
                $summary['imported']++;
                $summary['imported_records'][] = [
                    'file' => $fileName,
                    'design_name' => $designName,
                    'thumbnail_path' => $relativeThumbnailPath,
                    'id' => $created['id'] ?? '',
                ];
            } catch (\Throwable $exception) {
                if ($copiedFile && is_file($absoluteThumbnailPath)) {
                    @unlink($absoluteThumbnailPath);
                }

                $summary['failed']++;
                $summary['failed_records'][] = [
                    'file' => $fileName,
                    'design_name' => $designName,
                    'reason' => 'import_failed',
                    'message' => $exception->getMessage(),
                ];
            }
        }

        return $summary;
    }
}

/**
 * @return array<int, string>
 */
function listStaffCatalogImportDirectoryEntries(string $sourceDirectory): array
{
    $entries = @scandir($sourceDirectory);
    if (!is_array($entries)) {
        return [];
    }

    $files = [];
    foreach ($entries as $entry) {
        $absolutePath = rtrim($sourceDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $entry;
        if (!is_file($absolutePath)) {
            continue;
        }

        $files[] = $absolutePath;
    }

    sort($files, SORT_NATURAL | SORT_FLAG_CASE);
    return $files;
}

function shouldSkipStaffCatalogImportFile(string $fileName): bool
{
    $trimmed = trim($fileName);
    if ($trimmed === '' || $trimmed === '.' || $trimmed === '..') {
        return true;
    }

    return str_starts_with($trimmed, '.')
        || str_starts_with($trimmed, '~')
        || str_ends_with($trimmed, '~');
}

function isSupportedStaffCatalogPreviewImageFile(string $fileName): bool
{
    if (shouldSkipStaffCatalogImportFile($fileName)) {
        return false;
    }

    return normalizeStaffCatalogPreviewImageExtension(pathinfo($fileName, PATHINFO_EXTENSION)) !== null;
}

function deriveStaffCatalogDesignNameFromFileName(string $fileName): string
{
    $baseName = pathinfo($fileName, PATHINFO_FILENAME);
    $normalized = preg_replace('/[_-]+/u', ' ', $baseName);
    if (!is_string($normalized)) {
        $normalized = $baseName;
    }

    $normalized = trim(preg_replace('/\s+/u', ' ', $normalized) ?? '');
    if ($normalized === '') {
        return '';
    }

    $tokens = preg_split('/\s+/u', $normalized) ?: [];
    $formattedTokens = [];
    foreach ($tokens as $token) {
        $lowerToken = function_exists('mb_strtolower')
            ? mb_strtolower($token)
            : strtolower($token);

        if (preg_match('/^\d+(st|nd|rd|th)$/i', $token)) {
            $formattedTokens[] = $lowerToken;
            continue;
        }

        if (preg_match('/^v\d+$/i', $token)) {
            $formattedTokens[] = strtoupper($token);
            continue;
        }

        if (in_array($lowerToken, ['uv', 'tx'], true)) {
            $formattedTokens[] = strtoupper($lowerToken);
            continue;
        }

        if (function_exists('mb_convert_case')) {
            $formattedTokens[] = mb_convert_case($lowerToken, MB_CASE_TITLE);
            continue;
        }

        $formattedTokens[] = ucwords($lowerToken);
    }

    if ($formattedTokens !== []) {
        return implode(' ', $formattedTokens);
    }

    return ucwords(strtolower($normalized));
}

function normalizeStaffCatalogImportDesignName(string $designName): string
{
    $normalized = trim(preg_replace('/\s+/u', ' ', $designName) ?? '');
    return function_exists('mb_strtolower')
        ? mb_strtolower($normalized)
        : strtolower($normalized);
}

function normalizeStaffCatalogPreviewImageExtension(string $extension): ?string
{
    $normalized = strtolower(trim($extension));
    if ($normalized === 'jpeg') {
        return 'jpg';
    }

    return in_array($normalized, ['png', 'jpg', 'webp'], true)
        ? $normalized
        : null;
}

function buildStaffCatalogManagedThumbnailFileName(string $sourceFile, ?string $normalizedExtension = null): string
{
    $extension = $normalizedExtension ?? normalizeStaffCatalogPreviewImageExtension(pathinfo($sourceFile, PATHINFO_EXTENSION));
    if ($extension === null) {
        throw new \InvalidArgumentException('A supported image extension is required.');
    }

    $hash = sha1_file($sourceFile);
    if (!is_string($hash) || $hash === '') {
        throw new \RuntimeException('The source file hash could not be generated.');
    }

    return 'design-' . $hash . '.' . $extension;
}

function buildStaffCatalogManagedThumbnailRelativePath(string $fileName): string
{
    return '/uploads/design-thumbnails/' . ltrim($fileName, '/');
}
