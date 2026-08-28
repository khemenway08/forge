<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/_endpoint.php';

$bootstrapPath = forge_staff_resolve_bootstrap_path();
if ($bootstrapPath === null) {
    forge_staff_send_fallback_response(500, ['status' => 'error', 'error' => ['code' => 'server_error', 'message' => 'Inventory is currently unavailable.']]);
    exit;
}

try {
    require_once $bootstrapPath;
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $payload = $method === 'GET' ? $_GET : \Forge\Server\OrderPayload::decodeJsonObject(file_get_contents('php://input') ?: '');
    if (($payload['subject_type'] ?? '') !== \Forge\Server\PdoInventoryLocationRepository::SUBJECT_TYPE_CATALOG_FINISHED_HAT) {
        throw new \Forge\Server\InventoryNotFoundException('That inventory record could not be found.');
    }
    $repository = \Forge\Server\buildInventoryLocationRepositoryFromEnvironment();
    if ($method === 'GET') {
        $inventory = $repository->getFinishedHatInventory((string) ($payload['subject_id'] ?? ''));
    } elseif ($method === 'POST') {
        if (isset($payload['assign_location_id'])) {
            $inventory = $repository->assignLocation((string) ($payload['subject_id'] ?? ''), (string) $payload['assign_location_id']);
        } elseif (isset($payload['initial_count_location_id'])) {
            $inventory = $repository->initialCountLocation((string) ($payload['subject_id'] ?? ''), (string) $payload['initial_count_location_id'], $payload['target_quantity'] ?? null);
        } else {
            $inventory = $repository->adjustLocation((string) ($payload['subject_id'] ?? ''), (string) ($payload['location_id'] ?? ''), $payload['expected_quantity'] ?? null, $payload['expected_version'] ?? null, $payload['target_quantity'] ?? null, $payload['reason_code'] ?? null, $payload['note'] ?? null);
        }
    } else {
        \Forge\Server\ApiResponse::send(405, \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET and POST requests only.'), ['Allow' => 'GET, POST']);
        exit;
    }
    \Forge\Server\ApiResponse::send(200, \Forge\Server\ApiResponse::success(['inventory' => $inventory]));
} catch (\Forge\Server\ApiProblem $error) {
    \Forge\Server\ApiResponse::send($error->getHttpStatus(), \Forge\Server\ApiResponse::error($error->getErrorCodeValue(), $error->getSafeMessage()), $error->getHeaders());
} catch (\Forge\Server\InventoryConflictException $error) {
    \Forge\Server\ApiResponse::send(409, \Forge\Server\ApiResponse::error('inventory_conflict', $error->getMessage()));
} catch (\Forge\Server\InventoryNotFoundException $error) {
    \Forge\Server\ApiResponse::send(404, \Forge\Server\ApiResponse::error('inventory_not_found', $error->getMessage()));
} catch (\Forge\Server\InventoryValidationException $error) {
    \Forge\Server\ApiResponse::send(422, \Forge\Server\ApiResponse::error('invalid_request', $error->getMessage()));
} catch (\Throwable $error) {
    forge_staff_log_unexpected_exception($error, $bootstrapPath, 'inventory location stock');
    forge_staff_send_fallback_response(500, ['status' => 'error', 'error' => ['code' => 'server_error', 'message' => 'Inventory is currently unavailable.']]);
}
