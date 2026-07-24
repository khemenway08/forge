<?php
declare(strict_types=1);

require_once __DIR__ . '/_shared.php';

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_design_catalog_send_bootstrap_error('Design catalog is currently unavailable.');
    exit;
}

try {
    require_once $bootstrapPath;

    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if ($method !== 'GET' && $method !== 'POST' && $method !== 'DELETE') {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET, POST, and DELETE requests only.'),
            ['Allow' => 'GET, POST, DELETE']
        );
        exit;
    }

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $designId = \Forge\Server\normalizeStaffCatalogDesignId($_GET['id'] ?? ($_POST['id'] ?? null));
    if ($designId === null) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid design identifier is required.')
        );
        exit;
    }

    $repository = \Forge\Server\buildStaffDesignCatalogRepositoryFromEnvironment();

    if ($method === 'GET') {
        $design = $repository->getDesign($designId);
        if ($design === null) {
            \Forge\Server\ApiResponse::send(
                404,
                \Forge\Server\ApiResponse::error('design_not_found', 'That design could not be found.')
            );
            exit;
        }

        \Forge\Server\ApiResponse::send(
            200,
            \Forge\Server\ApiResponse::success([
                'design' => $design,
            ])
        );
        exit;
    }

    if ($method === 'DELETE') {
        $deleted = $repository->deleteDesign($designId);
        $thumbnailPath = $deleted['thumbnail_path'];
        if ($deleted['thumbnail_was_exclusive'] && is_string($thumbnailPath)) {
            $absoluteThumbnailPath = forge_design_catalog_resolve_absolute_thumbnail_path($thumbnailPath);
            if ($absoluteThumbnailPath !== null && is_file($absoluteThumbnailPath)) {
                @unlink($absoluteThumbnailPath);
            }
        }

        \Forge\Server\ApiResponse::send(
            200,
            \Forge\Server\ApiResponse::success([
                'design' => $deleted['design'],
            ])
        );
        exit;
    }

    $contentType = $_SERVER['CONTENT_TYPE'] ?? null;
    if (!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType) ? $contentType : null)) {
        \Forge\Server\ApiResponse::send(
            415,
            \Forge\Server\ApiResponse::error('unsupported_media_type', 'The request must use Content-Type: application/json.')
        );
        exit;
    }

    $rawBody = file_get_contents('php://input');
    $payload = \Forge\Server\OrderPayload::decodeJsonObject($rawBody === false ? '' : $rawBody);
    $updated = $repository->updateDesign($designId, $payload);

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'design' => $updated,
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
} catch (\Forge\Server\StaffDesignCatalogDeleteConflictException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'design_delete_blocked',
                'message' => 'Clear Finished Hat links before deleting this Design.',
                'finished_hat_link_count' => $exception->getLinkedFinishedHatCount(),
            ],
        ]
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
                'message' => 'Design catalog storage is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff catalog design endpoint');
    forge_design_catalog_send_bootstrap_error('Design catalog is currently unavailable.');
}
