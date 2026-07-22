<?php
declare(strict_types=1);

namespace Forge\Server;

final class StaffHatCatalogMetadataBackfill
{
    /** @var object */
    private $repository;

    /**
     * @param object $repository
     */
    public function __construct($repository)
    {
        if (
            !is_object($repository)
            || !method_exists($repository, 'listHats')
            || !method_exists($repository, 'updateHat')
        ) {
            throw new \InvalidArgumentException('A repository with listHats() and updateHat() is required.');
        }

        $this->repository = $repository;
    }

    /**
     * @return array{
     *   source_directory:string,
     *   dry_run:bool,
     *   updated:int,
     *   unchanged:int,
     *   skipped_populated_fields:int,
     *   ambiguous:int,
     *   failed:int,
     *   updated_records:array<int, array<string, mixed>>,
     *   unchanged_records:array<int, array<string, mixed>>,
     *   ambiguous_records:array<int, array<string, mixed>>,
     *   failed_records:array<int, array<string, mixed>>
     * }
     */
    public function backfillDirectory(string $sourceDirectory, bool $dryRun = true): array
    {
        $normalizedSourceDirectory = trim($sourceDirectory);
        if ($normalizedSourceDirectory === '' || !is_dir($normalizedSourceDirectory)) {
            throw new \InvalidArgumentException('A valid source directory is required.');
        }

        /** @var array<int, array<string, mixed>> $existingHats */
        $existingHats = $this->repository->listHats();
        $sourceByNormalizedHatName = buildStaffCatalogHatMetadataSourceMap($normalizedSourceDirectory);

        $summary = [
            'source_directory' => $normalizedSourceDirectory,
            'dry_run' => $dryRun,
            'updated' => 0,
            'unchanged' => 0,
            'skipped_populated_fields' => 0,
            'ambiguous' => 0,
            'failed' => 0,
            'updated_records' => [],
            'unchanged_records' => [],
            'ambiguous_records' => [],
            'failed_records' => [],
        ];

        foreach ($existingHats as $record) {
            $currentHatName = is_string($record['hat_name'] ?? null)
                ? trim((string) $record['hat_name'])
                : '';
            $normalizedHatName = normalizeStaffCatalogImportedHatName($currentHatName);
            $sourceRecord = $sourceByNormalizedHatName[$normalizedHatName] ?? null;

            if (!is_array($sourceRecord)) {
                $summary['ambiguous']++;
                $summary['ambiguous_records'][] = [
                    'hat_name' => $currentHatName,
                    'current_manufacturer' => normalizeStaffCatalogHatNullableString($record['manufacturer'] ?? null),
                    'current_model' => normalizeStaffCatalogHatNullableString($record['model'] ?? null),
                    'current_color' => normalizeStaffCatalogHatNullableString($record['color'] ?? null),
                    'proposed_manufacturer' => null,
                    'proposed_model' => null,
                    'proposed_color' => null,
                    'confidence' => 'review',
                    'review_reason' => 'No matching source filename was found.',
                ];
                continue;
            }

            $proposal = proposeStaffCatalogHatMetadataFromFileName((string) $sourceRecord['file']);
            $currentManufacturer = normalizeStaffCatalogHatNullableString($record['manufacturer'] ?? null);
            $currentModel = normalizeStaffCatalogHatNullableString($record['model'] ?? null);
            $currentColor = normalizeStaffCatalogHatNullableString($record['color'] ?? null);

            $proposedManufacturer = normalizeStaffCatalogHatNullableString($proposal['manufacturer'] ?? null);
            $proposedModel = normalizeStaffCatalogHatNullableString($proposal['model'] ?? null);
            $proposedColor = normalizeStaffCatalogHatNullableString($proposal['color'] ?? null);

            $skippedPopulatedFields = 0;
            foreach (
                [
                    ['current' => $currentManufacturer, 'proposed' => $proposedManufacturer],
                    ['current' => $currentModel, 'proposed' => $proposedModel],
                    ['current' => $currentColor, 'proposed' => $proposedColor],
                ] as $fieldPair
            ) {
                if ($fieldPair['proposed'] !== null && $fieldPair['current'] !== null) {
                    $skippedPopulatedFields++;
                }
            }
            $summary['skipped_populated_fields'] += $skippedPopulatedFields;

            $hasManualReviewReason = ($proposal['review_reasons'] ?? []) !== [];
            $canApplyRecord = !$hasManualReviewReason
                && $proposedManufacturer !== null
                && $proposedModel !== null
                && $proposedColor !== null;

            if (!$canApplyRecord) {
                $summary['ambiguous']++;
                $summary['ambiguous_records'][] = [
                    'file' => $sourceRecord['file'],
                    'hat_name' => $currentHatName,
                    'current_manufacturer' => $currentManufacturer,
                    'current_model' => $currentModel,
                    'current_color' => $currentColor,
                    'proposed_manufacturer' => $proposedManufacturer,
                    'proposed_model' => $proposedModel,
                    'proposed_color' => $proposedColor,
                    'confidence' => $proposal['confidence'] ?? 'review',
                    'review_reason' => implode('; ', $proposal['review_reasons'] ?? []),
                ];
                continue;
            }

            $updatePayload = [
                'hat_name' => $currentHatName,
                'manufacturer' => $currentManufacturer ?? $proposedManufacturer ?? '',
                'model' => $currentModel ?? $proposedModel ?? '',
                'color' => $currentColor ?? $proposedColor ?? '',
                'vendor' => normalizeStaffCatalogHatNullableString($record['vendor'] ?? null) ?? '',
                'base_cost' => normalizeStaffCatalogHatBaseCostString($record['base_cost'] ?? null) ?? '',
                'status' => normalizeStaffCatalogHatNullableString($record['status'] ?? null) ?? 'review',
                'notes' => normalizeStaffCatalogHatNullableString($record['notes'] ?? null) ?? '',
            ];

            $changedFields = [];
            if ($currentManufacturer === null && $proposedManufacturer !== null) {
                $changedFields[] = 'manufacturer';
            }
            if ($currentModel === null && $proposedModel !== null) {
                $changedFields[] = 'model';
            }
            if ($currentColor === null && $proposedColor !== null) {
                $changedFields[] = 'color';
            }

            if ($changedFields === []) {
                $summary['unchanged']++;
                $summary['unchanged_records'][] = [
                    'file' => $sourceRecord['file'],
                    'hat_name' => $currentHatName,
                    'current_manufacturer' => $currentManufacturer,
                    'current_model' => $currentModel,
                    'current_color' => $currentColor,
                    'proposed_manufacturer' => $proposedManufacturer,
                    'proposed_model' => $proposedModel,
                    'proposed_color' => $proposedColor,
                    'confidence' => 'high',
                    'reason' => 'All high-confidence fields were already populated.',
                ];
                continue;
            }

            try {
                if (!$dryRun) {
                    $this->repository->updateHat((string) ($record['id'] ?? ''), $updatePayload);
                }

                $summary['updated']++;
                $summary['updated_records'][] = [
                    'file' => $sourceRecord['file'],
                    'hat_name' => $currentHatName,
                    'current_manufacturer' => $currentManufacturer,
                    'current_model' => $currentModel,
                    'current_color' => $currentColor,
                    'proposed_manufacturer' => $proposedManufacturer,
                    'proposed_model' => $proposedModel,
                    'proposed_color' => $proposedColor,
                    'confidence' => 'high',
                    'changed_fields' => implode(', ', $changedFields),
                    'dry_run' => $dryRun,
                ];
            } catch (\Throwable $exception) {
                $summary['failed']++;
                $summary['failed_records'][] = [
                    'file' => $sourceRecord['file'],
                    'hat_name' => $currentHatName,
                    'message' => $exception->getMessage(),
                ];
            }
        }

        return $summary;
    }
}

