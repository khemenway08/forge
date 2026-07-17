<?php
declare(strict_types=1);

namespace Forge\Server;

final class ApiResponse
{
    private const APPLICATION = 'Forge';
    private const API_VERSION = '1';

    public static function success(array $data): array
    {
        return [
            'application' => self::APPLICATION,
            'api_version' => self::API_VERSION,
            'status' => 'ok',
            'data' => $data,
        ];
    }

    public static function error(string $code, string $message): array
    {
        return [
            'application' => self::APPLICATION,
            'api_version' => self::API_VERSION,
            'status' => 'error',
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
        ];
    }

    public static function send(int $statusCode, array $payload, array $extraHeaders = []): void
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        foreach ($extraHeaders as $headerName => $headerValue) {
            header($headerName . ': ' . $headerValue);
        }

        echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
