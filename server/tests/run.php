<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__, 2) . '/public/api/v1/staff/_endpoint.php';

use Forge\Server\OrderConflictException;
use Forge\Server\OrderHandler;
use Forge\Server\OrderPayload;
use Forge\Server\OrderRepositoryInterface;
use Forge\Server\StorageUnavailableException;
use Forge\Server\StoreOrderResult;

final class InMemoryOrderRepository implements OrderRepositoryInterface
{
    /** @var array<string, array{payload: array, payload_sha256: string, received_at: string}> */
    private array $records = [];
    private ?\Throwable $nextFailure = null;

    public function failOnce(\Throwable $failure): void
    {
        $this->nextFailure = $failure;
    }

    public function storeOrder(array $payload, string $canonicalJson, string $payloadSha256, string $receivedAt): StoreOrderResult
    {
        if ($this->nextFailure !== null) {
            $failure = $this->nextFailure;
            $this->nextFailure = null;
            throw $failure;
        }

        $forgeOrderUuid = $payload['forge_order_uuid'];
        if (!isset($this->records[$forgeOrderUuid])) {
            $this->records[$forgeOrderUuid] = [
                'payload' => json_decode($canonicalJson, true, 512, JSON_THROW_ON_ERROR),
                'payload_sha256' => $payloadSha256,
                'received_at' => $receivedAt,
            ];

            return new StoreOrderResult($forgeOrderUuid, true, $receivedAt, $payloadSha256);
        }

        $existing = $this->records[$forgeOrderUuid];
        if (hash_equals($existing['payload_sha256'], $payloadSha256)) {
            return new StoreOrderResult($forgeOrderUuid, false, $existing['received_at'], $existing['payload_sha256']);
        }

        throw new OrderConflictException('Conflict');
    }

    public function getStoredPayload(string $forgeOrderUuid): ?array
    {
        return $this->records[$forgeOrderUuid]['payload'] ?? null;
    }
}

final class DatabaseTimestampOrderRepository implements OrderRepositoryInterface
{
    /** @var array<string, array{payload: array, payload_sha256: string, received_at_database: string, received_at_iso8601: string}> */
    private array $records = [];

    public function storeOrder(array $payload, string $canonicalJson, string $payloadSha256, string $receivedAt): StoreOrderResult
    {
        $forgeOrderUuid = $payload['forge_order_uuid'];
        $receivedAtIso8601 = OrderPayload::normalizeIso8601Utc($receivedAt);
        $receivedAtDatabase = OrderPayload::normalizeDatabaseDateTime($receivedAtIso8601);

        if (!isset($this->records[$forgeOrderUuid])) {
            $this->records[$forgeOrderUuid] = [
                'payload' => json_decode($canonicalJson, true, 512, JSON_THROW_ON_ERROR),
                'payload_sha256' => $payloadSha256,
                'received_at_database' => $receivedAtDatabase,
                'received_at_iso8601' => $receivedAtIso8601,
            ];

            return new StoreOrderResult($forgeOrderUuid, true, $receivedAtIso8601, $payloadSha256);
        }

        $existing = $this->records[$forgeOrderUuid];
        if (hash_equals($existing['payload_sha256'], $payloadSha256)) {
            return new StoreOrderResult(
                $forgeOrderUuid,
                false,
                OrderPayload::databaseDateTimeToIso8601($existing['received_at_database']),
                $existing['payload_sha256']
            );
        }

        throw new OrderConflictException('Conflict');
    }
}

final class TestRunner
{
    private int $passed = 0;
    private int $failed = 0;

    public function run(string $name, callable $test): void
    {
        try {
            $test();
            $this->passed++;
            echo "PASS {$name}\n";
        } catch (\Throwable $exception) {
            $this->failed++;
            fwrite(STDERR, "FAIL {$name}: {$exception->getMessage()}\n");
        }
    }

    public function finish(): void
    {
        echo "\n{$this->passed} passed, {$this->failed} failed\n";
        exit($this->failed === 0 ? 0 : 1);
    }
}

function assertTrue($condition, string $message = 'Assertion failed.'): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assertSame($expected, $actual, string $message = 'Values are not identical.'): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ' but received ' . var_export($actual, true) . '.');
    }
}

function assertNotContains(string $needle, string $haystack, string $message = 'Unexpected string found.'): void
{
    if (strpos($haystack, $needle) !== false) {
        throw new RuntimeException($message);
    }
}

function assertThrows(callable $callback, callable $assertion, string $message = 'Expected exception was not thrown.'): void
{
    try {
        $callback();
    } catch (\Throwable $exception) {
        $assertion($exception);
        return;
    }

    throw new RuntimeException($message);
}

function createValidPayload(array $overrides = []): array
{
    $payload = [
        'payload_type' => 'forge_order',
        'schema_version' => '1.0',
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
        'forge_order_number' => null,
        'order_status' => 'submitted',
        'source' => 'customer_kiosk',
        'built_at' => '2026-07-17T12:00:00+00:00',
        'submitted_at' => '2026-07-17T12:00:01+00:00',
        'device_id' => 'ipad-1',
        'event' => [
            'event_id' => 'holiday-market',
            'event_name' => 'Holiday Market',
        ],
        'currency' => 'USD',
        'customer' => [
            'full_name' => 'Kyle Hemenway',
            'email' => 'customer@example.com',
        ],
        'fulfillment' => [
            'method' => 'shipping',
        ],
        'items' => [
            [
                'line_id' => '123e4567-e89b-42d3-a456-426614174000-line-1',
                'line_number' => 1,
                'quantity' => 1,
                'product_definition_id' => 'tree_ornament',
                'product_display_name' => 'Tree Ornament',
                'product_category' => 'ornament',
                'product_definition_version' => '1.0',
                'pricing' => [
                    'mode' => 'fixed',
                    'final_unit_price_cents' => 2600,
                ],
                'configuration_snapshot' => [
                    'familyName' => 'Hemenway',
                    'year' => '2026',
                ],
                'personalization_order' => [
                    [
                        'position' => 1,
                        'type' => 'person',
                        'name' => 'Kyle',
                    ],
                    [
                        'position' => 2,
                        'type' => 'pet',
                        'name' => 'Scout',
                        'icon' => 'paw',
                    ],
                ],
                'structured_attributes' => [
                    'family_name' => 'Hemenway',
                ],
                'open_flags' => [],
                'customer_note' => null,
                'production_note' => null,
            ],
        ],
        'pricing' => [
            'estimated_total_cents' => 2600,
        ],
        'open_flags' => [],
        'has_open_flags' => false,
    ];

    foreach ($overrides as $key => $value) {
        $payload[$key] = $value;
    }

    return $payload;
}

