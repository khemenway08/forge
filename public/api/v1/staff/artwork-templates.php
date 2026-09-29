<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';
$bootstrapPath = forge_staff_resolve_bootstrap_path();
if ($bootstrapPath === null) { forge_staff_send_fallback_response(500, ['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Artwork Template Setup is currently unavailable.']]); exit; }

try {
    require_once $bootstrapPath;
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $method = strtoupper(trim((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    $repository = \Forge\Server\buildArtworkTemplateRepositoryFromEnvironment();
    if ($method === 'GET') {
        \Forge\Server\ApiResponse::send(200, \Forge\Server\ApiResponse::success(['registrations'=>$repository->listRegistrations()])); exit;
    }
    if ($method !== 'POST') { \Forge\Server\ApiResponse::send(405, \Forge\Server\ApiResponse::error('method_not_allowed','This endpoint accepts GET and POST requests only.'), ['Allow'=>'GET, POST']); exit; }
    $contentType=$_SERVER['CONTENT_TYPE']??null;
    if(!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType)?$contentType:null))throw new \Forge\Server\ApiProblem(415,'unsupported_media_type','The request must use Content-Type: application/json.');
    $raw=file_get_contents('php://input'); $payload=\Forge\Server\OrderPayload::decodeJsonObject($raw===false?'':$raw);
    $action=trim((string)($payload['action']??'save'));
    if($action==='save')$registration=$repository->saveRegistration(is_array($payload['registration']??null)?$payload['registration']:[]);
    elseif($action==='activate'||$action==='deactivate')$registration=$repository->setRegistrationActive(trim((string)($payload['registration_id']??'')),$action==='activate');
    else throw new InvalidArgumentException('A valid artwork template action is required.');
    \Forge\Server\ApiResponse::send(200, \Forge\Server\ApiResponse::success(['registration'=>$registration]));
} catch (\Forge\Server\ApiProblem $problem) { \Forge\Server\ApiResponse::send($problem->getHttpStatus(),\Forge\Server\ApiResponse::error($problem->getErrorCodeValue(),$problem->getSafeMessage()),$problem->getHeaders()); }
catch (InvalidArgumentException $exception) { \Forge\Server\ApiResponse::send(422,\Forge\Server\ApiResponse::error('invalid_request',$exception->getMessage())); }
catch (\Forge\Server\StorageUnavailableException $exception) { forge_staff_send_fallback_response(503,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'storage_unavailable','message'=>'Artwork Template Setup storage is currently unavailable.']]); }
catch (Throwable $exception) { forge_staff_log_unexpected_exception($exception,$bootstrapPath,'artwork templates endpoint'); forge_staff_send_fallback_response(500,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Artwork Template Setup is currently unavailable.']]); }
