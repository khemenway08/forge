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
    /** @var array<string, array{payload: array, payload_sha256: string, received_at: string, forge_order_number: int}> */
    private array $records = [];
    private ?\Throwable $nextFailure = null;
    private int $nextForgeOrderNumber = 1001;

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
            $forgeOrderNumber = $this->nextForgeOrderNumber++;
            $this->records[$forgeOrderUuid] = [
                'payload' => json_decode($canonicalJson, true, 512, JSON_THROW_ON_ERROR),
                'payload_sha256' => $payloadSha256,
                'received_at' => $receivedAt,
                'forge_order_number' => $forgeOrderNumber,
            ];

            return new StoreOrderResult($forgeOrderUuid, true, $receivedAt, $payloadSha256, $forgeOrderNumber);
        }

        $existing = $this->records[$forgeOrderUuid];
        if (hash_equals($existing['payload_sha256'], $payloadSha256)) {
            return new StoreOrderResult($forgeOrderUuid, false, $existing['received_at'], $existing['payload_sha256'], $existing['forge_order_number']);
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
    /** @var array<string, array{payload: array, payload_sha256: string, received_at_database: string, received_at_iso8601: string, forge_order_number: int}> */
    private array $records = [];
    private int $nextForgeOrderNumber = 1001;

    public function storeOrder(array $payload, string $canonicalJson, string $payloadSha256, string $receivedAt): StoreOrderResult
    {
        $forgeOrderUuid = $payload['forge_order_uuid'];
        $receivedAtIso8601 = OrderPayload::normalizeIso8601Utc($receivedAt);
        $receivedAtDatabase = OrderPayload::normalizeDatabaseDateTime($receivedAtIso8601);

        if (!isset($this->records[$forgeOrderUuid])) {
            $forgeOrderNumber = $this->nextForgeOrderNumber++;
            $this->records[$forgeOrderUuid] = [
                'payload' => json_decode($canonicalJson, true, 512, JSON_THROW_ON_ERROR),
                'payload_sha256' => $payloadSha256,
                'received_at_database' => $receivedAtDatabase,
                'received_at_iso8601' => $receivedAtIso8601,
                'forge_order_number' => $forgeOrderNumber,
            ];

            return new StoreOrderResult($forgeOrderUuid, true, $receivedAtIso8601, $payloadSha256, $forgeOrderNumber);
        }

        $existing = $this->records[$forgeOrderUuid];
        if (hash_equals($existing['payload_sha256'], $payloadSha256)) {
            return new StoreOrderResult(
                $forgeOrderUuid,
                false,
                OrderPayload::databaseDateTimeToIso8601($existing['received_at_database']),
                $existing['payload_sha256'],
                $existing['forge_order_number']
            );
        }

        throw new OrderConflictException('Conflict');
    }
}

final class FakePhpMailer
{
    public bool $smtpMode = false;
    public ?string $Host = null;
    public ?int $Port = null;
    public ?bool $SMTPAuth = null;
    public ?string $Username = null;
    public ?string $Password = null;
    public ?int $Timeout = null;
    public ?int $Timelimit = null;
    public ?string $CharSet = null;
    public ?string $SMTPSecure = null;
    /** @var array{address: string, name: string, auto: bool}|null */
    public ?array $from = null;
    /** @var array<int, string> */
    public array $to = [];
    /** @var array<int, string> */
    public array $replyTo = [];
    public bool $htmlEnabled = false;
    public ?string $Subject = null;
    public ?string $Body = null;
    public ?string $AltBody = null;
    private ?\Throwable $sendFailure = null;

    public function isSMTP(): void
    {
        $this->smtpMode = true;
    }

    public function setFrom(string $address, string $name = '', bool $auto = true): void
    {
        $this->from = [
            'address' => $address,
            'name' => $name,
            'auto' => $auto,
        ];
    }

    public function addAddress(string $address): void
    {
        $this->to[] = $address;
    }

    public function addReplyTo(string $address): void
    {
        $this->replyTo[] = $address;
    }

    public function isHTML(bool $value): void
    {
        $this->htmlEnabled = $value;
    }

    public function send(): void
    {
        if ($this->sendFailure !== null) {
            throw $this->sendFailure;
        }
    }

    public function failOnSend(\Throwable $failure): void
    {
        $this->sendFailure = $failure;
    }
}

final class InMemoryEventRepository
{
    /** @var array<string, array<string, mixed>> */
    private array $events = [];

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function createEvent(array $payload): array
    {
        $eventId = 'event-' . (count($this->events) + 1);
        $event = [
            'event_id' => $eventId,
            'public_order_token' => \Forge\Server\PdoEventRepository::generatePublicOrderToken(),
            'event_name' => (string) ($payload['event_name'] ?? ''),
            'event_type' => (string) ($payload['event_type'] ?? 'live_event'),
            'start_date' => (string) ($payload['start_date'] ?? ''),
            'end_date' => (string) ($payload['end_date'] ?? ''),
            'event_location' => $payload['event_location'] ?? null,
            'event_status' => 'scheduled',
        ];
        $this->events[$eventId] = $event;
        return $event;
    }

    /**
     * @return array<string, mixed>
     */
    public function startEvent(string $eventId): array
    {
        foreach ($this->events as $existingEventId => $event) {
            if ($existingEventId !== $eventId && ($event['event_status'] ?? '') === 'active') {
                throw new RuntimeException('Only one event may be active at a time.');
            }
        }
        if (($this->events[$eventId]['event_status'] ?? '') === 'ended') {
            throw new RuntimeException('Ended events cannot be started again.');
        }
        $this->events[$eventId]['event_status'] = 'active';
        return $this->events[$eventId];
    }

    /**
     * @return array<string, mixed>
     */
    public function endEvent(string $eventId): array
    {
        $this->events[$eventId]['event_status'] = 'ended';
        return $this->events[$eventId];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getActiveEvent(): ?array
    {
        foreach ($this->events as $event) {
            if (($event['event_status'] ?? '') === 'active') {
                return $event;
            }
        }
        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function getPublicOrderingStatus(?string $requestedPublicOrderToken = null): array
    {
        if (is_string($requestedPublicOrderToken) && trim($requestedPublicOrderToken) !== '') {
            foreach ($this->events as $event) {
                if (($event['public_order_token'] ?? '') === trim($requestedPublicOrderToken)) {
                    return [
                        'ordering_open' => ($event['event_status'] ?? '') === 'active',
                        'resolution_scope' => 'event_token',
                        'requested_public_order_token' => trim($requestedPublicOrderToken),
                        'availability' => ($event['event_status'] ?? '') === 'active'
                            ? 'active'
                            : (($event['event_status'] ?? '') === 'scheduled' ? 'scheduled' : 'ended'),
                        'event' => [
                            'event_id' => $event['event_id'],
                            'public_order_token' => $event['public_order_token'],
                            'event_name' => $event['event_name'],
                            'event_type' => $event['event_type'],
                            'event_status' => $event['event_status'],
                            'start_date' => $event['start_date'],
                            'end_date' => $event['end_date'],
                            'event_location' => $event['event_location'],
                        ],
                    ];
                }
            }

            return [
                'ordering_open' => false,
                'resolution_scope' => 'event_token',
                'requested_public_order_token' => trim($requestedPublicOrderToken),
                'availability' => 'invalid_token',
                'event' => null,
            ];
        }

        $activeEvent = $this->getActiveEvent();
        if ($activeEvent === null) {
            return [
                'ordering_open' => false,
                'resolution_scope' => 'active_event',
                'requested_public_order_token' => null,
                'availability' => 'no_active_event',
                'event' => null,
            ];
        }

        return [
            'ordering_open' => true,
            'resolution_scope' => 'active_event',
            'requested_public_order_token' => null,
            'availability' => 'active',
            'event' => [
                'event_id' => $activeEvent['event_id'],
                'public_order_token' => $activeEvent['public_order_token'],
                'event_name' => $activeEvent['event_name'],
                'event_type' => $activeEvent['event_type'],
                'event_status' => $activeEvent['event_status'],
                'start_date' => $activeEvent['start_date'],
                'end_date' => $activeEvent['end_date'],
                'event_location' => $activeEvent['event_location'],
            ],
        ];
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
            'public_order_token' => 'test-public-order-token',
            'event_name' => 'Holiday Market',
            'event_type' => 'live_event',
            'event_start_date' => '2026-11-10',
            'event_end_date' => '2026-11-12',
            'event_location' => 'Denver',
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
        null,
        static function (): DateTimeImmutable {
            return new DateTimeImmutable('2026-07-17T12:30:00+00:00');
        },
        $unexpectedExceptionReporter
    );

    return [$handler, $repository];
}

function createEmailEnabledHandler(
    ?OrderRepositoryInterface $repository = null,
    ?\Forge\Server\EmailService $emailService = null,
    ?callable $unexpectedExceptionReporter = null
): array {
    $repository = $repository ?? new InMemoryOrderRepository();
    $emailService = $emailService ?? new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository(createOutboundMessageTestPdo()),
        new \Forge\Server\RecordingEmailTransport(),
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => true,
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ],
        static function (): DateTimeImmutable {
            return new DateTimeImmutable('2026-07-28T13:00:00+00:00');
        }
    );

    $handler = new OrderHandler(
        $repository,
        $emailService,
        static function (): DateTimeImmutable {
            return new DateTimeImmutable('2026-07-28T13:00:00+00:00');
        },
        $unexpectedExceptionReporter
    );

    return [$handler, $repository, $emailService];
}

$runner = new TestRunner();

$runner->run('valid UUID acceptance', static function (): void {
    OrderPayload::validatePayload(createValidPayload());
    assertTrue(true);
});

$runner->run('existing orders with null event data remain valid', static function (): void {
    $payload = createValidPayload([
        'event' => null,
    ]);

    OrderPayload::validatePayload($payload);
    $metadata = OrderPayload::extractMetadata($payload);
    assertSame(null, $metadata['event_id']);
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
    assertSame(1001, $response['body']['data']['forge_order_number']);
});

$runner->run('next unique order receives the next sequential number', static function (): void {
    [$handler] = createHandler();
    $first = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );
    $secondPayload = createValidPayload([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174111',
        'submitted_at' => '2026-07-17T12:10:01+00:00',
    ]);
    $second = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode($secondPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    assertSame(1001, $first['body']['data']['forge_order_number']);
    assertSame(1002, $second['body']['data']['forge_order_number']);
});

$runner->run('identical UUID and payload returns created false', static function (): void {
    [$handler] = createHandler();
    $body = json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $first = $handler->handleRequest('POST', 'application/json', $body);
    $second = $handler->handleRequest('POST', 'application/json', $body);

    assertSame(201, $first['statusCode']);
    assertSame(200, $second['statusCode']);
    assertSame(false, $second['body']['data']['created']);
    assertSame($first['body']['data']['forge_order_number'], $second['body']['data']['forge_order_number']);
});

$runner->run('a new real order creates exactly one outbound message and marks it sent after persistence', static function (): void {
    $outboundPdo = createOutboundMessageTestPdo();
    $transport = new \Forge\Server\RecordingEmailTransport();
    $emailService = new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository($outboundPdo),
        $transport,
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => true,
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ],
        static function (): DateTimeImmutable {
            return new DateTimeImmutable('2026-07-28T13:00:00+00:00');
        }
    );
    [$handler, $repository] = createEmailEnabledHandler(new InMemoryOrderRepository(), $emailService);

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload([
            'external_payment_method' => 'cash',
            'payment_confirmed_at' => '2026-07-28T12:58:00+00:00',
        ]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    $messageCount = (int) $outboundPdo->query('SELECT COUNT(*) FROM forge_outbound_messages')->fetchColumn();
    $status = (string) $outboundPdo->query('SELECT status FROM forge_outbound_messages LIMIT 1')->fetchColumn();
    $renderContextJson = (string) $outboundPdo->query('SELECT render_context_json FROM forge_outbound_messages LIMIT 1')->fetchColumn();
    $renderContext = json_decode($renderContextJson, true, 512, JSON_THROW_ON_ERROR);
    assertSame(201, $response['statusCode']);
    assertSame(1, $messageCount);
    assertSame('sent', $status);
    assertSame('customer@example.com', $transport->messages()[0]->toAddress);
    assertSame(null, $repository->getStoredPayload('123e4567-e89b-42d3-a456-426614174000')['forge_order_number']);
    assertSame(1001, $renderContext['order']['forge_order_number']);
});

$runner->run('outbound message scheduling happens only after order persistence succeeds', static function (): void {
    $outboundPdo = createOutboundMessageTestPdo();
    $repository = new InMemoryOrderRepository();
    $repository->failOnce(new StorageUnavailableException('Storage unavailable'));
    $emailService = new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository($outboundPdo),
        new \Forge\Server\RecordingEmailTransport(),
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => true,
        ]
    );
    [$handler] = createEmailEnabledHandler($repository, $emailService);

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    $messageCount = (int) $outboundPdo->query('SELECT COUNT(*) FROM forge_outbound_messages')->fetchColumn();
    assertSame(503, $response['statusCode']);
    assertSame(0, $messageCount);
});

$runner->run('duplicate order sync creates no second logical message and sends no duplicate email', static function (): void {
    $outboundPdo = createOutboundMessageTestPdo();
    $transport = new \Forge\Server\RecordingEmailTransport();
    $emailService = new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository($outboundPdo),
        $transport,
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => true,
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ]
    );
    [$handler] = createEmailEnabledHandler(new InMemoryOrderRepository(), $emailService);
    $body = json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $first = $handler->handleRequest('POST', 'application/json', $body);
    $second = $handler->handleRequest('POST', 'application/json', $body);

    $messageCount = (int) $outboundPdo->query('SELECT COUNT(*) FROM forge_outbound_messages')->fetchColumn();
    assertSame(201, $first['statusCode']);
    assertSame(200, $second['statusCode']);
    assertSame(1, $messageCount);
    assertSame(1, count($transport->messages()));
});

$runner->run('test session orders are recorded as skipped_test and never attempt smtp', static function (): void {
    $outboundPdo = createOutboundMessageTestPdo();
    $transport = new \Forge\Server\RecordingEmailTransport();
    $emailService = new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository($outboundPdo),
        $transport,
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => true,
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ]
    );
    [$handler] = createEmailEnabledHandler(new InMemoryOrderRepository(), $emailService);
    $payload = createValidPayload([
        'event' => array_merge(createValidPayload()['event'], [
            'event_type' => 'test_session',
        ]),
    ]);

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    $status = (string) $outboundPdo->query('SELECT status FROM forge_outbound_messages LIMIT 1')->fetchColumn();
    $attemptCount = (int) $outboundPdo->query('SELECT attempt_count FROM forge_outbound_messages LIMIT 1')->fetchColumn();
    assertSame(201, $response['statusCode']);
    assertSame('skipped_test', $status);
    assertSame(0, $attemptCount);
    assertSame(0, count($transport->messages()));
});

$runner->run('smtp delivery failure preserves the saved order and marks the message failed with a sanitized error', static function (): void {
    $outboundPdo = createOutboundMessageTestPdo();
    $transport = new \Forge\Server\RecordingEmailTransport();
    $transport->failOnce(new \Forge\Server\EmailDeliveryException('SMTP password rejected for customer@example.com at smtp.mail.me.com'));
    $emailService = new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository($outboundPdo),
        $transport,
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => true,
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ]
    );
    $repository = new InMemoryOrderRepository();
    [$handler] = createEmailEnabledHandler($repository, $emailService);

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    $failedRow = $outboundPdo->query('SELECT status, last_error_safe, attempt_count FROM forge_outbound_messages LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    assertSame(201, $response['statusCode']);
    assertTrue(is_array($repository->getStoredPayload('123e4567-e89b-42d3-a456-426614174000')));
    assertSame('failed', $failedRow['status']);
    assertSame(1, (int) $failedRow['attempt_count']);
    assertNotContains('customer@example.com', (string) $failedRow['last_error_safe']);
    assertNotContains('smtp.mail.me.com', (string) $failedRow['last_error_safe']);
});

$runner->run('missing email configuration cannot break order creation and marks the message failed safely', static function (): void {
    $outboundPdo = createOutboundMessageTestPdo();
    $repository = new InMemoryOrderRepository();
    $emailService = new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository($outboundPdo),
        new \Forge\Server\NullEmailTransport(),
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => true,
        ]
    );
    [$handler] = createEmailEnabledHandler($repository, $emailService);

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    $row = $outboundPdo->query('SELECT status, last_error_safe FROM forge_outbound_messages LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    assertSame(201, $response['statusCode']);
    assertSame('failed', $row['status']);
    assertSame('Email transport is not configured.', $row['last_error_safe']);
    assertTrue(is_array($repository->getStoredPayload('123e4567-e89b-42d3-a456-426614174000')));
});

$runner->run('missing email enabled flag defaults to false', static function (): void {
    assertSame(false, \Forge\Server\normalizePrivateEmailEnabledFlag(null));
    assertSame(false, \Forge\Server\normalizePrivateEmailEnabledFlag(''));
    assertSame(false, \Forge\Server\normalizePrivateEmailEnabledFlag('false'));
    assertSame(true, \Forge\Server\normalizePrivateEmailEnabledFlag('true'));
});

