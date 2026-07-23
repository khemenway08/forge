<?php
declare(strict_types=1);

namespace Forge\Server;

final class StaffFinishedHatCatalogAssistedLinker
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
            || !method_exists($repository, 'listFinishedHats')
            || (!method_exists($repository, 'listFinishedHatSelectionOptions') && !method_exists($repository, 'listFinishedHatImportLinkOptions'))
            || !method_exists($repository, 'updateFinishedHat')
        ) {
            throw new \InvalidArgumentException(
                'A repository with listFinishedHats(), listFinishedHatSelectionOptions() or listFinishedHatImportLinkOptions(), and updateFinishedHat() is required.'
            );
        }

        $this->repository = $repository;
    }

    /**
     * @return array{
     *   dry_run:bool,
     *   records_processed:int,
     *   design_links_proposed:int,
     *   hat_links_proposed:int,
     *   material_links_proposed:int,
     *   existing_links_preserved:int,
     *   ambiguous_fields:int,
     *   missing_catalog_records:int,
     *   fully_linkable_records:int,
     *   partially_linkable_records:int,
     *   records_receiving_no_proposals:int,
     *   failures:int,
     *   updated_records:int,
     *   records:array<int, array<string, mixed>>
     * }
     */
    public function link(bool $dryRun = true): array
    {
        /** @var array<int, array<string, mixed>> $records */
        $records = $this->repository->listFinishedHats();
        $linkOptions = method_exists($this->repository, 'listFinishedHatSelectionOptions')
            ? $this->repository->listFinishedHatSelectionOptions()
            : $this->repository->listFinishedHatImportLinkOptions();

        $designOptions = buildStaffCatalogFinishedHatAssistedDesignIndex($linkOptions['designs'] ?? []);
        $hatOptions = buildStaffCatalogFinishedHatAssistedHatIndex($linkOptions['hats'] ?? []);
        $materialOptions = buildStaffCatalogFinishedHatAssistedMaterialIndex($linkOptions['materials'] ?? []);

        $summary = [
            'dry_run' => $dryRun,
            'records_processed' => 0,
            'design_links_proposed' => 0,
            'hat_links_proposed' => 0,
            'material_links_proposed' => 0,
            'existing_links_preserved' => 0,
            'ambiguous_fields' => 0,
            'missing_catalog_records' => 0,
            'fully_linkable_records' => 0,
            'partially_linkable_records' => 0,
            'records_receiving_no_proposals' => 0,
            'failures' => 0,
            'updated_records' => 0,
            'records' => [],
        ];

        foreach ($records as $record) {
            $summary['records_processed']++;

            $designResult = $this->evaluateField(
                $record,
                'design_id',
                static fn(array $candidateRecord) => normalizeStaffCatalogFinishedHatNullableString($candidateRecord['design_name'] ?? null),
                static fn(array $candidateRecord) => proposeStaffCatalogFinishedHatAssistedDesignLink(
                    (string) ($candidateRecord['finished_hat_name'] ?? ''),
                    $designOptions
                )
            );
            $hatResult = $this->evaluateField(
                $record,
                'hat_id',
                static fn(array $candidateRecord) => buildStaffCatalogFinishedHatAssistedHatSummary($candidateRecord),
                static fn(array $candidateRecord) => proposeStaffCatalogFinishedHatAssistedHatLink(
                    (string) ($candidateRecord['finished_hat_name'] ?? ''),
                    $hatOptions
                )
            );
            $materialResult = $this->evaluateField(
                $record,
                'material_id',
                static fn(array $candidateRecord) => buildStaffCatalogFinishedHatAssistedMaterialSummary($candidateRecord),
                static fn(array $candidateRecord) => proposeStaffCatalogFinishedHatAssistedMaterialLink(
                    (string) ($candidateRecord['finished_hat_name'] ?? ''),
                    $materialOptions
                )
            );

            foreach ([$designResult, $hatResult, $materialResult] as $fieldResult) {
                if ($fieldResult['status'] === 'preserved_existing') {
                    $summary['existing_links_preserved']++;
                } elseif ($fieldResult['status'] === 'proposed') {
                    if ($fieldResult['field'] === 'design_id') {
                        $summary['design_links_proposed']++;
                    } elseif ($fieldResult['field'] === 'hat_id') {
                        $summary['hat_links_proposed']++;
                    } elseif ($fieldResult['field'] === 'material_id') {
                        $summary['material_links_proposed']++;
                    }
                } elseif ($fieldResult['status'] === 'ambiguous') {
                    $summary['ambiguous_fields']++;
                } elseif ($fieldResult['status'] === 'missing_catalog_record') {
                    $summary['missing_catalog_records']++;
                }
            }

            $proposedFields = array_values(array_filter(
                [$designResult, $hatResult, $materialResult],
                static fn(array $fieldResult): bool => $fieldResult['status'] === 'proposed'
            ));
            $finalDesignId = $designResult['current_id'] ?? $designResult['proposed_id'];
            $finalHatId = $hatResult['current_id'] ?? $hatResult['proposed_id'];
            $finalMaterialId = $materialResult['current_id'] ?? $materialResult['proposed_id'];

            $recordSummary = [
                'finished_hat_id' => (string) ($record['id'] ?? ''),
                'finished_hat_name' => (string) ($record['finished_hat_name'] ?? ''),
                'current_design_link' => $designResult['current_label'],
                'proposed_design_link' => $designResult['proposed_label'],
                'design_status' => $designResult['status'],
                'design_confidence' => $designResult['confidence'],
                'design_reason' => $designResult['reason'],
                'current_hat_link' => $hatResult['current_label'],
                'proposed_hat_link' => $hatResult['proposed_label'],
                'hat_status' => $hatResult['status'],
                'hat_confidence' => $hatResult['confidence'],
                'hat_reason' => $hatResult['reason'],
                'current_material_link' => $materialResult['current_label'],
                'proposed_material_link' => $materialResult['proposed_label'],
                'material_status' => $materialResult['status'],
                'material_confidence' => $materialResult['confidence'],
                'material_reason' => $materialResult['reason'],
                'remaining_missing_fields' => array_values(array_filter([
                    $finalDesignId === null ? 'design' : null,
                    $finalHatId === null ? 'hat' : null,
                    $finalMaterialId === null ? 'material' : null,
                ])),
                'updated' => false,
                'update_failed' => false,
                'failure_message' => null,
            ];

            if ($finalDesignId !== null && $finalHatId !== null && $finalMaterialId !== null) {
                $summary['fully_linkable_records']++;
            } elseif ($proposedFields !== []) {
                $summary['partially_linkable_records']++;
            } else {
                $summary['records_receiving_no_proposals']++;
            }

            if (!$dryRun && $proposedFields !== []) {
                $updatePayload = [];
                foreach ($proposedFields as $fieldResult) {
                    $updatePayload[$fieldResult['field']] = $fieldResult['proposed_id'];
                }

                try {
                    $this->repository->updateFinishedHat((string) ($record['id'] ?? ''), $updatePayload);
                    $summary['updated_records']++;
                    $recordSummary['updated'] = true;
                } catch (\Throwable $exception) {
                    $summary['failures']++;
                    $recordSummary['update_failed'] = true;
                    $recordSummary['failure_message'] = $exception->getMessage();
                }
            }

            $summary['records'][] = $recordSummary;
        }

        return $summary;
    }

    /**
     * @param callable(array<string, mixed>):?string $currentLabelResolver
     * @param callable(array<string, mixed>):array<string, mixed> $proposalResolver
     * @return array{
     *   field:string,
     *   status:string,
     *   confidence:string,
     *   current_id:?string,
     *   current_label:?string,
     *   proposed_id:?string,
     *   proposed_label:?string,
     *   reason:string
     * }
     */
    private function evaluateField(
        array $record,
        string $field,
        callable $currentLabelResolver,
        callable $proposalResolver
    ): array {
        $currentId = normalizeStaffCatalogFinishedHatLinkedId($record[$field] ?? null);
        $currentLabel = $currentLabelResolver($record);
        if ($currentId !== null) {
            return [
                'field' => $field,
                'status' => 'preserved_existing',
                'confidence' => 'existing',
                'current_id' => $currentId,
                'current_label' => $currentLabel,
                'proposed_id' => null,
                'proposed_label' => null,
                'reason' => 'Existing link preserved.',
            ];
        }

        $proposal = $proposalResolver($record);
        return [
            'field' => $field,
            'status' => (string) ($proposal['status'] ?? 'no_match'),
            'confidence' => (string) ($proposal['confidence'] ?? 'review'),
            'current_id' => null,
            'current_label' => null,
            'proposed_id' => normalizeStaffCatalogFinishedHatLinkedId($proposal['id'] ?? null),
            'proposed_label' => normalizeStaffCatalogFinishedHatNullableString($proposal['label'] ?? null),
            'reason' => (string) ($proposal['reason'] ?? 'No high-confidence match was found.'),
        ];
    }
}

