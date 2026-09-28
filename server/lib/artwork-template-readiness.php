<?php
declare(strict_types=1);

namespace Forge\Server;

const ARTWORK_READY = 'ready';
const ARTWORK_TEMPLATE_NOT_CONFIGURED = 'template_not_configured';
const ARTWORK_UNSUPPORTED_VARIANT = 'unsupported_variant';
const ARTWORK_TEMPLATE_VALIDATION_PROBLEM = 'template_validation_problem';

/**
 * @param array<string, mixed> $record
 * @param array<string, array<string, mixed>> $registrationsByProduct
 * @return array<string, mixed>
 */
function applyArtworkReadinessToStaffOrderRecord(array $record, array $registrationsByProduct): array
{
    $payload = is_array($record['payload'] ?? null) ? $record['payload'] : [];
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $normalizedItems = [];
    $hasProblem = false;

    foreach ($items as $item) {
        if (!is_array($item)) {
            $normalizedItems[] = $item;
            continue;
        }

        $readiness = resolveArtworkTemplateReadiness($item, $registrationsByProduct);
        if ($readiness !== null) {
            $item['artwork_readiness'] = $readiness;
            if (($readiness['state'] ?? '') !== ARTWORK_READY) {
                $hasProblem = true;
            }
        }
        $normalizedItems[] = $item;
    }

    $payload['items'] = $normalizedItems;
    $record['payload'] = $payload;
    $record['artwork_setup_needed'] = $hasProblem;

    return $record;
}

/**
 * @param array<string, mixed> $item
 * @param array<string, array<string, mixed>> $registrationsByProduct
 * @return array<string, mixed>|null
 */
function resolveArtworkTemplateReadiness(array $item, array $registrationsByProduct): ?array
{
    $attributes = is_array($item['structured_attributes'] ?? null) ? $item['structured_attributes'] : [];
    $configuration = is_array($item['configuration_snapshot'] ?? null) ? $item['configuration_snapshot'] : [];
    $category = strtolower(firstArtworkString([
        $item['product_category'] ?? null,
        $attributes['category'] ?? null,
        $item['category'] ?? null,
    ]));

    if ($category !== 'ornament') {
        return null;
    }

    $productDefinitionId = firstArtworkString([
        $item['product_definition_id'] ?? null,
        $attributes['product_definition_id'] ?? null,
    ]);
    $registration = $productDefinitionId !== '' && is_array($registrationsByProduct[$productDefinitionId] ?? null)
        ? $registrationsByProduct[$productDefinitionId]
        : null;

    if ($registration === null || strtolower(trim((string) ($registration['registration_status'] ?? 'active'))) !== 'active') {
        return artworkReadinessResult(
            ARTWORK_TEMPLATE_NOT_CONFIGURED,
            'Template Not Configured',
            'No active artwork template is registered for this ornament.'
        );
    }

    $selectorType = strtolower(trim((string) ($registration['selector_type'] ?? '')));
    $allowedVariants = normalizeArtworkAllowedVariants($registration['allowed_variants'] ?? []);
    $variant = resolveArtworkVariant($selectorType, $item, $attributes, $configuration, $allowedVariants);
    if (!$variant['supported']) {
        return artworkReadinessResult(
            ARTWORK_UNSUPPORTED_VARIANT,
            'Unsupported Variant',
            $variant['detail'],
            $registration,
            $variant
        );
    }

    $validations = is_array($registration['validations'] ?? null) ? $registration['validations'] : [];
    $validation = is_array($validations[$variant['key']] ?? null) ? $validations[$variant['key']] : null;
    $currentRevision = (int) ($registration['configuration_revision'] ?? 0);
    $currentDigest = strtolower(trim((string) ($registration['configuration_digest'] ?? '')));
    $validationIsCurrent = $validation !== null
        && strtolower(trim((string) ($validation['validation_status'] ?? ''))) === 'valid'
        && (int) ($validation['configuration_revision'] ?? -1) === $currentRevision
        && $currentDigest !== ''
        && hash_equals($currentDigest, strtolower(trim((string) ($validation['configuration_digest'] ?? ''))));

    if (!$validationIsCurrent) {
        $errorCode = $validation === null ? 'master_missing' : normalizeArtworkErrorCode($validation['validation_error_code'] ?? null);
        $detail = $errorCode === 'master_missing'
            ? 'Master Missing — ' . $variant['label']
            : ($errorCode !== null
                ? formatArtworkErrorCode($errorCode) . ' — ' . $variant['label']
                : 'Validation required — ' . $variant['label']);

        return artworkReadinessResult(
            ARTWORK_TEMPLATE_VALIDATION_PROBLEM,
            'Template Validation Problem',
            $detail,
            $registration,
            $variant,
            $validation
        );
    }

    return artworkReadinessResult(
        ARTWORK_READY,
        'Ready',
        'Ready — ' . $variant['label'],
        $registration,
        $variant,
        $validation
    );
}

/**
 * @param array<string, mixed> $item
 * @param array<string, mixed> $attributes
 * @param array<string, mixed> $configuration
 * @param array<string, string> $allowedVariants
 * @return array{supported: bool, key: string, label: string, detail: string}
 */
