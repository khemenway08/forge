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
                'message' => 'Order editing is currently unavailable.',
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
    if ($rawBody !== false && strlen($rawBody) > \Forge\Server\OrderPayload::MAX_REQUEST_BYTES) {
        throw new \InvalidArgumentException('The edit request is too large.');
    }
    $payload = \Forge\Server\OrderPayload::decodeJsonObject($rawBody === false ? '' : $rawBody);
    \Forge\Server\assertSubmittedEditKeys($payload, ['forge_order_uuid', 'expected_payload_sha256', 'changes']);
    if (!is_string($payload['expected_payload_sha256'] ?? null) || !is_array($payload['changes'] ?? null)) {
        throw new \InvalidArgumentException('An original payload hash and correction fields are required.');
    }

    $forgeOrderUuid = isset($payload['forge_order_uuid']) && is_string($payload['forge_order_uuid'])
        ? trim($payload['forge_order_uuid'])
        : '';
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $forgeOrderUuid)) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid Forge order UUID is required.')
        );
        exit;
    }

    $repository = \Forge\Server\buildStaffOrderRepositoryFromEnvironment();
    $result = $repository->updateSubmittedOrder($forgeOrderUuid, $payload['expected_payload_sha256'], $payload['changes']);

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
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
} catch (\Forge\Server\SubmittedOrderEditConflictException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('order_edit_conflict', $exception->getMessage() !== '' ? $exception->getMessage() : 'That order cannot be edited.')
    );
} catch (\InvalidArgumentException $exception) {
    \Forge\Server\ApiResponse::send(
        422,
        \Forge\Server\ApiResponse::error('invalid_request', $exception->getMessage() !== '' ? $exception->getMessage() : 'The edit request is invalid.')
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
                'message' => 'Order editing is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff edit order endpoint');
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Order editing is currently unavailable.',
            ],
        ]
    );
}
