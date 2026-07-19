<?php
declare(strict_types=1);

function forge_staff_resolve_bootstrap_path(): ?string
{
    $candidates = [];

    $serverRoot = getenv('FORGE_SERVER_ROOT');
    if (is_string($serverRoot)) {
        $trimmedServerRoot = trim($serverRoot);
        if ($trimmedServerRoot !== '') {
            $candidates[] = rtrim($trimmedServerRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'bootstrap.php';
        }
    }

    $candidates[] = dirname(__DIR__, 4) . '/server/bootstrap.php';
    $candidates[] = dirname(__DIR__, 5) . '/forge_server_test/bootstrap.php';

    foreach ($candidates as $candidate) {
        if (is_string($candidate) && $candidate !== '' && is_file($candidate) && is_readable($candidate)) {
            return $candidate;
        }
    }

    return null;
}

function forge_staff_send_fallback_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
