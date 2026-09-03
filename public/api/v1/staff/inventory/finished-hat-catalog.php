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
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
        \Forge\Server\ApiResponse::send(405, \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET requests only.'), ['Allow' => 'GET']);
        exit;
    }
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $subjectIds = $_GET['subject_id'] ?? [];
    if (!is_array($subjectIds)) $subjectIds = [$subjectIds];
    $repository = \Forge\Server\buildInventoryLocationRepositoryFromEnvironment();
    $catalog = $repository->getFinishedHatCatalogInventory($subjectIds, true);
    \Forge\Server\ApiResponse::send(200, \Forge\Server\ApiResponse::success($catalog));
} catch (\Forge\Server\ApiProblem $error) {
    \Forge\Server\ApiResponse::send($error->getHttpStatus(), \Forge\Server\ApiResponse::error($error->getErrorCodeValue(), $error->getSafeMessage()), $error->getHeaders());
} catch (\Forge\Server\InventoryNotFoundException $error) {
    \Forge\Server\ApiResponse::send(404, \Forge\Server\ApiResponse::error('inventory_not_found', $error->getMessage()));
} catch (\Forge\Server\StorageUnavailableException $error) {
    forge_staff_send_fallback_response(503, ['status' => 'error', 'error' => ['code' => 'storage_unavailable', 'message' => 'Inventory storage is currently unavailable.']]);
} catch (\Throwable $error) {
    forge_staff_log_unexpected_exception($error, $bootstrapPath, 'finished hat catalog inventory');
    forge_staff_send_fallback_response(500, ['status' => 'error', 'error' => ['code' => 'server_error', 'message' => 'Inventory is currently unavailable.']]);
}
