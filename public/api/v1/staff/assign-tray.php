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
                'message' => 'Production tray assignment is currently unavailable.',
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
    $trayNumber = $payload['tray_number'] ?? null;

    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $forgeOrderUuid)) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid Forge order UUID is required.')
        );
        exit;
    }

    try {
        $normalizedTrayNumber = \Forge\Server\normalizePositiveTrayNumber($trayNumber);
    } catch (\InvalidArgumentException $exception) {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A valid production tray number is required.')
        );
        exit;
    }

    $repository = \Forge\Server\buildStaffOrderRepositoryFromEnvironment();
    $result = $repository->assignTrayToOrder($forgeOrderUuid, $normalizedTrayNumber);

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'already_assigned' => (bool) ($result['already_assigned'] ?? false),
            'order' => $result['order'] ?? null,
            'tray' => $result['tray'] ?? null,
            'assignment_history' => $result['assignment_history'] ?? null,
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
} catch (\Forge\Server\ProductionTrayNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('tray_not_found', 'That production tray could not be found.')
    );
} catch (\Forge\Server\ProductionTrayUnavailableException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('tray_unavailable', 'That tray is no longer available. Choose another tray.')
    );
} catch (\Forge\Server\ProductionOrderAlreadyAssignedException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('order_already_assigned', 'This order already has an assigned tray.')
    );
} catch (\Forge\Server\ProductionOrderNotAssignableException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('invalid_request', 'Only submitted orders can receive a tray.')
    );
} catch (\Forge\Server\ProductionTrayConfigurationException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'no_trays_configured',
                'message' => 'No production trays are configured.',
            ],
        ]
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
                'message' => 'Production tray assignment is currently unavailable.',
            ],
        ]
    );
} catch (\Throwable $exception) {
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Production tray assignment is currently unavailable.',
            ],
        ]
    );
}
