<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';
$bootstrapPath = forge_staff_resolve_bootstrap_path();
if ($bootstrapPath === null) { forge_staff_send_fallback_response(500, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Artwork proof preview is unavailable.']]); exit; }
try {
    require_once $bootstrapPath;
    if (strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? ''))) !== 'GET') throw new \Forge\Server\ApiProblem(405, 'method_not_allowed', 'This endpoint accepts GET requests only.', ['Allow'=>'GET']);
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $preview = \Forge\Server\buildArtworkProofRepositoryFromEnvironment()->loadPreview((string) ($_GET['artwork_file_id'] ?? ''));
    http_response_code(200);
    header('Content-Type: image/png');
    header('Content-Length: ' . strlen($preview['bytes']));
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('ETag: "' . $preview['sha256'] . '"');
    echo $preview['bytes'];
} catch (\Forge\Server\ApiProblem $e) { \Forge\Server\ApiResponse::send($e->getHttpStatus(), \Forge\Server\ApiResponse::error($e->getErrorCodeValue(), $e->getSafeMessage()), $e->getHeaders()); }
catch (\Forge\Server\ArtworkProofNotFoundException $e) { \Forge\Server\ApiResponse::send(404, \Forge\Server\ApiResponse::error('artwork_proof_not_found', $e->getMessage())); }
catch (InvalidArgumentException $e) { \Forge\Server\ApiResponse::send(422, \Forge\Server\ApiResponse::error('invalid_request', $e->getMessage())); }
catch (Throwable $e) { forge_staff_log_unexpected_exception($e, $bootstrapPath, 'artwork proof preview endpoint'); forge_staff_send_fallback_response(503, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'storage_unavailable','message'=>'Artwork proof preview is unavailable.']]); }
