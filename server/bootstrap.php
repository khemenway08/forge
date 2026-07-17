<?php
declare(strict_types=1);

namespace Forge\Server;

require_once __DIR__ . '/lib/api-response.php';
require_once __DIR__ . '/lib/order-handler.php';
require_once __DIR__ . '/lib/order-payload.php';
require_once __DIR__ . '/lib/database.php';
require_once __DIR__ . '/lib/order-repository.php';

function buildOrderHandlerFromEnvironment(): OrderHandler
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    $repository = new PdoOrderRepository($pdo);

    return new OrderHandler($repository);
}

/**
 * @return array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed}
 */
function loadPrivateDatabaseConfig(): array
{
    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        return [];
    }

    $config = require $configPath;
    return normalizePrivateDatabaseConfig($config);
}

/**
 * @param mixed $config
 * @return array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed}
 */
function normalizePrivateDatabaseConfig($config): array
{
    if (!is_array($config)) {
        throw new StorageUnavailableException('Forge order storage is currently unavailable.');
    }

    $approvedKeys = [
        'FORGE_DB_DSN',
        'FORGE_DB_USER',
        'FORGE_DB_PASSWORD',
    ];

    $normalized = [];
    foreach ($approvedKeys as $key) {
        if (array_key_exists($key, $config)) {
            $normalized[$key] = $config[$key];
        }
    }

    return $normalized;
}
