<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';
$bootstrapPath=forge_staff_resolve_bootstrap_path();
if($bootstrapPath===null){forge_staff_send_fallback_response(500,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'server_error','message'=>'Artwork preparation could not be started.']]);exit;}
try{
    require_once $bootstrapPath;
    if(strtoupper(trim((string)($_SERVER['REQUEST_METHOD']??'')))!=='POST')throw new \Forge\Server\ApiProblem(405,'method_not_allowed','This endpoint accepts POST requests only.',['Allow'=>'POST']);
    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $contentType=$_SERVER['CONTENT_TYPE']??null;if(!\Forge\Server\OrderPayload::isJsonContentType(is_string($contentType)?$contentType:null))throw new \Forge\Server\ApiProblem(415,'unsupported_media_type','The request must use Content-Type: application/json.');
    $raw=file_get_contents('php://input');$payload=\Forge\Server\OrderPayload::decodeJsonObject($raw===false?'':$raw);
    $result=\Forge\Server\buildArtworkPreparationRepositoryFromEnvironment()->issuePrepareToken(trim((string)($payload['forge_order_uuid']??'')),trim((string)($payload['line_id']??'')));
    \Forge\Server\ApiResponse::send(200,\Forge\Server\ApiResponse::success(['prepare_url'=>'forge-artwork://prepare?token='.$result['prepare_token'],'expires_at'=>$result['expires_at'],'association'=>$result['association']]));
}catch(\Forge\Server\ApiProblem $e){\Forge\Server\ApiResponse::send($e->getHttpStatus(),\Forge\Server\ApiResponse::error($e->getErrorCodeValue(),$e->getSafeMessage()),$e->getHeaders());}
catch(\Forge\Server\StaffOrderNotFoundException $e){\Forge\Server\ApiResponse::send(404,\Forge\Server\ApiResponse::error('order_not_found','That order could not be found.'));}
catch(\Forge\Server\ProductionOrderItemNotFoundException $e){\Forge\Server\ApiResponse::send(404,\Forge\Server\ApiResponse::error('item_not_found','That saved item could not be found.'));}
catch(\Forge\Server\ArtworkPreparationNotReadyException $e){\Forge\Server\ApiResponse::send(409,\Forge\Server\ApiResponse::error('artwork_not_ready',$e->getMessage()));}
catch(\Forge\Server\ArtworkPreparationConflictException $e){\Forge\Server\ApiResponse::send(409,\Forge\Server\ApiResponse::error('artwork_conflict',$e->getMessage()));}
catch(InvalidArgumentException $e){\Forge\Server\ApiResponse::send(422,\Forge\Server\ApiResponse::error('invalid_request',$e->getMessage()));}
catch(Throwable $e){forge_staff_log_unexpected_exception($e,$bootstrapPath,'artwork prepare token endpoint');forge_staff_send_fallback_response(503,['application'=>'Forge','api_version'=>'1','status'=>'error','error'=>['code'=>'storage_unavailable','message'=>'Artwork preparation could not be started.']]);}
