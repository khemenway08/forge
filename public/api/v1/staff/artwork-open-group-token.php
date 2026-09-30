<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';
$bootstrapPath=forge_staff_resolve_bootstrap_path();
if($bootstrapPath===null){forge_staff_send_fallback_response(500,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Prepared artwork could not be opened.']]);exit;}
try{
    require_once $bootstrapPath;
    if(strtoupper(trim((string)($_SERVER['REQUEST_METHOD']??'')))!=='POST')throw new \Forge\Server\ApiProblem(405,'method_not_allowed','This endpoint accepts POST requests only.',['Allow'=>'POST']);
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $contentType=$_SERVER['CONTENT_TYPE']??null;if(!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType)?$contentType:null))throw new \Forge\Server\ApiProblem(415,'unsupported_media_type','The request must use Content-Type: application/json.');
    $raw=file_get_contents('php://input');$payload=\Forge\Server\OrderPayload::decodeJsonObject($raw===false?'':$raw);
    $result=\Forge\Server\buildArtworkPreparationRepositoryFromEnvironment()->issueOpenGroupToken((string)($payload['product_definition_id']??''),(string)($payload['variant_key']??''));
    \Forge\Server\ApiResponse::send(200,\Forge\Server\ApiResponse::success(['open_url'=>'forge-artwork://open-group?token='.$result['open_token'],'expires_at'=>$result['expires_at'],'group'=>$result['group']]));
}catch(\Forge\Server\ApiProblem $e){\Forge\Server\ApiResponse::send($e->getHttpStatus(),\Forge\Server\ApiResponse::error($e->getErrorCodeValue(),$e->getSafeMessage()),$e->getHeaders());}
catch(\Forge\Server\ArtworkPreparationNotReadyException $e){\Forge\Server\ApiResponse::send(409,\Forge\Server\ApiResponse::error('artwork_not_ready',$e->getMessage()));}
catch(\Forge\Server\ArtworkPreparationConflictException $e){\Forge\Server\ApiResponse::send(409,\Forge\Server\ApiResponse::error('artwork_conflict',$e->getMessage()));}
catch(InvalidArgumentException $e){\Forge\Server\ApiResponse::send(422,\Forge\Server\ApiResponse::error('invalid_request',$e->getMessage()));}
catch(Throwable $e){forge_staff_log_unexpected_exception($e,$bootstrapPath,'artwork open group token endpoint');forge_staff_send_fallback_response(503,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'storage_unavailable','message'=>'Prepared artwork could not be opened.']]);}
