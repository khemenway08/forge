<?php
declare(strict_types=1);

namespace Forge\Server;

use Throwable;

class ApiProblem extends \RuntimeException
{
    private int $httpStatus;
    private string $errorCode;
    private string $safeMessage;
    private array $headers;

    public function __construct(int $httpStatus, string $errorCode, string $safeMessage, array $headers = [], ?Throwable $previous = null)
    {
        parent::__construct($safeMessage, 0, $previous);
        $this->httpStatus = $httpStatus;
        $this->errorCode = $errorCode;
        $this->safeMessage = $safeMessage;
        $this->headers = $headers;
    }

    public function getHttpStatus(): int
    {
        return $this->httpStatus;
    }

    public function getErrorCodeValue(): string
    {
        return $this->errorCode;
    }

    public function getSafeMessage(): string
    {
        return $this->safeMessage;
    }

    public function getHeaders(): array
    {
        return $this->headers;
    }
}

class StorageUnavailableException extends \RuntimeException
{
}

class OrderConflictException extends \RuntimeException
{
}

final class OrderHandler
{
    private OrderRepositoryInterface $repository;
    /** @var callable */
    private $clock;
    /** @var null|callable */
    private $unexpectedExceptionReporter;

    public function __construct(
        OrderRepositoryInterface $repository,
        ?callable $clock = null,
        ?callable $unexpectedExceptionReporter = null
    )
    {
        $this->repository = $repository;
        $this->clock = $clock ?? static function (): \DateTimeImmutable {
            return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        };
        $this->unexpectedExceptionReporter = $unexpectedExceptionReporter;
    }

    public function handleRequest(string $method, ?string $contentType, string $rawBody, ?int $contentLength = null): array
    {
        try {
            $this->assertMethodIsPost($method);
            $this->assertJsonContentType($contentType);
            $this->assertRequestSize($rawBody, $contentLength);

            $payload = OrderPayload::decodeJsonObject($rawBody);
            OrderPayload::validatePayload($payload);

            $canonicalJson = OrderPayload::canonicalizeToJson($payload);
            $payloadSha256 = OrderPayload::hashCanonicalPayload($payload);
            $receivedAt = $this->currentUtcIso8601();
            $result = $this->repository->storeOrder($payload, $canonicalJson, $payloadSha256, $receivedAt);

            return [
                'statusCode' => $result->created ? 201 : 200,
                'headers' => [],
                'body' => ApiResponse::success([
                    'forge_order_uuid' => $result->forgeOrderUuid,
                    'created' => $result->created,
                    'received_at' => $result->receivedAt,
                    'payload_sha256' => $result->payloadSha256,
                ]),
            ];
        } catch (ApiProblem $problem) {
            return [
                'statusCode' => $problem->getHttpStatus(),
                'headers' => $problem->getHeaders(),
                'body' => ApiResponse::error($problem->getErrorCodeValue(), $problem->getSafeMessage()),
            ];
        } catch (OrderConflictException $exception) {
            return [
                'statusCode' => 409,
                'headers' => [],
                'body' => ApiResponse::error(
                    'uuid_conflict',
                    'An order with this identifier is already stored with different information.'
                ),
            ];
        } catch (StorageUnavailableException $exception) {
            return [
                'statusCode' => 503,
                'headers' => [],
                'body' => ApiResponse::error(
                    'storage_unavailable',
                    'Forge order storage is currently unavailable.'
                ),
            ];
        } catch (Throwable $exception) {
            $this->reportUnexpectedException($exception);
            return [
                'statusCode' => 500,
                'headers' => [],
                'body' => ApiResponse::error(
                    'server_error',
                    'The Forge server could not store this order.'
                ),
            ];
        }
    }

    private function reportUnexpectedException(Throwable $exception): void
    {
        if (!is_callable($this->unexpectedExceptionReporter)) {
            return;
        }

        try {
            ($this->unexpectedExceptionReporter)($exception);
        } catch (Throwable $reportingFailure) {
            unset($reportingFailure);
        }
    }

    private function assertMethodIsPost(string $method): void
    {
        if (strtoupper(trim($method)) !== 'POST') {
            throw new ApiProblem(
                405,
                'method_not_allowed',
                'This endpoint accepts POST requests only.',
                ['Allow' => 'POST']
            );
        }
    }

    private function assertJsonContentType(?string $contentType): void
    {
        if (!OrderPayload::isJsonContentType($contentType)) {
            throw new ApiProblem(
                415,
                'unsupported_media_type',
                'The request must use Content-Type: application/json.'
            );
        }
    }

    private function assertRequestSize(string $rawBody, ?int $contentLength): void
    {
        $length = $contentLength;
        if ($length === null || $length < 0) {
            $length = strlen($rawBody);
        }

        if ($length > OrderPayload::MAX_REQUEST_BYTES) {
            throw new ApiProblem(
                413,
                'request_too_large',
                'The submitted order exceeds the maximum request size.'
            );
        }
    }

    private function currentUtcIso8601(): string
    {
        $value = ($this->clock)();

        if ($value instanceof \DateTimeImmutable) {
            return $value->setTimezone(new \DateTimeZone('UTC'))->format(\DateTimeInterface::ATOM);
        }

        if ($value instanceof \DateTimeInterface) {
            return \DateTimeImmutable::createFromInterface($value)
                ->setTimezone(new \DateTimeZone('UTC'))
                ->format(\DateTimeInterface::ATOM);
        }

        throw new \RuntimeException('Order handler clock must return a DateTimeInterface value.');
    }
}
