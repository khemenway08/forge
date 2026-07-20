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
                'message' => 'Item completion is currently unavailable.',
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
    $lineId = isset($payload['line_id']) && is_string($payload['line_id'])
        ? trim($payload['line_id'])
        : '';
    $expectedCompletedQuantity = $payload['expected_completed_quantity'] ?? null;
    $targetCompletedQuantity = $payload['target_completed_quantity'] ?? null;

    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $forgeOrderUuid)) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid Forge order UUID is required.')
        );
        exit;
    }

    if ($lineId === '') {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid line ID is required.')
        );
        exit;
    }

    if (!is_int($expectedCompletedQuantity) && !(is_string($expectedCompletedQuantity) && preg_match('/^\d+$/', trim($expectedCompletedQuantity)))) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid current completed quantity is required.')
        );
        exit;
    }

    if (!is_int($targetCompletedQuantity) && !(is_string($targetCompletedQuantity) && preg_match('/^\d+$/', trim($targetCompletedQuantity)))) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid target completed quantity is required.')
        );
        exit;
    }

    $repository = \Forge\Server\buildStaffOrderRepositoryFromEnvironment();
    $result = $repository->completeItemQuantity(
        $forgeOrderUuid,
        $lineId,
        (int) $expectedCompletedQuantity,
        (int) $targetCompletedQuantity
    );

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'already_applied' => (bool) ($result['already_applied'] ?? false),
            'order' => $result['order'] ?? null,
            'item' => $result['item'] ?? null,
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
} catch (\Forge\Server\ProductionOrderItemNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('item_not_found', 'That saved item could not be found.')
    );
} catch (\Forge\Server\ProductionOrderItemConflictException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('item_conflict', 'That item was already updated. Refresh the order and try again.')
    );
} catch (\Forge\Server\ProductionOrderItemNotCompletableException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('item_not_completable', $exception->getMessage() !== '' ? $exception->getMessage() : 'That item cannot be marked complete right now.')
    );
} catch (\InvalidArgumentException $exception) {
    \Forge\Server\ApiResponse::send(
        422,
        \Forge\Server\ApiResponse::error('invalid_request', $exception->getMessage() !== '' ? $exception->getMessage() : 'The item completion request is invalid.')
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
                'message' => 'Item completion is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff item completion endpoint');
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Item completion is currently unavailable.',
            ],
        ]
    );
}
