<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class StaffCatalogSortOrderConflictException extends \RuntimeException
{
}

final class StaffCatalogSortOrderValidationException extends \RuntimeException
{
}

const STAFF_CATALOG_SORT_ORDER_STEP = 1000;

function getNextStaffCatalogSortOrder(PDO $pdo, string $tableName): int
{
    $allowedTables = [
        'forge_catalog_designs',
        'forge_catalog_hats',
        'forge_catalog_materials',
        'forge_catalog_finished_hats',
    ];

    if (!in_array($tableName, $allowedTables, true)) {
        throw new StaffCatalogSortOrderValidationException('Catalog ordering is currently unavailable.');
    }

    try {
        $statement = $pdo->query(sprintf('SELECT COALESCE(MAX(sort_order), 0) FROM %s', $tableName));
        $maxSortOrder = $statement ? (int) $statement->fetchColumn() : 0;
    } catch (PDOException $exception) {
        throw new StorageUnavailableException('Catalog ordering is currently unavailable.', 0, $exception);
    }

    if ($maxSortOrder < 0) {
        $maxSortOrder = 0;
    }

    $bucket = (int) floor($maxSortOrder / STAFF_CATALOG_SORT_ORDER_STEP);
    return ($bucket + 1) * STAFF_CATALOG_SORT_ORDER_STEP;
}

/**
 * @param array<int, mixed> $orderedIds
 */
function saveStaffCatalogSortOrder(PDO $pdo, string $tableName, array $orderedIds): void
{
    $allowedTables = [
        'forge_catalog_designs',
        'forge_catalog_hats',
        'forge_catalog_materials',
        'forge_catalog_finished_hats',
    ];

    if (!in_array($tableName, $allowedTables, true)) {
        throw new StaffCatalogSortOrderValidationException('Catalog ordering is currently unavailable.');
    }

    $normalizedIds = [];
    foreach ($orderedIds as $orderedId) {
        $normalizedId = is_string($orderedId) ? trim($orderedId) : '';
        if ($normalizedId === '') {
            throw new StaffCatalogSortOrderValidationException('Reload the catalog and try again.');
        }
        if (in_array($normalizedId, $normalizedIds, true)) {
            throw new StaffCatalogSortOrderValidationException('Reload the catalog and try again.');
        }
        $normalizedIds[] = $normalizedId;
    }

    try {
        $statement = $pdo->query(sprintf('SELECT id FROM %s', $tableName));
        $rows = $statement ? $statement->fetchAll(PDO::FETCH_COLUMN) : [];
    } catch (PDOException $exception) {
        throw new StorageUnavailableException('Catalog ordering is currently unavailable.', 0, $exception);
    }

    $currentIds = [];
    foreach (is_array($rows) ? $rows : [] as $rowId) {
        $currentIds[] = is_string($rowId) ? trim($rowId) : '';
    }
    $currentIds = array_values(array_filter($currentIds, static fn ($value): bool => $value !== ''));

    sort($currentIds);
    $expectedIds = $normalizedIds;
    sort($expectedIds);

    if ($currentIds !== $expectedIds) {
        throw new StaffCatalogSortOrderConflictException('The catalog changed on another device. Reload and try again.');
    }

    try {
        $pdo->beginTransaction();
        $statement = $pdo->prepare(sprintf('UPDATE %s SET sort_order = :sort_order WHERE id = :id', $tableName));
        foreach ($normalizedIds as $index => $id) {
            $statement->execute([
                ':sort_order' => ($index + 1) * STAFF_CATALOG_SORT_ORDER_STEP,
                ':id' => $id,
            ]);
        }
        $pdo->commit();
    } catch (PDOException $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw new StorageUnavailableException('Catalog ordering is currently unavailable.', 0, $exception);
    } catch (\Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}
