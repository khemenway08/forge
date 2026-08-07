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
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $repository = \Forge\Server\buildStaffDesignCatalogRepositoryFromEnvironment();

    if ($method === 'GET') {
        \Forge\Server\ApiResponse::send(
            200,
            \Forge\Server\ApiResponse::success([
                'designs' => $repository->listDesigns(),
            ])
        );
        exit;
    }

    if ($method !== 'POST') {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET and POST requests only.'),
            ['Allow' => 'GET, POST']
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
    $idempotencyKey = \Forge\Server\normalizeStaffCatalogCreateIdempotencyKey($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? null);
    if ($idempotencyKey === null) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid Idempotency-Key header is required.')
        );
        exit;
    }

    $result = $repository->createDesign($payload, $idempotencyKey);

    \Forge\Server\ApiResponse::send(
        $result['created'] ? 201 : 200,
        \Forge\Server\ApiResponse::success([
            'design' => $result['design'],
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\StaffDesignCatalogValidationException $exception) {
    forge_design_catalog_send_validation_error($exception->getFieldErrors(), $exception->getMessage());
} catch (\Forge\Server\StaffDesignCatalogIdempotencyConflictException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('idempotency_conflict', 'This Create Design request conflicts with an existing Design.')
    );
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
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff catalog designs endpoint');
    forge_design_catalog_send_bootstrap_error('Design catalog is currently unavailable.');
}
