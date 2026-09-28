<?php
declare(strict_types=1);

namespace Forge\Server;

use JsonException;
use PDO;
use PDOException;

final class PdoArtworkTemplateRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, array<string, mixed>> */
    public function listActiveRegistrationsByProduct(): array
    {
        try {
            $statement = $this->pdo->query(
                "SELECT
                    r.registration_id,
                    r.product_definition_id,
                    r.family_id,
                    r.selector_type,
                    r.allowed_variants_json,
                    r.launcher_family_id,
                    r.artwork_label,
                    r.configuration_revision,
                    r.configuration_digest,
                    r.registration_status,
                    v.variant_key,
                    v.validation_status,
                    v.validated_at,
                    v.launcher_profile_label,
                    v.configuration_revision AS validation_revision,
                    v.configuration_digest AS validation_digest,
                    v.validation_error_code
                 FROM forge_artwork_template_registrations r
                 LEFT JOIN forge_artwork_template_validations v
                   ON v.registration_id = r.registration_id
                 WHERE r.registration_status = 'active'
                 ORDER BY r.product_definition_id, v.variant_key"
            );
            $rows = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge artwork-template storage is currently unavailable.', 0, $exception);
        }

        $registrations = [];
        foreach (is_array($rows) ? $rows : [] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $productId = trim((string) ($row['product_definition_id'] ?? ''));
            $registrationId = trim((string) ($row['registration_id'] ?? ''));
            if ($productId === '' || $registrationId === '') {
                continue;
            }
            if (!isset($registrations[$productId])) {
                $registrations[$productId] = [
                    'registration_id' => $registrationId,
                    'product_definition_id' => $productId,
                    'family_id' => trim((string) ($row['family_id'] ?? '')),
                    'selector_type' => trim((string) ($row['selector_type'] ?? '')),
                    'allowed_variants' => decodeArtworkAllowedVariants($row['allowed_variants_json'] ?? null),
                    'launcher_family_id' => trim((string) ($row['launcher_family_id'] ?? '')),
                    'artwork_label' => trim((string) ($row['artwork_label'] ?? '')),
                    'configuration_revision' => (int) ($row['configuration_revision'] ?? 0),
                    'configuration_digest' => strtolower(trim((string) ($row['configuration_digest'] ?? ''))),
                    'registration_status' => trim((string) ($row['registration_status'] ?? '')),
                    'validations' => [],
                ];
            }
            $variantKey = normalizeArtworkVariantKey((string) ($row['variant_key'] ?? ''));
            if ($variantKey !== '') {
                $registrations[$productId]['validations'][$variantKey] = [
                    'validation_status' => trim((string) ($row['validation_status'] ?? '')),
                    'validated_at' => normalizeArtworkValidationTimestamp($row['validated_at'] ?? null),
                    'launcher_profile_label' => trim((string) ($row['launcher_profile_label'] ?? '')),
                    'configuration_revision' => (int) ($row['validation_revision'] ?? 0),
                    'configuration_digest' => strtolower(trim((string) ($row['validation_digest'] ?? ''))),
                    'validation_error_code' => normalizeArtworkErrorCode($row['validation_error_code'] ?? null),
                ];
            }
        }

        return $registrations;
    }
}

/** @return array<string, string> */
function decodeArtworkAllowedVariants($json): array
{
    if (!is_string($json) || trim($json) === '') {
        return [];
    }
    try {
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new StorageUnavailableException('Forge artwork-template configuration is invalid.', 0, $exception);
    }
    return normalizeArtworkAllowedVariants($decoded);
}

function normalizeArtworkValidationTimestamp($value): ?string
{
    $normalized = is_string($value) ? trim($value) : '';
    if ($normalized === '') {
        return null;
    }
    if (strpos($normalized, 'T') !== false) {
        return $normalized;
    }
    return OrderPayload::databaseDateTimeToIso8601($normalized);
}
