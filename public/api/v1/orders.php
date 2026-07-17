<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('html_errors', '0');
error_reporting(E_ALL);

$bootstrapPath = dirname(__DIR__, 3) . '/server/bootstrap.php';

if (!is_file($bootstrapPath)) {
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

    $handler = \Forge\Server\buildOrderHandlerFromEnvironment();
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

function forge_send_fallback_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