/**
 * @return array<string, array{file:string, derived_hat_name:string}>
 */
function buildStaffCatalogHatMetadataSourceMap(string $sourceDirectory): array
{
    $sourceFiles = listStaffCatalogHatImportDirectoryEntries($sourceDirectory);
    $map = [];

    foreach ($sourceFiles as $sourceFile) {
        $fileName = basename($sourceFile);
        if (shouldSkipStaffCatalogHatImportFile($fileName) || !isSupportedStaffCatalogHatImportFile($fileName)) {
            continue;
        }

        $derivedHatName = deriveStaffCatalogHatNameFromFileName($fileName);
        $normalizedHatName = normalizeStaffCatalogImportedHatName($derivedHatName);
        if ($normalizedHatName === '') {
            continue;
        }

        $map[$normalizedHatName] = [
            'file' => $fileName,
            'derived_hat_name' => $derivedHatName,
        ];
    }

    return $map;
}

/**
 * @return array{
 *   manufacturer:?string,
 *   model:?string,
 *   color:?string,
 *   confidence:string,
 *   review_reasons:array<int, string>
 * }
 */
function proposeStaffCatalogHatMetadataFromFileName(string $fileName): array
{
    $baseName = pathinfo($fileName, PATHINFO_FILENAME);
    $normalizedBaseName = preg_replace('/\(\d+\)$/u', '', $baseName);
    $normalizedBaseName = is_string($normalizedBaseName) ? trim($normalizedBaseName) : trim($baseName);

    if (preg_match('/^Richardson_(\d+?)_(.+)$/i', $normalizedBaseName, $matches) === 1) {
        $colorResult = parseStaffCatalogHatColorProposal((string) $matches[2]);
        $reviewReasons = $colorResult['review_reasons'];

        return [
            'manufacturer' => 'Richardson',
            'model' => (string) $matches[1],
            'color' => $colorResult['color'],
            'confidence' => $reviewReasons === [] ? 'high' : 'review',
            'review_reasons' => $reviewReasons,
        ];
    }

    if (preg_match('/^Blackhawk_R_Zapped_Headwear_5_Panel__?(.+)$/i', $normalizedBaseName, $matches) === 1) {
        $colorResult = parseStaffCatalogHatColorProposal((string) $matches[1]);
        $reviewReasons = $colorResult['review_reasons'];

        return [
            'manufacturer' => 'Zapped Headwear',
            'model' => 'Blackhawk R 5 Panel',
            'color' => $colorResult['color'],
            'confidence' => $reviewReasons === [] ? 'high' : 'review',
            'review_reasons' => $reviewReasons,
        ];
    }

    if (preg_match('/^Osprey R\+\s+(.+)$/i', str_replace('_', ' ', $normalizedBaseName), $matches) === 1) {
        $colorResult = parseStaffCatalogHatColorProposal((string) $matches[1]);
        $reviewReasons = $colorResult['review_reasons'];
        $reviewReasons[] = 'Manufacturer was not clear in the source filename.';

        return [
            'manufacturer' => null,
            'model' => 'Osprey R+',
            'color' => $colorResult['color'],
            'confidence' => 'review',
            'review_reasons' => array_values(array_unique($reviewReasons)),
        ];
    }

    return [
        'manufacturer' => null,
        'model' => null,
        'color' => null,
        'confidence' => 'review',
        'review_reasons' => [
            'Filename did not match a high-confidence metadata pattern.',
        ],
    ];
}