/**
 * @param array<int, array<string, mixed>> $designs
 * @return array<int, array<string, mixed>>
 */
function buildStaffCatalogFinishedHatAssistedDesignIndex(array $designs): array
{
    $indexed = [];
    foreach ($designs as $record) {
        $designName = normalizeStaffCatalogFinishedHatNullableString($record['design_name'] ?? null);
        $id = normalizeStaffCatalogFinishedHatLinkedId($record['id'] ?? null);
        if ($designName === null || $id === null) {
            continue;
        }

        $nameKey = normalizeStaffCatalogFinishedHatAssistedTextKey($designName);
        $tokens = tokenizeStaffCatalogFinishedHatAssistedTextKey($nameKey);
        if ($nameKey === '' || $tokens === []) {
            continue;
        }

        $indexed[] = [
            'id' => $id,
            'design_name' => $designName,
            'name_key' => $nameKey,
            'tokens' => $tokens,
        ];
    }

    return $indexed;
}

/**
 * @param array<int, array<string, mixed>> $hats
 * @return array<int, array<string, mixed>>
 */
function buildStaffCatalogFinishedHatAssistedHatIndex(array $hats): array
{
    $indexed = [];
    foreach ($hats as $record) {
        $id = normalizeStaffCatalogFinishedHatLinkedId($record['id'] ?? null);
        $manufacturer = normalizeStaffCatalogFinishedHatNullableString($record['manufacturer'] ?? null);
        $model = normalizeStaffCatalogFinishedHatNullableString($record['model'] ?? null);
        if ($id === null || $manufacturer === null || $model === null) {
            continue;
        }

        $color = normalizeStaffCatalogFinishedHatNullableString($record['color'] ?? null);
        $indexed[] = [
            'id' => $id,
            'hat_name' => normalizeStaffCatalogFinishedHatNullableString($record['hat_name'] ?? null),
            'manufacturer' => $manufacturer,
            'manufacturer_key' => normalizeStaffCatalogFinishedHatAssistedTextKey($manufacturer),
            'model' => $model,
            'model_key' => normalizeStaffCatalogFinishedHatAssistedTextKey($model),
            'color' => $color,
            'color_key' => normalizeStaffCatalogFinishedHatAssistedColorKey($color),
            'color_loose_key' => normalizeStaffCatalogFinishedHatAssistedLooseColorKey($color),
        ];
    }

    return $indexed;
}

