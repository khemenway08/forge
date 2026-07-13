<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

echo json_encode([
    'application' => 'Forge',
    'status' => 'ok',
    'php_version' => PHP_VERSION,
    'timestamp' => gmdate('c'),
], JSON_PRETTY_PRINT);
