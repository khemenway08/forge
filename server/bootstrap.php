<?php
declare(strict_types=1);

namespace Forge\Server;

require_once __DIR__ . '/lib/api-response.php';
require_once __DIR__ . '/lib/order-handler.php';
require_once __DIR__ . '/lib/order-payload.php';
require_once __DIR__ . '/lib/database.php';
require_once __DIR__ . '/lib/order-repository.php';

function buildOrderHandlerFromEnvironment(): OrderHandler
{
    $pdo = DatabaseConnectionFactory::createFromEnvironment();
    $repository = new PdoOrderRepository($pdo);

    return new OrderHandler($repository);
}
