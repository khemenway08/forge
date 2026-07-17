<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class DatabaseConnectionFactory
{
    /**
     * @param array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed} $fallbackConfig
     */
    public static function createFromEnvironment(array $fallbackConfig = []): PDO
    {
        $config = self::resolveConfiguration(self::readEnvironmentConfiguration(), $fallbackConfig);
        $dsn = $config['FORGE_DB_DSN'];
        $user = $config['FORGE_DB_USER'];
        $password = $config['FORGE_DB_PASSWORD'];

        try {
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];

            $pdo = new PDO($dsn, $user, $password, $options);
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");

            return $pdo;
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.', 0, $exception);
        }
    }

    /**
     * @param array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed} $environmentConfig
     * @param array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed} $fallbackConfig
     * @return array{FORGE_DB_DSN: string, FORGE_DB_USER: string, FORGE_DB_PASSWORD: string}
     */
    public static function resolveConfiguration(array $environmentConfig, array $fallbackConfig = []): array
    {
        return [
            'FORGE_DB_DSN' => self::resolveNonEmptyStringValue('FORGE_DB_DSN', $environmentConfig, $fallbackConfig),
            'FORGE_DB_USER' => self::resolveNonEmptyStringValue('FORGE_DB_USER', $environmentConfig, $fallbackConfig),
            'FORGE_DB_PASSWORD' => self::resolveStringValue('FORGE_DB_PASSWORD', $environmentConfig, $fallbackConfig),
        ];
    }

    /**
     * @return array{FORGE_DB_DSN: mixed, FORGE_DB_USER: mixed, FORGE_DB_PASSWORD: mixed}
     */
    private static function readEnvironmentConfiguration(): array
    {
        return [
            'FORGE_DB_DSN' => getenv('FORGE_DB_DSN'),
            'FORGE_DB_USER' => getenv('FORGE_DB_USER'),
            'FORGE_DB_PASSWORD' => getenv('FORGE_DB_PASSWORD'),
        ];
    }

    /**
     * @param array<string, mixed> $environmentConfig
     * @param array<string, mixed> $fallbackConfig
     */
    private static function resolveNonEmptyStringValue(string $name, array $environmentConfig, array $fallbackConfig): string
    {
        $environmentValue = self::readStringValue($environmentConfig, $name);
        if ($environmentValue !== null) {
            $trimmedEnvironmentValue = trim($environmentValue);
            if ($trimmedEnvironmentValue !== '') {
                return $trimmedEnvironmentValue;
            }
        }

        $fallbackValue = self::readStringValue($fallbackConfig, $name);
        if ($fallbackValue !== null) {
            $trimmedFallbackValue = trim($fallbackValue);
            if ($trimmedFallbackValue !== '') {
                return $trimmedFallbackValue;
            }
        }

        throw new StorageUnavailableException('Forge order storage is currently unavailable.');
    }

    /**
     * @param array<string, mixed> $environmentConfig
     * @param array<string, mixed> $fallbackConfig
     */
    private static function resolveStringValue(string $name, array $environmentConfig, array $fallbackConfig): string
    {
        $environmentValue = self::readStringValue($environmentConfig, $name);
        if ($environmentValue !== null && trim($environmentValue) !== '') {
            return $environmentValue;
        }

        $fallbackValue = self::readStringValue($fallbackConfig, $name);
        if ($fallbackValue !== null) {
            return $fallbackValue;
        }

        throw new StorageUnavailableException('Forge order storage is currently unavailable.');
    }

    /**
     * @param array<string, mixed> $source
     */
    private static function readStringValue(array $source, string $name): ?string
    {
        if (!array_key_exists($name, $source)) {
            return null;
        }

        $value = $source[$name];
        if (!is_string($value)) {
            return null;
        }

        return $value;
    }
}