$runner->run('disabled automatic email creates no outbound message makes no transport call and does not affect order creation', static function (): void {
    $outboundPdo = createOutboundMessageTestPdo();
    $transport = new \Forge\Server\RecordingEmailTransport();
    $repository = new InMemoryOrderRepository();
    $emailService = new \Forge\Server\EmailService(
        new \Forge\Server\PdoOutboundMessageRepository($outboundPdo),
        $transport,
        new \Forge\Server\EmailRenderer(),
        [
            'FORGE_EMAIL_ENABLED' => false,
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ]
    );
    [$handler] = createEmailEnabledHandler($repository, $emailService);

    $response = $handler->handleRequest(
        'POST',
        'application/json',
        json_encode(createValidPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    assertSame(201, $response['statusCode']);
    assertSame(0, (int) $outboundPdo->query('SELECT COUNT(*) FROM forge_outbound_messages')->fetchColumn());
    assertSame(0, count($transport->messages()));
    assertTrue(is_array($repository->getStoredPayload('123e4567-e89b-42d3-a456-426614174000')));
});

$runner->run('smtp username from address and reply-to may differ and the visible custom-domain headers are preserved', static function (): void {
    $fakeMailer = new FakePhpMailer();
    $transport = new \Forge\Server\PhpMailerSmtpEmailTransport(
        [
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'support@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ],
        static function () use ($fakeMailer): FakePhpMailer {
            return $fakeMailer;
        }
    );

    $transport->send(new \Forge\Server\EmailMessage(
        'recipient@example.com',
        'Subject',
        '<p>Hello</p>',
        'Hello',
        'orders@thehilltopshop.com',
        'The Hilltop Shop',
        'support@thehilltopshop.com'
    ));

    assertSame(true, $fakeMailer->smtpMode);
    assertSame('primary-icloud@example.com', $fakeMailer->Username);
    assertSame('orders@thehilltopshop.com', $fakeMailer->from['address']);
    assertSame('support@thehilltopshop.com', $fakeMailer->replyTo[0]);
    assertSame(false, $fakeMailer->from['auto']);
});

$runner->run('tls port 587 smtp configuration is passed to PHPMailer as STARTTLS-safe settings', static function (): void {
    $fakeMailer = new FakePhpMailer();
    $transport = new \Forge\Server\PhpMailerSmtpEmailTransport(
        [
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 12,
            'FORGE_EMAIL_SEND_TIMEOUT' => 34,
        ],
        static function () use ($fakeMailer): FakePhpMailer {
            return $fakeMailer;
        }
    );

    $transport->send(new \Forge\Server\EmailMessage(
        'recipient@example.com',
        'Subject',
        '<p>Hello</p>',
        'Hello',
        'orders@thehilltopshop.com',
        'The Hilltop Shop',
        'orders@thehilltopshop.com'
    ));

    assertSame('smtp.mail.me.com', $fakeMailer->Host);
    assertSame(587, $fakeMailer->Port);
    assertSame('tls', $fakeMailer->SMTPSecure);
    assertSame(true, $fakeMailer->SMTPAuth);
    assertSame(12, $fakeMailer->Timeout);
    assertSame(34, $fakeMailer->Timelimit);
});

$runner->run('transport sanitizes smtp authentication failures before they reach staff-visible storage', static function (): void {
    $fakeMailer = new FakePhpMailer();
    $fakeMailer->failOnSend(new \PHPMailer\PHPMailer\Exception(
        '535 5.7.8 Username primary-icloud@example.com password APPLE_APP_SPECIFIC_PASSWORD rejected by smtp.mail.me.com for orders@thehilltopshop.com'
    ));
    $transport = new \Forge\Server\PhpMailerSmtpEmailTransport(
        [
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
        ],
        static function () use ($fakeMailer): FakePhpMailer {
            return $fakeMailer;
        }
    );

    assertThrows(
        static function () use ($transport): void {
            $transport->send(new \Forge\Server\EmailMessage(
                'recipient@example.com',
                'Subject',
                '<p>Hello</p>',
                'Hello',
                'orders@thehilltopshop.com',
                'The Hilltop Shop',
                'orders@thehilltopshop.com'
            ));
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\EmailDeliveryException);
            assertNotContains('primary-icloud@example.com', $exception->getMessage());
            assertNotContains('APPLE_APP_SPECIFIC_PASSWORD', $exception->getMessage());
            assertNotContains('smtp.mail.me.com', $exception->getMessage());
            assertNotContains('orders@thehilltopshop.com', $exception->getMessage());
        }
    );
});

$runner->run('cli smoke-test rejects non-cli execution and never touches smtp for invalid contexts', static function (): void {
    $transport = new \Forge\Server\RecordingEmailTransport();
    $result = \Forge\Server\runEmailSmokeTest(
        ['server/cli/smoke-test-email.php', '--to', 'test@example.com'],
        $transport,
        [
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
            'FORGE_EMAIL_ENABLED' => false,
        ],
        'fpm-fcgi'
    );

    assertSame(1, $result['exit_code']);
    assertSame('This command may only run from PHP CLI.', $result['output']);
    assertSame(0, count($transport->messages()));
});

$runner->run('cli smoke-test uses the injected transport without touching order records or outbound queues', static function (): void {
    $transport = new \Forge\Server\RecordingEmailTransport();
    $result = \Forge\Server\runEmailSmokeTest(
        ['server/cli/smoke-test-email.php', '--to=qa-recipient@example.com'],
        $transport,
        [
            'FORGE_EMAIL_TRANSPORT' => 'smtp',
            'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
            'FORGE_EMAIL_PORT' => 587,
            'FORGE_EMAIL_ENCRYPTION' => 'tls',
            'FORGE_EMAIL_USERNAME' => 'primary-icloud@example.com',
            'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
            'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
            'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
            'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
            'FORGE_EMAIL_SEND_TIMEOUT' => 20,
            'FORGE_EMAIL_ENABLED' => false,
        ],
        'cli'
    );

    assertSame(0, $result['exit_code']);
    assertSame('SMTP smoke test sent successfully.', $result['output']);
    assertSame(1, count($transport->messages()));
    assertSame('qa-recipient@example.com', $transport->messages()[0]->toAddress);
    assertSame('orders@thehilltopshop.com', $transport->messages()[0]->fromAddress);
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
    assertSame($first['body']['data']['forge_order_number'], $second['body']['data']['forge_order_number']);
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
    assertSame($first['body']['data']['forge_order_number'], $second['body']['data']['forge_order_number']);
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

$runner->run('new order stores event id and snapshot in the canonical payload', static function (): void {
    [$handler, $repository] = createHandler();
    $payload = createValidPayload();

    $result = $handler->handleRequest('POST', 'application/json', json_encode($payload, JSON_THROW_ON_ERROR));
    assertSame(201, $result['statusCode']);

    $storedPayload = $repository->getStoredPayload('123e4567-e89b-42d3-a456-426614174000');
    assertSame('holiday-market', $storedPayload['event']['event_id'] ?? null);
    assertSame('live_event', $storedPayload['event']['event_type'] ?? null);
    assertSame('2026-11-10', $storedPayload['event']['event_start_date'] ?? null);
    assertSame('2026-11-12', $storedPayload['event']['event_end_date'] ?? null);
    assertSame('Denver', $storedPayload['event']['event_location'] ?? null);
});

$runner->run('duplicate UUID retry preserves the original event assignment', static function (): void {
    [$handler, $repository] = createHandler();
    $payload = createValidPayload();
    $handler->handleRequest('POST', 'application/json', json_encode($payload, JSON_THROW_ON_ERROR));

    $retryPayload = createValidPayload([
        'event' => [
            'event_id' => 'different-event',
            'event_name' => 'Different Event',
            'event_type' => 'test_session',
            'event_start_date' => '2026-11-13',
            'event_end_date' => '2026-11-13',
            'event_location' => 'Austin',
        ],
    ]);
    $retryResult = $handler->handleRequest('POST', 'application/json', json_encode($payload, JSON_THROW_ON_ERROR));

    assertSame(200, $retryResult['statusCode']);
    $storedPayload = $repository->getStoredPayload('123e4567-e89b-42d3-a456-426614174000');
    assertSame('holiday-market', $storedPayload['event']['event_id'] ?? null);
    assertSame('Holiday Market', $storedPayload['event']['event_name'] ?? null);
});

$runner->run('create scheduled event start end and public ordering status are server-safe', static function (): void {
    $repository = new InMemoryEventRepository();
    $scheduled = $repository->createEvent([
        'event_name' => 'Holiday Market',
        'event_type' => 'live_event',
        'start_date' => '2026-11-10',
        'end_date' => '2026-11-12',
        'event_location' => 'Denver',
    ]);
    assertSame('scheduled', $scheduled['event_status']);

    $active = $repository->startEvent($scheduled['event_id']);
    assertSame('active', $active['event_status']);

    $publicStatus = $repository->getPublicOrderingStatus();
    assertSame(true, $publicStatus['ordering_open']);
    assertSame('Holiday Market', $publicStatus['event']['event_name']);
    assertTrue(\Forge\Server\PdoEventRepository::isValidPublicOrderToken($publicStatus['event']['public_order_token']));
    assertTrue(!array_key_exists('created_at', $publicStatus['event']), 'Public event response should stay minimal.');

    $ended = $repository->endEvent($scheduled['event_id']);
    assertSame('ended', $ended['event_status']);
    assertSame(false, $repository->getPublicOrderingStatus()['ordering_open']);
});

$runner->run('starting a second active event is rejected', static function (): void {
    $repository = new InMemoryEventRepository();
    $first = $repository->createEvent([
        'event_name' => 'First',
        'event_type' => 'live_event',
        'start_date' => '2026-11-10',
        'end_date' => '2026-11-10',
    ]);
    $second = $repository->createEvent([
        'event_name' => 'Second',
        'event_type' => 'test_session',
        'start_date' => '2026-11-11',
        'end_date' => '2026-11-11',
    ]);
    $repository->startEvent($first['event_id']);

    assertThrows(
        static function () use ($repository, $second): void {
            $repository->startEvent($second['event_id']);
        },
        static function (\Throwable $exception): void {
            assertSame('Only one event may be active at a time.', $exception->getMessage());
        }
    );
});

$runner->run('creating an event generates a unique public token that is not derived from its name', static function (): void {
    $repository = new InMemoryEventRepository();
    $first = $repository->createEvent([
        'event_name' => 'Holiday Market',
        'event_type' => 'live_event',
        'start_date' => '2026-11-10',
        'end_date' => '2026-11-12',
    ]);
    $second = $repository->createEvent([
        'event_name' => 'Holiday Market',
        'event_type' => 'live_event',
        'start_date' => '2026-12-01',
        'end_date' => '2026-12-03',
    ]);

    assertTrue(\Forge\Server\PdoEventRepository::isValidPublicOrderToken($first['public_order_token']));
    assertTrue(\Forge\Server\PdoEventRepository::isValidPublicOrderToken($second['public_order_token']));
    assertTrue($first['public_order_token'] !== $second['public_order_token']);
    assertNotContains('Holiday', $first['public_order_token']);
    assertNotContains('Market', $first['public_order_token']);
});

$runner->run('token-scoped public ordering status never falls back to another active event', static function (): void {
    $repository = new InMemoryEventRepository();
    $eventA = $repository->createEvent([
        'event_name' => 'Autumn Fair',
        'event_type' => 'live_event',
        'start_date' => '2026-10-01',
        'end_date' => '2026-10-02',
    ]);
    $eventB = $repository->createEvent([
        'event_name' => 'Winter Market',
        'event_type' => 'live_event',
        'start_date' => '2026-12-01',
        'end_date' => '2026-12-02',
    ]);

    $repository->startEvent($eventA['event_id']);
    $statusA = $repository->getPublicOrderingStatus($eventA['public_order_token']);
    assertSame(true, $statusA['ordering_open']);
    assertSame('active', $statusA['availability']);

    $repository->endEvent($eventA['event_id']);
    $repository->startEvent($eventB['event_id']);

    $endedStatusA = $repository->getPublicOrderingStatus($eventA['public_order_token']);
    assertSame(false, $endedStatusA['ordering_open']);
    assertSame('ended', $endedStatusA['availability']);
    assertSame('Autumn Fair', $endedStatusA['event']['event_name']);

    $invalidStatus = $repository->getPublicOrderingStatus('invalid-token');
    assertSame(false, $invalidStatus['ordering_open']);
    assertSame('invalid_token', $invalidStatus['availability']);
    assertSame(null, $invalidStatus['event']);

    $noTokenStatus = $repository->getPublicOrderingStatus();
    assertSame(true, $noTokenStatus['ordering_open']);
    assertSame('Winter Market', $noTokenStatus['event']['event_name']);
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
    assertSame(null, $record['forge_order_number']);
    assertSame(false, array_key_exists('forge_order_number', $record['payload']));
    assertSame('Not Scheduled', $record['confirmation_email_status']);
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
    assertSame(null, $record['forge_order_number']);
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

$runner->run('historical staff order records without an internal note remain readable and unchanged', static function (): void {
    $record = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174401',
        'forge_order_number' => 1042,
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00.123456',
        'received_at' => '2026-07-19 10:05:00.123456',
        'updated_at' => '2026-07-19 10:06:00.123456',
        'device_id' => 'ipad-1',
        'event_id' => 'event-1',
        'payload_json' => json_encode(createValidPayload(), JSON_THROW_ON_ERROR),
        'payload_sha256' => str_repeat('a', 64),
        'production_status' => 'submitted',
        'current_tray_number' => null,
        'ready_to_pack_at' => null,
    ]);

    assertSame(null, $record['internal_note']);
    assertSame(false, $record['has_internal_note']);
    assertSame('Kyle Hemenway', $record['payload']['customer']['full_name']);
});

$runner->run('stored staff order records surface the private internal note separately from the immutable customer payload', static function (): void {
    $payload = createValidPayload();
    $payload['customer']['full_name'] = 'Meagan Smith';

    $record = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174402',
        'forge_order_number' => 1043,
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00.123456',
        'received_at' => '2026-07-19 10:05:00.123456',
        'updated_at' => '2026-07-19 10:06:00.123456',
        'device_id' => 'ipad-1',
        'event_id' => 'event-1',
        'internal_note' => "Customer confirmed spelling.\nCall before shipping.",
        'payload_json' => json_encode($payload, JSON_THROW_ON_ERROR),
        'payload_sha256' => str_repeat('b', 64),
        'production_status' => 'submitted',
        'current_tray_number' => null,
        'ready_to_pack_at' => null,
    ]);

    assertSame("Customer confirmed spelling.\nCall before shipping.", $record['internal_note']);
    assertSame(true, $record['has_internal_note']);
    assertSame(false, array_key_exists('internal_note', $record['payload']));
    assertSame('Meagan Smith', $record['payload']['customer']['full_name']);
});

$runner->run('stored staff order records expose staff-visible outbound email delivery labels safely', static function (): void {
    $sent = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174403',
        'forge_order_number' => 1044,
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00.123456',
        'received_at' => '2026-07-19 10:05:00.123456',
        'updated_at' => '2026-07-19 10:06:00.123456',
        'payload_json' => json_encode(createValidPayload(), JSON_THROW_ON_ERROR),
        'payload_sha256' => str_repeat('c', 64),
        'production_status' => 'submitted',
    ], [], \Forge\Server\OutboundMessageStatus::SENT);
    $skipped = \Forge\Server\normalizeStoredStaffOrderRecord([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174404',
        'forge_order_number' => 1045,
        'record_version' => '1.0',
        'source' => 'customer_kiosk',
        'submitted_at' => '2026-07-19 10:00:00.123456',
        'received_at' => '2026-07-19 10:05:00.123456',
        'updated_at' => '2026-07-19 10:06:00.123456',
        'payload_json' => json_encode(createValidPayload(), JSON_THROW_ON_ERROR),
        'payload_sha256' => str_repeat('d', 64),
        'production_status' => 'submitted',
    ], [], \Forge\Server\OutboundMessageStatus::SKIPPED_TEST);

    assertSame('Sent', $sent['confirmation_email_status']);
    assertSame('Skipped/Test', $skipped['confirmation_email_status']);
});

$runner->run('staff repository lists historical orders as Not Scheduled and new outbound statuses when present', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174501',
        'forge_order_number' => 1051,
    ]);
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174502',
        'forge_order_number' => 1052,
    ]);
    seedOutboundMessage($pdo, [
        'message_id' => 'msg-sent',
        'entity_uuid' => '123e4567-e89b-42d3-a456-426614174502',
        'status' => \Forge\Server\OutboundMessageStatus::SENT,
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository(
        $pdo,
        [],
        new \Forge\Server\PdoOutboundMessageRepository($pdo)
    );
    $orders = $repository->listOrders();

    $statuses = [];
    foreach ($orders as $order) {
        $statuses[$order['forge_order_uuid']] = $order['confirmation_email_status'];
    }

    assertSame('Not Scheduled', $statuses['123e4567-e89b-42d3-a456-426614174501']);
    assertSame('Sent', $statuses['123e4567-e89b-42d3-a456-426614174502']);
});

