<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_endpoint.php';
$bootstrapPath = forge_staff_resolve_bootstrap_path();
if ($bootstrapPath === null) { forge_staff_send_fallback_response(500, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Inventory is currently unavailable.']]); exit; }
try {
    require_once $bootstrapPath;
    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if (!in_array($method, ['GET', 'POST'], true)) { \Forge\Server\ApiResponse::send(405, \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET and POST requests only.'), ['Allow'=>'GET, POST']); exit; }
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $payload = [];
    if ($method === 'POST') { $contentType = $_SERVER['CONTENT_TYPE'] ?? null; if (!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType) ? $contentType : null)) { \Forge\Server\ApiResponse::send(415, \Forge\Server\ApiResponse::error('unsupported_media_type', 'The request must use Content-Type: application/json.')); exit; } $raw = file_get_contents('php://input'); $payload = \Forge\Server\OrderPayload::decodeJsonObject($raw === false ? '' : $raw); }
    $subjectType = is_string($payload['subject_type'] ?? null) ? trim($payload['subject_type']) : trim((string) ($_GET['subject_type'] ?? ''));
    $subjectId = is_string($payload['subject_id'] ?? null) ? trim($payload['subject_id']) : trim((string) ($_GET['subject_id'] ?? ''));
    $repository = \Forge\Server\buildInventoryRepositoryFromEnvironment();
    $inventory = $method === 'GET'
        ? $repository->getSubjectInventory($subjectType, $subjectId)
        : $repository->adjustSubjectInventory($subjectType, $subjectId, $payload['expected_quantity'] ?? null, $payload['expected_version'] ?? null, $payload['target_quantity'] ?? null, $payload['reason_code'] ?? null, $payload['note'] ?? null);
    \Forge\Server\ApiResponse::send(200, \Forge\Server\ApiResponse::success(['inventory' => $inventory]));
} catch (\Forge\Server\ApiProblem $problem) { \Forge\Server\ApiResponse::send($problem->getHttpStatus(), \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()), $problem->getHeaders());
} catch (\Forge\Server\InventoryNotFoundException $exception) { \Forge\Server\ApiResponse::send(404, \Forge\Server\ApiResponse::error('inventory_not_found', 'That inventory record could not be found.'));
} catch (\Forge\Server\InventoryConflictException $exception) { \Forge\Server\ApiResponse::send(409, \Forge\Server\ApiResponse::error('inventory_conflict', 'This inventory record was updated elsewhere. Reload and try again.'));
} catch (\Forge\Server\InventoryValidationException | \InvalidArgumentException $exception) { \Forge\Server\ApiResponse::send(422, \Forge\Server\ApiResponse::error('invalid_request', $exception->getMessage() ?: 'Review the inventory adjustment and try again.'));
} catch (\Forge\Server\StorageUnavailableException $exception) { forge_staff_send_fallback_response(503, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'storage_unavailable','message'=>'Inventory storage is currently unavailable.']]);
} catch (\Throwable $exception) { forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'staff inventory endpoint'); forge_staff_send_fallback_response(500, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Inventory is currently unavailable.']]); }
