<?php
declare(strict_types=1);

require_once __DIR__ . '/_endpoint.php';

$bootstrapPath = forge_staff_resolve_bootstrap_path();

if ($bootstrapPath === null) {
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Legacy test cleanup is currently unavailable.',
            ],
        ]
    );
    exit;
}

try {
    require_once $bootstrapPath;

    $method = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if (!in_array($method, ['GET', 'POST'], true)) {
        \Forge\Server\ApiResponse::send(
            405,
            \Forge\Server\ApiResponse::error('method_not_allowed', 'This endpoint accepts GET or POST requests only.'),
            ['Allow' => 'GET, POST']
        );
        exit;
    }

    \Forge\Server\requireAuthenticatedStaffSession($_SERVER);
    $repository = \Forge\Server\buildStaffOrderRepositoryFromEnvironment();

    if ($method === 'GET') {
        \Forge\Server\ApiResponse::send(
            200,
            \Forge\Server\ApiResponse::success([
                'preview' => $repository->previewLegacyTestCleanup(),
            ])
        );
        exit;
    }

    if (!\Forge\Server\OrderPayload::isJsonContentType($_SERVER['CONTENT_TYPE'] ?? null)) {
        \Forge\Server\ApiResponse::send(
            415,
            \Forge\Server\ApiResponse::error('unsupported_media_type', 'The request must use Content-Type: application/json.')
        );
        exit;
    }

    $rawBody = file_get_contents('php://input');
    if (!is_string($rawBody)) {
        throw new \RuntimeException('Legacy test cleanup request body could not be read.');
    }

    $payload = \Forge\Server\OrderPayload::decodeJsonObject($rawBody);
    $previewSignature = isset($payload['preview_signature']) && is_string($payload['preview_signature'])
        ? trim($payload['preview_signature'])
        : '';
    $expectedCount = isset($payload['expected_count']) ? (int) $payload['expected_count'] : -1;
    $confirmationText = isset($payload['confirmation_text']) && is_string($payload['confirmation_text'])
        ? trim($payload['confirmation_text'])
        : '';

    if ($previewSignature === '' || $expectedCount < 0 || $confirmationText === '') {
        \Forge\Server\ApiResponse::send(
            422,
            \Forge\Server\ApiResponse::error('invalid_request', 'A cleanup preview, count, and confirmation text are required.')
        );
        exit;
    }

    $result = $repository->applyLegacyTestCleanup($previewSignature, $expectedCount, $confirmationText);

    \Forge\Server\ApiResponse::send(
        200,
        \Forge\Server\ApiResponse::success([
            'deleted_count' => $result['deleted_count'],
            'released_tray_numbers' => $result['released_tray_numbers'],
            'deleted_order_uuids' => $result['deleted_order_uuids'],
        ])
    );
} catch (\Forge\Server\ApiProblem $problem) {
    \Forge\Server\ApiResponse::send(
        $problem->getHttpStatus(),
        \Forge\Server\ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
        $problem->getHeaders()
    );
} catch (\Forge\Server\LegacyTestCleanupConflictException $exception) {
    \Forge\Server\ApiResponse::send(
        409,
        \Forge\Server\ApiResponse::error('cleanup_conflict', $exception->getMessage())
    );
} catch (\Forge\Server\StorageUnavailableException $exception) {
    forge_staff_send_fallback_response(
        503,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'storage_unavailable',
                'message' => 'Legacy test cleanup is currently unavailable.',
            ],
        ]
    );
} catch (\InvalidArgumentException $exception) {
    \Forge\Server\ApiResponse::send(
        422,
        \Forge\Server\ApiResponse::error('invalid_request', $exception->getMessage() !== '' ? $exception->getMessage() : 'Legacy test cleanup could not be prepared.')
    );
} catch (\Throwable $exception) {
    forge_staff_log_unexpected_exception($exception, $bootstrapPath, 'legacy cleanup endpoint');
    forge_staff_send_fallback_response(
        500,
        [
            'application' => 'Forge',
            'api_version' => '1',
            'status' => 'error',
            'error' => [
                'code' => 'server_error',
                'message' => 'Legacy test cleanup is currently unavailable.',
            ],
        ]
    );
}
