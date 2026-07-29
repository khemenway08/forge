<?php
declare(strict_types=1);

namespace Forge\Server;

if (is_file(__DIR__ . '/vendor/autoload.php')) {
    require_once __DIR__ . '/vendor/autoload.php';
}

require_once __DIR__ . '/lib/api-response.php';
require_once __DIR__ . '/lib/email-renderer.php';
require_once __DIR__ . '/lib/email-service.php';
require_once __DIR__ . '/lib/email-smoke-test.php';
require_once __DIR__ . '/lib/email-transport.php';
require_once __DIR__ . '/lib/order-handler.php';
require_once __DIR__ . '/lib/order-payload.php';
require_once __DIR__ . '/lib/database.php';
require_once __DIR__ . '/lib/event-repository.php';
require_once __DIR__ . '/lib/outbound-message-repository.php';
require_once __DIR__ . '/lib/order-repository.php';
require_once __DIR__ . '/lib/staff-auth.php';
require_once __DIR__ . '/lib/staff-order-repository.php';
require_once __DIR__ . '/lib/staff-catalog-sort-order.php';
require_once __DIR__ . '/lib/staff-design-catalog-importer.php';
require_once __DIR__ . '/lib/staff-design-catalog-repository.php';
require_once __DIR__ . '/lib/staff-hat-catalog-importer.php';
require_once __DIR__ . '/lib/staff-hat-catalog-repository.php';
require_once __DIR__ . '/lib/staff-hat-catalog-metadata-backfill.php';
require_once __DIR__ . '/lib/staff-finished-hat-catalog-importer.php';
require_once __DIR__ . '/lib/staff-finished-hat-assisted-linker.php';
require_once __DIR__ . '/lib/staff-finished-hat-catalog-repository.php';
require_once __DIR__ . '/lib/staff-material-catalog-importer.php';
require_once __DIR__ . '/lib/staff-material-catalog-repository.php';

function buildOrderHandlerFromEnvironment(?callable $unexpectedExceptionReporter = null): OrderHandler
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    $repository = new PdoOrderRepository($pdo);
    $outboundMessageRepository = new PdoOutboundMessageRepository($pdo);
    $transport = new NullEmailTransport();
    try {
        $transport = buildEmailTransportFromEnvironment();
    } catch (EmailConfigurationException $exception) {
        unset($exception);
    }
    $emailService = new EmailService(
        $outboundMessageRepository,
        $transport,
        new EmailRenderer(loadPrivateEmailConfig()),
        loadPrivateEmailConfig()
    );

    return new OrderHandler($repository, $emailService, null, $unexpectedExceptionReporter);
}

function buildStaffOrderRepositoryFromEnvironment(): PdoStaffOrderRepository
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    return new PdoStaffOrderRepository($pdo, loadPrivateTrayConfig(), new PdoOutboundMessageRepository($pdo));
}

function buildEventRepositoryFromEnvironment(): PdoEventRepository
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    return new PdoEventRepository($pdo);
}

function buildStaffDesignCatalogRepositoryFromEnvironment(): PdoStaffDesignCatalogRepository
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    return new PdoStaffDesignCatalogRepository($pdo);
}

function buildStaffHatCatalogRepositoryFromEnvironment(): PdoStaffHatCatalogRepository
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    return new PdoStaffHatCatalogRepository($pdo);
}

function buildStaffFinishedHatCatalogRepositoryFromEnvironment(): PdoStaffFinishedHatCatalogRepository
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    return new PdoStaffFinishedHatCatalogRepository($pdo);
}

function buildStaffMaterialCatalogRepositoryFromEnvironment(): PdoStaffMaterialCatalogRepository
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment(loadPrivateDatabaseConfig());
    return new PdoStaffMaterialCatalogRepository($pdo);
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
 * @return array{
 *   FORGE_DB_DSN?: mixed,
 *   FORGE_DB_USER?: mixed,
 *   FORGE_DB_PASSWORD?: mixed,
 *   FORGE_STAFF_PIN_HASH?: mixed,
 *   FORGE_TRAY_NUMBERS?: mixed,
 *   FORGE_EMAIL_ENABLED?: mixed,
 *   FORGE_EMAIL_TRANSPORT?: mixed,
 *   FORGE_EMAIL_HOST?: mixed,
 *   FORGE_EMAIL_PORT?: mixed,
 *   FORGE_EMAIL_ENCRYPTION?: mixed,
 *   FORGE_EMAIL_USERNAME?: mixed,
 *   FORGE_EMAIL_PASSWORD?: mixed,
 *   FORGE_EMAIL_FROM_ADDRESS?: mixed,
 *   FORGE_EMAIL_FROM_NAME?: mixed,
 *   FORGE_EMAIL_REPLY_TO?: mixed,
 *   FORGE_EMAIL_CONNECT_TIMEOUT?: mixed,
 *   FORGE_EMAIL_SEND_TIMEOUT?: mixed,
 *   FORGE_FACEBOOK_URL?: mixed,
 *   FORGE_INSTAGRAM_URL?: mixed,
 *   FORGE_EMAIL_SIGNUP_URL?: mixed
 * }
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
 * @return array{FORGE_TRAY_NUMBERS?: mixed}
 */
function loadPrivateTrayConfig(): array
{
    $config = loadPrivateServerConfig();
    $resolvedValue = resolvePrivateTrayNumbersConfigValue(getenv('FORGE_TRAY_NUMBERS'), $config);

    if ($resolvedValue === null) {
        return [];
    }

    return [
        'FORGE_TRAY_NUMBERS' => $resolvedValue,
    ];
}

