<?php
declare(strict_types=1);

namespace Forge\Server;

final class StaffAuth
{
    public const SESSION_NAME = 'forge_staff_session';
    public const SESSION_AUTHENTICATED_KEY = 'forge_staff_authenticated';
    public const SESSION_AUTHENTICATED_AT_KEY = 'forge_staff_authenticated_at';
    public const SESSION_SAMESITE = 'Strict';
}

/**
 * @param array{FORGE_STAFF_PIN_HASH?: mixed} $environmentConfig
 * @param array{FORGE_STAFF_PIN_HASH?: mixed} $fallbackConfig
 */
function resolveStaffPinHash(array $environmentConfig, array $fallbackConfig = []): string
{
    $environmentValue = readStaffConfigString($environmentConfig, 'FORGE_STAFF_PIN_HASH');
    if ($environmentValue !== null && trim($environmentValue) !== '') {
        return $environmentValue;
    }

    $fallbackValue = readStaffConfigString($fallbackConfig, 'FORGE_STAFF_PIN_HASH');
    if ($fallbackValue !== null && trim($fallbackValue) !== '') {
        return $fallbackValue;
    }

    throw new StorageUnavailableException('Staff authentication is currently unavailable.');
}

function verifyStaffPin(string $pin, string $pinHash): bool
{
    $normalizedPin = trim($pin);
    if ($normalizedPin === '' || trim($pinHash) === '') {
        return false;
    }

    return password_verify($normalizedPin, $pinHash);
}

/**
 * @param array<string, mixed> $server
 * @return array{lifetime:int,path:string,domain:string,secure:bool,httponly:bool,samesite:string}
 */
function buildStaffSessionCookieParams(array $server = []): array
{
    return [
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => isHttpsRequest($server),
        'httponly' => true,
        'samesite' => StaffAuth::SESSION_SAMESITE,
    ];
}

/**
 * @param array<string, mixed> $server
 */
function startStaffSession(array $server = []): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name(StaffAuth::SESSION_NAME);
    session_set_cookie_params(buildStaffSessionCookieParams($server));

    if (!session_start()) {
        throw new \RuntimeException('Staff session could not be started.');
    }
}

/**
 * @param array<string, mixed> $server
 */
function loginStaffSession(string $pinHash, string $pin, array $server = []): bool
{
    startStaffSession($server);

    if (!verifyStaffPin($pin, $pinHash)) {
        return false;
    }

    if (!session_regenerate_id(true)) {
        throw new \RuntimeException('Staff session could not be secured.');
    }

    $_SESSION[StaffAuth::SESSION_AUTHENTICATED_KEY] = true;
    $_SESSION[StaffAuth::SESSION_AUTHENTICATED_AT_KEY] = gmdate(\DateTimeInterface::ATOM);

    return true;
}

/**
 * @param array<string, mixed> $server
 */
function isStaffSessionAuthenticated(array $server = []): bool
{
    startStaffSession($server);

    return $_SESSION[StaffAuth::SESSION_AUTHENTICATED_KEY] === true;
}

/**
 * @param array<string, mixed> $server
 */
function requireAuthenticatedStaffSession(array $server = []): void
{
    if (!isStaffSessionAuthenticated($server)) {
        throw new ApiProblem(
            401,
            'authentication_required',
            'Staff authentication is required.'
        );
    }
}

/**
 * @param array<string, mixed> $server
 */
function logoutStaffSession(array $server = []): void
{
    startStaffSession($server);
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $cookieParams = buildStaffSessionCookieParams($server);
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $cookieParams['path'],
            'domain' => $cookieParams['domain'],
            'secure' => $cookieParams['secure'],
            'httponly' => $cookieParams['httponly'],
            'samesite' => $cookieParams['samesite'],
        ]);
    }

    session_destroy();
}

/**
 * @param array<string, mixed> $source
 */
function readStaffConfigString(array $source, string $key): ?string
{
    if (!array_key_exists($key, $source)) {
        return null;
    }

    $value = $source[$key];
    return is_string($value) ? $value : null;
}

/**
 * @param array<string, mixed> $server
 */
function isHttpsRequest(array $server = []): bool
{
    $https = strtolower(trim((string) ($server['HTTPS'] ?? '')));
    if ($https !== '' && $https !== 'off' && $https !== '0') {
        return true;
    }

    $forwardedProto = strtolower(trim((string) ($server['HTTP_X_FORWARDED_PROTO'] ?? '')));
    if ($forwardedProto === 'https') {
        return true;
    }

    return (string) ($server['SERVER_PORT'] ?? '') === '443';
}