function createHandler(?OrderRepositoryInterface $repository = null, ?callable $unexpectedExceptionReporter = null): array
{
    $repository = $repository ?? new InMemoryOrderRepository();
    $handler = new OrderHandler(
        $repository,
        static function (): DateTimeImmutable {
            return new DateTimeImmutable('2026-07-17T12:30:00+00:00');
        },
        $unexpectedExceptionReporter
    );

    return [$handler, $repository];
}

$runner = new TestRunner();

$runner->run('valid UUID acceptance', static function (): void {
    OrderPayload::validatePayload(createValidPayload());
    assertTrue(true);
});

$runner->run('approved external payment metadata is accepted and preserved in canonical json', static function (): void {
    $payload = createValidPayload([
        'external_payment_method' => 'venmo',
        'payment_confirmed_at' => '2026-07-21T18:55:00+00:00',
    ]);

    OrderPayload::validatePayload($payload);
    $canonicalJson = OrderPayload::canonicalizeToJson($payload);

    assertTrue(strpos($canonicalJson, '"external_payment_method":"venmo"') !== false);
    assertTrue(strpos($canonicalJson, '"payment_confirmed_at":"2026-07-21T18:55:00+00:00"') !== false);
});

$runner->run('unsupported external payment metadata is rejected safely', static function (): void {
    assertThrows(
        static function (): void {
            OrderPayload::validatePayload(createValidPayload([
                'external_payment_method' => 'bitcoin',
                'payment_confirmed_at' => '2026-07-21T18:55:00+00:00',
            ]));
        },
        static function (\Throwable $exception): void {
            assertSame('The submitted order is missing required Forge fields.', $exception->getMessage());
        }
    );
});

$runner->run('partial external payment metadata is rejected safely', static function (): void {
    assertThrows(
        static function (): void {
            OrderPayload::validatePayload(createValidPayload([
                'external_payment_method' => 'cash',
            ]));
        },
        static function (\Throwable $exception): void {
            assertSame('The submitted order is missing required Forge fields.', $exception->getMessage());
        }
    );
});

$runner->run('invalid UUID rejection', static function (): void {
    assertThrows(
        static function (): void {
            OrderPayload::validatePayload(createValidPayload([
                'forge_order_uuid' => 'NOT-A-UUID',
            ]));
        },
        static function (\Throwable $exception): void {
            assertSame('The submitted order is missing required Forge fields.', $exception->getMessage());
        }
    );
});

$runner->run('non-ISO submitted_at rejection', static function (): void {
    assertThrows(
        static function (): void {
            OrderPayload::validatePayload(createValidPayload([
                'submitted_at' => 'next Tuesday at noon',
            ]));
        },
        static function (\Throwable $exception): void {
            assertSame('The submitted order is missing required Forge fields.', $exception->getMessage());
        }
    );
});

$runner->run('missing required fields rejection', static function (): void {
    assertThrows(
        static function (): void {
            $payload = createValidPayload();
            unset($payload['customer']);
            OrderPayload::validatePayload($payload);
        },
        static function (\Throwable $exception): void {
            assertSame('The submitted order is missing required Forge fields.', $exception->getMessage());
        }
    );
});

$runner->run('empty items rejection', static function (): void {
    assertThrows(
        static function (): void {
            OrderPayload::validatePayload(createValidPayload([
                'items' => [],
            ]));
        },
        static function (\Throwable $exception): void {
            assertSame('The submitted order is missing required Forge fields.', $exception->getMessage());
        }
    );
});

$runner->run('oversized-body rejection where testable at handler level', static function (): void {
    [$handler] = createHandler();
    $response = $handler->handleRequest(
        'POST',
        'application/json',
        '{}',
        OrderPayload::MAX_REQUEST_BYTES + 1
    );

    assertSame(413, $response['statusCode']);
    assertSame('request_too_large', $response['body']['error']['code']);
});

$runner->run('database DATETIME(6) converts to ISO-8601 UTC correctly', static function (): void {
    assertSame(
        '2026-07-18T12:27:39+00:00',
        OrderPayload::databaseDateTimeToIso8601('2026-07-18 12:27:39.123456')
    );
});

$runner->run('database DATETIME without microseconds converts to ISO-8601 UTC correctly', static function (): void {
    assertSame(
        '2026-07-18T12:27:39+00:00',
        OrderPayload::databaseDateTimeToIso8601('2026-07-18 12:27:39')
    );
});

$runner->run('malformed database timestamp is rejected safely', static function (): void {
    assertThrows(
        static function (): void {
            OrderPayload::databaseDateTimeToIso8601('2026-07-18T12:27:39Z trailing');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof InvalidArgumentException);
            assertSame('A valid database date-time value is required.', $exception->getMessage());
        }
    );
});

$runner->run('incoming ISO-8601 timestamp validation remains strict', static function (): void {
    assertThrows(
        static function (): void {
            OrderPayload::normalizeIso8601Utc('2026-07-18 12:27:39');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof InvalidArgumentException);
            assertSame('A valid ISO-8601 date-time value is required.', $exception->getMessage());
        }
    );
});

$runner->run('canonical object-key ordering produces identical hashes', static function (): void {
    $left = createValidPayload([
        'customer' => [
            'email' => 'customer@example.com',
            'full_name' => 'Kyle Hemenway',
        ],
    ]);
    $right = createValidPayload([
        'customer' => [
            'full_name' => 'Kyle Hemenway',
            'email' => 'customer@example.com',
        ],
    ]);

    assertSame(
        OrderPayload::hashCanonicalPayload($left),
        OrderPayload::hashCanonicalPayload($right)
    );
});

$runner->run('array-order changes produce different hashes', static function (): void {
    $left = createValidPayload();
    $right = createValidPayload([
        'items' => [
            array_merge($left['items'][0], [
                'personalization_order' => [
                    [
                        'position' => 1,
                        'type' => 'pet',
                        'name' => 'Scout',
                        'icon' => 'paw',
                    ],
                    [
                        'position' => 2,
                        'type' => 'person',
                        'name' => 'Kyle',
                    ],
                ],
            ]),
        ],
    ]);

    assertTrue(
        OrderPayload::hashCanonicalPayload($left) !== OrderPayload::hashCanonicalPayload($right),
        'Changing array order should change the payload hash.'
    );
});