$runner->run('email renderer includes the approved order details and excludes staff-only fields', static function (): void {
    $payload = createValidPayload([
        'forge_order_number' => 1099,
        'external_payment_method' => 'card_square',
        'payment_confirmed_at' => '2026-07-28T12:58:00+00:00',
        'fulfillment' => [
            'method' => 'shipping',
            'shipping_address' => [
                'recipient' => 'Kyle Hemenway',
                'address_1' => '123 Main Street',
                'address_2' => 'Apartment 4',
                'city' => 'Austin',
                'state' => 'TX',
                'postal_code' => '78701',
                'country' => 'US',
            ],
        ],
        'internal_note' => 'never render this',
        'items' => [
            [
                'line_id' => 'line-1',
                'line_number' => 1,
                'quantity' => 2,
                'product_definition_id' => 'tree_ornament',
                'product_display_name' => 'Tree Ornament',
                'product_category' => 'ornament',
                'product_definition_version' => '1.0',
                'pricing' => [
                    'mode' => 'fixed',
                    'line_total_cents' => 5200,
                    'final_unit_price_cents' => 2600,
                ],
                'configuration_snapshot' => [
                    'familyName' => 'Hemenway',
                    'year' => '2026',
                ],
                'personalization_order' => [
                    ['position' => 1, 'type' => 'person', 'name' => 'Kyle'],
                    ['position' => 2, 'type' => 'pet', 'name' => 'Scout', 'icon' => 'paw'],
                ],
                'structured_attributes' => [],
                'open_flags' => [],
                'customer_note' => 'Please double check spelling',
                'production_note' => 'private production detail',
                'current_tray_number' => 8,
            ],
        ],
        'pricing' => [
            'estimated_total_cents' => 5200,
        ],
    ]);
    $renderer = new \Forge\Server\EmailRenderer();
    $html = $renderer->renderOrderConfirmationHtml($payload, 'orders@thehilltopshop.com');
    $text = $renderer->renderOrderConfirmationText($payload, 'orders@thehilltopshop.com');

    assertTrue(strpos($html, 'The Hilltop Shop') !== false);
    assertTrue(strpos($html, '#1099') !== false);
    assertTrue(strpos($html, 'Kyle Hemenway') !== false);
    assertTrue(strpos($html, 'Tree Ornament') !== false);
    assertTrue(strpos($html, 'Kyle') !== false);
    assertTrue(strpos($html, 'Scout') !== false);
    assertTrue(strpos($html, 'Card / Square') !== false);
    assertTrue(strpos($html, 'Shipping') !== false);
    assertTrue(strpos($html, '123 Main Street') !== false);
    assertTrue(strpos($text, 'Order total: $52.00') !== false);
    assertTrue(strpos($text, 'Please review your order details carefully.') !== false);
    assertNotContains('never render this', $html);
    assertNotContains('private production detail', $html);
    assertNotContains('Tray', $html);
});

$runner->run('outbound message repository enforces unique idempotency keys for logical order confirmations', static function (): void {
    $pdo = createOutboundMessageTestPdo();
    $repository = new \Forge\Server\PdoOutboundMessageRepository($pdo);
    $payload = createValidPayload([
        'forge_order_number' => 1055,
        'external_payment_method' => 'venmo',
        'payment_confirmed_at' => '2026-07-28T12:58:00+00:00',
    ]);

    $first = $repository->createOrderConfirmationMessage($payload);
    $second = $repository->createOrderConfirmationMessage($payload);
    $count = (int) $pdo->query('SELECT COUNT(*) FROM forge_outbound_messages')->fetchColumn();

    assertSame(true, $first->created);
    assertSame(false, $second->created);
    assertSame(1, $count);
    assertSame(
        \Forge\Server\buildOrderConfirmationIdempotencyKey($payload['forge_order_uuid']),
        $second->record->idempotencyKey
    );
});

$runner->run('internal order notes preserve quotes apostrophes and line breaks safely', static function (): void {
    $note = "Customer confirmed \"O'Brien\" spelling.\r\nCall before shipping.\nPaid cash at show.";
    $normalized = \Forge\Server\normalizeInternalOrderNoteForStorage($note, 4000);

    assertSame("Customer confirmed \"O'Brien\" spelling.\nCall before shipping.\nPaid cash at show.", $normalized);
});

$runner->run('blank internal order notes normalize to null safely', static function (): void {
    assertSame(null, \Forge\Server\normalizeInternalOrderNoteForStorage(" \r\n\t ", 4000));
});

$runner->run('excessively long internal order notes are rejected safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\normalizeInternalOrderNoteForStorage(str_repeat('n', 4001), 4000);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\InternalOrderNoteTooLongException);
            assertSame('Internal notes must be 4000 characters or fewer.', $exception->getMessage());
        }
    );
});

$runner->run('legacy cleanup cutoff uses America Chicago midnight and excludes July 25 orders safely', static function (): void {
    assertSame('2026-07-25 05:00:00.000000', \Forge\Server\legacyTestCleanupCutoffDatabase());
    assertSame('2026-07-25T00:00:00-05:00', \Forge\Server\legacyTestCleanupCutoffLocalIso8601());
    assertSame('DELETE 2 ORDERS BEFORE JULY 25', \Forge\Server\buildLegacyTestCleanupConfirmationText(2));
});

$runner->run('legacy cleanup preview rows expose only the operational preview fields safely', static function (): void {
    $payload = createValidPayload();
    $payload['forge_order_number'] = 1042;
    $payload['customer']['full_name'] = 'Historical Test Customer';
    $payload['event'] = [
        'event_id' => 'event-test',
        'event_name' => 'Checkout Test Session',
    ];

    $normalized = \Forge\Server\normalizeLegacyTestCleanupPreviewRow([
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174450',
        'forge_order_number' => 1042,
        'submitted_at' => '2026-07-24 23:59:59.000000',
        'updated_at' => '2026-07-24 23:59:59.000000',
        'event_id' => 'event-test',
        'current_tray_number' => 5,
        'payload_json' => json_encode($payload, JSON_THROW_ON_ERROR),
    ]);

    assertSame('Order 1042', $normalized['order_reference']);
    assertSame('Historical Test Customer', $normalized['customer_name']);
    assertSame('Checkout Test Session', $normalized['event_label']);
    assertSame(5, $normalized['tray_number']);
    assertTrue(!array_key_exists('payload_json', $normalized));
});

$runner->run('legacy cleanup preview signatures change when the eligible record snapshot changes', static function (): void {
    $baseline = [[
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174451',
        'submitted_at' => '2026-07-24 20:00:00.000000',
        'updated_at' => '2026-07-24 20:05:00.000000',
        'current_tray_number' => 4,
        'event_id' => 'event-a',
    ]];
    $changed = [[
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174451',
        'submitted_at' => '2026-07-24 20:00:00.000000',
        'updated_at' => '2026-07-24 20:06:00.000000',
        'current_tray_number' => 4,
        'event_id' => 'event-a',
    ]];

    assertTrue(
        \Forge\Server\buildLegacyTestCleanupPreviewSignature($baseline)
        !== \Forge\Server\buildLegacyTestCleanupPreviewSignature($changed)
    );
});

$runner->run('previewLegacyTestCleanup returns normalized eligible and protected orders without deleting anything', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestEvent($pdo, [
        'event_id' => 'event-test-cleanup',
        'event_name' => 'Checkout Test Session',
        'event_type' => 'test_session',
        'event_status' => 'ended',
    ]);

    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174523',
        'forge_order_number' => 1201,
        'submitted_at' => '2026-07-24 23:30:00.000000',
        'current_tray_number' => 5,
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174523',
            'forge_order_number' => 1201,
            'customer' => [
                'full_name' => 'Historical Test Customer',
                'email' => 'historical@example.com',
                'phone' => '555-111-2222',
            ],
            'event' => [
                'event_id' => 'event-test-cleanup',
                'event_name' => 'Checkout Test Session',
                'event_type' => 'test_session',
            ],
        ]),
    ]);
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174524',
        'forge_order_number' => 1202,
        'submitted_at' => '2026-07-25 05:00:00.000000',
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174524',
            'forge_order_number' => 1202,
            'customer' => [
                'full_name' => 'Protected Real Customer',
                'email' => 'protected@example.com',
                'phone' => '555-333-4444',
            ],
            'event' => null,
        ]),
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6,7,8',
    ]);

    $orderCountBefore = (int) $pdo->query('SELECT COUNT(*) FROM forge_orders')->fetchColumn();
    $tombstoneCountBefore = (int) $pdo->query('SELECT COUNT(*) FROM forge_order_cleanup_tombstones')->fetchColumn();

    $preview = $repository->previewLegacyTestCleanup();

    assertSame(1, $preview['eligible_count']);
    assertSame('DELETE 1 ORDERS BEFORE JULY 25', $preview['confirmation_text']);
    assertSame('America/Chicago', $preview['cutoff_timezone']);
    assertSame('2026-07-25T00:00:00-05:00', $preview['cutoff_local']);
    assertSame(1, count($preview['eligible_orders']));
    assertSame(1, count($preview['protected_orders']));

    $eligibleOrder = $preview['eligible_orders'][0];
    assertSame('Order 1201', $eligibleOrder['order_reference']);
    assertSame('Historical Test Customer', $eligibleOrder['customer_name']);
    assertSame('Checkout Test Session', $eligibleOrder['event_label']);
    assertSame(5, $eligibleOrder['tray_number']);
    assertTrue(!array_key_exists('payload_json', $eligibleOrder));

    $protectedOrder = $preview['protected_orders'][0];
    assertSame('Order 1202', $protectedOrder['order_reference']);
    assertSame('Protected Real Customer', $protectedOrder['customer_name']);
    assertSame(null, $protectedOrder['event_label']);
    assertSame(null, $protectedOrder['tray_number']);
    assertTrue(!array_key_exists('payload_json', $protectedOrder));

    $orderCountAfter = (int) $pdo->query('SELECT COUNT(*) FROM forge_orders')->fetchColumn();
    $tombstoneCountAfter = (int) $pdo->query('SELECT COUNT(*) FROM forge_order_cleanup_tombstones')->fetchColumn();
    assertSame($orderCountBefore, $orderCountAfter);
    assertSame($tombstoneCountBefore, $tombstoneCountAfter);
});

$runner->run('staff cancellation stores cancelled state safely and releases any assigned tray while preserving order data', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174501',
        'forge_order_number' => 1042,
        'production_status' => 'tray_assigned',
        'current_tray_number' => 5,
        'internal_note' => "Customer confirmed spelling.\nPaid cash at show.",
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174501',
            'forge_order_number' => 1042,
            'event' => [
                'event_id' => 'event-live-1',
                'event_name' => 'Austin Market',
                'event_type' => 'live_event',
                'event_start_date' => '2026-07-24',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Austin',
                'public_order_token' => 'token-live-1',
            ],
        ]),
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6',
    ]);

    $result = $repository->cancelOrder('123e4567-e89b-42d3-a456-426614174501');
    $storedOrder = $repository->getOrder('123e4567-e89b-42d3-a456-426614174501');
    $trayRow = $pdo->query('SELECT tray_status, current_order_uuid FROM forge_production_trays WHERE tray_number = 5')->fetch(PDO::FETCH_ASSOC);
    $historyRow = $pdo->query("SELECT released_at, release_reason FROM forge_tray_assignment_history WHERE forge_order_uuid = '123e4567-e89b-42d3-a456-426614174501' LIMIT 1")->fetch(PDO::FETCH_ASSOC);

    assertSame('cancelled', $result['order']['production_status']);
    assertSame(null, $result['order']['current_tray_number']);
    assertTrue(is_string($result['order']['cancelled_at'] ?? null));
    assertSame("Customer confirmed spelling.\nPaid cash at show.", $storedOrder['internal_note']);
    assertSame('Kyle Hemenway', $storedOrder['payload']['customer']['full_name']);
    assertSame('Austin Market', $storedOrder['payload']['event']['event_name']);
    assertSame(5, $result['tray']['tray_number']);
    assertSame('available', $trayRow['tray_status'] ?? null);
    assertSame('', (string) ($trayRow['current_order_uuid'] ?? ''));
    assertTrue(is_string($historyRow['released_at'] ?? null));
    assertSame('cancelled', $historyRow['release_reason'] ?? null);
});

$runner->run('cancelled orders cannot receive another tray or complete more items safely', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174502',
        'forge_order_number' => 1043,
        'production_status' => 'cancelled',
        'current_tray_number' => null,
        'cancelled_at' => '2026-07-24 19:05:00.000000',
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174502',
            'forge_order_number' => 1043,
            'event' => [
                'event_id' => 'event-live-2',
                'event_name' => 'Dallas Market',
                'event_type' => 'live_event',
                'event_start_date' => '2026-07-24',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Dallas',
                'public_order_token' => 'token-live-2',
            ],
        ]),
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6',
    ]);

    assertThrows(
        static function () use ($repository): void {
            $repository->assignTrayToOrder('123e4567-e89b-42d3-a456-426614174502', 1);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\ProductionOrderNotAssignableException);
            assertSame('Only submitted orders can receive a tray.', $exception->getMessage());
        }
    );

    assertThrows(
        static function () use ($repository): void {
            $repository->completeItemQuantity(
                '123e4567-e89b-42d3-a456-426614174502',
                '123e4567-e89b-42d3-a456-426614174000-line-1',
                0,
                1
            );
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\ProductionOrderItemNotCompletableException);
            assertSame('Assign a production tray before marking completed pieces.', $exception->getMessage());
        }
    );
});

$runner->run('staff Test Session deletion creates a minimal tombstone and rejects live or malformed event deletes safely', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174503',
        'forge_order_number' => 1007,
        'production_status' => 'tray_assigned',
        'current_tray_number' => 8,
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174503',
            'forge_order_number' => 1007,
            'event' => [
                'event_id' => 'event-test-1',
                'event_name' => 'Checkout Test Session',
                'event_type' => 'test_session',
                'event_start_date' => '2026-07-27',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Shop',
                'public_order_token' => 'token-test-1',
            ],
        ]),
    ]);
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174504',
        'forge_order_number' => 1044,
        'production_status' => 'submitted',
        'current_tray_number' => null,
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174504',
            'forge_order_number' => 1044,
            'event' => [
                'event_id' => 'event-live-3',
                'event_name' => 'Austin Market',
                'event_type' => 'live_event',
                'event_start_date' => '2026-07-27',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Austin',
                'public_order_token' => 'token-live-3',
            ],
        ]),
    ]);
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174505',
        'forge_order_number' => 1045,
        'production_status' => 'submitted',
        'current_tray_number' => null,
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174505',
            'forge_order_number' => 1045,
            'event' => [
                'event_id' => 'event-legacy-1',
                'event_name' => 'Legacy Snapshot',
            ],
        ]),
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6,7,8',
    ]);

    $deleted = $repository->deleteTestOrder('123e4567-e89b-42d3-a456-426614174503', 'DELETE TEST ORDER');
    $tombstoneRow = $pdo->query("SELECT * FROM forge_order_cleanup_tombstones WHERE forge_order_uuid = '123e4567-e89b-42d3-a456-426614174503'")->fetch(PDO::FETCH_ASSOC);
    $trayRow = $pdo->query('SELECT tray_status, current_order_uuid FROM forge_production_trays WHERE tray_number = 8')->fetch(PDO::FETCH_ASSOC);

    assertSame('123e4567-e89b-42d3-a456-426614174503', $deleted['deleted_order_uuid']);
    assertSame(1007, $deleted['deleted_order_number']);
    assertSame(8, $deleted['released_tray_number']);
    assertTrue($repository->getOrder('123e4567-e89b-42d3-a456-426614174503') === null);
    assertSame('available', $trayRow['tray_status'] ?? null);
    assertSame('', (string) ($trayRow['current_order_uuid'] ?? ''));
    assertTrue(is_string($tombstoneRow['deleted_at'] ?? null));
    assertTrue(!array_key_exists('customer_name', $tombstoneRow));

    assertThrows(
        static function () use ($repository): void {
            $repository->deleteTestOrder('123e4567-e89b-42d3-a456-426614174504', 'DELETE TEST ORDER');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\TestOrderDeletionNotAllowedException);
            assertSame('Only Test Session orders can be permanently deleted.', $exception->getMessage());
        }
    );

    assertThrows(
        static function () use ($repository): void {
            $repository->deleteTestOrder('123e4567-e89b-42d3-a456-426614174505', 'DELETE TEST ORDER');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\TestOrderDeletionNotAllowedException);
            assertSame('Only Test Session orders can be permanently deleted.', $exception->getMessage());
        }
    );

    assertThrows(
        static function () use ($repository): void {
            $repository->deleteTestOrder('123e4567-e89b-42d3-a456-426614174504', 'DELETE TEST');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \InvalidArgumentException);
            assertSame('Enter DELETE TEST ORDER before deleting this order.', $exception->getMessage());
        }
    );
});

$runner->run('failed Test Session deletion rolls back safely without removing the order or releasing the tray', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo(false);
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174506',
        'forge_order_number' => 1008,
        'production_status' => 'tray_assigned',
        'current_tray_number' => 9,
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174506',
            'forge_order_number' => 1008,
            'event' => [
                'event_id' => 'event-test-2',
                'event_name' => 'Future Test Session',
                'event_type' => 'test_session',
                'event_start_date' => '2026-07-28',
                'event_end_date' => '2026-07-28',
                'event_location' => 'Shop',
                'public_order_token' => 'token-test-2',
            ],
        ]),
    ]);
    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6,7,8,9',
    ]);

    assertThrows(
        static function () use ($repository): void {
            $repository->deleteTestOrder('123e4567-e89b-42d3-a456-426614174506', 'DELETE TEST ORDER');
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StorageUnavailableException);
        }
    );

    $orderRow = $repository->getOrder('123e4567-e89b-42d3-a456-426614174506');
    $trayRow = $pdo->query('SELECT tray_status, current_order_uuid FROM forge_production_trays WHERE tray_number = 9')->fetch(PDO::FETCH_ASSOC);
    $historyRow = $pdo->query("SELECT released_at, release_reason FROM forge_tray_assignment_history WHERE forge_order_uuid = '123e4567-e89b-42d3-a456-426614174506' LIMIT 1")->fetch(PDO::FETCH_ASSOC);

    assertSame('tray_assigned', $orderRow['production_status']);
    assertSame(9, $orderRow['current_tray_number']);
    assertSame('assigned', $trayRow['tray_status'] ?? null);
    assertSame('123e4567-e89b-42d3-a456-426614174506', $trayRow['current_order_uuid'] ?? null);
    assertSame(null, $historyRow['released_at'] ?? null);
    assertSame(null, $historyRow['release_reason'] ?? null);
});

