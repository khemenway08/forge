<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$bootstrapPath = forge_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Forge event status is currently unavailable.',
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

    $requestedPublicOrderToken = isset($_GET['event']) && is_string($_GET['event'])
        ? trim($_GET['event'])
        : null;
    $repository = \Forge\Server\buildEventRepositoryFromEnvironment();
    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success($repository->getPublicOrderingStatus($requestedPublicOrderToken))
    );
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Forge event status is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_log_unexpected_exception($exception, $bootstrapPath);
    forge_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Forge event status is currently unavailable.',
            ],
        ]
    );
}
