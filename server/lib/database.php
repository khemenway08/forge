<?php
declare(strict_types=1);

namespace Forge\Server;

use PDO;
use PDOException;

final class DatabaseConnectionFactory
{
    public static function createFromEnvironment(): PDO
    {
        $dsn = self::getRequiredEnvironmentValue('FORGE_DB_DSN');
        $user = self::getRequiredEnvironmentValue('FORGE_DB_USER');
        $password = self::getRequiredEnvironmentValue('FORGE_DB_PASSWORD', true);

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

    private static function getRequiredEnvironmentValue(string $name, bool $allowBlank = false): string
    {
        $value = getenv($name);
        if ($value === false) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.');
        }

        $stringValue = trim((string) $value);
        if ($stringValue === '' && !$allowBlank) {
            throw new StorageUnavailableException('Forge order storage is currently unavailable.');
        }

        return $allowBlank ? (string) $value : $stringValue;
    }
}