$runner->run('personalization changes produce different hashes', static function (): void {
    $left = createValidPayload();
    $right = createValidPayload([
        'items' => [
            array_merge($left['items'][0], [
                'personalization_order' => [
                    [
                        'position' => 1,
                        'type' => 'person',
                        'name' => 'Meagan',
                    ],
                    [
                        'position' => 2,
                        'type' => 'pet',
                        'name' => 'Scout',
                        'icon' => 'paw',
                    ],
                ],
            ]),
        ],
    ]);

    assertTrue(
        OrderPayload::hashCanonicalPayload($left) !== OrderPayload::hashCanonicalPayload($right),
        'Changing personalization data should change the payload hash.'
    );
});

$runner->run('first create returns created true', static function (): void {
    [$handler] = createHandler();
    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    assertSame(201, $response['statusCode']);
    assertSame(true, $response['body']['data']['created']);
});

$runner->run('identical UUID and payload returns created false', static function (): void {
    [$handler] = createHandler();
    $body = json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $first = $handler->handleRequest('POST', 'application/json', $body);
    $second = $handler->handleRequest('POST', 'application/json', $body);

    assertSame(201, $first['statusCode']);
    assertSame(200, $second['statusCode']);
    assertSame(false, $second['body']['data']['created']);
});

$runner->run('identical retry returns the original received_at value and leaves the stored record unchanged', static function (): void {
    [$handler, $repository] = createHandler();
    $payload = createValidPayload();
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $first = $handler->handleRequest('POST', 'application/json', $body);
    $firstReceivedAt = $first['body']['data']['received_at'];
    $storedAfterFirst = $repository->getStoredPayload($payload['forge_order_uuid']);

    $second = $handler->handleRequest('POST', 'application/json', $body);
    $storedAfterSecond = $repository->getStoredPayload($payload['forge_order_uuid']);

    assertSame(201, $first['statusCode']);
    assertSame(200, $second['statusCode']);
    assertSame(false, $second['body']['data']['created']);
    assertSame($firstReceivedAt, $second['body']['data']['received_at']);
    assertSame($storedAfterFirst, $storedAfterSecond);
});

$runner->run('duplicate identical order returns HTTP 200 created false and preserves the original database-backed received_at', static function (): void {
    [$handler] = createHandler(new DatabaseTimestampOrderRepository());
    $body = json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $first = $handler->handleRequest('POST', 'application/json', $body);
    $second = $handler->handleRequest('POST', 'application/json', $body);

    assertSame(201, $first['statusCode']);
    assertSame(200, $second['statusCode']);
    assertSame(false, $second['body']['data']['created']);
    assertSame($first['body']['data']['received_at'], $second['body']['data']['received_at']);
});