$runner->run('shipping export preview includes only selected-event live shipping orders with complete addresses and reports missing fields safely', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestEvent($pdo, [
        'event_id' => 'event-live-shipping',
        'event_name' => 'Austin Market',
        'event_type' => 'live_event',
        'start_date' => '2026-07-27',
        'end_date' => '2026-07-27',
        'event_status' => 'active',
    ]);

    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174601',
        'forge_order_number' => 1101,
        'submitted_at' => '2026-07-27 16:00:00.000000',
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174601',
            'forge_order_number' => 1101,
            'customer' => [
                'full_name' => 'Shipping Customer',
                'email' => 'ship@example.com',
                'phone' => '555-111-2222',
            ],
            'fulfillment' => [
                'method' => 'shipping',
                'shipping_address' => [
                    'address_1' => '123 Main Street',
                    'address_2' => '',
                    'city' => 'Austin',
                    'state' => 'TX',
                    'postal_code' => '78701',
                    'country' => 'United States',
                ],
            ],
            'event' => [
                'event_id' => 'event-live-shipping',
                'event_name' => 'Austin Market',
                'event_type' => 'live_event',
                'event_start_date' => '2026-07-27',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Austin',
            ],
        ]),
    ]);
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174602',
        'forge_order_number' => 1102,
        'submitted_at' => '2026-07-27 16:05:00.000000',
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174602',
            'forge_order_number' => 1102,
            'customer' => [
                'full_name' => 'Missing Postal',
                'email' => 'missing@example.com',
                'phone' => '555-333-4444',
            ],
            'fulfillment' => [
                'method' => 'shipping',
                'shipping_address' => [
                    'address_1' => '500 Pine Street',
                    'address_2' => '',
                    'city' => 'Austin',
                    'state' => 'TX',
                    'postal_code' => '',
                    'country' => 'United States',
                ],
            ],
            'event' => [
                'event_id' => 'event-live-shipping',
                'event_name' => 'Austin Market',
                'event_type' => 'live_event',
                'event_start_date' => '2026-07-27',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Austin',
            ],
        ]),
    ]);
    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174603',
        'forge_order_number' => 1103,
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174603',
            'forge_order_number' => 1103,
            'fulfillment' => [
                'method' => 'pickup',
                'shipping_address' => null,
            ],
            'event' => [
                'event_id' => 'event-live-shipping',
                'event_name' => 'Austin Market',
                'event_type' => 'live_event',
                'event_start_date' => '2026-07-27',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Austin',
            ],
        ]),
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3',
    ]);

    $preview = $repository->previewShippingExportForEvent('event-live-shipping');
    $download = $repository->generateShippingExportCsvForEvent('event-live-shipping');

    assertSame('Austin Market', $preview['event']['event_name']);
    assertSame(1, $preview['included_count']);
    assertSame(1, $preview['excluded_count']);
    assertSame(2, $preview['shipping_order_count']);
    assertSame('Order 1101', $preview['included_orders'][0]['order_reference']);
    assertSame(['postal_code'], $preview['excluded_orders'][0]['missing_fields']);
    assertSame(1, substr_count($download['csv'], 'Shipping Customer'));
    assertSame(0, substr_count($download['csv'], 'Missing Postal'));
    assertTrue(strpos($download['filename'], 'forge-shipping-export-austin-market-2026-07-27.csv') !== false);
});

$runner->run('shipping export csv keeps approved columns order neutralizes formulas and excludes private production fields safely', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestEvent($pdo, [
        'event_id' => 'event-safe-csv',
        'event_name' => 'Safe CSV Market',
        'event_type' => 'live_event',
        'start_date' => '2026-07-27',
        'end_date' => '2026-07-27',
        'event_status' => 'active',
    ]);

    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174611',
        'forge_order_number' => 1111,
        'internal_note' => 'private note',
        'current_tray_number' => 3,
        'production_status' => 'tray_assigned',
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174611',
            'forge_order_number' => 1111,
            'customer' => [
                'full_name' => '=Formula Name',
                'email' => '+ship@example.com',
                'phone' => '@555-111-2222',
            ],
            'fulfillment' => [
                'method' => 'shipping',
                'shipping_address' => [
                    'address_1' => '123 Main Street',
                    'address_2' => "Apt 2B,\nNorth Hall",
                    'city' => 'Austin',
                    'state' => 'TX',
                    'postal_code' => '78701',
                    'country' => 'United States',
                ],
            ],
            'event' => [
                'event_id' => 'event-safe-csv',
                'event_name' => 'Safe CSV Market',
                'event_type' => 'live_event',
                'event_start_date' => '2026-07-27',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Austin',
            ],
            'pricing' => [
                'estimated_total_cents' => 2600,
            ],
            'items' => [
                [
                    'line_id' => 'line-safe-1',
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
                    ],
                    'personalization_order' => [
                        ['position' => 1, 'type' => 'person', 'name' => 'Kyle'],
                    ],
                    'structured_attributes' => [],
                    'open_flags' => [],
                    'customer_note' => 'hello',
                    'production_note' => 'hidden',
                ],
            ],
        ]),
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3',
    ]);

    $download = $repository->generateShippingExportCsvForEvent('event-safe-csv');
    $lines = preg_split("/\r\n|\n|\r/", trim($download['csv']));
    assertTrue(is_array($lines));
    assertTrue(strpos($lines[0], 'Forge Order Number') !== false);
    assertTrue(strpos($lines[0], 'Customer Name') !== false);
    assertTrue(strpos($lines[0], 'Submitted At') !== false);
    assertTrue(strpos($download['csv'], "'=Formula Name") !== false);
    assertTrue(strpos($download['csv'], "'+ship@example.com") !== false);
    assertTrue(strpos($download['csv'], "'@555-111-2222") !== false);
    assertTrue(strpos($download['csv'], "\"Apt 2B,\nNorth Hall\"") !== false);
    assertTrue(strpos($download['csv'], 'private note') === false);
    assertTrue(strpos($download['csv'], '2600') === false);
    assertTrue(strpos($download['csv'], 'tray_assigned') === false);
    assertTrue(strpos($download['csv'], 'current_tray_number') === false);
    assertTrue(strpos($download['csv'], 'Kyle') === false);
});

$runner->run('shipping export excludes deleted test-order tombstones safely', static function (): void {
    $pdo = createStaffOrderRepositoryTestPdo();
    seedStaffOrderRepositoryTestEvent($pdo, [
        'event_id' => 'event-tombstone-safe',
        'event_name' => 'Tombstone Market',
        'event_type' => 'live_event',
        'start_date' => '2026-07-27',
        'end_date' => '2026-07-27',
        'event_status' => 'active',
    ]);

    seedStaffOrderRepositoryTestOrder($pdo, [
        'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174612',
        'forge_order_number' => 1112,
        'payload' => createValidPayload([
            'forge_order_uuid' => '123e4567-e89b-42d3-a456-426614174612',
            'forge_order_number' => 1112,
            'event' => [
                'event_id' => 'event-tombstone-safe',
                'event_name' => 'Tombstone Market',
                'event_type' => 'test_session',
                'event_start_date' => '2026-07-27',
                'event_end_date' => '2026-07-27',
                'event_location' => 'Austin',
            ],
        ]),
    ]);

    $repository = new \Forge\Server\PdoStaffOrderRepository($pdo, [
        'FORGE_TRAY_NUMBERS' => '1,2,3',
    ]);
    $repository->deleteTestOrder('123e4567-e89b-42d3-a456-426614174612', 'DELETE TEST ORDER');

    $preview = $repository->previewShippingExportForEvent('event-tombstone-safe');
    assertSame(0, $preview['included_count']);
    assertSame(0, $preview['excluded_count']);
    assertSame(0, $preview['shipping_order_count']);
});

$runner->run('shipping export endpoint pair stays staff-only no-store and separate from public order access', static function (): void {
    $previewEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/shipping-export-preview.php');
    $downloadEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/shipping-export-download.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-order-repository.php');
    $publicOrdersEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/orders.php');

    assertTrue(is_string($previewEndpointSource));
    assertTrue(is_string($downloadEndpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(is_string($publicOrdersEndpointSource));
    assertTrue(strpos($previewEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($downloadEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($previewEndpointSource, 'previewShippingExportForEvent') !== false);
    assertTrue(strpos($downloadEndpointSource, 'generateShippingExportCsvForEvent') !== false);
    assertTrue(strpos($downloadEndpointSource, 'Content-Type: text/csv; charset=utf-8') !== false);
    assertTrue(strpos($downloadEndpointSource, 'Cache-Control: no-store') !== false);
    assertTrue(strpos($repositorySource, 'No shipping orders with complete addresses are available for that event.') !== false);
    assertTrue(strpos($publicOrdersEndpointSource, 'shipping-export') === false);
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
        'FORGE_EMAIL_ENABLED' => false,
        'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
        'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
        'IGNORED_KEY' => 'ignored',
    ]);

    assertSame('$2y$example', $normalized['FORGE_STAFF_PIN_HASH']);
    assertSame('1,2,3', $normalized['FORGE_TRAY_NUMBERS']);
    assertSame(false, $normalized['FORGE_EMAIL_ENABLED']);
    assertSame('smtp.mail.me.com', $normalized['FORGE_EMAIL_HOST']);
    assertSame('The Hilltop Shop', $normalized['FORGE_EMAIL_FROM_NAME']);
    assertTrue(!array_key_exists('IGNORED_KEY', $normalized));
});

$runner->run('staff endpoint bootstrap candidates prefer the live hosted forge_server_test sibling layout', static function (): void {
    $candidates = forge_staff_bootstrap_candidates(null, '/home/example/domains/forge.thehilltopshop.com/public_html/api/v1/staff');

    assertSame('/home/example/domains/forge_server_test/bootstrap.php', $candidates[0]);
    assertSame('/home/example/domains/forge.thehilltopshop.com/forge_server_test/bootstrap.php', $candidates[1]);
    assertSame('/home/example/domains/forge.thehilltopshop.com/public_html/server/bootstrap.php', $candidates[2]);
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

$runner->run('hat catalog migration creates the isolated forge_catalog_hats table', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__, 2) . '/server/migrations/005_create_forge_catalog_hats.sql');

    assertTrue(is_string($migrationSource));
    assertTrue(strpos($migrationSource, 'CREATE TABLE IF NOT EXISTS forge_catalog_hats') !== false);
    assertTrue(strpos($migrationSource, 'base_cost DECIMAL(10,2) DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, 'status VARCHAR(16) NOT NULL') !== false);
});

$runner->run('hat catalog validation accepts approved optional fields and blank base cost remains null', static function (): void {
    $normalized = \Forge\Server\validateAndNormalizeStaffCatalogHatInput([
        'hat_name' => '  Richardson 112 Navy White  ',
        'manufacturer' => ' Richardson ',
        'model' => ' 112 ',
        'color' => ' Navy / White ',
        'vendor' => ' Hilltop Vendor ',
        'base_cost' => ' ',
        'status' => 'review',
        'notes' => '  Local favorite  ',
    ]);

    assertSame('Richardson 112 Navy White', $normalized['hat_name']);
    assertSame('Richardson', $normalized['manufacturer']);
    assertSame('112', $normalized['model']);
    assertSame('Navy / White', $normalized['color']);
    assertSame('Hilltop Vendor', $normalized['vendor']);
    assertSame(null, $normalized['base_cost']);
    assertSame('review', $normalized['status']);
    assertSame('Local favorite', $normalized['notes']);
});

$runner->run('hat catalog validation rejects missing names invalid statuses and invalid base cost safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\validateAndNormalizeStaffCatalogHatInput([
                'hat_name' => ' ',
                'status' => 'archived',
                'base_cost' => '-1.00',
            ]);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffHatCatalogValidationException);
            assertSame('Hat name is required.', $exception->getFieldErrors()['hat_name'] ?? null);
            assertSame('Select a valid status.', $exception->getFieldErrors()['status'] ?? null);
            assertSame('Base cost must be a nonnegative amount with up to two decimals.', $exception->getFieldErrors()['base_cost'] ?? null);
        }
    );
});

$runner->run('hat catalog importer derives readable hat names and excludes hidden or unsupported files', static function (): void {
    assertSame('Richardson 112 Navy White Front High', \Forge\Server\deriveStaffCatalogHatNameFromFileName('Richardson_112_Navy-_White_Front_High.jpg'));
    assertSame('Blackhawk R Zapped Headwear 5 Panel Patriotic Side', \Forge\Server\deriveStaffCatalogHatNameFromFileName('Blackhawk_R_Zapped_Headwear_5_Panel__patriotic_Side.png'));
    assertTrue(\Forge\Server\isSupportedStaffCatalogHatImportFile('Richardson_112_Navy-_White_Front_High.jpg'));
    assertTrue(\Forge\Server\isSupportedStaffCatalogHatImportFile('whiteoldschoolfrontside.png'));
    assertTrue(!\Forge\Server\isSupportedStaffCatalogHatImportFile('.DS_Store'));
    assertTrue(!\Forge\Server\isSupportedStaffCatalogHatImportFile('notes.ai'));
});