/**
 * @param array<int, array<string, mixed>> $materials
 * @return array<int, array<string, mixed>>
 */
function buildStaffCatalogFinishedHatAssistedMaterialIndex(array $materials): array
{
    $indexed = [];
    foreach ($materials as $record) {
        $id = normalizeStaffCatalogFinishedHatLinkedId($record['id'] ?? null);
        $materialName = normalizeStaffCatalogFinishedHatNullableString($record['material_name'] ?? null);
        $materialType = normalizeStaffCatalogFinishedHatNullableString($record['material_type'] ?? null);
        if ($id === null || $materialName === null || $materialType === null) {
            continue;
        }

        $color = normalizeStaffCatalogFinishedHatNullableString($record['color'] ?? null);
        $indexed[] = [
            'id' => $id,
            'material_name' => $materialName,
            'material_type' => $materialType,
            'material_type_key' => normalizeStaffCatalogFinishedHatAssistedTextKey($materialType),
            'color' => $color,
            'color_key' => normalizeStaffCatalogFinishedHatAssistedColorKey($color),
            'name_key' => normalizeStaffCatalogFinishedHatAssistedTextKey($materialName),
        ];
    }

    return $indexed;
}

/**
 * @param array<int, array<string, mixed>> $designOptions
 * @return array{status:string,confidence:string,id:?string,label:?string,reason:string}
 */
