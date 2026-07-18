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

function forge_send_fallback_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function forge_log_unexpected_exception(\Throwable $exception, ?string $bootstrapPath = null): void
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
            forge_redact_sensitive_text(forge_normalize_exception_message($current->getMessage())),
            basename((string) $current->getFile()),
            (int) $current->getLine()
        );
        $current = $current->getPrevious();
        $depth++;
    }

    $entry = sprintf(
        '%s Forge orders endpoint unexpected exception: %s',
        gmdate('c'),
        implode(' ', $segments)
    );

    error_log($entry);

    $privateLogPath = forge_resolve_private_exception_log_path($bootstrapPath);
    if ($privateLogPath === null) {
        return;
    }

    $privateLogDirectory = dirname($privateLogPath);
    if (!is_dir($privateLogDirectory)) {
        @mkdir($privateLogDirectory, 0700, true);
    }

    if (!is_dir($privateLogDirectory) || !is_writable($privateLogDirectory)) {
        return;
    }

    if (!file_exists($privateLogPath)) {
        @touch($privateLogPath);
    }

    @chmod($privateLogDirectory, 0700);
    @chmod($privateLogPath, 0600);
    @error_log($entry . PHP_EOL, 3, $privateLogPath);
    @chmod($privateLogPath, 0600);
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

function forge_redact_sensitive_text(string $message): string
{
    $redacted = preg_replace('/mysql:\S+/iu', 'mysql:[redacted]', $message);
    if (!is_string($redacted)) {
        $redacted = $message;
    }

    $patterns = [
        '/\b(password|passwd|pwd)\s*[:=]\s*([^\s;,\]]+)/iu',
        '/\b(password|passwd|pwd)\s+([^\s;,\]]+)/iu',
    ];

    foreach ($patterns as $pattern) {
        $nextValue = preg_replace($pattern, '$1=[redacted]', $redacted);
        if (is_string($nextValue)) {
            $redacted = $nextValue;
        }
    }

    return $redacted;
}

function forge_resolve_private_exception_log_path(?string $bootstrapPath): ?string
{
    if (!is_string($bootstrapPath) || trim($bootstrapPath) === '') {
        return null;
    }

    return dirname($bootstrapPath) . '/logs/orders-error.log';
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