$runner->run('same UUID with different payload produces uuid_conflict', static function (): void {
    [$handler] = createHandler();
    $first = json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $second = json_encode(createValidPayload([
        'items' => [
            array_merge(createValidPayload()['items'][0], [
                'personalization_order' => [
                    [
                        'position' => 1,
                        'type' => 'person',
                        'name' => 'Changed Name',
                    ],
                ],
            ]),
        ],
    ]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $handler->handleRequest('POST', 'application/json', $first);
    $response = $handler->handleRequest('POST', 'application/json', $second);

    assertSame(409, $response['statusCode']);
    assertSame('uuid_conflict', $response['body']['error']['code']);
});

$runner->run('existing payload is not overwritten during a conflict', static function (): void {
    [$handler, $repository] = createHandler();
    $originalPayload = createValidPayload();
    $changedPayload = createValidPayload([
        'customer' => [
            'full_name' => 'Changed Customer',
            'email' => 'changed@example.com',
        ],
    ]);

    $handler->handleRequest('POST', 'application/json', json_encode($originalPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $handler->handleRequest('POST', 'application/json', json_encode($changedPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    $storedPayload = $repository->getStoredPayload($originalPayload['forge_order_uuid']);
    assertSame('Kyle Hemenway', $storedPayload['customer']['full_name']);
});

$runner->run('safe errors do not expose payload contents or exception details', static function (): void {
    [$handler, $repository] = createHandler();
    $repository->failOnce(new StorageUnavailableException('mysql://root:secret@db-host.internal'));
    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload([
            'customer' => [
                'full_name' => 'Kyle Hemenway',
                'email' => 'hidden@example.com',
            ],
        ]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    $encodedResponse = json_encode($response['body'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    assertSame(503, $response['statusCode']);
    assertNotContains('hidden@example.com', $encodedResponse);
    assertNotContains('mysql://root:secret@db-host.internal', $encodedResponse);
});

$runner->run('unexpected exception invokes reporter exactly once with the original throwable', static function (): void {
    $reportCount = 0;
    $reportedException = null;
    $repository = new InMemoryOrderRepository();
    $failure = new RuntimeException('Unexpected repository failure');
    $repository->failOnce($failure);

    [$handler] = createHandler(
        $repository,
        static function (\Throwable $exception) use (&$reportCount, &$reportedException): void {
            $reportCount++;
            $reportedException = $exception;
        }
    );

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    assertSame(500, $response['statusCode']);
    assertSame('server_error', $response['body']['error']['code']);
    assertSame(1, $reportCount);
    assertTrue($reportedException === $failure, 'Reporter should receive the original throwable instance.');
});

$runner->run('reporter failures do not change the safe 500 response', static function (): void {
    $reportCount = 0;
    $repository = new InMemoryOrderRepository();
    $repository->failOnce(new RuntimeException('Unexpected repository failure'));

    [$handler] = createHandler(
        $repository,
        static function (\Throwable $exception) use (&$reportCount): void {
            $reportCount++;
            throw new RuntimeException('Reporter failure');
        }
    );

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    assertSame(500, $response['statusCode']);
    assertSame('server_error', $response['body']['error']['code']);
    assertSame('The Forge server could not store this order.', $response['body']['error']['message']);
    assertSame(1, $reportCount);
});

$runner->run('validation errors do not invoke reporter', static function (): void {
    $reportCount = 0;
    [$handler] = createHandler(
        null,
        static function (\Throwable $exception) use (&$reportCount): void {
            $reportCount++;
        }
    );

    $response = $handler->handleRequest('POST', 'application/json', '{"forge_order_uuid": ');

    assertSame(422, $response['statusCode']);
    assertSame('invalid_json', $response['body']['error']['code']);
    assertSame(0, $reportCount);
});

$runner->run('storage unavailable exceptions do not invoke reporter', static function (): void {
    $reportCount = 0;
    $repository = new InMemoryOrderRepository();
    $repository->failOnce(new StorageUnavailableException('Storage unavailable'));

    [$handler] = createHandler(
        $repository,
        static function (\Throwable $exception) use (&$reportCount): void {
            $reportCount++;
        }
    );

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    assertSame(503, $response['statusCode']);
    assertSame('storage_unavailable', $response['body']['error']['code']);
    assertSame(0, $reportCount);
});

$runner->run('order conflicts do not invoke reporter', static function (): void {
    $reportCount = 0;
    [$handler] = createHandler(
        null,
        static function (\Throwable $exception) use (&$reportCount): void {
            $reportCount++;
        }
    );

    $first = json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $second = json_encode(createValidPayload([
        'items' => [
            array_merge(createValidPayload()['items'][0], [
                'personalization_order' => [
                    [
                        'position' => 1,
                        'type' => 'person',
                        'name' => 'Changed Name',
                    ],
                ],
            ]),
        ],
    ]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $handler->handleRequest('POST', 'application/json', $first);
    $response = $handler->handleRequest('POST', 'application/json', $second);

    assertSame(409, $response['statusCode']);
    assertSame('uuid_conflict', $response['body']['error']['code']);
    assertSame(0, $reportCount);
});

$runner->run('method-not-allowed behavior', static function (): void {
    [$handler] = createHandler();
    $response = $handler->handleRequest('GET', 'application/json', '');

    assertSame(405, $response['statusCode']);
    assertSame('POST', $response['headers']['Allow']);
    assertSame('method_not_allowed', $response['body']['error']['code']);
});

$runner->run('unsupported-content-type behavior', static function (): void {
    [$handler] = createHandler();
    $response = $handler->handleRequest('POST', 'text/plain', '{}');

    assertSame(415, $response['statusCode']);
    assertSame('unsupported_media_type', $response['body']['error']['code']);
});

$runner->run('invalid-JSON behavior', static function (): void {
    [$handler] = createHandler();
    $response = $handler->handleRequest('POST', 'application/json', '{"forge_order_uuid": ');

    assertSame(422, $response['statusCode']);
    assertSame('invalid_json', $response['body']['error']['code']);
});

$runner->run('environment values override fallback config', static function (): void {
    $resolved = \Forge\Server\DatabaseConnectionFactory::resolveConfiguration(
        [
            'FORGE_DB_DSN' => 'mysql:host=localhost;dbname=env_db;charset=utf8mb4',
            'FORGE_DB_USER' => 'env_user',
            'FORGE_DB_PASSWORD' => 'env_password',
        ],
        [
            'FORGE_DB_DSN' => 'mysql:host=localhost;dbname=fallback_db;charset=utf8mb4',
            'FORGE_DB_USER' => 'fallback_user',
            'FORGE_DB_PASSWORD' => 'fallback_password',
        ]
    );

    assertSame('mysql:host=localhost;dbname=env_db;charset=utf8mb4', $resolved['FORGE_DB_DSN']);
    assertSame('env_user', $resolved['FORGE_DB_USER']);
    assertSame('env_password', $resolved['FORGE_DB_PASSWORD']);
});

$runner->run('fallback values work when environment values are absent', static function (): void {
    $resolved = \Forge\Server\DatabaseConnectionFactory::resolveConfiguration(
        [
            'FORGE_DB_DSN' => false,
            'FORGE_DB_USER' => false,
            'FORGE_DB_PASSWORD' => false,
        ],
        [
            'FORGE_DB_DSN' => 'mysql:host=localhost;dbname=fallback_db;charset=utf8mb4',
            'FORGE_DB_USER' => 'fallback_user',
            'FORGE_DB_PASSWORD' => 'fallback_password',
        ]
    );

    assertSame('mysql:host=localhost;dbname=fallback_db;charset=utf8mb4', $resolved['FORGE_DB_DSN']);
    assertSame('fallback_user', $resolved['FORGE_DB_USER']);
    assertSame('fallback_password', $resolved['FORGE_DB_PASSWORD']);
});

$runner->run('missing required values produce storage-unavailable behavior', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\DatabaseConnectionFactory::resolveConfiguration(
                [
                    'FORGE_DB_DSN' => false,
                    'FORGE_DB_USER' => false,
                    'FORGE_DB_PASSWORD' => false,
                ],
                []
            );
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof StorageUnavailableException);
            assertSame('Forge order storage is currently unavailable.', $exception->getMessage());
        }
    );
});

$runner->run('invalid config return type fails safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\normalizePrivateDatabaseConfig('not-an-array');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof StorageUnavailableException);
            assertSame('Forge order storage is currently unavailable.', $exception->getMessage());
        }
    );
});

$runner->run('unapproved config keys are ignored', static function (): void {
    $config = \Forge\Server\normalizePrivateDatabaseConfig([
        'FORGE_DB_DSN' => 'mysql:host=localhost;dbname=fallback_db;charset=utf8mb4',
        'FORGE_DB_USER' => 'fallback_user',
        'FORGE_DB_PASSWORD' => 'fallback_password',
        'UNAPPROVED_KEY' => 'should-be-ignored',
    ]);

    assertTrue(!array_key_exists('UNAPPROVED_KEY', $config));
    assertSame('fallback_user', $config['FORGE_DB_USER']);
});

$runner->run('safe storage exceptions do not expose configuration values', static function (): void {
    $dsn = 'mysql:host=localhost;dbname=sensitive_db;charset=utf8mb4';
    $user = 'sensitive_user';
    $password = 'super-secret-password';

    assertThrows(
        static function () use ($dsn, $password): void {
            \Forge\Server\DatabaseConnectionFactory::resolveConfiguration(
                [
                    'FORGE_DB_DSN' => '   ',
                    'FORGE_DB_USER' => false,
                    'FORGE_DB_PASSWORD' => false,
                ],
                [
                    'FORGE_DB_DSN' => $dsn,
                    'FORGE_DB_USER' => '',
                    'FORGE_DB_PASSWORD' => $password,
                ]
            );
        },
        static function (\Throwable $exception) use ($dsn, $user, $password): void {
            $message = $exception->getMessage();
            assertSame('Forge order storage is currently unavailable.', $message);
            assertNotContains($dsn, $message);
            assertNotContains($user, $message);
            assertNotContains($password, $message);
        }
    );
});

$runner->run('private server config preserves the approved staff pin hash key', static function (): void {
    $config = \Forge\Server\normalizePrivateServerConfig([
        'FORGE_DB_DSN' => 'mysql:host=localhost;dbname=fallback_db;charset=utf8mb4',
        'FORGE_DB_USER' => 'fallback_user',
        'FORGE_DB_PASSWORD' => 'fallback_password',
        'FORGE_STAFF_PIN_HASH' => '$2y$10$examplehashvalue',
        'UNAPPROVED_KEY' => 'ignored',
    ]);

    assertSame('$2y$10$examplehashvalue', $config['FORGE_STAFF_PIN_HASH']);
    assertTrue(!array_key_exists('UNAPPROVED_KEY', $config));
});

$runner->run('staff pin hash resolves from environment or fallback config', static function (): void {
    $resolvedFromEnvironment = \Forge\Server\resolveStaffPinHash(
        ['FORGE_STAFF_PIN_HASH' => '$2y$10$envhashvalue'],
        ['FORGE_STAFF_PIN_HASH' => '$2y$10$fallbackhashvalue']
    );
    $resolvedFromFallback = \Forge\Server\resolveStaffPinHash(
        ['FORGE_STAFF_PIN_HASH' => false],
        ['FORGE_STAFF_PIN_HASH' => '$2y$10$fallbackhashvalue']
    );

    assertSame('$2y$10$envhashvalue', $resolvedFromEnvironment);
    assertSame('$2y$10$fallbackhashvalue', $resolvedFromFallback);
});

$runner->run('missing staff pin hash fails safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\resolveStaffPinHash(
                ['FORGE_STAFF_PIN_HASH' => false],
                []
            );
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof StorageUnavailableException);
            assertSame('Staff authentication is currently unavailable.', $exception->getMessage());
        }
    );
});

