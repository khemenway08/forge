<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';

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
                'message' => 'Production tray retrieval is currently unavailable.',
            ],
        ]
    );
    exit;
}

try {
    require_once $bootstrapPath;

    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if ($method !== 'GET') {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET requests only.'),
            ['Allow' => 'GET']
        );
        exit;
    }

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);

    $repository = \Forge\Server\buildStaffOrderRepositoryFromEnvironment();
    $trays = $repository->listTrays();

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'trays' => $trays,
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\ProductionTrayConfigurationException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'no_trays_configured',
                'message' => 'No production trays are configured.',
            ],
        ]
    );
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Production tray retrieval is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff trays endpoint');
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Production tray retrieval is currently unavailable.',
            ],
        ]
    );
}
