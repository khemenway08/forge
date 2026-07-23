<?php
declare(strict_types=1);

require_once __DIR__ . '/_shared.php';

const FORGE_MATERIAL_CATALOG_MAX_UPLOAD_BYTES = 5242880;

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_material_catalog_send_bootstrap_error('Material swatch upload is currently unavailable.');
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

    $materialId = \Forge\Server\normalizeStaffCatalogMaterialId($_POST['material_id'] ?? null);
    if ($materialId === null) {
        forge_material_catalog_send_validation_error([
            'swatch' => 'Choose a valid material before uploading a swatch.',
        ]);
        exit;
    }

    if (!isset($_FILES['swatch']) || !is_array($_FILES['swatch'])) {
        forge_material_catalog_send_validation_error([
            'swatch' => 'Choose a PNG, JPEG, or WebP material swatch to upload.',
        ]);
        exit;
    }

    $upload = $_FILES['swatch'];
    $errorCode = isset($upload['error']) ? (int) $upload['error'] : UPLOAD_ERR_NO_FILE;
    if ($errorCode !== UPLOAD_ERR_OK) {
        forge_material_catalog_send_validation_error([
            'swatch' => 'Choose a PNG, JPEG, or WebP material swatch to upload.',
        ]);
        exit;
    }

    $tmpName = is_string($upload['tmp_name'] ?? null) ? $upload['tmp_name'] : '';
    $size = isset($upload['size']) ? (int) $upload['size'] : 0;
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        forge_material_catalog_send_validation_error([
            'swatch' => 'Material swatch upload could not be verified.',
        ]);
        exit;
    }

    if ($size <= 0 || $size > FORGE_MATERIAL_CATALOG_MAX_UPLOAD_BYTES) {
        forge_material_catalog_send_validation_error([
            'swatch' => 'Material swatch files must be 5 MB or smaller.',
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
        forge_material_catalog_send_validation_error([
            'swatch' => 'Only PNG, JPEG, and WebP material swatches are allowed.',
        ]);
        exit;
    }

    $imageInfo = @getimagesize($tmpName);
    if (!is_array($imageInfo) || !isset($imageInfo[0], $imageInfo[1])) {
        forge_material_catalog_send_validation_error([
            'swatch' => 'Material swatch dimensions could not be read.',
        ]);
        exit;
    }

    $imageWidth = (int) $imageInfo[0];
    $imageHeight = (int) $imageInfo[1];
    if ($imageWidth <= 0 || $imageHeight <= 0) {
        forge_material_catalog_send_validation_error([
            'swatch' => 'Material swatch dimensions must be positive.',
        ]);
        exit;
    }

    $uploadDirectory = forge_material_catalog_resolve_upload_directory();
    if (!is_dir($uploadDirectory) && !@mkdir($uploadDirectory, 0775, true) && !is_dir($uploadDirectory)) {
        throw new \RuntimeException('Material swatch upload directory could not be created.');
    }

    $extension = $allowedMimeTypes[$mimeType];
    $fileName = 'material-' . bin2hex(random_bytes(16)) . '.' . $extension;
    $relativePath = forge_material_catalog_build_swatch_relative_path($fileName);
    $absolutePath = $uploadDirectory . '/' . $fileName;

    if (!move_uploaded_file($tmpName, $absolutePath)) {
        throw new \RuntimeException('Material swatch upload could not be stored.');
    }

    $repository = \Forge\Server\buildStaffMaterialCatalogRepositoryFromEnvironment();

    try {
        $result = $repository->updateSwatchMedia($materialId, $relativePath, $imageWidth, $imageHeight);
    } catch (\Throwable $exception) {
        @unlink($absolutePath);
        throw $exception;
    }

    $previousSwatchPath = is_array($result) ? ($result['previous_swatch_path'] ?? null) : null;
    $previousAbsolutePath = forge_material_catalog_resolve_absolute_swatch_path(is_string($previousSwatchPath) ? $previousSwatchPath : null);
    if ($previousAbsolutePath !== null && $previousAbsolutePath !== $absolutePath && is_file($previousAbsolutePath)) {
        @unlink($previousAbsolutePath);
    }

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'material' => $result['material'] ?? null,
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\StaffMaterialCatalogNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('material_not_found', 'That material could not be found.')
    );
} catch (\Forge\Server\StaffMaterialCatalogValidationException $exception) {
    forge_material_catalog_send_validation_error($exception->getFieldErrors(), $exception->getMessage());
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Material swatch upload is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff catalog material swatch endpoint');
    forge_material_catalog_send_bootstrap_error('Material swatch upload is currently unavailable.');
}