$runner->run('staff pin verification uses password_verify safely', static function (): void {
    $pinHash = password_hash('2468', PASSWORD_DEFAULT);

    assertTrue(\Forge\Server\verifyStaffPin('2468', $pinHash));
    assertTrue(!\Forge\Server\verifyStaffPin('0000', $pinHash));
    assertTrue(!\Forge\Server\verifyStaffPin('', $pinHash));
});

$runner->run('staff session cookie parameters are secure for hosted https requests', static function (): void {
    $params = \Forge\Server\buildStaffSessionCookieParams([
        'HTTPS' => 'on',
        'SERVER_PORT' => '443',
    ]);

    assertSame(true, $params['secure']);
    assertSame(true, $params['httponly']);
    assertSame('Strict', $params['samesite']);
    assertSame('/', $params['path']);
});

$runner->run('staff session cookie parameters stay non-secure off https for local development', static function (): void {
    $params = \Forge\Server\buildStaffSessionCookieParams([
        'HTTPS' => 'off',
        'SERVER_PORT' => '80',
    ]);

    assertSame(false, $params['secure']);
    assertSame(true, $params['httponly']);
    assertSame('Strict', $params['samesite']);
});

$runner->run('stored staff order records normalize payload JSON and UTC timestamps', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00.123456',
        'received_at' => '2026-07-19 10:05:00',
        'updated_at' => '2026-07-19 10:06:00.500000',
        'device_id' => 'ipad-1',
        'event_id' => 'holiday-market',
        'payload_sha256' => str_repeat('a', 64),
        'payload_json' => json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);

    assertSame('2026-07-19T10:00:00+00:00', $record['submitted_at']);
    assertSame('2026-07-19T10:05:00+00:00', $record['received_at']);
    assertSame('2026-07-19T10:06:00+00:00', $record['updated_at']);
    assertSame('holiday-market', $record['event_id']);
    assertSame('123e4567-e89b-42d3-a456-426614174000', $record['payload']['forge_order_uuid']);
});

$runner->run('stored staff order records default missing production fields to submitted with no tray', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00',
        'received_at' => '2026-07-19 10:05:00',
        'updated_at' => '2026-07-19 10:06:00',
        'payload_sha256' => str_repeat('a', 64),
        'payload_json' => json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);

    assertSame('submitted', $record['production_status']);
    assertSame(null, $record['current_tray_number']);
});

$runner->run('stored staff order records infer tray assigned when a tray number exists', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00',
        'received_at' => '2026-07-19 10:05:00',
        'updated_at' => '2026-07-19 10:06:00',
        'current_tray_number' => '12',
        'payload_sha256' => str_repeat('b', 64),
        'payload_json' => json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);

    assertSame('tray_assigned', $record['production_status']);
    assertSame(12, $record['current_tray_number']);
});

$runner->run('stored staff order records preserve later production lifecycle statuses', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00',
        'received_at' => '2026-07-19 10:05:00',
        'updated_at' => '2026-07-19 10:06:00',
        'production_status' => 'packed',
        'payload_sha256' => str_repeat('b', 64),
        'payload_json' => json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);

    assertSame('packed', $record['production_status']);
    assertSame(null, $record['current_tray_number']);
});

$runner->run('stored staff order records default legacy item production fields to pending with zero completed quantity', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00',
        'received_at' => '2026-07-19 10:05:00',
        'updated_at' => '2026-07-19 10:06:00',
        'payload_sha256' => str_repeat('c', 64),
        'payload_json' => json_encode(createValidPayload([
            'items' => [
                [
                    'line_number' => 1,
                    'quantity' => 2,
                    'product_definition_id' => 'tree_ornament',
                    'product_display_name' => 'Tree Ornament',
                    'structured_attributes' => [
                        'production_status' => 'not_started',
                    ],
                ],
            ],
        ]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);

    assertSame('123e4567-e89b-42d3-a456-426614174000-line-1', $record['payload']['items'][0]['line_id']);
    assertSame('pending', $record['payload']['items'][0]['production_status']);
    assertSame(0, $record['payload']['items'][0]['completed_quantity']);
    assertSame(2, $record['total_item_count']);
    assertSame(0, $record['completed_item_count']);
});

