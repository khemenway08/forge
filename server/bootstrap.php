<?php
declare(strict_types=1);

namespace Forge\Server;

require_once __DIR__ . '/lib/api-response.php';
require_once __DIR__ . '/lib/order-handler.php';
require_once __DIR__ . '/lib/order-payload.php';
require_once __DIR__ . '/lib/database.php';
require_once __DIR__ . '/lib/order-repository.php';
require_once __DIR__ . '/lib/staff-auth.php';
require_once __DIR__ . '/lib/staff-order-repository.php';

function buildOrderHandlerFromEnvironment(?callable $unexpectedExceptionReporter = null): OrderHandler
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    $repository = new PdoOrderRepository($pdo);

    return new OrderHandler($repository, null, $unexpectedExceptionReporter);
}

function buildStaffOrderRepositoryFromEnvironment(): PdoStaffOrderRepository
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    return new PdoStaffOrderRepository($pdo);
}

function loadPrivateStaffPinHashFromEnvironment(): string
{
    return resolveStaffPinHash(
        [
            'FORGE_STAFF_PIN_HASH' => getenv('FORGE_STAFF_PIN_HASH'),
        ],
        loadPrivateStaffAuthConfig()
    );
}

/**
 * @return array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed, FORGE_STAFF_PIN_HASH?: mixed}
 */
function loadPrivateServerConfig(): array
{
    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        return [];
    }

    $config = require $configPath;
    return normalizePrivateServerConfig($config);
}

/**
 * @return array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed}
 */
function loadPrivateDatabaseConfig(): array
{
    return filterPrivateServerConfigKeys(loadPrivateServerConfig(), [
        'FORGE_DB_DSN',
        'FORGE_DB_USER',
        'FORGE_DB_PASSWORD',
    ]);
}

/**
 * @return array{FORGE_STAFF_PIN_HASH?: mixed}
 */
function loadPrivateStaffAuthConfig(): array
{
    return filterPrivateServerConfigKeys(loadPrivateServerConfig(), [
        'FORGE_STAFF_PIN_HASH',
    ]);
}

/**
 * @param mixed $config
 * @return array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed, FORGE_STAFF_PIN_HASH?: mixed}
 */
function normalizePrivateServerConfig($config): array
{
    if (!is_array($config)) {
        throw new StorageUnavailableException('Forge order storage is currently unavailable.');
    }

    $approvedKeys = [
        'FORGE_DB_DSN',
        'FORGE_DB_USER',
        'FORGE_DB_PASSWORD',
        'FORGE_STAFF_PIN_HASH',
    ];

    $normalized = [];
    foreach ($approvedKeys as $key) {
        if (array_key_exists($key, $config)) {
            $normalized[$key] = $config[$key];
        }
    }

    return $normalized;
}

/**
 * @param array<string, mixed> $config
 * @param array<int, string> $approvedKeys
 * @return array<string, mixed>
 */
function filterPrivateServerConfigKeys(array $config, array $approvedKeys): array
{
    $normalized = [];
    foreach ($approvedKeys as $key) {
        if (array_key_exists($key, $config)) {
            $normalized[$key] = $config[$key];
        }
    }

    return $normalized;
}

/**
 * @param mixed $config
 * @return array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed}
 */
function normalizePrivateDatabaseConfig($config): array
{
    return filterPrivateServerConfigKeys(normalizePrivateServerConfig($config), [
        'FORGE_DB_DSN',
        'FORGE_DB_USER',
        'FORGE_DB_PASSWORD',
    ]);
}
