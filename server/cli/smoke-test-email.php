<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/lib/email-smoke-test.php';

$result = \Forge\Server\runEmailSmokeTest(
    $argv ?? [],
    \Forge\Server\buildEmailTransportFromEnvironment(),
    \Forge\Server\loadPrivateEmailConfig()
);

fwrite($result['exit_code'] === 0 ? STDOUT : STDERR, $result['output'] . PHP_EOL);
exit($result['exit_code']);