$runner->run('stored staff order records merge item production rows into ready-to-pack lifecycle counts', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord(
        [
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
            'record_version' => '1.0',
            'source' => 'customer_kiosk',
            'submitted_at' => '2026-07-19 10:00:00',
            'received_at' => '2026-07-19 10:05:00',
            'updated_at' => '2026-07-19 10:06:00',
            'current_tray_number' => 5,
            'ready_to_pack_at' => '2026-07-19 10:06:00.000000',
            'payload_sha256' => str_repeat('d', 64),
            'payload_json' => json_encode(createValidPayload([
                'items' => [
                    [
                        'line_id' => 'line-a',
                        'line_number' => 1,
                        'quantity' => 1,
                        'product_definition_id' => 'tree_ornament',
                        'product_display_name' => 'Tree Ornament',
                        'structured_attributes' => [],
                    ],
                    [
                        'line_id' => 'line-b',
                        'line_number' => 2,
                        'quantity' => 2,
                        'product_definition_id' => 'reindeer_ornament',
                        'product_display_name' => 'Reindeer Ornament',
                        'structured_attributes' => [],
                    ],
                ],
            ]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ],
        [
            [
                'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
                'line_id' => 'line-a',
                'required_quantity' => 1,
                'completed_quantity' => 1,
                'production_status' => 'complete',
                'completed_at' => '2026-07-19 10:04:00.000000',
                'updated_at' => '2026-07-19 10:04:00.000000',
            ],
            [
                'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
                'line_id' => 'line-b',
                'required_quantity' => 2,
                'completed_quantity' => 2,
                'production_status' => 'complete',
                'completed_at' => '2026-07-19 10:06:00.000000',
                'updated_at' => '2026-07-19 10:06:00.000000',
            ],
        ]
    );

    assertSame('ready_to_pack', $record['production_status']);
    assertSame(3, $record['total_item_count']);
    assertSame(3, $record['completed_item_count']);
    assertSame('2026-07-19T10:06:00+00:00', $record['ready_to_pack_at']);
    assertSame('complete', $record['payload']['items'][1]['production_status']);
    assertSame(2, $record['payload']['items'][1]['completed_quantity']);
});

$runner->run('stored staff order records stay in production when open flags remain after all pieces are complete', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord(
        [
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
            'record_version' => '1.0',
            'source' => 'customer_kiosk',
            'submitted_at' => '2026-07-19 10:00:00',
            'received_at' => '2026-07-19 10:05:00',
            'updated_at' => '2026-07-19 10:06:00',
            'current_tray_number' => 5,
            'payload_sha256' => str_repeat('e', 64),
            'payload_json' => json_encode(createValidPayload([
                'has_open_flags' => true,
                'open_flags' => [
                    ['code' => 'needs_clarification', 'message' => 'Needs clarification'],
                ],
            ]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ],
        [
            [
                'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
                'line_id' => '123e4567-e89b-42d3-a456-426614174000-line-1',
                'required_quantity' => 1,
                'completed_quantity' => 1,
                'production_status' => 'complete',
                'completed_at' => '2026-07-19 10:06:00.000000',
                'updated_at' => '2026-07-19 10:06:00.000000',
            ],
        ]
    );

    assertSame('in_production', $record['production_status']);
    assertSame(null, $record['ready_to_pack_at']);
    assertSame(true, $record['has_open_flags']);
});

$runner->run('configured tray numbers are deduplicated and sorted numerically', static function (): void {
    $trayNumbers = \Forge\Server\parseConfiguredTrayNumbers('12, 2, 7 2 4');

    assertSame([2, 4, 7, 12], $trayNumbers);
});

$runner->run('configured tray numbers accept the deployed comma-separated format', static function (): void {
    $trayNumbers = \Forge\Server\parseConfiguredTrayNumbers('1,2,3,4,5,6,7,8,9,10,11,12');

    assertSame([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], $trayNumbers);
});

$runner->run('private tray config uses config array value when environment is absent', static function (): void {
    $resolvedValue = \Forge\Server\resolvePrivateTrayNumbersConfigValue(false, [
        'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6,7,8,9,10,11,12',
    ]);

    assertSame('1,2,3,4,5,6,7,8,9,10,11,12', $resolvedValue);
});

$runner->run('private tray config gives non-empty environment values precedence over config array values', static function (): void {
    $resolvedValue = \Forge\Server\resolvePrivateTrayNumbersConfigValue('4,5,6', [
        'FORGE_TRAY_NUMBERS' => '1,2,3',
    ]);

    assertSame('4,5,6', $resolvedValue);
});

$runner->run('private bootstrap normalization preserves both staff auth and tray configuration keys', static function (): void {
    $normalized = \Forge\Server\normalizePrivateServerConfig([
        'FORGE_DB_DSN' => 'mysql:host=localhost;dbname=test;charset=utf8mb4',
        'FORGE_DB_USER' => 'forge_user',
        'FORGE_DB_PASSWORD' => 'secret',
        'FORGE_STAFF_PIN_HASH' => '$2y$example',
        'FORGE_TRAY_NUMBERS' => '1,2,3',
        'IGNORED_KEY' => 'ignored',
    ]);

    assertSame('$2y$example', $normalized['FORGE_STAFF_PIN_HASH']);
    assertSame('1,2,3', $normalized['FORGE_TRAY_NUMBERS']);
    assertTrue(!array_key_exists('IGNORED_KEY', $normalized));
});

$runner->run('staff endpoint bootstrap candidates preserve the hosted forge_server_test sibling layout', static function (): void {
    $candidates = forge_staff_bootstrap_candidates(null, '/home/example/domains/forge.thehilltopshop.com/public_html/api/v1/staff');

    assertSame('/home/example/domains/forge.thehilltopshop.com/forge_server_test/bootstrap.php', $candidates[0]);
    assertSame('/home/example/domains/forge.thehilltopshop.com/public_html/server/bootstrap.php', $candidates[1]);
});

$runner->run('stateless staff pin verification validates a correct pin without creating a php session', static function (): void {
    $pinHash = password_hash('2468', PASSWORD_DEFAULT);
    $sessionStatusBefore = session_status();

    $verified = \Forge\Server\verifyStaffPinStateless($pinHash, '2468');

    assertSame(true, $verified);
    assertSame($sessionStatusBefore, session_status());
});

$runner->run('stateless staff pin verification rejects an incorrect pin without creating a php session', static function (): void {
    $pinHash = password_hash('2468', PASSWORD_DEFAULT);
    $sessionStatusBefore = session_status();

    $verified = \Forge\Server\verifyStaffPinStateless($pinHash, '1357');

    assertSame(false, $verified);
    assertSame($sessionStatusBefore, session_status());
});

$runner->run('configured tray numbers reject non-numeric tokens safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\parseConfiguredTrayNumbers('trays 1 through 12');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof InvalidArgumentException);
            assertSame('A valid positive tray number is required.', $exception->getMessage());
        }
    );
});