function resolveArtworkVariant(string $selectorType, array $item, array $attributes, array $configuration, array $allowedVariants): array
{
    if ($selectorType === 'none') {
        $key = 'single';
        if ($allowedVariants !== [] && !isset($allowedVariants[$key])) {
            return ['supported' => false, 'key' => $key, 'label' => 'Single master', 'detail' => 'The single-master variant is not configured.'];
        }
        return ['supported' => true, 'key' => $key, 'label' => $allowedVariants[$key] ?? 'Single master', 'detail' => ''];
    }

    if ($selectorType === 'size') {
        $size = firstArtworkString([$attributes['size'] ?? null, $configuration['size'] ?? null]);
        $key = normalizeArtworkVariantKey($size);
        if ($key === '' || !isset($allowedVariants[$key])) {
            $configured = formatArtworkConfiguredVariants($allowedVariants, 'Configured sizes');
            return [
                'supported' => false,
                'key' => $key,
                'label' => $size !== '' ? $size : 'Missing size',
                'detail' => ($size !== '' ? 'Unsupported size: ' . $size . '.' : 'The ornament size could not be resolved.') . $configured,
            ];
        }
        return ['supported' => true, 'key' => $key, 'label' => $allowedVariants[$key], 'detail' => ''];
    }

    if ($selectorType === 'personalization_count') {
        if (!is_array($item['personalization_order'] ?? null)) {
            return ['supported' => false, 'key' => '', 'label' => 'Unknown personalization count', 'detail' => 'The personalization position count could not be resolved.'];
        }
        $count = count($item['personalization_order']);
        $key = (string) $count;
        $label = $count . ' personalization position' . ($count === 1 ? '' : 's');
        if (!isset($allowedVariants[$key])) {
            return [
                'supported' => false,
                'key' => $key,
                'label' => $label,
                'detail' => 'Unsupported Variant — ' . $label . '.' . formatArtworkConfiguredCountRange($allowedVariants),
            ];
        }
        return ['supported' => true, 'key' => $key, 'label' => $allowedVariants[$key], 'detail' => ''];
    }

    return ['supported' => false, 'key' => '', 'label' => 'Unknown variant', 'detail' => 'The artwork template selector is not supported.'];
}

/** @return array<string, string> */
function normalizeArtworkAllowedVariants($allowedVariants): array
{
    if (!is_array($allowedVariants)) {
        return [];
    }
    $normalized = [];
    foreach ($allowedVariants as $key => $value) {
        $variantKey = normalizeArtworkVariantKey((string) $key);
        $label = trim((string) $value);
        if ($variantKey !== '' && $label !== '') {
            $normalized[$variantKey] = $label;
        }
    }
    return $normalized;
}

function normalizeArtworkVariantKey(string $value): string
{
    return strtolower(trim($value));
}

/** @param array<int, mixed> $values */
function firstArtworkString(array $values): string
{
    foreach ($values as $value) {
        if (is_string($value) || is_numeric($value)) {
            $normalized = trim((string) $value);
            if ($normalized !== '') {
                return $normalized;
            }
        }
    }
    return '';
}

/**
 * @param array<string, mixed>|null $registration
 * @param array<string, mixed>|null $variant
 * @param array<string, mixed>|null $validation
 * @return array<string, mixed>
 */
function artworkReadinessResult(string $state, string $label, string $detail, ?array $registration = null, ?array $variant = null, ?array $validation = null): array
{
    $result = [
        'state' => $state,
        'label' => $label,
        'detail' => $detail,
    ];
    if ($registration !== null) {
        $result['registration_id'] = trim((string) ($registration['registration_id'] ?? ''));
        $result['family_id'] = trim((string) ($registration['family_id'] ?? ''));
        $result['launcher_family_id'] = trim((string) ($registration['launcher_family_id'] ?? ''));
        $result['artwork_label'] = trim((string) ($registration['artwork_label'] ?? ''));
        $result['configuration_revision'] = (int) ($registration['configuration_revision'] ?? 0);
    }
    if ($variant !== null) {
        $result['variant_key'] = (string) ($variant['key'] ?? '');
        $result['variant_label'] = (string) ($variant['label'] ?? '');
    }
    if ($validation !== null) {
        $result['validated_at'] = isset($validation['validated_at']) ? trim((string) $validation['validated_at']) : null;
        $result['launcher_profile_label'] = isset($validation['launcher_profile_label']) ? trim((string) $validation['launcher_profile_label']) : null;
        $result['validation_error_code'] = normalizeArtworkErrorCode($validation['validation_error_code'] ?? null);
    }
    return $result;
}

/** @param array<string, string> $variants */
function formatArtworkConfiguredVariants(array $variants, string $prefix): string
{
    return $variants === [] ? '' : ' ' . $prefix . ': ' . implode(', ', array_values($variants)) . '.';
}

/** @param array<string, string> $variants */
function formatArtworkConfiguredCountRange(array $variants): string
{
    $counts = array_values(array_filter(array_map(static fn ($key): ?int => ctype_digit((string) $key) ? (int) $key : null, array_keys($variants)), static fn ($value): bool => $value !== null));
    if ($counts === []) {
        return '';
    }
    sort($counts, SORT_NUMERIC);
    return ' Configured range: ' . $counts[0] . '–' . $counts[count($counts) - 1] . '.';
}

function normalizeArtworkErrorCode($value): ?string
{
    $normalized = is_string($value) ? strtolower(trim($value)) : '';
    return $normalized === '' ? null : preg_replace('/[^a-z0-9_]/', '', $normalized);
}

function formatArtworkErrorCode(string $errorCode): string
{
    return ucwords(str_replace('_', ' ', $errorCode));
}