function proposeStaffCatalogFinishedHatAssistedDesignLink(string $finishedHatName, array $designOptions): array
{
    $nameKey = normalizeStaffCatalogFinishedHatAssistedTextKey($finishedHatName);
    $nameTokens = tokenizeStaffCatalogFinishedHatAssistedTextKey($nameKey);
    if ($nameKey === '' || $nameTokens === []) {
        return buildStaffCatalogFinishedHatAssistedNoMatch('No high-confidence design match was found.');
    }

    $exactMatches = [];
    foreach ($designOptions as $option) {
        $optionKey = (string) ($option['name_key'] ?? '');
        if ($optionKey !== '' && str_contains($nameKey, $optionKey)) {
            $exactMatches[] = $option;
        }
    }

    if ($exactMatches !== []) {
        usort(
            $exactMatches,
            static fn(array $left, array $right): int => count($right['tokens']) <=> count($left['tokens'])
        );
        $longestLength = count($exactMatches[0]['tokens'] ?? []);
        $longestMatches = array_values(array_filter(
            $exactMatches,
            static fn(array $option): bool => count($option['tokens'] ?? []) === $longestLength
        ));
        if (count($longestMatches) === 1) {
            return buildStaffCatalogFinishedHatAssistedProposal(
                (string) $longestMatches[0]['id'],
                (string) $longestMatches[0]['design_name'],
                'high',
                'The longest full design name appears in the finished hat name.'
            );
        }

        return buildStaffCatalogFinishedHatAssistedAmbiguous(
            'Multiple equally specific full design names appear in the finished hat name.'
        );
    }

    $phraseMatches = [];
    $bestPhraseLength = 0;
    foreach ($designOptions as $option) {
        $tokens = is_array($option['tokens'] ?? null) ? array_values($option['tokens']) : [];
        $designName = (string) ($option['design_name'] ?? '');
        $designId = (string) ($option['id'] ?? '');
        $optionBestLength = 0;
        $optionBestPhrase = '';

        $tokenCount = count($tokens);
        for ($length = $tokenCount; $length >= 3; $length--) {
            for ($start = 0; $start <= $tokenCount - $length; $start++) {
                $phraseTokens = array_slice($tokens, $start, $length);
                $phraseKey = implode(' ', $phraseTokens);
                if ($phraseKey !== '' && str_contains($nameKey, $phraseKey)) {
                    $optionBestLength = $length;
                    $optionBestPhrase = $phraseKey;
                    break 2;
                }
            }
        }

        if ($optionBestLength <= 0) {
            continue;
        }

        if ($optionBestLength > $bestPhraseLength) {
            $bestPhraseLength = $optionBestLength;
            $phraseMatches = [[
                'id' => $designId,
                'design_name' => $designName,
                'phrase' => $optionBestPhrase,
                'length' => $optionBestLength,
            ]];
        } elseif ($optionBestLength === $bestPhraseLength) {
            $phraseMatches[] = [
                'id' => $designId,
                'design_name' => $designName,
                'phrase' => $optionBestPhrase,
                'length' => $optionBestLength,
            ];
        }
    }

    if ($bestPhraseLength >= 3 && count($phraseMatches) === 1) {
        return buildStaffCatalogFinishedHatAssistedProposal(
            (string) $phraseMatches[0]['id'],
            (string) $phraseMatches[0]['design_name'],
            'high',
            'Matched the longest unique design phrase: ' . $phraseMatches[0]['phrase'] . '.'
        );
    }
    if ($bestPhraseLength >= 3 && count($phraseMatches) > 1) {
        return buildStaffCatalogFinishedHatAssistedAmbiguous(
            'Competing design phrases matched the finished hat name with the same specificity.'
        );
    }

    $tokenSetMatches = [];
    foreach ($designOptions as $option) {
        $tokens = is_array($option['tokens'] ?? null) ? array_values($option['tokens']) : [];
        if (count($tokens) < 3) {
            continue;
        }
        if (staffCatalogFinishedHatAssistedContainsAllTokens($nameTokens, $tokens)) {
            $tokenSetMatches[] = $option;
        }
    }

    if (count($tokenSetMatches) === 1) {
        return buildStaffCatalogFinishedHatAssistedProposal(
            (string) $tokenSetMatches[0]['id'],
            (string) $tokenSetMatches[0]['design_name'],
            'high',
            'All design-name words were found in the finished hat name in a unique combination.'
        );
    }
    if (count($tokenSetMatches) > 1) {
        return buildStaffCatalogFinishedHatAssistedAmbiguous(
            'Multiple designs share the same design-name words in this finished hat name.'
        );
    }

    return buildStaffCatalogFinishedHatAssistedNoMatch('No high-confidence design match was found.');
}

/**
 * @param array<int, array<string, mixed>> $hatOptions
 * @return array{status:string,confidence:string,id:?string,label:?string,reason:string}
 */
