<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';
$bootstrapPath = forge_staff_resolve_bootstrap_path();
if ($bootstrapPath === null) { forge_staff_send_fallback_response(500, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Artwork proofing could not be started.']]); exit; }
try {
    require_once $bootstrapPath;
    if (strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? ''))) !== 'POST') throw new \Forge\Server\ApiProblem(405, 'method_not_allowed', 'This endpoint accepts POST requests only.', ['Allow'=>'POST']);
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    if (!\Forge\Server\OrderPayload::isJsonContentType($_SERVER['CONTENT_TYPE'] ?? null)) throw new \Forge\Server\ApiProblem(415, 'unsupported_media_type', 'The request must use Content-Type: application/json.');
    $payload = \Forge\Server\OrderPayload::decodeJsonObject(file_get_contents('php://input') ?: '');
    $result = \Forge\Server\buildArtworkProofRepositoryFromEnvironment()->issueProofToken((string) ($payload['forge_order_uuid'] ?? ''), (string) ($payload['line_id'] ?? ''));
    \Forge\Server\ApiResponse::send(200, \Forge\Server\ApiResponse::success(['proof_url'=>'forge-artwork://proof?token='.$result['proof_token'],'expires_at'=>$result['expires_at'],'association'=>$result['association'],'proof'=>$result['proof']]));
} catch (\Forge\Server\ApiProblem $e) { \Forge\Server\ApiResponse::send($e->getHttpStatus(), \Forge\Server\ApiResponse::error($e->getErrorCodeValue(), $e->getSafeMessage()), $e->getHeaders()); }
catch (\Forge\Server\ArtworkProofNotFoundException $e) { \Forge\Server\ApiResponse::send(404, \Forge\Server\ApiResponse::error('artwork_proof_not_found', $e->getMessage())); }
catch (\Forge\Server\ArtworkProofConflictException $e) { \Forge\Server\ApiResponse::send(409, \Forge\Server\ApiResponse::error('artwork_proof_conflict', $e->getMessage())); }
catch (InvalidArgumentException $e) { \Forge\Server\ApiResponse::send(422, \Forge\Server\ApiResponse::error('invalid_request', $e->getMessage())); }
catch (Throwable $e) { forge_staff_log_unexpected_exception($e, $bootstrapPath, 'artwork proof token endpoint'); forge_staff_send_fallback_response(503, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'storage_unavailable','message'=>'Artwork proofing could not be started.']]); }