/**
 * @return array{
 *   FORGE_EMAIL_ENABLED?: mixed,
 *   FORGE_EMAIL_TRANSPORT?: mixed,
 *   FORGE_EMAIL_HOST?: mixed,
 *   FORGE_EMAIL_PORT?: mixed,
 *   FORGE_EMAIL_ENCRYPTION?: mixed,
 *   FORGE_EMAIL_USERNAME?: mixed,
 *   FORGE_EMAIL_PASSWORD?: mixed,
 *   FORGE_EMAIL_FROM_ADDRESS?: mixed,
 *   FORGE_EMAIL_FROM_NAME?: mixed,
 *   FORGE_EMAIL_REPLY_TO?: mixed,
 *   FORGE_EMAIL_CONNECT_TIMEOUT?: mixed,
 *   FORGE_EMAIL_SEND_TIMEOUT?: mixed,
 *   FORGE_FACEBOOK_URL?: mixed,
 *   FORGE_INSTAGRAM_URL?: mixed,
 *   FORGE_EMAIL_SIGNUP_URL?: mixed
 * }
 */
function loadPrivateEmailConfig(): array
{
    $config = loadPrivateServerConfig();
    $resolved = [];
    foreach ([
        'FORGE_EMAIL_ENABLED',
        'FORGE_EMAIL_TRANSPORT',
        'FORGE_EMAIL_HOST',
        'FORGE_EMAIL_PORT',
        'FORGE_EMAIL_ENCRYPTION',
        'FORGE_EMAIL_USERNAME',
        'FORGE_EMAIL_PASSWORD',
        'FORGE_EMAIL_FROM_ADDRESS',
        'FORGE_EMAIL_FROM_NAME',
        'FORGE_EMAIL_REPLY_TO',
        'FORGE_EMAIL_CONNECT_TIMEOUT',
        'FORGE_EMAIL_SEND_TIMEOUT',
        'FORGE_FACEBOOK_URL',
        'FORGE_INSTAGRAM_URL',
        'FORGE_EMAIL_SIGNUP_URL',
    ] as $key) {
        $value = resolvePrivateEmailConfigValue(getenv($key), $config[$key] ?? null);
        if ($value !== null) {
            $resolved[$key] = $value;
        }
    }

    return $resolved;
}

/**
 * @param mixed $config
 * @return array{
 *   FORGE_DB_DSN?: mixed,
 *   FORGE_DB_USER?: mixed,
 *   FORGE_DB_PASSWORD?: mixed,
 *   FORGE_STAFF_PIN_HASH?: mixed,
 *   FORGE_TRAY_NUMBERS?: mixed,
 *   FORGE_EMAIL_ENABLED?: mixed,
 *   FORGE_EMAIL_TRANSPORT?: mixed,
 *   FORGE_EMAIL_HOST?: mixed,
 *   FORGE_EMAIL_PORT?: mixed,
 *   FORGE_EMAIL_ENCRYPTION?: mixed,
 *   FORGE_EMAIL_USERNAME?: mixed,
 *   FORGE_EMAIL_PASSWORD?: mixed,
 *   FORGE_EMAIL_FROM_ADDRESS?: mixed,
 *   FORGE_EMAIL_FROM_NAME?: mixed,
 *   FORGE_EMAIL_REPLY_TO?: mixed,
 *   FORGE_EMAIL_CONNECT_TIMEOUT?: mixed,
 *   FORGE_EMAIL_SEND_TIMEOUT?: mixed,
 *   FORGE_FACEBOOK_URL?: mixed,
 *   FORGE_INSTAGRAM_URL?: mixed,
 *   FORGE_EMAIL_SIGNUP_URL?: mixed
 * }
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
        'FORGE_TRAY_NUMBERS',
        'FORGE_EMAIL_ENABLED',
        'FORGE_EMAIL_TRANSPORT',
        'FORGE_EMAIL_HOST',
        'FORGE_EMAIL_PORT',
        'FORGE_EMAIL_ENCRYPTION',
        'FORGE_EMAIL_USERNAME',
        'FORGE_EMAIL_PASSWORD',
        'FORGE_EMAIL_FROM_ADDRESS',
        'FORGE_EMAIL_FROM_NAME',
        'FORGE_EMAIL_REPLY_TO',
        'FORGE_EMAIL_CONNECT_TIMEOUT',
        'FORGE_EMAIL_SEND_TIMEOUT',
        'FORGE_FACEBOOK_URL',
        'FORGE_INSTAGRAM_URL',
        'FORGE_EMAIL_SIGNUP_URL',
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
 * @param mixed $environmentValue
 * @param array<string, mixed> $config
 */
function resolvePrivateTrayNumbersConfigValue($environmentValue, array $config): ?string
{
    if (is_string($environmentValue)) {
        $normalizedEnvironmentValue = trim($environmentValue);
        if ($normalizedEnvironmentValue !== '') {
            return $normalizedEnvironmentValue;
        }
    }

    $configValue = $config['FORGE_TRAY_NUMBERS'] ?? null;
    if (!is_string($configValue)) {
        return null;
    }

    $normalizedConfigValue = trim($configValue);
    return $normalizedConfigValue === '' ? null : $normalizedConfigValue;
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

/**
 * @param mixed $environmentValue
 * @param mixed $configValue
 * @return bool|int|string|null
 */
function resolvePrivateEmailConfigValue($environmentValue, $configValue)
{
    if (is_string($environmentValue)) {
        $normalizedEnvironmentValue = trim($environmentValue);
        if ($normalizedEnvironmentValue !== '') {
            return $normalizedEnvironmentValue;
        }
    }

    if (is_bool($configValue) || is_int($configValue)) {
        return $configValue;
    }

    if (!is_string($configValue)) {
        return null;
    }

    $normalizedConfigValue = trim($configValue);
    return $normalizedConfigValue === '' ? null : $normalizedConfigValue;
}
