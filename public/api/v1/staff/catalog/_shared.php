<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/_endpoint.php';

function forge_design_catalog_send_bootstrap_error(string $message): void
{
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => $message,
            ],
        ]
    );
}

/**
 * @param array<string, string> $fieldErrors
 */
function forge_design_catalog_send_validation_error(array $fieldErrors, string $message = 'Review the design fields and try again.'): void
{
    http_response_code(422);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'invalid_request',
                'message' => $message,
                'fields' => $fieldErrors,
            ],
        ],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
}

function forge_design_catalog_resolve_upload_directory(): string
{
    return dirname(__DIR__, 4) . '/uploads/design-thumbnails';
}

function forge_design_catalog_build_thumbnail_relative_path(string $fileName): string
{
    return '/uploads/design-thumbnails/' . ltrim($fileName, '/');
}

function forge_design_catalog_is_managed_thumbnail_path(?string $thumbnailPath): bool
{
    if (!is_string($thumbnailPath)) {
        return false;
    }

    return str_starts_with($thumbnailPath, '/uploads/design-thumbnails/');
}

function forge_design_catalog_resolve_absolute_thumbnail_path(string $thumbnailPath): ?string
{
    if (!forge_design_catalog_is_managed_thumbnail_path($thumbnailPath)) {
        return null;
    }

    $relativePath = substr($thumbnailPath, strlen('/uploads/design-thumbnails/'));
    if ($relativePath === false || $relativePath === '' || str_contains($relativePath, '..')) {
        return null;
    }

    return forge_design_catalog_resolve_upload_directory() . '/' . $relativePath;
}