$runner->run('hat catalog importer dry-run makes no database or filesystem changes', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/Richardson_112_Navy-_White_Front_High.jpg', 'hat-preview');
        $repository = new class implements \Forge\Server\StaffHatCatalogImportRepositoryInterface {
            public int $createdCount = 0;
            public function listHats(): array
            {
                return [];
            }
            public function createImportedHat(array $input, string $photoPath): array
            {
                $this->createdCount++;
                return [];
            }
        };

        $importer = new \Forge\Server\StaffHatCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, true);

        assertSame(1, $summary['imported']);
        assertSame(0, $repository->createdCount);
        assertSame([], array_values(array_diff(scandir($uploadDirectory) ?: [], ['.', '..'])));
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('hat catalog importer rerun is idempotent when the hat already exists with a managed photo', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/Richardson_112_Navy-_White_Front_High.jpg', 'same-hat-photo');
        $repository = new class implements \Forge\Server\StaffHatCatalogImportRepositoryInterface {
            public int $createdCount = 0;
            public function listHats(): array
            {
                return [[
                    'id' => '123e4567-e89b-42d3-a456-426614174889',
                    'hat_name' => 'Richardson 112 Navy White Front High',
                    'photo_path' => '/uploads/hat-photos/hat-existing.png',
                ]];
            }
            public function createImportedHat(array $input, string $photoPath): array
            {
                $this->createdCount++;
                return [];
            }
        };

        $importer = new \Forge\Server\StaffHatCatalogImporter($repository, $uploadDirectory);
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

$runner->run('hat catalog importer reports duplicate-name collisions and partial failures safely', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/Osprey R+ black red front side photo.png', 'osprey-one');
        file_put_contents($sourceDirectory . '/whiteoldschoolfrontside.png', 'white-old-school');
        $repository = new class implements \Forge\Server\StaffHatCatalogImportRepositoryInterface {
            public function listHats(): array
            {
                return [[
                    'id' => '123e4567-e89b-42d3-a456-426614174888',
                    'hat_name' => 'Osprey R+ Black Red Front Side Photo',
                    'photo_path' => null,
                ]];
            }
            public function createImportedHat(array $input, string $photoPath): array
            {
                if (($input['hat_name'] ?? '') === 'Whiteoldschoolfrontside') {
                    throw new RuntimeException('Synthetic repository failure.');
                }
                return [];
            }
        };

        $importer = new \Forge\Server\StaffHatCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, false);

        assertSame(0, $summary['imported']);
        assertSame(1, $summary['collisions']);
        assertSame('existing_hat_name_conflict', $summary['collision_records'][0]['reason']);
        assertSame(1, $summary['failed']);
        assertSame('import_failed', $summary['failed_records'][0]['reason']);
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('hat metadata backfill parses clear manufacturer model and compound colors from source filenames', static function (): void {
    $richardson = \Forge\Server\proposeStaffCatalogHatMetadataFromFileName('Richardson_356_Cream-_Wheat_Front_High.jpg');
    $blackhawk = \Forge\Server\proposeStaffCatalogHatMetadataFromFileName('Blackhawk_R_Zapped_Headwear_5_Panel__graphite-grey_Chainlink_Side (1).png');

    assertSame('Richardson', $richardson['manufacturer']);
    assertSame('356', $richardson['model']);
    assertSame('Cream / Wheat', $richardson['color']);
    assertSame('high', $richardson['confidence']);
    assertSame([], $richardson['review_reasons']);

    assertSame('Zapped Headwear', $blackhawk['manufacturer']);
    assertSame('Blackhawk R 5 Panel', $blackhawk['model']);
    assertSame('Graphite Grey / Chainlink', $blackhawk['color']);
    assertSame('high', $blackhawk['confidence']);
    assertSame([], $blackhawk['review_reasons']);
});

$runner->run('hat metadata color parsing removes photo-description words and preserves compound color display names', static function (): void {
    $navyRope = \Forge\Server\parseStaffCatalogHatColorProposal('navy_whiterope_front_side_photo');
    $heatherGrey = \Forge\Server\parseStaffCatalogHatColorProposal('Black-_White-_Heather_Grey_Front_High');

    assertSame('Navy / White Rope', $navyRope['color']);
    assertSame([], $navyRope['review_reasons']);
    assertSame('Black / White / Heather Grey', $heatherGrey['color']);
    assertSame([], $heatherGrey['review_reasons']);
});

$runner->run('hat metadata backfill flags ambiguous filenames for manual review instead of guessing', static function (): void {
    $osprey = \Forge\Server\proposeStaffCatalogHatMetadataFromFileName('Osprey R+ black red front side photo.png');
    $cmb = \Forge\Server\proposeStaffCatalogHatMetadataFromFileName('Richardson_112_White-_Red_CMB_Front_High.jpg');
    $oldSchool = \Forge\Server\proposeStaffCatalogHatMetadataFromFileName('whiteoldschoolfrontside.png');

    assertSame('review', $osprey['confidence']);
    assertSame(null, $osprey['manufacturer']);
    assertSame('Osprey R+', $osprey['model']);
    assertSame('Black / Red', $osprey['color']);
    assertTrue(count($osprey['review_reasons']) > 0);

    assertSame('review', $cmb['confidence']);
    assertSame('Richardson', $cmb['manufacturer']);
    assertSame('112', $cmb['model']);
    assertSame(null, $cmb['color']);
    assertTrue(strpos($cmb['review_reasons'][0] ?? '', 'CMB') !== false);

    assertSame('review', $oldSchool['confidence']);
    assertSame(null, $oldSchool['manufacturer']);
    assertSame(null, $oldSchool['model']);
    assertSame(null, $oldSchool['color']);
});

$runner->run('hat metadata backfill dry-run makes no repository writes and preserves existing metadata while proposing blank-field updates', static function (): void {
    $sourceDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/Richardson_112_Navy-_White_Front_High.jpg', 'hat-preview');
        $repository = new class {
            public int $updates = 0;
            public function listHats(): array
            {
                return [[
                    'id' => '123e4567-e89b-42d3-a456-426614174100',
                    'hat_name' => 'Richardson 112 Navy White Front High',
                    'manufacturer' => 'Already Set',
                    'model' => null,
                    'color' => null,
                    'vendor' => null,
                    'base_cost' => null,
                    'status' => 'review',
                    'notes' => null,
                ]];
            }
            public function updateHat(string $id, array $input): array
            {
                $this->updates++;
                return $input;
            }
        };

        $backfill = new \Forge\Server\StaffHatCatalogMetadataBackfill($repository);
        $summary = $backfill->backfillDirectory($sourceDirectory, true);

        assertSame(0, $repository->updates);
        assertSame(1, $summary['updated']);
        assertSame(0, $summary['ambiguous']);
        assertSame(1, $summary['skipped_populated_fields']);
        assertSame('Already Set', $summary['updated_records'][0]['current_manufacturer']);
        assertSame('112', $summary['updated_records'][0]['proposed_model']);
        assertSame('Navy / White', $summary['updated_records'][0]['proposed_color']);
    } finally {
        removeTempImportDirectory($sourceDirectory);
    }
});

$runner->run('hat metadata backfill applies only high-confidence blank-field updates and is safe to rerun', static function (): void {
    $sourceDirectory = createTempImportDirectory();

    try {
        file_put_contents($sourceDirectory . '/Richardson_220_Stone_Front_High.jpg', 'hat-preview');
        $repository = new class {
            /** @var array<int, array<string, mixed>> */
            public array $records = [[
                'id' => '123e4567-e89b-42d3-a456-426614174101',
                'hat_name' => 'Richardson 220 Stone Front High',
                'manufacturer' => null,
                'model' => null,
                'color' => null,
                'vendor' => null,
                'base_cost' => null,
                'status' => 'review',
                'notes' => null,
            ]];
            public int $updates = 0;
            public function listHats(): array
            {
                return $this->records;
            }
            public function updateHat(string $id, array $input): array
            {
                $this->updates++;
                $this->records[0] = array_merge($this->records[0], $input);
                return $this->records[0];
            }
        };

        $backfill = new \Forge\Server\StaffHatCatalogMetadataBackfill($repository);
        $firstPass = $backfill->backfillDirectory($sourceDirectory, false);
        $secondPass = $backfill->backfillDirectory($sourceDirectory, false);

        assertSame(1, $firstPass['updated']);
        assertSame(1, $repository->updates);
        assertSame('Richardson', $repository->records[0]['manufacturer']);
        assertSame('220', $repository->records[0]['model']);
        assertSame('Stone', $repository->records[0]['color']);

        assertSame(0, $secondPass['updated']);
        assertSame(1, $secondPass['unchanged']);
        assertSame(3, $secondPass['skipped_populated_fields']);
        assertSame(1, $repository->updates);
    } finally {
        removeTempImportDirectory($sourceDirectory);
    }
});