function proposeStaffCatalogFinishedHatAssistedHatLink(string $finishedHatName, array $hatOptions): array
{
    $tail = extractStaffCatalogFinishedHatAssistedHatTail($finishedHatName);
    if ($tail === '') {
        return buildStaffCatalogFinishedHatAssistedNoMatch('No high-confidence hat model was identified.');
    }

    $parsed = parseStaffCatalogFinishedHatAssistedHatReference($tail, $hatOptions);
    if (($parsed['status'] ?? '') !== 'parsed') {
        return [
            'status' => (string) ($parsed['status'] ?? 'no_match'),
            'confidence' => 'review',
            'id' => null,
            'label' => null,
            'reason' => (string) ($parsed['reason'] ?? 'No high-confidence hat model was identified.'),
        ];
    }

    $manufacturerKey = (string) ($parsed['manufacturer_key'] ?? '');
    $modelKey = (string) ($parsed['model_key'] ?? '');
    $colorKey = (string) ($parsed['color_key'] ?? '');
    $colorLooseKey = (string) ($parsed['color_loose_key'] ?? '');

    $sameModelOptions = array_values(array_filter(
        $hatOptions,
        static function (array $option) use ($manufacturerKey, $modelKey): bool {
            return (string) ($option['manufacturer_key'] ?? '') === $manufacturerKey
                && (string) ($option['model_key'] ?? '') === $modelKey;
        }
    ));

    if ($sameModelOptions === []) {
        return buildStaffCatalogFinishedHatAssistedMissingCatalog(
            'No Hat Library record exists for ' . ((string) ($parsed['manufacturer'] ?? '') !== ''
                ? (string) $parsed['manufacturer'] . ' ' . (string) ($parsed['model'] ?? '')
                : 'model ' . (string) ($parsed['model'] ?? ''))
            . '.'
        );
    }

    if (count($sameModelOptions) === 1) {
        return buildStaffCatalogFinishedHatAssistedProposal(
            (string) $sameModelOptions[0]['id'],
            buildStaffCatalogFinishedHatAssistedHatOptionLabel($sameModelOptions[0]),
            'high',
            'Manufacturer and model identify one unique Hat Library record.'
        );
    }

    if ($colorKey === '' && $colorLooseKey === '') {
        return buildStaffCatalogFinishedHatAssistedAmbiguous(
            'Multiple Hat Library records share this manufacturer and model, and the finished hat color was not specific enough to identify one.'
        );
    }

    $bestScore = 0;
    $bestMatches = [];
    foreach ($sameModelOptions as $option) {
        $optionColorKey = (string) ($option['color_key'] ?? '');
        $optionLooseKey = (string) ($option['color_loose_key'] ?? '');
        $score = 0;
        if (
            $colorKey !== ''
            && $optionColorKey !== ''
            && staffCatalogFinishedHatAssistedSameDelimitedTokenSet($colorKey, $optionColorKey)
        ) {
            $score = 3;
        } elseif (
            $colorLooseKey !== ''
            && $optionLooseKey !== ''
            && staffCatalogFinishedHatAssistedSameDelimitedTokenSet($colorLooseKey, $optionLooseKey)
        ) {
            $score = 2;
        }

        if ($score > $bestScore) {
            $bestScore = $score;
            $bestMatches = [$option];
        } elseif ($score > 0 && $score === $bestScore) {
            $bestMatches[] = $option;
        }
    }

    if ($bestScore > 0 && count($bestMatches) === 1) {
        return buildStaffCatalogFinishedHatAssistedProposal(
            (string) $bestMatches[0]['id'],
            buildStaffCatalogFinishedHatAssistedHatOptionLabel($bestMatches[0]),
            'high',
            'Manufacturer, model, and color identify one unique Hat Library record.'
        );
    }
    if ($bestScore > 0 && count($bestMatches) > 1) {
        return buildStaffCatalogFinishedHatAssistedAmbiguous(
            'Multiple Hat Library records still match this color-normalized manufacturer/model combination.'
        );
    }

    return buildStaffCatalogFinishedHatAssistedAmbiguous(
        'No unique Hat Library color match was found for this manufacturer and model.'
    );
}

/**
 * @param array<int, array<string, mixed>> $materialOptions
 * @return array{status:string,confidence:string,id:?string,label:?string,reason:string}
 */
