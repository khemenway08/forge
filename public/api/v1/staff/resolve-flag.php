<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';

$bootstrapPath = forge_staff_resolve_bootstrap_path();
if ($bootstrapPath === null) {
    forge_staff_send_fallback_response(500, [
        'application' => 'Forge',
        'api_version' => '1',
        'status' => 'error',
        'error' => ['code' => 'server_error', 'message' => 'Flag resolution is currently unavailable.'],
    ]);
    exit;
}

try {
    require_once $bootstrapPath;
    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if ($method !== 'POST') {
        \Forge\Server\ApiResponse::send(405, \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts POST requests only.'), ['Allow' => 'POST']);
        exit;
    }
    $contentType = $_SERVER['CONTENT_TYPE'] ?? null;
    if (!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType) ? $contentType : null)) {
        \Forge\Server\ApiResponse::send(415, \Forge\Server\ApiResponse::error('unsupported_media_type', 'The request must use Content-Type: application/json.'));
        exit;
    }

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $rawBody = file_get_contents('php://input');
    $payload = \Forge\Server\OrderPayload::decodeJsonObject($rawBody === false ? '' : $rawBody);
    if (array_diff(array_keys($payload), ['forge_order_uuid', 'expected_payload_sha256', 'flag_key']) !== []) {
        throw new \InvalidArgumentException('The flag resolution request contains unsupported fields.');
    }
    $orderUuid = is_string($payload['forge_order_uuid'] ?? null) ? trim($payload['forge_order_uuid']) : '';
    $expectedHash = is_string($payload['expected_payload_sha256'] ?? null) ? strtolower(trim($payload['expected_payload_sha256'])) : '';
    $flagKey = is_string($payload['flag_key'] ?? null) ? strtolower(trim($payload['flag_key'])) : '';

    $repository = \Forge\Server\buildStaffOrderRepositoryFromEnvironment();
    $result = $repository->resolveOrderFlag($orderUuid, $expectedHash, $flagKey);
    \Forge\Server\ApiResponse::send(200, \Forge\Server\ApiResponse::success([
        'order' => $result['order'] ?? null,
        'resolved_flag' => $result['resolved_flag'] ?? null,
    ]));
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send($problem->getHttpStatus(), \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()), $problem->getHeaders());
} catch (\Forge\Server\StaffOrderNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(404, \Forge\Server\ApiResponse::error('order_not_found', 'That order could not be found.'));
} catch (\Forge\Server\OrderFlagNotFoundException $exception) {
    \Forge\Server\ApiResponse::send(404, \Forge\Server\ApiResponse::error('flag_not_found', 'That submitted flag could not be found.'));
} catch (\Forge\Server\OrderFlagResolutionConflictException $exception) {
    \Forge\Server\ApiResponse::send(409, \Forge\Server\ApiResponse::error('flag_resolution_conflict', $exception->getMessage()));
} catch (\Forge\Server\OrderFlagResolutionNotAllowedException $exception) {
    \Forge\Server\ApiResponse::send(409, \Forge\Server\ApiResponse::error('flag_resolution_not_allowed', $exception->getMessage()));
} catch (\InvalidArgumentException $exception) {
    \Forge\Server\ApiResponse::send(422, \Forge\Server\ApiResponse::error('invalid_request', $exception->getMessage() !== '' ? $exception->getMessage() : 'The flag resolution request is invalid.'));
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(503, [
        'application' => 'Forge',
        'api_version' => '1',
        'status' => 'error',
        'error' => ['code' => 'storage_unavailable', 'message' => 'Flag resolution is currently unavailable.'],
    ]);
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff flag resolution endpoint');
    forge_staff_send_fallback_response(500, [
        'application' => 'Forge',
        'api_version' => '1',
        'status' => 'error',
        'error' => ['code' => 'server_error', 'message' => 'Flag resolution is currently unavailable.'],
    ]);
}