$runner->run('hat catalog endpoints require staff authentication and enforce approved image upload constraints', static function (): void {
    $listEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/hats.php');
    $singleEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/hat.php');
    $photoEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/hat-photo.php');
    $sharedEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/_shared.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-hat-catalog-repository.php');

    assertTrue(is_string($listEndpointSource));
    assertTrue(is_string($singleEndpointSource));
    assertTrue(is_string($photoEndpointSource));
    assertTrue(is_string($sharedEndpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(strpos($listEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($singleEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($photoEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($photoEndpointSource, 'FILEINFO_MIME_TYPE') !== false);
    assertTrue(strpos($photoEndpointSource, "'image/png'") !== false);
    assertTrue(strpos($photoEndpointSource, "'image/jpeg'") !== false);
    assertTrue(strpos($photoEndpointSource, "'image/webp'") !== false);
    assertTrue(strpos($photoEndpointSource, 'FORGE_HAT_CATALOG_MAX_UPLOAD_BYTES = 5242880') !== false);
    assertTrue(strpos($sharedEndpointSource, 'function forge_hat_catalog_resolve_absolute_photo_path(?string $photoPath): ?string') !== false);
    assertTrue(strpos($repositorySource, 'forge_catalog_hats') !== false);
    assertTrue(strpos($repositorySource, 'forge_orders') === false);
});

$runner->run('material catalog migration creates the isolated forge_catalog_materials table', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__, 2) . '/server/migrations/006_create_forge_catalog_materials.sql');

    assertTrue(is_string($migrationSource));
    assertTrue(strpos($migrationSource, 'CREATE TABLE IF NOT EXISTS forge_catalog_materials') !== false);
    assertTrue(strpos($migrationSource, 'purchase_cost DECIMAL(10,2) DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, 'purchase_quantity INT UNSIGNED DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, 'image_width INT UNSIGNED DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, 'image_height INT UNSIGNED DEFAULT NULL') !== false);
});

$runner->run('material catalog validation accepts optional metadata blank costs remain null and per-unit reference can be derived safely', static function (): void {
    $normalized = \Forge\Server\validateAndNormalizeStaffCatalogMaterialInput([
        'material_name' => '  Brushed Stainless Black Acrylic  ',
        'material_type' => ' Acrylic ',
        'color' => ' Brushed Stainless / Black ',
        'supplier' => ' JDS ',
        'production_method' => ' Laserable ',
        'purchase_cost' => ' ',
        'purchase_quantity' => ' ',
        'cost_basis' => 'per_sheet',
        'status' => 'review',
        'notes' => '  Premium panel  ',
        'image_width' => '1000',
        'image_height' => '1000',
    ]);

    assertSame('Brushed Stainless Black Acrylic', $normalized['material_name']);
    assertSame('Acrylic', $normalized['material_type']);
    assertSame('Brushed Stainless / Black', $normalized['color']);
    assertSame('JDS', $normalized['supplier']);
    assertSame('Laserable', $normalized['production_method']);
    assertSame(null, $normalized['purchase_cost']);
    assertSame(null, $normalized['purchase_quantity']);
    assertSame('per_sheet', $normalized['cost_basis']);
    assertSame('review', $normalized['status']);
    assertSame('Premium panel', $normalized['notes']);
    assertSame(1000, $normalized['image_width']);
    assertSame(1000, $normalized['image_height']);
});

$runner->run('material catalog validation rejects missing names invalid statuses and invalid cost values safely', static function (): void {
    assertThrows(
        static function (): void {
            \Forge\Server\validateAndNormalizeStaffCatalogMaterialInput([
                'material_name' => ' ',
                'status' => 'archived',
                'purchase_cost' => '-1.00',
                'purchase_quantity' => '0',
                'cost_basis' => 'per_roll',
            ]);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffMaterialCatalogValidationException);
            assertSame('Material name is required.', $exception->getFieldErrors()['material_name'] ?? null);
            assertSame('Select a valid status.', $exception->getFieldErrors()['status'] ?? null);
            assertSame('Purchase cost must be a nonnegative amount with up to two decimals.', $exception->getFieldErrors()['purchase_cost'] ?? null);
            assertSame('Purchase quantity must be a positive whole number.', $exception->getFieldErrors()['purchase_quantity'] ?? null);
            assertSame('Select a valid cost basis.', $exception->getFieldErrors()['cost_basis'] ?? null);
        }
    );
});

$runner->run('material importer derives readable names recognizes supported files and classifies aspect ratios safely', static function (): void {
    assertSame('Brushed Stainless Black Acrylic 12x24', \Forge\Server\deriveStaffCatalogMaterialNameFromFileName('brushed-stainless-black-acrylic-12x24.png'));
    assertTrue(\Forge\Server\isSupportedStaffCatalogMaterialImportFile('rawhide-black-durra-bull-premium-leatherette-sheets-12x24-917884.png'));
    assertTrue(!\Forge\Server\isSupportedStaffCatalogMaterialImportFile('.DS_Store'));
    assertTrue(!\Forge\Server\isSupportedStaffCatalogMaterialImportFile('notes.ai'));
    assertSame('approximately_square', \Forge\Server\classifyStaffCatalogMaterialAspectRatio(1000, 1000));
    assertSame('portrait', \Forge\Server\classifyStaffCatalogMaterialAspectRatio(1500, 2000));
    assertSame('landscape', \Forge\Server\classifyStaffCatalogMaterialAspectRatio(2000, 1500));
    assertSame(true, \Forge\Server\shouldUseContainForStaffCatalogMaterialCard(1000, 1000));
    assertSame(false, \Forge\Server\shouldUseContainForStaffCatalogMaterialCard(1500, 2000));
});

$runner->run('material importer dry-run makes no database or filesystem changes', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        createPngFixture($sourceDirectory . '/brushed-stainless-black-acrylic-12x24.png', 1000, 1000);
        $repository = new class implements \Forge\Server\StaffMaterialCatalogImportRepositoryInterface {
            public int $createdCount = 0;
            public function listMaterials(): array
            {
                return [];
            }
            public function createImportedMaterial(array $input, string $swatchPath): array
            {
                $this->createdCount++;
                return [];
            }
        };

        $importer = new \Forge\Server\StaffMaterialCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, true);

        assertSame(1, $summary['imported']);
        assertSame(1, $summary['approximately_square']);
        assertSame(0, $repository->createdCount);
        assertSame([], array_values(array_diff(scandir($uploadDirectory) ?: [], ['.', '..'])));
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('material importer rerun is idempotent and duplicate-name collisions and partial failures are reported safely', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        createPngFixture($sourceDirectory . '/brushed-stainless-black-acrylic-12x24.png', 1000, 1000);
        createPngFixture($sourceDirectory . '/rawhide-black-durra-bull-premium-leatherette-sheets-12x24-917884.png', 1500, 2000);
        $repository = new class implements \Forge\Server\StaffMaterialCatalogImportRepositoryInterface {
            public function listMaterials(): array
            {
                return [[
                    'id' => '123e4567-e89b-42d3-a456-426614174777',
                    'material_name' => 'Brushed Stainless Black Acrylic 12x24',
                    'swatch_path' => '/uploads/material-swatches/material-existing.png',
                ]];
            }
            public function createImportedMaterial(array $input, string $swatchPath): array
            {
                throw new RuntimeException('Synthetic repository failure.');
            }
        };

        $importer = new \Forge\Server\StaffMaterialCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, false);

        assertSame(0, $summary['imported']);
        assertSame(1, $summary['skipped']);
        assertSame('already_imported', $summary['skipped_records'][0]['reason']);
        assertSame(1, $summary['failed']);
        assertSame('import_failed', $summary['failed_records'][0]['reason']);
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('material import proposal captures explicit type color and production method without guessing', static function (): void {
    $acrylic = \Forge\Server\proposeStaffCatalogMaterialImportMetadataFromFileName('brushed-stainless-black-acrylic-12x24.png');
    $leatherette = \Forge\Server\proposeStaffCatalogMaterialImportMetadataFromFileName('rawhide-black-durra-bull-premium-leatherette-sheets-12x24-917884.png');

    assertSame('Acrylic', $acrylic['material_type']);
    assertSame('Brushed / Stainless / Black', $acrylic['color']);
    assertSame(null, $acrylic['production_method']);

    assertSame('Leatherette', $leatherette['material_type']);
    assertSame('Rawhide / Black', $leatherette['color']);
    assertSame(null, $leatherette['production_method']);
});

$runner->run('material catalog endpoints require staff authentication enforce approved image upload constraints and stay isolated from order tables', static function (): void {
    $listEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/materials.php');
    $singleEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/material.php');
    $swatchEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/material-swatch.php');
    $sharedEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/_shared.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-material-catalog-repository.php');

    assertTrue(is_string($listEndpointSource));
    assertTrue(is_string($singleEndpointSource));
    assertTrue(is_string($swatchEndpointSource));
    assertTrue(is_string($sharedEndpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(strpos($listEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($singleEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($swatchEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($swatchEndpointSource, 'FILEINFO_MIME_TYPE') !== false);
    assertTrue(strpos($swatchEndpointSource, '@getimagesize') !== false);
    assertTrue(strpos($swatchEndpointSource, "'image/png'") !== false);
    assertTrue(strpos($swatchEndpointSource, "'image/jpeg'") !== false);
    assertTrue(strpos($swatchEndpointSource, "'image/webp'") !== false);
    assertTrue(strpos($swatchEndpointSource, 'FORGE_MATERIAL_CATALOG_MAX_UPLOAD_BYTES = 5242880') !== false);
    assertTrue(strpos($sharedEndpointSource, "function forge_material_catalog_resolve_absolute_swatch_path(?string \$swatchPath): ?string") !== false);
    assertTrue(strpos($repositorySource, 'forge_catalog_materials') !== false);
    assertTrue(strpos($repositorySource, 'forge_orders') === false);
});

$runner->run('finished hat catalog migration creates the isolated forge_catalog_finished_hats table', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__, 2) . '/server/migrations/007_create_forge_catalog_finished_hats.sql');

    assertTrue(is_string($migrationSource));
    assertTrue(strpos($migrationSource, 'CREATE TABLE IF NOT EXISTS forge_catalog_finished_hats') !== false);
    assertTrue(strpos($migrationSource, 'design_id CHAR(36) DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, 'hat_id CHAR(36) DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, 'material_id CHAR(36) DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, 'retail_price DECIMAL(10,2) DEFAULT NULL') !== false);
    assertTrue(strpos($migrationSource, "placement_status VARCHAR(40) NOT NULL DEFAULT 'unassigned'") !== false);
});

$runner->run('catalog sort-order migration updates only the four catalog tables and seeds deterministic custom ordering', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__, 2) . '/server/migrations/008_add_catalog_sort_order.sql');

    assertTrue(is_string($migrationSource));
    assertTrue(strpos($migrationSource, 'ALTER TABLE forge_catalog_designs') !== false);
    assertTrue(strpos($migrationSource, 'ALTER TABLE forge_catalog_hats') !== false);
    assertTrue(strpos($migrationSource, 'ALTER TABLE forge_catalog_materials') !== false);
    assertTrue(strpos($migrationSource, 'ALTER TABLE forge_catalog_finished_hats') !== false);
    assertTrue(strpos($migrationSource, 'sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0') !== false);
    assertTrue(strpos($migrationSource, 'ORDER BY updated_at DESC, design_name ASC, id ASC') !== false);
    assertTrue(strpos($migrationSource, 'ORDER BY updated_at DESC, hat_name ASC, id ASC') !== false);
    assertTrue(strpos($migrationSource, 'ORDER BY updated_at DESC, material_name ASC, id ASC') !== false);
    assertTrue(strpos($migrationSource, 'ORDER BY updated_at DESC, finished_hat_name ASC, id ASC') !== false);
    assertTrue(strpos($migrationSource, 'forge_orders') === false);
});

$runner->run('catalog reorder endpoint source requires authenticated staff access and keeps a strict resource allowlist', static function (): void {
    $endpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/reorder.php');

    assertTrue(is_string($endpointSource));
    assertTrue(strpos($endpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($endpointSource, "case 'designs'") !== false);
    assertTrue(strpos($endpointSource, "case 'hats'") !== false);
    assertTrue(strpos($endpointSource, "case 'materials'") !== false);
    assertTrue(strpos($endpointSource, "case 'finished_hats'") !== false);
    assertTrue(strpos($endpointSource, 'reorderDesigns') !== false);
    assertTrue(strpos($endpointSource, 'reorderHats') !== false);
    assertTrue(strpos($endpointSource, 'reorderMaterials') !== false);
    assertTrue(strpos($endpointSource, 'reorderFinishedHats') !== false);
    assertTrue(strpos($endpointSource, 'catalog_order_conflict') !== false);
    assertTrue(strpos($endpointSource, 'table') === false);
});

$runner->run('finished hat repository create list read and update support incomplete links and blank price remains null', static function (): void {
    $pdo = createFinishedHatCatalogTestPdo();
    seedFinishedHatCatalogLinkTables($pdo);
    $repository = new \Forge\Server\PdoStaffFinishedHatCatalogRepository($pdo);

    $created = $repository->createFinishedHat([
        'finished_hat_name' => 'Texas Flag Acrylic Patch Hat Black Performance Rope',
        'design_id' => '123e4567-e89b-42d3-a456-426614174101',
        'hat_id' => '',
        'material_id' => '',
        'placement_status' => 'unassigned',
        'retail_price' => '',
        'status' => 'review',
        'notes' => ' Sample record '
    ]);

    assertSame('Texas Flag Acrylic Patch Hat Black Performance Rope', $created['finished_hat_name']);
    assertSame(null, $created['retail_price']);
    assertSame(true, $created['needs_linking']);
    assertSame('Texas Flag', $created['design_name']);

    $listed = $repository->listFinishedHats();
    assertSame(1, count($listed));

    $updated = $repository->updateFinishedHat((string) $created['id'], [
        'hat_id' => '123e4567-e89b-42d3-a456-426614174201',
        'material_id' => '123e4567-e89b-42d3-a456-426614174301',
        'placement_status' => 'sample',
        'retail_price' => '32.50',
        'status' => 'active',
    ]);

    assertSame(false, $updated['needs_linking']);
    assertSame('32.50', $updated['retail_price']);
    assertSame('sample', $updated['placement_status']);
    assertSame('active', $updated['status']);
    assertSame('Richardson', $updated['hat_manufacturer']);
    assertSame('Rawhide Black Durra Bull Premium Leatherette Sheets', $updated['material_name']);
});

$runner->run('finished hat validation rejects invalid status placement status price and broken links safely', static function (): void {
    $pdo = createFinishedHatCatalogTestPdo();
    seedFinishedHatCatalogLinkTables($pdo);
    $repository = new \Forge\Server\PdoStaffFinishedHatCatalogRepository($pdo);

    assertThrows(
        static function () use ($repository): void {
            $repository->createFinishedHat([
                'finished_hat_name' => ' ',
                'design_id' => '123e4567-e89b-42d3-a456-426614174999',
                'hat_id' => '123e4567-e89b-42d3-a456-426614174998',
                'material_id' => '123e4567-e89b-42d3-a456-426614174997',
                'placement_status' => 'displayed',
                'retail_price' => '-2.00',
                'status' => 'archived',
            ]);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffFinishedHatCatalogValidationException);
            assertSame('Finished hat name is required.', $exception->getFieldErrors()['finished_hat_name'] ?? null);
            assertSame('Select a valid design.', $exception->getFieldErrors()['design_id'] ?? null);
            assertSame('Select a valid hat.', $exception->getFieldErrors()['hat_id'] ?? null);
            assertSame('Select a valid material.', $exception->getFieldErrors()['material_id'] ?? null);
            assertSame('Select a valid placement status.', $exception->getFieldErrors()['placement_status'] ?? null);
            assertSame('Retail price must be a nonnegative amount with up to two decimals.', $exception->getFieldErrors()['retail_price'] ?? null);
            assertSame('Select a valid status.', $exception->getFieldErrors()['status'] ?? null);
        }
    );
});

$runner->run('shared catalog sort-order helper rejects duplicate stale and incomplete id sets safely', static function (): void {
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE forge_catalog_designs (id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL DEFAULT 0)');
    $pdo->exec("INSERT INTO forge_catalog_designs (id, sort_order) VALUES ('a', 1000), ('b', 2000), ('c', 3000)");

    assertThrows(
        static function () use ($pdo): void {
            \Forge\Server\saveStaffCatalogSortOrder($pdo, 'forge_catalog_designs', ['a', 'a', 'c']);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffCatalogSortOrderValidationException);
        }
    );

    assertThrows(
        static function () use ($pdo): void {
            \Forge\Server\saveStaffCatalogSortOrder($pdo, 'forge_catalog_designs', ['a', 'b']);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffCatalogSortOrderConflictException);
        }
    );

    assertThrows(
        static function () use ($pdo): void {
            \Forge\Server\saveStaffCatalogSortOrder($pdo, 'forge_catalog_designs', ['a', 'b', 'missing']);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffCatalogSortOrderConflictException);
        }
    );
});

$runner->run('design hat material and finished-hat repositories append sort order and persist saved custom ordering', static function (): void {
    $designRepository = new \Forge\Server\PdoStaffDesignCatalogRepository(createDesignCatalogTestPdo());
    $firstDesign = $designRepository->createDesign([
        'design_name' => 'Alpha Ranch',
        'category' => 'other',
        'store_fit' => 'undecided',
        'status' => 'review',
        'production_method' => 'tbd',
        'production_file_location' => '',
        'made_on_hat' => 'unknown',
        'notes' => ''
    ]);
    $secondDesign = $designRepository->createDesign([
        'design_name' => 'Bravo Trail',
        'category' => 'other',
        'store_fit' => 'undecided',
        'status' => 'review',
        'production_method' => 'tbd',
        'production_file_location' => '',
        'made_on_hat' => 'unknown',
        'notes' => ''
    ]);
    assertSame(1000, $firstDesign['sort_order']);
    assertSame(2000, $secondDesign['sort_order']);
    $designRepository->reorderDesigns([(string) $secondDesign['id'], (string) $firstDesign['id']]);
    assertSame((string) $secondDesign['id'], $designRepository->listDesigns()[0]['id']);

    $hatRepository = new \Forge\Server\PdoStaffHatCatalogRepository(createHatCatalogTestPdo());
    $firstHat = $hatRepository->createHat([
        'hat_name' => 'Alpha Hat',
        'manufacturer' => 'Richardson',
        'model' => '112',
        'color' => 'Black',
        'vendor' => '',
        'base_cost' => '',
        'status' => 'review',
        'notes' => ''
    ]);
    $secondHat = $hatRepository->createHat([
        'hat_name' => 'Bravo Hat',
        'manufacturer' => 'Richardson',
        'model' => '115',
        'color' => 'Navy',
        'vendor' => '',
        'base_cost' => '',
        'status' => 'review',
        'notes' => ''
    ]);
    assertSame(1000, $firstHat['sort_order']);
    assertSame(2000, $secondHat['sort_order']);
    $hatRepository->reorderHats([(string) $secondHat['id'], (string) $firstHat['id']]);
    assertSame((string) $secondHat['id'], $hatRepository->listHats()[0]['id']);

    $materialRepository = new \Forge\Server\PdoStaffMaterialCatalogRepository(createMaterialCatalogTestPdo());
    $firstMaterial = $materialRepository->createMaterial([
        'material_name' => 'Alpha Acrylic',
        'material_type' => 'Acrylic',
        'color' => 'Black',
        'supplier' => '',
        'production_method' => '',
        'purchase_cost' => '',
        'purchase_quantity' => '',
        'cost_basis' => '',
        'status' => 'review',
        'notes' => ''
    ]);
    $secondMaterial = $materialRepository->createMaterial([
        'material_name' => 'Bravo Leatherette',
        'material_type' => 'Leatherette',
        'color' => 'Brown',
        'supplier' => '',
        'production_method' => '',
        'purchase_cost' => '',
        'purchase_quantity' => '',
        'cost_basis' => '',
        'status' => 'review',
        'notes' => ''
    ]);
    assertSame(1000, $firstMaterial['sort_order']);
    assertSame(2000, $secondMaterial['sort_order']);
    $materialRepository->reorderMaterials([(string) $secondMaterial['id'], (string) $firstMaterial['id']]);
    assertSame((string) $secondMaterial['id'], $materialRepository->listMaterials()[0]['id']);

    $finishedHatPdo = createFinishedHatCatalogTestPdo();
    seedFinishedHatCatalogLinkTables($finishedHatPdo);
    $finishedHatRepository = new \Forge\Server\PdoStaffFinishedHatCatalogRepository($finishedHatPdo);
    $firstFinishedHat = $finishedHatRepository->createFinishedHat([
        'finished_hat_name' => 'Alpha Finished Hat',
        'design_id' => '123e4567-e89b-42d3-a456-426614174101',
        'hat_id' => '123e4567-e89b-42d3-a456-426614174201',
        'material_id' => '123e4567-e89b-42d3-a456-426614174301',
        'placement_status' => 'unassigned',
        'retail_price' => '',
        'status' => 'review',
        'notes' => ''
    ]);
    $secondFinishedHat = $finishedHatRepository->createFinishedHat([
        'finished_hat_name' => 'Bravo Finished Hat',
        'design_id' => '123e4567-e89b-42d3-a456-426614174101',
        'hat_id' => '123e4567-e89b-42d3-a456-426614174201',
        'material_id' => '123e4567-e89b-42d3-a456-426614174301',
        'placement_status' => 'sample',
        'retail_price' => '',
        'status' => 'review',
        'notes' => ''
    ]);
    assertSame(1000, $firstFinishedHat['sort_order']);
    assertSame(2000, $secondFinishedHat['sort_order']);
    $finishedHatRepository->reorderFinishedHats([(string) $secondFinishedHat['id'], (string) $firstFinishedHat['id']]);
    assertSame((string) $secondFinishedHat['id'], $finishedHatRepository->listFinishedHats()[0]['id']);
});

$runner->run('design repository blocks linked deletes and deletes unlinked designs safely', static function (): void {
    $pdo = createDesignCatalogTestPdo();
    $repository = new \Forge\Server\PdoStaffDesignCatalogRepository($pdo);

    $linkedDesign = $repository->createDesign([
        'design_name' => 'Linked Design',
        'category' => 'other',
        'store_fit' => 'undecided',
        'status' => 'review',
        'production_method' => 'tbd',
        'production_file_location' => '',
        'made_on_hat' => 'unknown',
        'notes' => ''
    ]);
    $unlinkedDesign = $repository->createDesign([
        'design_name' => 'Unlinked Design',
        'category' => 'other',
        'store_fit' => 'undecided',
        'status' => 'review',
        'production_method' => 'tbd',
        'production_file_location' => '',
        'made_on_hat' => 'unknown',
        'notes' => ''
    ]);

    $pdo->prepare(
        'INSERT INTO forge_catalog_finished_hats (
            id,
            finished_hat_name,
            design_id,
            created_at,
            updated_at
        ) VALUES (
            :id,
            :finished_hat_name,
            :design_id,
            :created_at,
            :updated_at
        )'
    )->execute([
        ':id' => 'finished-1',
        ':finished_hat_name' => 'Linked Finished Hat',
        ':design_id' => $linkedDesign['id'],
        ':created_at' => '2026-07-24 10:00:00.000000',
        ':updated_at' => '2026-07-24 10:00:00.000000',
    ]);

    $linkedRecord = $repository->getDesign((string) $linkedDesign['id']);
    assertSame(1, $linkedRecord['finished_hat_link_count']);

    assertThrows(
        static function () use ($repository, $linkedDesign): void {
            $repository->deleteDesign((string) $linkedDesign['id']);
        },
        static function (\Throwable $exception): void {
            assertTrue($exception instanceof \Forge\Server\StaffDesignCatalogDeleteConflictException);
            assertSame(1, $exception->getLinkedFinishedHatCount());
        }
    );

    $deleted = $repository->deleteDesign((string) $unlinkedDesign['id']);
    assertSame('Unlinked Design', $deleted['design']['design_name']);
    assertSame(null, $repository->getDesign((string) $unlinkedDesign['id']));
    assertSame(1, count($repository->listDesigns()));
});

