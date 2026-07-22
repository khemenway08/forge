<?php
declare(strict_types=1);

require_once __DIR__ . '/_shared.php';

const FORGE_HAT_CATALOG_MAX_UPLOAD_BYTES = 5242880;

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_hat_catalog_send_bootstrap_error('Hat photo upload is currently unavailable.');
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

    $hatId = \Forge\Server\normalizeStaffCatalogHatId($_POST['hat_id'] ?? null);
    if ($hatId === null) {
        forge_hat_catalog_send_validation_error([
            'photo' => 'Choose a valid hat before uploading a photo.',
        ]);
        exit;
    }

    if (!isset($_FILES['photo']) || !is_array($_FILES['photo'])) {
        forge_hat_catalog_send_validation_error([
            'photo' => 'Choose a PNG, JPEG, or WebP hat photo to upload.',
        ]);
        exit;
    }

    $upload = $_FILES['photo'];
    $errorCode = isset($upload['error']) ? (int) $upload['error'] : UPLOAD_ERR_NO_FILE;
    if ($errorCode !== UPLOAD_ERR_OK) {
        forge_hat_catalog_send_validation_error([
            'photo' => 'Choose a PNG, JPEG, or WebP hat photo to upload.',
        ]);
        exit;
    }

    $tmpName = is_string($upload['tmp_name'] ?? null) ? $upload['tmp_name'] : '';
    $size = isset($upload['size']) ? (int) $upload['size'] : 0;
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        forge_hat_catalog_send_validation_error([
            'photo' => 'Hat photo upload could not be verified.',
        ]);
        exit;
    }

    if ($size <= 0 || $size > FORGE_HAT_CATALOG_MAX_UPLOAD_BYTES) {
        forge_hat_catalog_send_validation_error([
            'photo' => 'Hat photo files must be 5 MB or smaller.',
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
        forge_hat_catalog_send_validation_error([
            'photo' => 'Only PNG, JPEG, and WebP hat photos are allowed.',
        ]);
        exit;
    }

    $uploadDirectory = forge_hat_catalog_resolve_upload_directory();
    if (!is_dir($uploadDirectory) && !@mkdir($uploadDirectory, 0775, true) && !is_dir($uploadDirectory)) {
        throw new \RuntimeException('Hat photo upload directory could not be created.');
    }

    $extension = $allowedMimeTypes[$mimeType];
    $fileName = 'hat-' . bin2hex(random_bytes(16)) . '.' . $extension;
    $relativePath = forge_hat_catalog_build_photo_relative_path($fileName);
    $absolutePath = $uploadDirectory . '/' . $fileName;

    if (!move_uploaded_file($tmpName, $absolutePath)) {
        throw new \RuntimeException('Hat photo upload could not be stored.');
    }

    $repository = \Forge\Server\buildStaffHatCatalogRepositoryFromEnvironment();

    try {
        $result = $repository->updatePhotoPath($hatId, $relativePath);
    } catch (\Throwable $exception) {
        @unlink($absolutePath);
        throw $exception;
    }

    $previousPhotoPath = is_array($result) ? ($result['previous_photo_path'] ?? null) : null;
    $previousAbsolutePath = forge_hat_catalog_resolve_absolute_photo_path(is_string($previousPhotoPath) ? $previousPhotoPath : null);
    if ($previousAbsolutePath !== null && $previousAbsolutePath !== $absolutePath && is_file($previousAbsolutePath)) {
        @unlink($previousAbsolutePath);
    }

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'hat' => $result['hat'] ?? null,
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\StaffHatCatalogNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('hat_not_found', 'That hat could not be found.')
    );
} catch (\Forge\Server\StaffHatCatalogValidationException $exception) {
    forge_hat_catalog_send_validation_error($exception->getFieldErrors(), $exception->getMessage());
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Hat photo upload is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff catalog hat photo endpoint');
    forge_hat_catalog_send_bootstrap_error('Hat photo upload is currently unavailable.');
}