function proposeStaffCatalogFinishedHatAssistedMaterialLink(string $finishedHatName, array $materialOptions): array
{
    $nameKey = normalizeStaffCatalogFinishedHatAssistedTextKey($finishedHatName);
    if ($nameKey === '') {
        return buildStaffCatalogFinishedHatAssistedNoMatch('No high-confidence material match was found.');
    }

    $typeKey = '';
    if (preg_match('/\bleatherette\b/i', $finishedHatName) === 1) {
        $typeKey = 'leatherette';
    } elseif (preg_match('/\bacrylic\b/i', $finishedHatName) === 1) {
        $typeKey = 'acrylic';
    } elseif (preg_match('/\buv\s+print\b/i', $finishedHatName) === 1) {
        $typeKey = 'uv print';
    } elseif (preg_match('/\bleather\b/i', $finishedHatName) === 1) {
        $typeKey = 'leather';
    }

    if ($typeKey === '') {
        return buildStaffCatalogFinishedHatAssistedNoMatch('No explicit material type was found in the finished hat name.');
    }

    $sameTypeOptions = array_values(array_filter(
        $materialOptions,
        static fn(array $option): bool => (string) ($option['material_type_key'] ?? '') === $typeKey
    ));

    if ($sameTypeOptions === []) {
        return buildStaffCatalogFinishedHatAssistedMissingCatalog(
            'No Material Library record exists for material type ' . strtoupper($typeKey) . '.'
        );
    }

    $descriptorTokens = extractStaffCatalogFinishedHatAssistedMaterialDescriptorTokens($finishedHatName, $typeKey);
    $descriptorMatches = [];
    $bestDescriptorLength = 0;
    foreach ($descriptorTokens as $descriptorKey) {
        $descriptorLength = count(tokenizeStaffCatalogFinishedHatAssistedTextKey($descriptorKey));
        if ($descriptorLength <= 0) {
            continue;
        }

        $matches = array_values(array_filter(
            $sameTypeOptions,
            static function (array $option) use ($descriptorKey): bool {
                $colorKey = (string) ($option['color_key'] ?? '');
                $nameKeyOption = (string) ($option['name_key'] ?? '');
                return ($colorKey !== '' && str_contains($colorKey, $descriptorKey))
                    || ($nameKeyOption !== '' && str_contains($nameKeyOption, $descriptorKey));
            }
        ));

        if ($matches === []) {
            continue;
        }

        if ($descriptorLength > $bestDescriptorLength) {
            $bestDescriptorLength = $descriptorLength;
            $descriptorMatches = $matches;
        } elseif ($descriptorLength === $bestDescriptorLength) {
            $descriptorMatches = array_merge($descriptorMatches, $matches);
        }
    }

    if ($descriptorMatches === []) {
        return buildStaffCatalogFinishedHatAssistedAmbiguous(
            'The finished hat identifies a material type, but not one unique Material Library record.'
        );
    }

    $uniqueMatches = [];
    foreach ($descriptorMatches as $match) {
        $uniqueMatches[(string) $match['id']] = $match;
    }
    $descriptorMatches = array_values($uniqueMatches);

    if (count($descriptorMatches) === 1) {
        return buildStaffCatalogFinishedHatAssistedProposal(
            (string) $descriptorMatches[0]['id'],
            buildStaffCatalogFinishedHatAssistedMaterialOptionLabel($descriptorMatches[0]),
            'high',
            'Material type and descriptor identify one unique Material Library record.'
        );
    }

    return buildStaffCatalogFinishedHatAssistedAmbiguous(
        'Multiple Material Library records match the same material descriptor.'
    );
}

function buildStaffCatalogFinishedHatAssistedHatSummary(array $record): ?string
{
    $parts = array_values(array_filter([
        normalizeStaffCatalogFinishedHatNullableString($record['hat_manufacturer'] ?? null),
        normalizeStaffCatalogFinishedHatNullableString($record['hat_model'] ?? null),
        normalizeStaffCatalogFinishedHatNullableString($record['hat_color'] ?? null),
    ]));

    return $parts === [] ? null : implode(' / ', $parts);
}

function buildStaffCatalogFinishedHatAssistedMaterialSummary(array $record): ?string
{
    $parts = array_values(array_filter([
        normalizeStaffCatalogFinishedHatNullableString($record['material_name'] ?? null),
        normalizeStaffCatalogFinishedHatNullableString($record['material_color'] ?? null),
    ]));

    return $parts === [] ? null : implode(' / ', $parts);
}

function buildStaffCatalogFinishedHatAssistedHatOptionLabel(array $option): string
{
    return implode(' / ', array_values(array_filter([
        normalizeStaffCatalogFinishedHatNullableString($option['manufacturer'] ?? null),
        normalizeStaffCatalogFinishedHatNullableString($option['model'] ?? null),
        normalizeStaffCatalogFinishedHatNullableString($option['color'] ?? null),
    ])));
}

function buildStaffCatalogFinishedHatAssistedMaterialOptionLabel(array $option): string
{
    return implode(' / ', array_values(array_filter([
        normalizeStaffCatalogFinishedHatNullableString($option['material_name'] ?? null),
        normalizeStaffCatalogFinishedHatNullableString($option['color'] ?? null),
    ])));
}

/**
 * @return array{status:string,confidence:string,id:?string,label:?string,reason:string}
 */
function buildStaffCatalogFinishedHatAssistedProposal(string $id, string $label, string $confidence, string $reason): array
{
    return [
        'status' => 'proposed',
        'confidence' => $confidence,
        'id' => $id,
        'label' => $label,
        'reason' => $reason,
    ];
}

/**
 * @return array{status:string,confidence:string,id:?string,label:?string,reason:string}
 */
function buildStaffCatalogFinishedHatAssistedNoMatch(string $reason): array
{
    return [
        'status' => 'no_match',
        'confidence' => 'review',
        'id' => null,
        'label' => null,
        'reason' => $reason,
    ];
}

/**
 * @return array{status:string,confidence:string,id:?string,label:?string,reason:string}
 */
function buildStaffCatalogFinishedHatAssistedAmbiguous(string $reason): array
{
    return [
        'status' => 'ambiguous',
        'confidence' => 'review',
        'id' => null,
        'label' => null,
        'reason' => $reason,
    ];
}

/**
 * @return array{status:string,confidence:string,id:?string,label:?string,reason:string}
 */