/**
 * @return array{color:?string, review_reasons:array<int, string>}
 */
function parseStaffCatalogHatColorProposal(string $rawColorSegment): array
{
    $normalized = preg_replace('/\(\d+\)/u', '', $rawColorSegment);
    $normalized = is_string($normalized) ? $normalized : $rawColorSegment;
    $normalized = str_replace(['__', '_', '-'], ' ', $normalized);
    $normalized = trim(preg_replace('/\s+/u', ' ', $normalized) ?? '');

    if ($normalized === '') {
        return [
            'color' => null,
            'review_reasons' => ['Color was not clear in the source filename.'],
        ];
    }

    $tokens = preg_split('/\s+/u', $normalized) ?: [];
    $tokens = stripStaffCatalogHatPhotoDescriptorTokens($tokens);
    if ($tokens === []) {
        return [
            'color' => null,
            'review_reasons' => ['Color was not clear after removing photo-description words.'],
        ];
    }

    $recognizedParts = [];
    for ($index = 0, $count = count($tokens); $index < $count;) {
        $current = normalizeStaffCatalogHatMetadataToken($tokens[$index]);
        $next = $index + 1 < $count
            ? normalizeStaffCatalogHatMetadataToken($tokens[$index + 1])
            : null;

        if ($next !== null) {
            $twoWord = $current . ' ' . $next;
            $twoWordDisplay = mapStaffCatalogHatColorPhrase($twoWord);
            if ($twoWordDisplay !== null) {
                $recognizedParts[] = $twoWordDisplay;
                $index += 2;
                continue;
            }
        }

        $singleWordDisplay = mapStaffCatalogHatColorPhrase($current);
        if ($singleWordDisplay !== null) {
            $recognizedParts[] = $singleWordDisplay;
            $index++;
            continue;
        }

        return [
            'color' => null,
            'review_reasons' => [
                'Unrecognized color token "' . $tokens[$index] . '" requires manual review.',
            ],
        ];
    }

    return [
        'color' => $recognizedParts !== []
            ? implode(' / ', $recognizedParts)
            : null,
        'review_reasons' => [],
    ];
}

/**
 * @param array<int, string> $tokens
 * @return array<int, string>
 */
function stripStaffCatalogHatPhotoDescriptorTokens(array $tokens): array
{
    $descriptors = [
        'front',
        'side',
        'high',
        'angle',
        'photo',
        'image',
        'view',
    ];

    while ($tokens !== []) {
        $lastIndex = count($tokens) - 1;
        $normalizedLast = normalizeStaffCatalogHatMetadataToken($tokens[$lastIndex]);
        if (!in_array($normalizedLast, $descriptors, true)) {
            break;
        }
        array_pop($tokens);
    }

    return array_values($tokens);
}

function normalizeStaffCatalogHatMetadataToken(string $token): string
{
    $trimmed = trim($token);
    return function_exists('mb_strtolower')
        ? mb_strtolower($trimmed)
        : strtolower($trimmed);
}

function mapStaffCatalogHatColorPhrase(string $phrase): ?string
{
    static $map = [
        'black' => 'Black',
        'white' => 'White',
        'navy' => 'Navy',
        'red' => 'Red',
        'brown' => 'Brown',
        'khaki' => 'Khaki',
        'carmel' => 'Carmel',
        'charcoal' => 'Charcoal',
        'stone' => 'Stone',
        'cream' => 'Cream',
        'wheat' => 'Wheat',
        'coffee' => 'Coffee',
        'patriotic' => 'Patriotic',
        'chainlink' => 'Chainlink',
        'heather grey' => 'Heather Grey',
        'graphite grey' => 'Graphite Grey',
        'olive camo' => 'Olive Camo',
        'white rope' => 'White Rope',
        'whiterope' => 'White Rope',
    ];

    return $map[$phrase] ?? null;
}
