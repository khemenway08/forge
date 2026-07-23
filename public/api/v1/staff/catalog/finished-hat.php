<?php
declare(strict_types=1);

require_once __DIR__ . '/_shared.php';

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_finished_hat_catalog_send_bootstrap_error('Finished hat catalog is currently unavailable.');
    exit;
}

try {
    require_once $bootstrapPath;

    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if ($method !== 'GET' && $method !== 'POST') {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET and POST requests only.'),
            ['Allow' => 'GET, POST']
        );
        exit;
    }

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $finishedHatId = \Forge\Server\normalizeStaffCatalogFinishedHatId($_GET['id'] ?? ($_POST['id'] ?? null));
    if ($finishedHatId === null) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid finished hat identifier is required.')
        );
        exit;
    }

    $repository = \Forge\Server\buildStaffFinishedHatCatalogRepositoryFromEnvironment();

    if ($method === 'GET') {
        $record = $repository->getFinishedHat($finishedHatId);
        if ($record === null) {
            \Forge\Server\ApiResponse::send(
                404,
                \Forge\Server\ApiResponse::error('finished_hat_not_found', 'That finished hat could not be found.')
            );
            exit;
        }

        \Forge\Server\ApiResponse::send(
            200,
            \Forge\Server\ApiResponse::success([
                'finished_hat' => $record,
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
    $updated = $repository->updateFinishedHat($finishedHatId, $payload);

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'finished_hat' => $updated,
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\StaffFinishedHatCatalogNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('finished_hat_not_found', 'That finished hat could not be found.')
    );
} catch (\Forge\Server\StaffFinishedHatCatalogValidationException $exception) {
    forge_finished_hat_catalog_send_validation_error($exception->getFieldErrors(), $exception->getMessage());
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Finished hat catalog storage is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff catalog finished hat endpoint');
    forge_finished_hat_catalog_send_bootstrap_error('Finished hat catalog is currently unavailable.');
}
