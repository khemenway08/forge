<?php
declare(strict_types=1);

require_once __DIR__ . '/_shared.php';

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Catalog ordering is currently unavailable.',
            ],
        ]
    );
    exit;
}

try {
    require_once $bootstrapPath;

    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);

    if ($method !== 'POST') {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts POST requests only.'),
            ['Allow' => 'POST']
        );
        exit;
    }

    $contentType = $_SERVER['CONTENT_TYPE'] ?? null;
    if (!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType) ? $contentType : null)) {
        \Forge\Server\ApiResponse::send(
            415,
            \Forge\Server\ApiResponse::error('unsupported_media_type', 'The request must use Content-Type: application/json.')
        );
        exit;
    }

    $rawBody = file_get_contents('php://input');
    $payload = \Forge\Server\OrderPayload::decodeJsonObject($rawBody === false ? '' : $rawBody);
    $resourceType = is_string($payload['resource_type'] ?? null) ? trim($payload['resource_type']) : '';
    $orderedIds = is_array($payload['ordered_ids'] ?? null) ? array_values($payload['ordered_ids']) : null;

    if ($orderedIds === null) {
        forge_catalog_sort_order_send_validation_error('Reload the catalog and try again.');
        exit;
    }

    switch ($resourceType) {
        case 'designs':
            $repository = \Forge\Server\buildStaffDesignCatalogRepositoryFromEnvironment();
            $records = $repository->reorderDesigns($orderedIds);
            break;
        case 'hats':
            $repository = \Forge\Server\buildStaffHatCatalogRepositoryFromEnvironment();
            $records = $repository->reorderHats($orderedIds);
            break;
        case 'materials':
            $repository = \Forge\Server\buildStaffMaterialCatalogRepositoryFromEnvironment();
            $records = $repository->reorderMaterials($orderedIds);
            break;
        case 'finished_hats':
            $repository = \Forge\Server\buildStaffFinishedHatCatalogRepositoryFromEnvironment();
            $records = $repository->reorderFinishedHats($orderedIds);
            break;
        default:
            forge_catalog_sort_order_send_validation_error('Reload the catalog and try again.');
            exit;
    }

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'resource_type' => $resourceType,
            'records' => array_map(
                static function ($record): array {
                    return [
                        'id' => is_string($record['id'] ?? null) ? trim($record['id']) : '',
                        'sort_order' => max(0, (int) ($record['sort_order'] ?? 0)),
                    ];
                },
                $records
            ),
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\StaffCatalogSortOrderConflictException $exception) {
    // Stale complete-set reorder conflicts return the catalog_order_conflict safe code.
    forge_catalog_sort_order_send_conflict_error($exception->getMessage());
} catch (\Forge\Server\StaffCatalogSortOrderValidationException $exception) {
    forge_catalog_sort_order_send_validation_error($exception->getMessage());
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Catalog ordering is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff catalog reorder endpoint');
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Catalog ordering is currently unavailable.',
            ],
        ]
    );
}