$runner->run('catalog migration creates the isolated forge_catalog_designs table', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__) . '/migrations/004_create_forge_catalog_designs.sql');

    assertTrue(is_string($migrationSource));
    assertTrue(strpos($migrationSource, 'CREATE TABLE IF NOT EXISTS forge_catalog_designs') !== false);
    assertTrue(strpos($migrationSource, 'forge_orders') === false);
    assertTrue(strpos($migrationSource, 'forge_production_trays') === false);
});

$runner->run('catalog design validation accepts approved enum values', static function (): void {
    $normalized = \Forge\Server\validateAndNormalizeStaffCatalogDesignInput([
        'design_name' => '  Lone Star Ranch Stamp  ',
        'category' => 'western_rodeo',
        'store_fit' => 'feed_western',
        'status' => 'review',
        'production_method' => 'leatherette_engraving',
        'production_file_location' => ' Shared Drive / Western / Ranch Stamp.ai ',
        'made_on_hat' => 'unknown',
        'notes' => ' First proof pending. ',
    ]);

    assertSame('Lone Star Ranch Stamp', $normalized['design_name']);
    assertSame('western_rodeo', $normalized['category']);
    assertSame('feed_western', $normalized['store_fit']);
    assertSame('review', $normalized['status']);
    assertSame('leatherette_engraving', $normalized['production_method']);
    assertSame('Shared Drive / Western / Ranch Stamp.ai', $normalized['production_file_location']);
    assertSame('unknown', $normalized['made_on_hat']);
});

$runner->run('catalog design validation rejects invalid enum values safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\validateAndNormalizeStaffCatalogDesignInput([
                'design_name' => 'Hill Country Floral Patch',
                'category' => 'not_real',
                'store_fit' => 'boutique',
                'status' => 'active',
                'production_method' => 'uv_print',
                'production_file_location' => 'Shared Drive',
                'made_on_hat' => 'yes',
                'notes' => '',
            ]);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffDesignCatalogValidationException);
            assertSame('Select a valid category.', $exception->getFieldErrors()['category']);
        }
    );
});

$runner->run('catalog importer derives readable design names from filenames', static function (): void {
    assertSame(
        'Texas Landscape Patch V2',
        \Forge\Server\deriveStaffCatalogDesignNameFromFileName('TEXAS LANDSCAPE_PATCH_V2.png')
    );
    assertSame(
        'Hilltop Ridgeline Acrylic',
        \Forge\Server\deriveStaffCatalogDesignNameFromFileName('hilltop_Ridgeline_Acrylic.jpg')
    );
    assertSame(
        'Don’t Mess With Texas Snake',
        \Forge\Server\deriveStaffCatalogDesignNameFromFileName('Don’t Mess with Texas Snake.jpg')
    );
});

$runner->run('catalog importer recognizes supported images and excludes hidden or unsupported files', static function (): void {
    assertSame(true, \Forge\Server\isSupportedStaffCatalogPreviewImageFile('preview.png'));
    assertSame(true, \Forge\Server\isSupportedStaffCatalogPreviewImageFile('preview.jpeg'));
    assertSame(true, \Forge\Server\isSupportedStaffCatalogPreviewImageFile('preview.webp'));
    assertSame(false, \Forge\Server\isSupportedStaffCatalogPreviewImageFile('.DS_Store'));
    assertSame(false, \Forge\Server\isSupportedStaffCatalogPreviewImageFile('DESIGN PREVIEW_TEMPLATE.ai'));
    assertSame(true, \Forge\Server\shouldSkipStaffCatalogImportFile('.hidden-file'));
    assertSame(true, \Forge\Server\shouldSkipStaffCatalogImportFile('~tempfile.png'));
});

$runner->run('catalog importer generates deterministic managed thumbnail filenames safely', static function (): void {
    $file = createTempImportPreviewFile('deterministic-source.png', 'preview-a');

    try {
        $fileNameOne = \Forge\Server\buildStaffCatalogManagedThumbnailFileName($file);
        $fileNameTwo = \Forge\Server\buildStaffCatalogManagedThumbnailFileName($file);

        assertSame($fileNameOne, $fileNameTwo);
        assertTrue(str_starts_with($fileNameOne, 'design-'));
        assertTrue(str_ends_with($fileNameOne, '.png'));
        assertSame('/uploads/design-thumbnails/' . $fileNameOne, \Forge\Server\buildStaffCatalogManagedThumbnailRelativePath($fileNameOne));
    } finally {
        @unlink($file);
    }
});

