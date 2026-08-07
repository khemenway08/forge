<?php
declare(strict_types=1);

require_once __DIR__ . '/_shared.php';

const FORGE_DESIGN_CATALOG_MAX_UPLOAD_BYTES = 5242880;

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_design_catalog_send_bootstrap_error('Thumbnail upload is currently unavailable.');
    exit;
}

try {
    require_once $bootstrapPath;

    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if ($method !== 'POST') {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts POST requests only.'),
            ['Allow' => 'POST']
        );
        exit;
    }

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);

    $designId = \Forge\Server\normalizeStaffCatalogDesignId($_POST['design_id'] ?? null);
    if ($designId === null) {
        forge_design_catalog_send_validation_error([
            'thumbnail' => 'Choose a valid design before uploading a thumbnail.',
        ]);
        exit;
    }

    if (!isset($_FILES['thumbnail']) || !is_array($_FILES['thumbnail'])) {
        forge_design_catalog_send_validation_error([
            'thumbnail' => 'Choose a PNG, JPEG, or WebP thumbnail to upload.',
        ]);
        exit;
    }

    $upload = $_FILES['thumbnail'];
    $errorCode = isset($upload['error']) ? (int) $upload['error'] : UPLOAD_ERR_NO_FILE;
    if ($errorCode !== UPLOAD_ERR_OK) {
        forge_design_catalog_send_validation_error([
            'thumbnail' => 'Choose a PNG, JPEG, or WebP thumbnail to upload.',
        ]);
        exit;
    }

    $tmpName = is_string($upload['tmp_name'] ?? null) ? $upload['tmp_name'] : '';
    $size = isset($upload['size']) ? (int) $upload['size'] : 0;
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        forge_design_catalog_send_validation_error([
            'thumbnail' => 'Thumbnail upload could not be verified.',
        ]);
        exit;
    }

    if ($size <= 0 || $size > FORGE_DESIGN_CATALOG_MAX_UPLOAD_BYTES) {
        forge_design_catalog_send_validation_error([
            'thumbnail' => 'Thumbnail files must be 5 MB or smaller.',
        ]);
        exit;
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($tmpName);
    $allowedMimeTypes = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];
    if (!is_string($mimeType) || !array_key_exists($mimeType, $allowedMimeTypes)) {
        forge_design_catalog_send_validation_error([
            'thumbnail' => 'Only PNG, JPEG, and WebP thumbnails are allowed.',
        ]);
        exit;
    }

    $uploadDirectory = forge_design_catalog_resolve_upload_directory();
    if (!is_dir($uploadDirectory) && !@mkdir($uploadDirectory, 0775, true) && !is_dir($uploadDirectory)) {
        throw new \RuntimeException('Thumbnail upload directory could not be created.');
    }

    $extension = $allowedMimeTypes[$mimeType];
    $fileName = 'design-' . bin2hex(random_bytes(16)) . '.' . $extension;
    $relativePath = forge_design_catalog_build_thumbnail_relative_path($fileName);
    $absolutePath = $uploadDirectory . '/' . $fileName;

    if (!move_uploaded_file($tmpName, $absolutePath)) {
        throw new \RuntimeException('Thumbnail upload could not be stored.');
    }

    $repository = \Forge\Server\buildStaffDesignCatalogRepositoryFromEnvironment();

    try {
        $result = $repository->updateThumbnailPath($designId, $relativePath);
    } catch (\Throwable $exception) {
        @unlink($absolutePath);
        throw $exception;
    }

    $previousThumbnailPath = is_array($result) ? ($result['previous_thumbnail_path'] ?? null) : null;
    $previousAbsolutePath = is_string($previousThumbnailPath)
        ? forge_design_catalog_resolve_absolute_thumbnail_path($previousThumbnailPath)
        : null;
    if ($previousAbsolutePath !== null && $previousAbsolutePath !== $absolutePath && is_file($previousAbsolutePath)) {
        @unlink($previousAbsolutePath);
    }

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'design' => $result['design'] ?? null,
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\StaffDesignCatalogNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('design_not_found', 'That design could not be found.')
    );
} catch (\Forge\Server\StaffDesignCatalogValidationException $exception) {
    forge_design_catalog_send_validation_error($exception->getFieldErrors(), $exception->getMessage());
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Thumbnail upload is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff catalog thumbnail endpoint');
    forge_design_catalog_send_bootstrap_error('Thumbnail upload is currently unavailable.');
}
