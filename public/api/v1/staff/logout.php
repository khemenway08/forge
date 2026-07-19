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
                'message' => 'Staff authentication is currently unavailable.',
            ],
        ]
    );
    exit;
}

try {
    require_once $bootstrapPath;

    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if ($method !== 'POST') {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts POST requests only.'),
            ['Allow' => 'POST']
        );
        exit;
    }

    \Forge\Server\logoutStaffSession($_SERVER);
    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'authenticated' => false,
        ])
    );
} catch (\Throwable $exception) {
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Staff authentication is currently unavailable.',
            ],
        ]
    );
}