$runner->run('catalog importer dry-run makes no database or filesystem changes', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/TEXAS LANDSCAPE_PATCH_V2.png', 'dry-run-preview');
        $repository = new class implements \Forge\Server\StaffDesignCatalogImportRepositoryInterface {
            public int $createdCount = 0;
            public function listDesigns(): array
            {
                return [];
            }
            public function createImportedDesign(array $input, string $thumbnailPath): array
            {
                $this->createdCount++;
                return [];
            }
        };

        $importer = new \Forge\Server\StaffDesignCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, true);

        assertSame(1, $summary['imported']);
        assertSame(0, $repository->createdCount);
        assertSame([], array_values(array_diff(scandir($uploadDirectory) ?: [], ['.', '..'])));
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('catalog importer rerun is idempotent when the design and managed thumbnail already exist', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        $sourceFile = $sourceDirectory . '/Texas Raised Hill Country Tough.jpg';
        file_put_contents($sourceFile, 'same-preview-file');
        $fileName = \Forge\Server\buildStaffCatalogManagedThumbnailFileName($sourceFile);
        $relativePath = \Forge\Server\buildStaffCatalogManagedThumbnailRelativePath($fileName);
        file_put_contents($uploadDirectory . '/' . $fileName, 'same-preview-file');

        $repository = new class($relativePath) implements \Forge\Server\StaffDesignCatalogImportRepositoryInterface {
            private string $relativePath;
            public int $createdCount = 0;
            public function __construct(string $relativePath)
            {
                $this->relativePath = $relativePath;
            }
            public function listDesigns(): array
            {
                return [[
                    'id' => '123e4567-e89b-42d3-a456-426614174999',
                    'design_name' => 'Texas Raised Hill Country Tough',
                    'thumbnail_path' => $this->relativePath,
                ]];
            }
            public function createImportedDesign(array $input, string $thumbnailPath): array
            {
                $this->createdCount++;
                return [];
            }
        };

        $importer = new \Forge\Server\StaffDesignCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, false);

        assertSame(0, $summary['imported']);
        assertSame(1, $summary['skipped']);
        assertSame('already_imported', $summary['skipped_records'][0]['reason']);
        assertSame(0, $repository->createdCount);
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('catalog importer reports duplicate-name collisions instead of importing', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/Texas Team First.jpg', 'preview-team-first');
        $repository = new class implements \Forge\Server\StaffDesignCatalogImportRepositoryInterface {
            public function listDesigns(): array
            {
                return [[
                    'id' => '123e4567-e89b-42d3-a456-426614174998',
                    'design_name' => 'Texas Team First',
                    'thumbnail_path' => '/uploads/design-thumbnails/other-file.jpg',
                ]];
            }
            public function createImportedDesign(array $input, string $thumbnailPath): array
            {
                throw new RuntimeException('Should not create during collision handling.');
            }
        };

        $importer = new \Forge\Server\StaffDesignCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, false);

        assertSame(0, $summary['imported']);
        assertSame(1, $summary['collisions']);
        assertSame('existing_design_name_conflict', $summary['collision_records'][0]['reason']);
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('catalog importer continues after a partial failure and reports the error safely', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/Texas Team First.jpg', 'ok-preview');
        file_put_contents($sourceDirectory . '/Texas Overwatch.jpg', 'fail-preview');
        $repository = new class implements \Forge\Server\StaffDesignCatalogImportRepositoryInterface {
            public function listDesigns(): array
            {
                return [];
            }
            public function createImportedDesign(array $input, string $thumbnailPath): array
            {
                if (($input['design_name'] ?? '') === 'Texas Overwatch') {
                    throw new RuntimeException('Synthetic repository failure.');
                }
                return [
                    'id' => '123e4567-e89b-42d3-a456-426614174997',
                    'design_name' => $input['design_name'],
                    'thumbnail_path' => $thumbnailPath,
                ];
            }
        };

        $importer = new \Forge\Server\StaffDesignCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, false);

        assertSame(1, $summary['imported']);
        assertSame(1, $summary['failed']);
        assertSame('import_failed', $summary['failed_records'][0]['reason']);
        assertSame('Texas Overwatch', $summary['failed_records'][0]['design_name']);
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('catalog thumbnail endpoint source enforces authenticated png jpeg webp uploads with a 5mb limit', static function (): void {
    $endpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/design-thumbnail.php');

    assertTrue(is_string($endpointSource));
    assertTrue(strpos($endpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($endpointSource, 'FILEINFO_MIME_TYPE') !== false);
    assertTrue(strpos($endpointSource, "'image/png'") !== false);
    assertTrue(strpos($endpointSource, "'image/jpeg'") !== false);
    assertTrue(strpos($endpointSource, "'image/webp'") !== false);
    assertTrue(strpos($endpointSource, 'FORGE_DESIGN_CATALOG_MAX_UPLOAD_BYTES = 5242880') !== false);
});

$runner->run('catalog list endpoint no longer seeds localhost development fixtures', static function (): void {
    $endpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/designs.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-design-catalog-repository.php');

    assertTrue(is_string($endpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(strpos($endpointSource, 'seedDevelopmentFixtureRecordsIfEmpty') === false);
    assertTrue(strpos($repositorySource, 'shouldSeedDevelopmentDesignCatalogFixtures') === false);
    assertTrue(strpos($repositorySource, 'buildStaffCatalogDevelopmentFixtures') === false);
});

$runner->run('catalog list endpoint source requires staff authentication and does not reference order tables', static function (): void {
    $endpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/designs.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-design-catalog-repository.php');

    assertTrue(is_string($endpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(strpos($endpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($repositorySource, 'forge_orders') === false);
    assertTrue(strpos($repositorySource, 'forge_tray_assignment_history') === false);
});

$runner->run('invalid stored staff order payload fails safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\normalizeStoredStaffOrderRecord([
                'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174000',
                'record_version' => '1.0',
                'source' => 'customer_kiosk',
                'submitted_at' => '2026-07-19 10:00:00',
                'received_at' => '2026-07-19 10:05:00',
                'updated_at' => '2026-07-19 10:06:00',
                'payload_sha256' => str_repeat('a', 64),
                'payload_json' => '{invalid',
            ]);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof InvalidArgumentException);
            assertSame('A valid stored staff order payload is required.', $exception->getMessage());
        }
    );
});

function createTempImportDirectory(): string
{
    $baseDirectory = sys_get_temp_dir() . '/forge-catalog-import-' . bin2hex(random_bytes(6));
    if (!mkdir($baseDirectory, 0777, true) && !is_dir($baseDirectory)) {
        throw new RuntimeException('Temporary import directory could not be created.');
    }

    return $baseDirectory;
}

function createTempImportPreviewFile(string $fileName, string $contents): string
{
    $directory = createTempImportDirectory();
    $filePath = $directory . '/' . $fileName;
    file_put_contents($filePath, $contents);
    return $filePath;
}

function removeTempImportDirectory(string $directory): void
{
    if (!is_dir($directory)) {
        return;
    }

    $entries = scandir($directory);
    if (!is_array($entries)) {
        @rmdir($directory);
        return;
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $path = $directory . '/' . $entry;
        if (is_dir($path)) {
            removeTempImportDirectory($path);
            continue;
        }

        @unlink($path);
    }

    @rmdir($directory);
}

$runner->finish();
