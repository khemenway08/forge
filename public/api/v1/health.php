<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode([
        'application' => 'Forge',
        'api_version' => '1',
        'status' => 'error',
        'error' => [
            'code' => 'method_not_allowed',
            'message' => 'This endpoint accepts GET requests only.',
        ],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

http_response_code(200);

echo json_encode([
    'application' => 'Forge',
    'api_version' => '1',
    'status' => 'ok',
    'server_time' => gmdate('c'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
