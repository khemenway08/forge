<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Internal notes are currently unavailable.',
            ],
        ]
    );
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

    $contentType = $_SERVER['CONTENT_TYPE'] ?? null;
    if (!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType) ? $contentType : null)) {
        \Forge\Server\ApiResponse::send(
            415,
            \Forge\Server\ApiResponse::error('unsupported_media_type', 'The request must use Content-Type: application/json.')
        );
        exit;
    }

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);

    $rawBody = file_get_contents('php://input');
    $payload = \Forge\Server\OrderPayload::decodeJsonObject($rawBody === false ? '' : $rawBody);

    $forgeOrderUuid = isset($payload['forge_order_uuid']) && is_string($payload['forge_order_uuid'])
        ? trim($payload['forge_order_uuid'])
        : '';
    if (!array_key_exists('internal_note', $payload) || (!is_string($payload['internal_note']) && $payload['internal_note'] !== null)) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid internal note is required.')
        );
        exit;
    }

    $internalNote = is_string($payload['internal_note']) ? $payload['internal_note'] : null;

    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $forgeOrderUuid)) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid Forge order UUID is required.')
        );
        exit;
    }

    $repository = \Forge\Server\buildStaffOrderRepositoryFromEnvironment();
    $result = $repository->updateInternalNote($forgeOrderUuid, $internalNote);

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'internal_note' => $result['internal_note'] ?? null,
            'order' => $result['order'] ?? null,
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\StaffOrderNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('order_not_found', 'That order could not be found.')
    );
} catch (\Forge\Server\InternalOrderNoteTooLongException $exception) {
    \Forge\Server\ApiResponse::send(
        422,
        \Forge\Server\ApiResponse::error('internal_note_too_long', $exception->getMessage() !== '' ? $exception->getMessage() : 'Internal notes are too long.')
    );
} catch (\InvalidArgumentException $exception) {
    \Forge\Server\ApiResponse::send(
        422,
        \Forge\Server\ApiResponse::error('invalid_request', $exception->getMessage() !== '' ? $exception->getMessage() : 'The internal note request is invalid.')
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
                'message' => 'Internal notes are currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff internal note endpoint');
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Internal notes are currently unavailable.',
            ],
        ]
    );
}