function buildStaffCatalogFinishedHatAssistedMissingCatalog(string $reason): array
{
    return [
        'status' => 'missing_catalog_record',
        'confidence' => 'review',
        'id' => null,
        'label' => null,
        'reason' => $reason,
    ];
}

function normalizeStaffCatalogFinishedHatAssistedTextKey(?string $value): string
{
    $normalized = strtolower(trim((string) $value));
    $normalized = str_replace(['_', '-', '/', '(', ')'], ' ', $normalized);
    $normalized = preg_replace('/([a-z])([0-9])/', '$1 $2', $normalized) ?? $normalized;
    $normalized = preg_replace('/([0-9])([a-z])/', '$1 $2', $normalized) ?? $normalized;
    $normalized = preg_replace('/([a-z])([A-Z])/', '$1 $2', $normalized) ?? $normalized;
    $normalized = str_replace('whiterope', 'white rope', $normalized);
    $normalized = str_replace('grey', 'gray', $normalized);
    $normalized = preg_replace('/[^a-z0-9]+/', ' ', $normalized) ?? $normalized;
    $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;
    return trim($normalized);
}

function normalizeStaffCatalogFinishedHatAssistedColorKey(?string $value): string
{
    $key = normalizeStaffCatalogFinishedHatAssistedTextKey($value);
    if ($key === '') {
        return '';
    }

    return implode(' / ', tokenizeStaffCatalogFinishedHatAssistedTextKey($key));
}

function normalizeStaffCatalogFinishedHatAssistedLooseColorKey(?string $value): string
{
    $tokens = array_values(array_filter(
        tokenizeStaffCatalogFinishedHatAssistedTextKey(normalizeStaffCatalogFinishedHatAssistedTextKey($value)),
        static fn(string $token): bool => !in_array($token, ['heather'], true)
    ));

    return $tokens === [] ? '' : implode(' / ', $tokens);
}

function staffCatalogFinishedHatAssistedSameDelimitedTokenSet(string $left, string $right): bool
{
    $leftTokens = array_values(array_filter(array_map('trim', explode('/', $left)), static fn(string $token): bool => $token !== ''));
    $rightTokens = array_values(array_filter(array_map('trim', explode('/', $right)), static fn(string $token): bool => $token !== ''));

    sort($leftTokens, SORT_NATURAL | SORT_FLAG_CASE);
    sort($rightTokens, SORT_NATURAL | SORT_FLAG_CASE);

    return $leftTokens === $rightTokens;
}

/**
 * @return array<int, string>
 */
function tokenizeStaffCatalogFinishedHatAssistedTextKey(string $key): array
{
    if ($key === '') {
        return [];
    }

    $tokens = preg_split('/\s+/', $key) ?: [];
    return array_values(array_filter(
        array_map(static fn(string $token): string => trim($token), $tokens),
        static fn(string $token): bool => $token !== ''
    ));
}

/**
 * @param array<int, string> $haystackTokens
 * @param array<int, string> $needleTokens
 */
function staffCatalogFinishedHatAssistedContainsAllTokens(array $haystackTokens, array $needleTokens): bool
{
    $counts = [];
    foreach ($haystackTokens as $token) {
        $counts[$token] = ($counts[$token] ?? 0) + 1;
    }

    foreach ($needleTokens as $token) {
        if (($counts[$token] ?? 0) <= 0) {
            return false;
        }
        $counts[$token]--;
    }

    return true;
}

function extractStaffCatalogFinishedHatAssistedHatTail(string $finishedHatName): string
{
    if (preg_match('/\bpatch\s+hat\b\s+(.+)$/i', $finishedHatName, $matches) === 1) {
        return trim((string) $matches[1]);
    }
    if (preg_match('/\bhat\b\s+(.+)$/i', $finishedHatName, $matches) === 1) {
        return trim((string) $matches[1]);
    }

    return '';
}

/**
 * @param array<int, array<string, mixed>> $hatOptions
 * @return array<string, string>
 */
