<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';
$bootstrapPath=forge_staff_resolve_bootstrap_path();
if($bootstrapPath===null){forge_staff_send_fallback_response(500,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Artwork setup could not be started.']]);exit;}
try{
    require_once $bootstrapPath;
    if(strtoupper(trim((string)($_SERVER['REQUEST_METHOD']??'')))!=='POST')throw new \Forge\Server\ApiProblem(405,'method_not_allowed','This endpoint accepts POST requests only.',['Allow'=>'POST']);
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $contentType=$_SERVER['CONTENT_TYPE']??null;if(!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType)?$contentType:null))throw new \Forge\Server\ApiProblem(415,'unsupported_media_type','The request must use Content-Type: application/json.');
    $raw=file_get_contents('php://input');$payload=\Forge\Server\OrderPayload::decodeJsonObject($raw===false?'':$raw);
    $result=\Forge\Server\buildArtworkTemplateRepositoryFromEnvironment()->issueSetupToken(trim((string)($payload['registration_id']??'')));
    \Forge\Server\ApiResponse::send(200,\Forge\Server\ApiResponse::success(['setup_url'=>'forge-artwork://setup?token='.$result['setup_token'],'expires_at'=>$result['expires_at']]));
}catch(\Forge\Server\ApiProblem $problem){\Forge\Server\ApiResponse::send($problem->getHttpStatus(),\Forge\Server\ApiResponse::error($problem->getErrorCodeValue(),$problem->getSafeMessage()),$problem->getHeaders());}
catch(InvalidArgumentException $exception){\Forge\Server\ApiResponse::send(422,\Forge\Server\ApiResponse::error('invalid_request',$exception->getMessage()));}
catch(Throwable $exception){forge_staff_log_unexpected_exception($exception,$bootstrapPath,'artwork setup token endpoint');forge_staff_send_fallback_response(503,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'storage_unavailable','message'=>'Artwork setup could not be started.']]);}
