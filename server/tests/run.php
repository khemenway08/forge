<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';

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

function createHandler(?InMemoryOrderRepository $repository = null, ?callable $unexpectedExceptionReporter = null): array
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

$runner->finish();