$runner->run('design delete endpoint requires auth and returns sanitized linked-record conflicts', static function (): void {
    $endpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/design.php');
    $repositorySource = file_get_contents(dirname(__DIR__, 2) . '/server/lib/staff-design-catalog-repository.php');

    assertTrue(is_string($endpointSource));
    assertTrue(strpos($endpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($endpointSource, "\$method !== 'DELETE'") !== false);
    assertTrue(strpos($endpointSource, 'deleteDesign($designId)') !== false);
    assertTrue(strpos($endpointSource, 'design_delete_blocked') !== false);
    assertTrue(strpos($endpointSource, 'finished_hat_link_count') !== false);
    assertTrue(strpos($endpointSource, 'SQLSTATE') === false);
    assertTrue(is_string($repositorySource));
    assertTrue(strpos($repositorySource, 'FROM forge_catalog_finished_hats') !== false);
    assertTrue(strpos($repositorySource, 'WHERE design_id = :id') !== false);
});

$runner->run('finished hat importer normalization grouping primary-photo selection and exact unique link matching are conservative', static function (): void {
    assertSame(true, \Forge\Server\isSupportedStaffCatalogFinishedHatImportFile('texas-flag-acrylic-patch-hat-black-performance-rope-main.jpg'));
    assertSame(false, \Forge\Server\isSupportedStaffCatalogFinishedHatImportFile('.DS_Store'));
    assertSame(true, \Forge\Server\isOpaqueFinishedHatImportFileName('IMG_4514.JPG'));
    assertSame('Texas Hill Country Brown Leatherette Patch Hat Brown Khaki Trucker', \Forge\Server\deriveStaffCatalogFinishedHatNameFromFileName('texas-hill-country-brown-leatherette-patch-hat-brown-khaki-trucker-main.png'));
    assertSame('texas hill country leatherette patch hat black richardson 168 7 panel', \Forge\Server\normalizeStaffCatalogFinishedHatGroupingKey('texas-hill-country-leatherette-patch-hat-black-richardson-168-7-panel-front-2.png'));
    assertSame('texas-hill-country-front.png', \Forge\Server\selectPrimaryFinishedHatImportFile([
        'texas-hill-country-side.png',
        'texas-hill-country-front.png',
        'texas-hill-country-back.png',
    ]));

    $proposal = \Forge\Server\proposeStaffCatalogFinishedHatImportMetadataFromFileName(
        'america-250-coastal-flag-eagle-leatherette-patch-hat-navy-charcoal-richardson-112-main.png',
        [
            ['id' => 'design-1', 'design_name' => 'America 250 Coastal Leather Patch', 'match_key' => 'america 250 coastal leather patch'],
        ],
        [
            ['id' => 'hat-1', 'manufacturer' => 'richardson', 'model' => '112', 'color' => 'navy charcoal', 'summary' => 'Richardson / 112 / Navy / Charcoal'],
        ],
        [
            ['id' => 'mat-1', 'material_name' => 'Rawhide Black Durra Bull Premium Leatherette Sheets', 'match_key' => 'rawhide black durra bull premium leatherette sheets'],
        ]
    );

    assertSame(null, $proposal['design_id']);
    assertSame('hat-1', $proposal['hat_id']);
    assertSame(null, $proposal['material_id']);
    assertSame('unassigned', $proposal['placement_status']);
});

$runner->run('finished hat importer dry-run makes no repository or filesystem changes and rerun stays idempotent', static function (): void {
    $sourceDirectory = createTempImportDirectory();
    $uploadDirectory = createTempImportDirectory();

    try {
        createPngFixture($sourceDirectory . '/texas-flag-acrylic-patch-hat-black-performance-rope-main.png', 1254, 1254);
        createPngFixture($sourceDirectory . '/IMG_4514.png', 1536, 2048);
        $repository = new class implements \Forge\Server\StaffFinishedHatCatalogImportRepositoryInterface {
            public int $createdCount = 0;
            public function listFinishedHats(): array
            {
                return [];
            }
            public function listFinishedHatImportLinkOptions(): array
            {
                return ['designs' => [], 'hats' => [], 'materials' => []];
            }
            public function createImportedFinishedHat(array $input, string $photoPath): array
            {
                $this->createdCount++;
                return [];
            }
        };

        $importer = new \Forge\Server\StaffFinishedHatCatalogImporter($repository, $uploadDirectory);
        $summary = $importer->importDirectory($sourceDirectory, true);

        assertSame(1, $summary['imported']);
        assertSame(1, $summary['manual_review']);
        assertSame(0, $repository->createdCount);
        assertSame([], array_values(array_diff(scandir($uploadDirectory) ?: [], ['.', '..'])));
    } finally {
        removeTempImportDirectory($sourceDirectory);
        removeTempImportDirectory($uploadDirectory);
    }
});

$runner->run('finished hat assisted linker uses the longest unique design phrase and rejects competing design phrases', static function (): void {
    $designOptions = \Forge\Server\buildStaffCatalogFinishedHatAssistedDesignIndex([
        ['id' => '123e4567-e89b-42d3-a456-426614174401', 'design_name' => 'Texas Flag Map'],
        ['id' => '123e4567-e89b-42d3-a456-426614174402', 'design_name' => 'Texas Flag'],
        ['id' => '123e4567-e89b-42d3-a456-426614174403', 'design_name' => 'America 250 Coastal Leather Patch'],
        ['id' => '123e4567-e89b-42d3-a456-426614174404', 'design_name' => 'America 250 Coastal Acrylic Patch'],
    ]);

    $unique = \Forge\Server\proposeStaffCatalogFinishedHatAssistedDesignLink(
        'Texas Flag Map Acrylic Patch Hat Navy Performance Rope',
        $designOptions
    );
    $competing = \Forge\Server\proposeStaffCatalogFinishedHatAssistedDesignLink(
        'America 250 Coastal Flag Eagle Leatherette Patch Hat Navy Charcoal Richardson 112',
        $designOptions
    );

    assertSame('proposed', $unique['status']);
    assertSame('Texas Flag Map', $unique['label']);
    assertSame('ambiguous', $competing['status']);
});

$runner->run('finished hat assisted linker matches hats by manufacturer model and unique color including compound color normalization', static function (): void {
    $hatOptions = \Forge\Server\buildStaffCatalogFinishedHatAssistedHatIndex([
        [
            'id' => '123e4567-e89b-42d3-a456-426614174501',
            'manufacturer' => 'Richardson',
            'model' => '112',
            'color' => 'Navy / Charcoal',
        ],
        [
            'id' => '123e4567-e89b-42d3-a456-426614174502',
            'manufacturer' => 'Richardson',
            'model' => '112',
            'color' => 'Black / White / Heather Grey',
        ],
    ]);

    $navy = \Forge\Server\proposeStaffCatalogFinishedHatAssistedHatLink(
        'America 250 Coastal Flag Eagle Leatherette Patch Hat Navy Charcoal Richardson 112',
        $hatOptions
    );
    $gray = \Forge\Server\proposeStaffCatalogFinishedHatAssistedHatLink(
        'Texas Hill Country Acrylic Patch Hat Black Gray White Richardson 112',
        $hatOptions
    );

    assertSame('proposed', $navy['status']);
    assertSame('Richardson / 112 / Navy / Charcoal', $navy['label']);
    assertSame('proposed', $gray['status']);
    assertSame('Richardson / 112 / Black / White / Heather Grey', $gray['label']);
});

$runner->run('finished hat assisted linker rejects ambiguous same-model hats and reports missing hat models', static function (): void {
    $hatOptions = \Forge\Server\buildStaffCatalogFinishedHatAssistedHatIndex([
        [
            'id' => '123e4567-e89b-42d3-a456-426614174511',
            'manufacturer' => 'Richardson',
            'model' => '112',
            'color' => 'Navy / Charcoal',
        ],
        [
            'id' => '123e4567-e89b-42d3-a456-426614174512',
            'manufacturer' => 'Richardson',
            'model' => '112',
            'color' => 'Navy / White',
        ],
    ]);

    $ambiguous = \Forge\Server\proposeStaffCatalogFinishedHatAssistedHatLink(
        'Texas Flag Acrylic Patch Hat Richardson 112',
        $hatOptions
    );
    $missing = \Forge\Server\proposeStaffCatalogFinishedHatAssistedHatLink(
        'Texas Hill Country Camo Leatherette Patch Hat Black Richardson 168 7 Panel',
        $hatOptions
    );

    assertSame('ambiguous', $ambiguous['status']);
    assertSame('missing_catalog_record', $missing['status']);
    assertTrue(strpos((string) $missing['reason'], 'Richardson 168 7 Panel') !== false);
});

$runner->run('finished hat assisted linker matches unique materials and rejects ambiguous material matches', static function (): void {
    $materialOptions = \Forge\Server\buildStaffCatalogFinishedHatAssistedMaterialIndex([
        [
            'id' => '123e4567-e89b-42d3-a456-426614174601',
            'material_name' => 'Brushed Stainless Red Blue Acrylic 12x24',
            'material_type' => 'Acrylic',
            'color' => 'Brushed / Stainless / Red / Blue',
        ],
        [
            'id' => '123e4567-e89b-42d3-a456-426614174602',
            'material_name' => 'Dark Brown Black Durra Bull Premium Leatherette Sheets 12x24',
            'material_type' => 'Leatherette',
            'color' => 'Dark / Brown / Black',
        ],
        [
            'id' => '123e4567-e89b-42d3-a456-426614174603',
            'material_name' => 'Light Brown Black Durra Bull Premium Leatherette Sheets 12x24',
            'material_type' => 'Leatherette',
            'color' => 'Light / Brown / Black',
        ],
    ]);

    $unique = \Forge\Server\proposeStaffCatalogFinishedHatAssistedMaterialLink(
        'Texas Flag Brushed Stainless Red Blue Acrylic Patch Hat Navy Performance Rope',
        $materialOptions
    );
    $ambiguous = \Forge\Server\proposeStaffCatalogFinishedHatAssistedMaterialLink(
        'Texas Hill Country Brown Leatherette Patch Hat Brown Khaki Trucker',
        $materialOptions
    );

    assertSame('proposed', $unique['status']);
    assertSame('Brushed Stainless Red Blue Acrylic 12x24 / Brushed / Stainless / Red / Blue', $unique['label']);
    assertSame('ambiguous', $ambiguous['status']);
});

$runner->run('finished hat assisted linker preserves existing links applies partial updates and is safe to rerun', static function (): void {
    $repository = new class {
        /** @var array<int, array<string, mixed>> */
        public array $records = [
            [
                'id' => '123e4567-e89b-42d3-a456-426614174701',
                'finished_hat_name' => 'America 250 Coastal Flag Eagle Leatherette Patch Hat Navy Charcoal Richardson 112',
                'design_id' => '123e4567-e89b-42d3-a456-426614174711',
                'design_name' => 'Manual Coastal Design',
                'hat_id' => null,
                'hat_manufacturer' => null,
                'hat_model' => null,
                'hat_color' => null,
                'material_id' => null,
                'material_name' => null,
                'material_color' => null,
            ],
            [
                'id' => '123e4567-e89b-42d3-a456-426614174702',
                'finished_hat_name' => 'Texas Flag Brushed Stainless Red Blue Acrylic Patch Hat Navy Performance Rope',
                'design_id' => null,
                'design_name' => null,
                'hat_id' => null,
                'hat_manufacturer' => null,
                'hat_model' => null,
                'hat_color' => null,
                'material_id' => null,
                'material_name' => null,
                'material_color' => null,
            ],
        ];

        public int $updateCalls = 0;

        public function listFinishedHats(): array
        {
            return $this->records;
        }

        public function listFinishedHatSelectionOptions(): array
        {
            return [
                'designs' => [
                    ['id' => '123e4567-e89b-42d3-a456-426614174711', 'design_name' => 'Manual Coastal Design'],
                    ['id' => '123e4567-e89b-42d3-a456-426614174712', 'design_name' => 'Texas Flag'],
                ],
                'hats' => [
                    ['id' => '123e4567-e89b-42d3-a456-426614174721', 'manufacturer' => 'Richardson', 'model' => '112', 'color' => 'Navy / Charcoal'],
                ],
                'materials' => [
                    ['id' => '123e4567-e89b-42d3-a456-426614174731', 'material_name' => 'Brushed Stainless Red Blue Acrylic 12x24', 'material_type' => 'Acrylic', 'color' => 'Brushed / Stainless / Red / Blue'],
                ],
            ];
        }

        public function updateFinishedHat(string $id, array $input): array
        {
            $this->updateCalls++;
            foreach ($this->records as &$record) {
                if ((string) $record['id'] !== $id) {
                    continue;
                }
                foreach ($input as $key => $value) {
                    $record[$key] = $value;
                }
                if (($input['hat_id'] ?? null) !== null) {
                    $record['hat_manufacturer'] = 'Richardson';
                    $record['hat_model'] = '112';
                    $record['hat_color'] = 'Navy / Charcoal';
                }
                if (($input['material_id'] ?? null) !== null) {
                    $record['material_name'] = 'Brushed Stainless Red Blue Acrylic 12x24';
                    $record['material_color'] = 'Brushed / Stainless / Red / Blue';
                }
                return $record;
            }
            return [];
        }
    };

    $linker = new \Forge\Server\StaffFinishedHatCatalogAssistedLinker($repository);
    $dryRun = $linker->link(true);
    $apply = $linker->link(false);
    $rerun = $linker->link(true);

    assertSame(0, $dryRun['updated_records']);
    assertSame(2, $apply['updated_records']);
    assertSame(2, $repository->updateCalls);
    assertSame('123e4567-e89b-42d3-a456-426614174711', $repository->records[0]['design_id']);
    assertSame('123e4567-e89b-42d3-a456-426614174721', $repository->records[0]['hat_id']);
    assertSame('123e4567-e89b-42d3-a456-426614174731', $repository->records[1]['material_id']);
    assertSame(0, $rerun['design_links_proposed']);
    assertSame(0, $rerun['hat_links_proposed']);
    assertSame(0, $rerun['material_links_proposed']);
});

$runner->run('finished hat assisted linker hard-stops against non-local databases', static function (): void {
    $toolSource = file_get_contents(dirname(__DIR__, 2) . '/server/tools/assist-link-finished-hats.php');

    assertTrue(is_string($toolSource));
    assertTrue(strpos($toolSource, 'forge_local_dev') !== false);
    assertTrue(strpos($toolSource, 'This utility may run only against the local forge_local_dev database.') !== false);
});

$runner->run('finished hat catalog endpoints require staff authentication enforce approved image upload constraints and stay isolated from order tables', static function (): void {
    $listEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/finished-hats.php');
    $singleEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/finished-hat.php');
    $photoEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/finished-hat-photo.php');
    $sharedEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/catalog/_shared.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-finished-hat-catalog-repository.php');

    assertTrue(is_string($listEndpointSource));
    assertTrue(is_string($singleEndpointSource));
    assertTrue(is_string($photoEndpointSource));
    assertTrue(is_string($sharedEndpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(strpos($listEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($singleEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($photoEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($photoEndpointSource, 'FILEINFO_MIME_TYPE') !== false);
    assertTrue(strpos($photoEndpointSource, '@getimagesize') !== false);
    assertTrue(strpos($photoEndpointSource, "'image/png'") !== false);
    assertTrue(strpos($photoEndpointSource, "'image/jpeg'") !== false);
    assertTrue(strpos($photoEndpointSource, "'image/webp'") !== false);
    assertTrue(strpos($photoEndpointSource, 'FORGE_FINISHED_HAT_CATALOG_MAX_UPLOAD_BYTES = 5242880') !== false);
    assertTrue(strpos($sharedEndpointSource, "function forge_finished_hat_catalog_resolve_absolute_photo_path(?string \$photoPath): ?string") !== false);
    assertTrue(strpos($repositorySource, 'forge_catalog_finished_hats') !== false);
    assertTrue(strpos($repositorySource, 'forge_orders') === false);
});

$runner->run('internal note migration and endpoint stay staff-only and public endpoints exclude private note fields', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__) . '/migrations/011_add_internal_order_notes.sql');
    $staffEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/internal-note.php');
    $staffOrdersEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/orders.php');
    $publicOrdersEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/orders.php');
    $publicEventStatusEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/event-status.php');

    assertTrue(is_string($migrationSource));
    assertTrue(is_string($staffEndpointSource));
    assertTrue(is_string($staffOrdersEndpointSource));
    assertTrue(is_string($publicOrdersEndpointSource));
    assertTrue(is_string($publicEventStatusEndpointSource));
    assertTrue(strpos($migrationSource, 'ALTER TABLE forge_orders ADD COLUMN internal_note TEXT NULL') !== false);
    assertTrue(strpos($staffEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($staffEndpointSource, 'updateInternalNote') !== false);
    assertTrue(strpos($staffOrdersEndpointSource, 'internal_note') === false);
    assertTrue(strpos($publicOrdersEndpointSource, 'internal_note') === false);
    assertTrue(strpos($publicEventStatusEndpointSource, 'internal_note') === false);
    assertTrue(strpos($publicEventStatusEndpointSource, "require_once __DIR__ . '/orders.php';") === false);
    assertTrue(strpos($publicEventStatusEndpointSource, "require_once __DIR__ . '/_bootstrap.php';") !== false);
});

$runner->run('legacy cleanup migration endpoint and tombstones stay staff-only and cutoff-safe', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__) . '/migrations/012_add_legacy_cleanup_tombstones.sql');
    $endpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/legacy-test-cleanup.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-order-repository.php');
    $orderRepositorySource = file_get_contents(dirname(__DIR__) . '/lib/order-repository.php');

    assertTrue(is_string($migrationSource));
    assertTrue(is_string($endpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(is_string($orderRepositorySource));
    assertTrue(strpos($migrationSource, 'CREATE TABLE IF NOT EXISTS forge_order_cleanup_tombstones') !== false);
    assertTrue(strpos($endpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($endpointSource, "if (\$method === 'GET')") !== false);
    assertTrue(strpos($endpointSource, "'preview' => \$repository->previewLegacyTestCleanup(),") !== false);
    assertTrue(strpos($endpointSource, 'ApiResponse::send(') !== false);
    assertTrue(strpos($endpointSource, 'previewLegacyTestCleanup') !== false);
    assertTrue(strpos($endpointSource, 'applyLegacyTestCleanup') !== false);
    assertTrue(strpos($repositorySource, 'America/Chicago') !== false);
    assertTrue(strpos($repositorySource, 'DELETE %d ORDERS BEFORE JULY 25') !== false);
    assertTrue(strpos($repositorySource, '$comparison = $eligible ? \'<\' : \'>=\';') !== false);
    assertTrue(strpos($repositorySource, ':cutoff_submitted_at') !== false);
    assertTrue(strpos($repositorySource, "__NAMESPACE__ . '\\\\normalizeLegacyTestCleanupPreviewRow'") !== false);
    assertTrue(strpos($orderRepositorySource, 'forge_order_cleanup_tombstones') !== false);
    assertTrue(strpos($orderRepositorySource, 'hasCleanupTombstone') !== false);
});

$runner->run('customer email foundation sources stay private use composer dependencies and keep outbound message storage reusable', static function (): void {
    $composerSource = file_get_contents(dirname(__DIR__, 2) . '/composer.json');
    $bootstrapSource = file_get_contents(dirname(__DIR__) . '/bootstrap.php');
    $buildScriptSource = file_get_contents(dirname(__DIR__, 2) . '/scripts/build-deployment-package.sh');
    $verifyScriptSource = file_get_contents(dirname(__DIR__, 2) . '/scripts/verify-deployment-package.sh');
    $migrationSource = file_get_contents(dirname(__DIR__) . '/migrations/014_create_forge_outbound_messages.sql');
    $ordersEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/orders.php');

    assertTrue(is_string($composerSource));
    assertTrue(is_string($bootstrapSource));
    assertTrue(is_string($buildScriptSource));
    assertTrue(is_string($verifyScriptSource));
    assertTrue(is_string($migrationSource));
    assertTrue(is_string($ordersEndpointSource));
    assertTrue(strpos($composerSource, '"phpmailer/phpmailer"') !== false);
    assertTrue(strpos($bootstrapSource, "require_once __DIR__ . '/lib/email-service.php';") !== false);
    assertTrue(strpos($bootstrapSource, "if (is_file(__DIR__ . '/vendor/autoload.php'))") !== false);
    assertTrue(strpos($buildScriptSource, 'COMPOSER_VENDOR_DIR="${PRIVATE_STAGE}/vendor"') !== false);
    assertTrue(strpos($verifyScriptSource, 'private/forge_server/vendor/phpmailer/phpmailer/src/PHPMailer.php') !== false);
    assertTrue(strpos($migrationSource, 'CREATE TABLE IF NOT EXISTS forge_outbound_messages') !== false);
    assertTrue(strpos($migrationSource, 'UNIQUE KEY ux_forge_outbound_messages_idempotency_key') !== false);
    assertTrue(strpos($ordersEndpointSource, "require_once __DIR__ . '/_bootstrap.php';") !== false);
    assertTrue(strpos($ordersEndpointSource, 'PHPMailer') === false);
});

$runner->run('order cancellation and Test Session deletion stay staff-only and use the dedicated migration safely', static function (): void {
    $migrationSource = file_get_contents(dirname(__DIR__) . '/migrations/013_add_cancelled_at_to_forge_orders.sql');
    $cancelEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/cancel-order.php');
    $deleteEndpointSource = file_get_contents(dirname(__DIR__, 2) . '/public/api/v1/staff/delete-test-order.php');
    $repositorySource = file_get_contents(dirname(__DIR__) . '/lib/staff-order-repository.php');
    $orderRepositorySource = file_get_contents(dirname(__DIR__) . '/lib/order-repository.php');

    assertTrue(is_string($migrationSource));
    assertTrue(is_string($cancelEndpointSource));
    assertTrue(is_string($deleteEndpointSource));
    assertTrue(is_string($repositorySource));
    assertTrue(is_string($orderRepositorySource));
    assertTrue(strpos($migrationSource, 'ADD COLUMN cancelled_at') !== false);
    assertTrue(strpos($cancelEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($deleteEndpointSource, 'requireAuthenticatedStaffSession') !== false);
    assertTrue(strpos($cancelEndpointSource, 'cancelOrder') !== false);
    assertTrue(strpos($deleteEndpointSource, 'deleteTestOrder') !== false);
    assertTrue(strpos($repositorySource, 'DELETE TEST ORDER') !== false);
    assertTrue(strpos($repositorySource, 'Test Session orders must be deleted with Delete Test Order.') !== false);
    assertTrue(strpos($repositorySource, 'Only Test Session orders can be permanently deleted.') !== false);
    assertTrue(strpos($orderRepositorySource, 'forge_order_cleanup_tombstones') !== false);
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

function createFinishedHatCatalogTestPdo(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE forge_catalog_designs (
            id TEXT PRIMARY KEY,
            design_name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_catalog_hats (
            id TEXT PRIMARY KEY,
            hat_name TEXT NOT NULL,
            manufacturer TEXT DEFAULT NULL,
            model TEXT DEFAULT NULL,
            color TEXT DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_catalog_materials (
            id TEXT PRIMARY KEY,
            material_name TEXT NOT NULL,
            material_type TEXT DEFAULT NULL,
            color TEXT DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_catalog_finished_hats (
            id TEXT PRIMARY KEY,
            finished_hat_name TEXT NOT NULL,
            photo_path TEXT DEFAULT NULL,
            image_width INTEGER DEFAULT NULL,
            image_height INTEGER DEFAULT NULL,
            design_id TEXT DEFAULT NULL,
            hat_id TEXT DEFAULT NULL,
            material_id TEXT DEFAULT NULL,
            patch_shape TEXT DEFAULT NULL,
            patch_size TEXT DEFAULT NULL,
            placement_status TEXT NOT NULL DEFAULT "unassigned",
            location_label TEXT DEFAULT NULL,
            retail_price TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT "review",
            notes TEXT DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );
    return $pdo;
}

function createDesignCatalogTestPdo(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE forge_catalog_designs (
            id TEXT PRIMARY KEY,
            design_name TEXT NOT NULL,
            thumbnail_path TEXT DEFAULT NULL,
            category TEXT NOT NULL,
            store_fit TEXT NOT NULL,
            status TEXT NOT NULL,
            production_method TEXT NOT NULL,
            production_file_location TEXT DEFAULT NULL,
            made_on_hat TEXT NOT NULL,
            notes TEXT DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_catalog_finished_hats (
            id TEXT PRIMARY KEY,
            finished_hat_name TEXT NOT NULL,
            design_id TEXT DEFAULT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );

    return $pdo;
}

function createHatCatalogTestPdo(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE forge_catalog_hats (
            id TEXT PRIMARY KEY,
            hat_name TEXT NOT NULL,
            photo_path TEXT DEFAULT NULL,
            manufacturer TEXT DEFAULT NULL,
            model TEXT DEFAULT NULL,
            color TEXT DEFAULT NULL,
            vendor TEXT DEFAULT NULL,
            base_cost TEXT DEFAULT NULL,
            status TEXT NOT NULL,
            notes TEXT DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );

    return $pdo;
}

function createMaterialCatalogTestPdo(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE forge_catalog_materials (
            id TEXT PRIMARY KEY,
            material_name TEXT NOT NULL,
            swatch_path TEXT DEFAULT NULL,
            material_type TEXT DEFAULT NULL,
            color TEXT DEFAULT NULL,
            supplier TEXT DEFAULT NULL,
            production_method TEXT DEFAULT NULL,
            purchase_cost TEXT DEFAULT NULL,
            purchase_quantity INTEGER DEFAULT NULL,
            cost_basis TEXT DEFAULT NULL,
            status TEXT NOT NULL,
            notes TEXT DEFAULT NULL,
            image_width INTEGER DEFAULT NULL,
            image_height INTEGER DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );

    return $pdo;
}

function createOutboundMessageTestPdo(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec(
        'CREATE TABLE forge_outbound_messages (
            message_id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_uuid TEXT NOT NULL,
            message_type TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            status TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_attempt_at TEXT DEFAULT NULL,
            sent_at TEXT DEFAULT NULL,
            last_error_safe TEXT DEFAULT NULL,
            idempotency_key TEXT NOT NULL UNIQUE,
            render_context_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );

    return $pdo;
}

function seedFinishedHatCatalogLinkTables(PDO $pdo): void
{
    $pdo->exec("INSERT INTO forge_catalog_designs (id, design_name) VALUES ('123e4567-e89b-42d3-a456-426614174101', 'Texas Flag')");
    $pdo->exec("INSERT INTO forge_catalog_hats (id, hat_name, manufacturer, model, color) VALUES ('123e4567-e89b-42d3-a456-426614174201', 'Richardson 112 Navy Charcoal', 'Richardson', '112', 'Navy / Charcoal')");
    $pdo->exec("INSERT INTO forge_catalog_materials (id, material_name, material_type, color) VALUES ('123e4567-e89b-42d3-a456-426614174301', 'Rawhide Black Durra Bull Premium Leatherette Sheets', 'Leatherette', 'Rawhide / Black')");
}

function createTempImportPreviewFile(string $fileName, string $contents): string
{
    $directory = createTempImportDirectory();
    $filePath = $directory . '/' . $fileName;
    file_put_contents($filePath, $contents);
    return $filePath;
}

function createPngFixture(string $filePath, int $width, int $height): void
{
    $signature = "\x89PNG\x0D\x0A\x1A\x0A";
    $ihdrData = pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0);
    $ihdrChunk = pack('N', strlen($ihdrData)) . 'IHDR' . $ihdrData . pack('N', crc32('IHDR' . $ihdrData));
    $iendChunk = pack('N', 0) . 'IEND' . pack('N', crc32('IEND'));

    file_put_contents($filePath, $signature . $ihdrChunk . $iendChunk);
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

final class SqliteStaffOrderTestPdo extends PDO
{
    #[\ReturnTypeWillChange]
    public function prepare($query, $options = [])
    {
        $normalized = str_replace(' FOR UPDATE', '', (string) $query);
        $normalized = str_replace(
            'ON DUPLICATE KEY UPDATE tray_number = tray_number',
            'ON CONFLICT(tray_number) DO NOTHING',
            $normalized
        );

        return parent::prepare($normalized, is_array($options) ? $options : []);
    }
}

function createStaffOrderRepositoryTestPdo(bool $includeCleanupTombstones = true): PDO
{
    $pdo = new SqliteStaffOrderTestPdo('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $pdo->exec(
        'CREATE TABLE forge_orders (
            forge_order_uuid TEXT PRIMARY KEY,
            forge_order_number INTEGER DEFAULT NULL,
            record_version TEXT NOT NULL,
            source TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            received_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            device_id TEXT DEFAULT NULL,
            event_id TEXT DEFAULT NULL,
            internal_note TEXT DEFAULT NULL,
            payload_json TEXT NOT NULL,
            payload_sha256 TEXT NOT NULL,
            production_status TEXT NOT NULL,
            current_tray_number INTEGER DEFAULT NULL,
            ready_to_pack_at TEXT DEFAULT NULL,
            cancelled_at TEXT DEFAULT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_production_trays (
            tray_number INTEGER PRIMARY KEY,
            tray_status TEXT NOT NULL,
            current_order_uuid TEXT DEFAULT NULL,
            assigned_at TEXT DEFAULT NULL,
            updated_at TEXT NOT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_tray_assignment_history (
            tray_assignment_id TEXT PRIMARY KEY,
            tray_number INTEGER NOT NULL,
            forge_order_uuid TEXT NOT NULL,
            assigned_at TEXT NOT NULL,
            released_at TEXT DEFAULT NULL,
            release_reason TEXT DEFAULT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_order_item_production (
            forge_order_uuid TEXT NOT NULL,
            line_id TEXT NOT NULL,
            required_quantity INTEGER NOT NULL,
            completed_quantity INTEGER NOT NULL,
            production_status TEXT NOT NULL,
            completed_at TEXT DEFAULT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (forge_order_uuid, line_id)
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_events (
            event_id TEXT PRIMARY KEY,
            public_order_token TEXT DEFAULT NULL,
            event_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            event_location TEXT DEFAULT NULL,
            event_status TEXT NOT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE forge_outbound_messages (
            message_id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_uuid TEXT NOT NULL,
            message_type TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            status TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_attempt_at TEXT DEFAULT NULL,
            sent_at TEXT DEFAULT NULL,
            last_error_safe TEXT DEFAULT NULL,
            idempotency_key TEXT NOT NULL UNIQUE,
            render_context_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );

    if ($includeCleanupTombstones) {
        $pdo->exec(
            'CREATE TABLE forge_order_cleanup_tombstones (
                forge_order_uuid TEXT PRIMARY KEY,
                deleted_at TEXT NOT NULL
            )'
        );
    }

    return $pdo;
}

function seedStaffOrderRepositoryTestEvent(PDO $pdo, array $options = []): void
{
    $insertEvent = $pdo->prepare(
        'INSERT INTO forge_events (
            event_id,
            public_order_token,
            event_name,
            event_type,
            start_date,
            end_date,
            event_location,
            event_status
         ) VALUES (
            :event_id,
            :public_order_token,
            :event_name,
            :event_type,
            :start_date,
            :end_date,
            :event_location,
            :event_status
         )'
    );
    $insertEvent->execute([
        ':event_id' => (string) ($options['event_id'] ?? 'event-test'),
        ':public_order_token' => (string) ($options['public_order_token'] ?? 'token-test'),
        ':event_name' => (string) ($options['event_name'] ?? 'Event'),
        ':event_type' => (string) ($options['event_type'] ?? 'live_event'),
        ':start_date' => (string) ($options['start_date'] ?? '2026-07-27'),
        ':end_date' => (string) ($options['end_date'] ?? '2026-07-27'),
        ':event_location' => $options['event_location'] ?? 'Austin',
        ':event_status' => (string) ($options['event_status'] ?? 'scheduled'),
    ]);
}

function seedStaffOrderRepositoryTestOrder(PDO $pdo, array $options = []): void
{
    $forgeOrderUuid = (string) ($options['forge_order_uuid'] ?? '123e4567-e89b-42d3-a456-426614174599');
    $forgeOrderNumber = $options['forge_order_number'] ?? 1042;
    $productionStatus = (string) ($options['production_status'] ?? 'submitted');
    $currentTrayNumber = $options['current_tray_number'] ?? null;
    $internalNote = $options['internal_note'] ?? null;
    $cancelledAt = $options['cancelled_at'] ?? null;
    $payload = $options['payload'] ?? createValidPayload([
        'forge_order_uuid' => $forgeOrderUuid,
        'forge_order_number' => $forgeOrderNumber,
    ]);
    $payloadJson = json_encode($payload, JSON_THROW_ON_ERROR);
    $payloadSha = hash('sha256', $payloadJson);
    $submittedAt = (string) ($options['submitted_at'] ?? '2026-07-24 19:00:00.000000');
    $receivedAt = (string) ($options['received_at'] ?? '2026-07-24 19:01:00.000000');
    $updatedAt = (string) ($options['updated_at'] ?? '2026-07-24 19:02:00.000000');
    $eventId = is_array($payload['event'] ?? null) ? (string) (($payload['event']['event_id'] ?? '') ?: '') : null;

    $insertOrder = $pdo->prepare(
        'INSERT INTO forge_orders (
            forge_order_uuid,
            forge_order_number,
            record_version,
            source,
            submitted_at,
            received_at,
            updated_at,
            device_id,
            event_id,
            internal_note,
            payload_json,
            payload_sha256,
            production_status,
            current_tray_number,
            ready_to_pack_at,
            cancelled_at
         ) VALUES (
            :forge_order_uuid,
            :forge_order_number,
            :record_version,
            :source,
            :submitted_at,
            :received_at,
            :updated_at,
            :device_id,
            :event_id,
            :internal_note,
            :payload_json,
            :payload_sha256,
            :production_status,
            :current_tray_number,
            :ready_to_pack_at,
            :cancelled_at
         )'
    );
    $insertOrder->execute([
        ':forge_order_uuid' => $forgeOrderUuid,
        ':forge_order_number' => $forgeOrderNumber,
        ':record_version' => '1.0',
        ':source' => 'customer_kiosk',
        ':submitted_at' => $submittedAt,
        ':received_at' => $receivedAt,
        ':updated_at' => $updatedAt,
        ':device_id' => 'ipad-1',
        ':event_id' => $eventId,
        ':internal_note' => $internalNote,
        ':payload_json' => $payloadJson,
        ':payload_sha256' => $payloadSha,
        ':production_status' => $productionStatus,
        ':current_tray_number' => $currentTrayNumber,
        ':ready_to_pack_at' => $options['ready_to_pack_at'] ?? null,
        ':cancelled_at' => $cancelledAt,
    ]);

    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $insertItem = $pdo->prepare(
        'INSERT INTO forge_order_item_production (
            forge_order_uuid,
            line_id,
            required_quantity,
            completed_quantity,
            production_status,
            completed_at,
            updated_at
         ) VALUES (
            :forge_order_uuid,
            :line_id,
            :required_quantity,
            :completed_quantity,
            :production_status,
            :completed_at,
            :updated_at
         )'
    );

    foreach ($items as $item) {
        $lineId = trim((string) ($item['line_id'] ?? ''));
        if ($lineId === '') {
            continue;
        }

        $insertItem->execute([
            ':forge_order_uuid' => $forgeOrderUuid,
            ':line_id' => $lineId,
            ':required_quantity' => (int) ($item['quantity'] ?? 1),
            ':completed_quantity' => (int) ($item['completed_quantity'] ?? 0),
            ':production_status' => (string) ($item['production_status'] ?? 'pending'),
            ':completed_at' => $item['completed_at'] ?? null,
            ':updated_at' => $updatedAt,
        ]);
    }

    if ($currentTrayNumber !== null) {
        $trayTimestamp = (string) ($options['tray_updated_at'] ?? $updatedAt);
        $insertTray = $pdo->prepare(
            'INSERT INTO forge_production_trays (
                tray_number,
                tray_status,
                current_order_uuid,
                assigned_at,
                updated_at
             ) VALUES (
                :tray_number,
                :tray_status,
                :current_order_uuid,
                :assigned_at,
                :updated_at
             )'
        );
        $insertTray->execute([
            ':tray_number' => (int) $currentTrayNumber,
            ':tray_status' => 'assigned',
            ':current_order_uuid' => $forgeOrderUuid,
            ':assigned_at' => $trayTimestamp,
            ':updated_at' => $trayTimestamp,
        ]);

        $insertHistory = $pdo->prepare(
            'INSERT INTO forge_tray_assignment_history (
                tray_assignment_id,
                tray_number,
                forge_order_uuid,
                assigned_at,
                released_at,
                release_reason
             ) VALUES (
                :tray_assignment_id,
                :tray_number,
                :forge_order_uuid,
                :assigned_at,
                NULL,
                NULL
             )'
        );
        $insertHistory->execute([
            ':tray_assignment_id' => $options['tray_assignment_id'] ?? ($forgeOrderUuid . '-assignment'),
            ':tray_number' => (int) $currentTrayNumber,
            ':forge_order_uuid' => $forgeOrderUuid,
            ':assigned_at' => $trayTimestamp,
        ]);
    }
}

function seedOutboundMessage(PDO $pdo, array $options = []): void
{
    $messageId = (string) ($options['message_id'] ?? 'msg-1');
    $entityUuid = (string) ($options['entity_uuid'] ?? '123e4567-e89b-42d3-a456-426614174599');
    $status = (string) ($options['status'] ?? \Forge\Server\OutboundMessageStatus::PENDING);
    $renderContext = $options['render_context'] ?? [
        'order' => createValidPayload([
            'forge_order_uuid' => $entityUuid,
            'forge_order_number' => 1042,
        ]),
    ];

    $statement = $pdo->prepare(
        'INSERT INTO forge_outbound_messages (
            message_id,
            entity_type,
            entity_uuid,
            message_type,
            recipient_email,
            status,
            attempt_count,
            last_attempt_at,
            sent_at,
            last_error_safe,
            idempotency_key,
            render_context_json,
            created_at,
            updated_at
        ) VALUES (
            :message_id,
            :entity_type,
            :entity_uuid,
            :message_type,
            :recipient_email,
            :status,
            :attempt_count,
            :last_attempt_at,
            :sent_at,
            :last_error_safe,
            :idempotency_key,
            :render_context_json,
            :created_at,
            :updated_at
        )'
    );
    $statement->execute([
        ':message_id' => $messageId,
        ':entity_type' => (string) ($options['entity_type'] ?? \Forge\Server\OutboundMessageEntityType::FORGE_ORDER),
        ':entity_uuid' => $entityUuid,
        ':message_type' => (string) ($options['message_type'] ?? \Forge\Server\OutboundMessageType::ORDER_CONFIRMATION),
        ':recipient_email' => (string) ($options['recipient_email'] ?? 'customer@example.com'),
        ':status' => $status,
        ':attempt_count' => (int) ($options['attempt_count'] ?? 0),
        ':last_attempt_at' => $options['last_attempt_at'] ?? null,
        ':sent_at' => $options['sent_at'] ?? null,
        ':last_error_safe' => $options['last_error_safe'] ?? null,
        ':idempotency_key' => (string) ($options['idempotency_key'] ?? \Forge\Server\buildOrderConfirmationIdempotencyKey($entityUuid)),
        ':render_context_json' => json_encode($renderContext, JSON_THROW_ON_ERROR),
        ':created_at' => (string) ($options['created_at'] ?? '2026-07-28 12:00:00.000000'),
        ':updated_at' => (string) ($options['updated_at'] ?? '2026-07-28 12:00:00.000000'),
    ]);
}

$runner->finish();
