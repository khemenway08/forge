<?php
declare(strict_types=1);

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
    forge_log_unexpected_exception($exception);
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

function forge_log_unexpected_exception(\Throwable $exception): void
{
    $segments = [];
    $current = $exception;
    $depth = 0;

    while ($current !== null && $depth < 3) {
        $label = $depth === 0 ? 'exception' : 'previous_' . $depth;
        $segments[] = sprintf(
            '%s[class=%s code=%s message=%s file=%s line=%d]',
            $label,
            get_class($current),
            forge_normalize_exception_code($current->getCode()),
            forge_normalize_exception_message($current->getMessage()),
            basename((string) $current->getFile()),
            (int) $current->getLine()
        );
        $current = $current->getPrevious();
        $depth++;
    }

    error_log('Forge orders endpoint unexpected exception: ' . implode(' ', $segments));
}

/**
 * @param int|string $code
 */
function forge_normalize_exception_code($code): string
{
    if (is_int($code) || is_string($code)) {
        return (string) $code;
    }

    return '';
}

function forge_normalize_exception_message(string $message): string
{
    $normalized = preg_replace('/\s+/u', ' ', trim($message));
    if (!is_string($normalized)) {
        $normalized = '';
    }

    if (function_exists('mb_substr')) {
        return mb_substr($normalized, 0, 500);
    }

    return substr($normalized, 0, 500);
}

function forge_resolve_bootstrap_path(): ?string
{
    $candidates = [];

    $serverRoot = getenv('FORGE_SERVER_ROOT');
    if (is_string($serverRoot)) {
        $trimmedServerRoot = trim($serverRoot);
        if ($trimmedServerRoot !== '') {
            $candidates[] = rtrim($trimmedServerRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'bootstrap.php';
        }
    }

    $candidates[] = dirname(__DIR__, 3) . '/server/bootstrap.php';
    $candidates[] = dirname(__DIR__, 4) . '/forge_server_test/bootstrap.php';

    foreach ($candidates as $candidate) {
        if (is_string($candidate) && $candidate !== '' && is_file($candidate) && is_readable($candidate)) {
            return $candidate;
        }
    }

    return null;
}
