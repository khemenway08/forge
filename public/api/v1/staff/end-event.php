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
                'message' => 'Staff event management is currently unavailable.',
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

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);

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
    $eventId = isset($payload['event_id']) && is_string($payload['event_id']) ? trim($payload['event_id']) : '';
    if ($eventId === '') {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'An event_id is required.')
        );
        exit;
    }

    $repository = \Forge\Server\buildEventRepositoryFromEnvironment();
    $event = $repository->endEvent($eventId);

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'event' => $event,
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\EventNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(
        404,
        \Forge\Server\ApiResponse::error('event_not_found', $exception->getMessage())
    );
} catch (\Forge\Server\EventStateConflictException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('event_conflict', $exception->getMessage())
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
                'message' => 'Staff event management is currently unavailable.',
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
                'message' => 'Staff event management is currently unavailable.',
            ],
        ]
    );
}