function parseStaffCatalogFinishedHatAssistedHatReference(string $tail, array $hatOptions): array
{
    if (preg_match('/^(?:(?<color>.+?)\s+)?richardson\s+(?<model>\d{3})(?<panel>\s+7\s+panel)?$/i', $tail, $matches) === 1) {
        $model = trim((string) $matches['model'] . (isset($matches['panel']) && trim((string) $matches['panel']) !== '' ? ' 7 Panel' : ''));
        return [
            'status' => 'parsed',
            'manufacturer' => 'Richardson',
            'manufacturer_key' => normalizeStaffCatalogFinishedHatAssistedTextKey('Richardson'),
            'model' => $model,
            'model_key' => normalizeStaffCatalogFinishedHatAssistedTextKey($model),
            'color' => trim((string) ($matches['color'] ?? '')),
            'color_key' => normalizeStaffCatalogFinishedHatAssistedColorKey((string) ($matches['color'] ?? '')),
            'color_loose_key' => normalizeStaffCatalogFinishedHatAssistedLooseColorKey((string) ($matches['color'] ?? '')),
            'reason' => 'Parsed a Richardson model reference from the finished hat name.',
        ];
    }

    $knownModelPatterns = buildStaffCatalogFinishedHatAssistedKnownModelPatterns($hatOptions);
    foreach ($knownModelPatterns as $modelPattern) {
        $quotedPattern = preg_quote($modelPattern['pattern'], '/');
        if (preg_match('/^(?<color>.+?)\s+' . $quotedPattern . '$/i', normalizeStaffCatalogFinishedHatAssistedTextKey($tail), $matches) === 1) {
            return [
                'status' => 'parsed',
                'manufacturer' => (string) $modelPattern['manufacturer'],
                'manufacturer_key' => normalizeStaffCatalogFinishedHatAssistedTextKey((string) $modelPattern['manufacturer']),
                'model' => (string) $modelPattern['model'],
                'model_key' => normalizeStaffCatalogFinishedHatAssistedTextKey((string) $modelPattern['model']),
                'color' => trim((string) $matches['color']),
                'color_key' => normalizeStaffCatalogFinishedHatAssistedColorKey((string) $matches['color']),
                'color_loose_key' => normalizeStaffCatalogFinishedHatAssistedLooseColorKey((string) $matches['color']),
                'reason' => 'Parsed a known Hat Library model reference from the finished hat name.',
            ];
        }
    }

    if (preg_match('/\brichardson\s+(\d{3})(?:\s+7\s+panel)?$/i', $tail, $matches) === 1) {
        $model = trim((string) $matches[1] . (preg_match('/7\s+panel$/i', $tail) === 1 ? ' 7 Panel' : ''));
        return [
            'status' => 'missing_catalog_record',
            'reason' => 'No Hat Library record exists for Richardson ' . $model . '.',
        ];
    }

    if (preg_match('/\b(performance\s+rope|stone\s+trucker|trucker|7\s+panel)\b$/i', $tail, $matches) === 1) {
        return [
            'status' => 'missing_catalog_record',
            'reason' => 'No Hat Library record exists for model ' . trim((string) $matches[1]) . '.',
        ];
    }

    return [
        'status' => 'no_match',
        'reason' => 'No high-confidence hat model was identified.',
    ];
}

/**
 * @param array<int, array<string, mixed>> $hatOptions
 * @return array<int, array{pattern:string,manufacturer:string,model:string}>
 */
function buildStaffCatalogFinishedHatAssistedKnownModelPatterns(array $hatOptions): array
{
    $patterns = [];
    foreach ($hatOptions as $option) {
        $manufacturer = normalizeStaffCatalogFinishedHatNullableString($option['manufacturer'] ?? null);
        $model = normalizeStaffCatalogFinishedHatNullableString($option['model'] ?? null);
        if ($manufacturer === null || $model === null) {
            continue;
        }

        $pattern = normalizeStaffCatalogFinishedHatAssistedTextKey($manufacturer . ' ' . $model);
        if ($pattern === '') {
            continue;
        }

        $patterns[$pattern] = [
            'pattern' => $pattern,
            'manufacturer' => $manufacturer,
            'model' => $model,
        ];
    }

    uasort(
        $patterns,
        static fn(array $left, array $right): int => strlen($right['pattern']) <=> strlen($left['pattern'])
    );

    return array_values($patterns);
}

/**
 * @return array<int, string>
 */
function extractStaffCatalogFinishedHatAssistedMaterialDescriptorTokens(string $finishedHatName, string $typeKey): array
{
    $normalized = normalizeStaffCatalogFinishedHatAssistedTextKey($finishedHatName);
    if ($normalized === '' || $typeKey === '') {
        return [];
    }

    $pattern = '/^(.*)\b' . preg_quote($typeKey, '/') . '\b/';
    if (preg_match($pattern, $normalized, $matches) !== 1) {
        return [];
    }

    $beforeType = trim((string) $matches[1]);
    $tokens = tokenizeStaffCatalogFinishedHatAssistedTextKey($beforeType);
    $descriptorKeys = [];
    $tokenCount = count($tokens);
    for ($length = min(4, $tokenCount); $length >= 1; $length--) {
        $slice = array_slice($tokens, $tokenCount - $length, $length);
        $descriptorKey = implode(' ', $slice);
        if ($descriptorKey !== '') {
            $descriptorKeys[] = $descriptorKey;
        }
    }

    return array_values(array_unique($descriptorKeys));
}
