<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

ini_set('display_errors', '0');
ini_set('html_errors', '0');
error_reporting(E_ALL);

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
                'message' => 'The Forge server could not store this order.',
            ],
        ]
    );
    exit;
}

try {
    require_once $bootstrapPath;

    if (!function_exists('Forge\\Server\\buildOrderHandlerFromEnvironment')) {
        throw new RuntimeException('Forge bootstrap is unavailable.');
    }

    $handler = \Forge\Server\buildOrderHandlerFromEnvironment(
        static function (\Throwable $exception) use ($bootstrapPath): void {
            forge_log_unexpected_exception($exception, $bootstrapPath);
        }
    );
    $rawBody = file_get_contents('php://input');
    $response = $handler->handleRequest(
        $_SERVER['REQUEST_METHOD'] ?? 'GET',
        $_SERVER['CONTENT_TYPE'] ?? null,
        $rawBody === false ? '' : $rawBody,
        isset($_SERVER['CONTENT_LENGTH']) && is_numeric($_SERVER['CONTENT_LENGTH'])
            ? (int) $_SERVER['CONTENT_LENGTH']
            : null
    );

    \Forge\Server\ApiResponse::send(
        $response['statusCode'],
        $response['body'],
        $response['headers'] ?? []
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
                'message' => 'Forge order storage is currently unavailable.',
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
                'message' => 'The Forge server could not store this order.',
            ],
        ]
    );
}
