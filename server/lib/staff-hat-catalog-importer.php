<?php
declare(strict_types=1);

namespace Forge\Server;

final class StaffHatCatalogImporter
{
    private StaffHatCatalogImportRepositoryInterface $repository;
    private string $uploadDirectory;

    public function __construct(StaffHatCatalogImportRepositoryInterface $repository, string $uploadDirectory)
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

        $existingRecords = $this->repository->listHats();
        $existingByNormalizedName = [];
        foreach ($existingRecords as $record) {
            $hatName = is_string($record['hat_name'] ?? null) ? $record['hat_name'] : '';
            $normalizedName = normalizeStaffCatalogImportedHatName($hatName);
            if ($normalizedName === '') {
                continue;
            }
            $existingByNormalizedName[$normalizedName][] = $record;
        }

        $sourceFiles = listStaffCatalogHatImportDirectoryEntries($normalizedSourceDirectory);
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
            if (shouldSkipStaffCatalogHatImportFile($fileName)) {
                $summary['skipped']++;
                $summary['skipped_records'][] = [
                    'file' => $fileName,
                    'reason' => 'hidden_or_temporary',
                ];
                continue;
            }

            $hatName = deriveStaffCatalogHatNameFromFileName($fileName);
            $normalizedName = normalizeStaffCatalogImportedHatName($hatName);
            $extension = normalizeStaffCatalogHatPhotoExtension(pathinfo($fileName, PATHINFO_EXTENSION));

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
                    'reason' => 'invalid_hat_name',
                ];
                continue;
            }

            if (isset($plannedNames[$normalizedName])) {
                $summary['collisions']++;
                $summary['collision_records'][] = [
                    'file' => $fileName,
                    'hat_name' => $hatName,
                    'reason' => 'duplicate_source_hat_name',
                    'conflicts_with' => $plannedNames[$normalizedName],
                ];
                continue;
            }

            $matchingExisting = $existingByNormalizedName[$normalizedName] ?? [];
            if (count($matchingExisting) > 1) {
                $summary['collisions']++;
                $summary['collision_records'][] = [
                    'file' => $fileName,
                    'hat_name' => $hatName,
                    'reason' => 'duplicate_existing_hat_name',
                ];
                continue;
            }

            if (count($matchingExisting) === 1) {
                $existingRecord = $matchingExisting[0];
                $existingPhotoPath = is_string($existingRecord['photo_path'] ?? null)
                    ? trim((string) $existingRecord['photo_path'])
                    : '';
                if ($existingPhotoPath !== '') {
                    $summary['skipped']++;
                    $summary['skipped_records'][] = [
                        'file' => $fileName,
                        'hat_name' => $hatName,
                        'reason' => 'already_imported',
                    ];
                    continue;
                }

                $summary['collisions']++;
                $summary['collision_records'][] = [
                    'file' => $fileName,
                    'hat_name' => $hatName,
                    'reason' => 'existing_hat_name_conflict',
                ];
                continue;
            }

            $plannedNames[$normalizedName] = $fileName;
            $destinationFileName = generateStaffCatalogHatManagedPhotoFileName($extension);
            $relativePhotoPath = buildStaffCatalogHatManagedPhotoRelativePath($destinationFileName);
            $absolutePhotoPath = $this->uploadDirectory . DIRECTORY_SEPARATOR . $destinationFileName;

            if ($dryRun) {
                $summary['imported']++;
                $summary['imported_records'][] = [
                    'file' => $fileName,
                    'hat_name' => $hatName,
                    'photo_path' => $relativePhotoPath,
                    'dry_run' => true,
                ];
                continue;
            }

            $copiedFile = false;
            try {
                if (!is_dir($this->uploadDirectory) && !@mkdir($this->uploadDirectory, 0775, true) && !is_dir($this->uploadDirectory)) {
                    throw new \RuntimeException('Managed hat photo directory could not be created.');
                }

                if (!@copy($sourceFile, $absolutePhotoPath)) {
                    throw new \RuntimeException('Hat photo could not be copied into managed storage.');
                }
                $copiedFile = true;

                $created = $this->repository->createImportedHat([
                    'hat_name' => $hatName,
                    'manufacturer' => '',
                    'model' => '',
                    'color' => '',
                    'vendor' => '',
                    'base_cost' => '',
                    'status' => 'review',
                    'notes' => '',
                ], $relativePhotoPath);

                $existingByNormalizedName[$normalizedName] = [$created];
                $summary['imported']++;
                $summary['imported_records'][] = [
                    'file' => $fileName,
                    'hat_name' => $hatName,
                    'photo_path' => $relativePhotoPath,
                    'id' => $created['id'] ?? '',
                ];
            } catch (\Throwable $exception) {
                if ($copiedFile && is_file($absolutePhotoPath)) {
                    @unlink($absolutePhotoPath);
                }

                $summary['failed']++;
                $summary['failed_records'][] = [
                    'file' => $fileName,
                    'hat_name' => $hatName,
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
function listStaffCatalogHatImportDirectoryEntries(string $sourceDirectory): array
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

function shouldSkipStaffCatalogHatImportFile(string $fileName): bool
{
    $trimmed = trim($fileName);
    if ($trimmed === '' || $trimmed === '.' || $trimmed === '..') {
        return true;
    }

    return str_starts_with($trimmed, '.')
        || str_starts_with($trimmed, '~')
        || str_ends_with($trimmed, '~');
}

function isSupportedStaffCatalogHatImportFile(string $fileName): bool
{
    if (shouldSkipStaffCatalogHatImportFile($fileName)) {
        return false;
    }

    return normalizeStaffCatalogHatPhotoExtension(pathinfo($fileName, PATHINFO_EXTENSION)) !== null;
}

function deriveStaffCatalogHatNameFromFileName(string $fileName): string
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

        if (function_exists('mb_convert_case')) {
            $formattedTokens[] = mb_convert_case($lowerToken, MB_CASE_TITLE);
            continue;
        }

        $formattedTokens[] = ucwords($lowerToken);
    }

    return $formattedTokens !== []
        ? implode(' ', $formattedTokens)
        : ucwords(strtolower($normalized));
}

function normalizeStaffCatalogImportedHatName(string $hatName): string
{
    $normalized = trim(preg_replace('/\s+/u', ' ', $hatName) ?? '');
    return function_exists('mb_strtolower')
        ? mb_strtolower($normalized)
        : strtolower($normalized);
}

function normalizeStaffCatalogHatPhotoExtension(string $extension): ?string
{
    $normalized = strtolower(trim($extension));
    if ($normalized === 'jpeg') {
        return 'jpg';
    }

    return in_array($normalized, ['png', 'jpg', 'webp'], true)
        ? $normalized
        : null;
}

function generateStaffCatalogHatManagedPhotoFileName(string $normalizedExtension): string
{
    return 'hat-' . bin2hex(random_bytes(16)) . '.' . $normalizedExtension;
}

function buildStaffCatalogHatManagedPhotoRelativePath(string $fileName): string
{
    return '/uploads/hat-photos/' . ltrim($fileName, '/');
}
