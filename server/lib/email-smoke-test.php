<?php
declare(strict_types=1);

namespace Forge\Server;

/**
 * @param array<int, string> $argv
 * @param array<string, mixed> $emailConfig
 * @return array{exit_code: int, output: string}
 */
function runEmailSmokeTest(array $argv, EmailTransportInterface $transport, array $emailConfig, string $sapi = PHP_SAPI): array
{
    if (strtolower(trim($sapi)) !== 'cli') {
        return [
            'exit_code' => 1,
            'output' => 'This command may only run from PHP CLI.',
        ];
    }

    $recipient = parseEmailSmokeTestRecipient($argv);
    if ($recipient === null) {
        return [
            'exit_code' => 1,
            'output' => 'Usage: php server/cli/smoke-test-email.php --to test-recipient@example.com',
        ];
    }

    try {
        $normalizedConfig = normalizePrivateEmailConfig($emailConfig);
        $replyToAddress = $normalizedConfig['FORGE_EMAIL_REPLY_TO'] ?? $normalizedConfig['FORGE_EMAIL_FROM_ADDRESS'];
        $message = new EmailMessage(
            $recipient,
            'Forge SMTP smoke test',
            '<p>This is a private Forge SMTP smoke test.</p>',
            'This is a private Forge SMTP smoke test.',
            $normalizedConfig['FORGE_EMAIL_FROM_ADDRESS'],
            $normalizedConfig['FORGE_EMAIL_FROM_NAME'],
            is_string($replyToAddress) && trim($replyToAddress) !== '' ? trim($replyToAddress) : null
        );
        $transport->send($message);
    } catch (EmailConfigurationException | EmailDeliveryException $exception) {
        return [
            'exit_code' => 1,
            'output' => 'SMTP smoke test failed: ' . sanitizeOutboundMessageError($exception->getMessage()),
        ];
    }

    return [
        'exit_code' => 0,
        'output' => 'SMTP smoke test sent successfully.',
    ];
}

/**
 * @param array<int, string> $argv
 */
function parseEmailSmokeTestRecipient(array $argv): ?string
{
    $argc = count($argv);
    for ($index = 1; $index < $argc; $index += 1) {
        $argument = trim((string) ($argv[$index] ?? ''));
        if ($argument === '--to' && isset($argv[$index + 1])) {
            $candidate = trim((string) $argv[$index + 1]);
            return filter_var($candidate, FILTER_VALIDATE_EMAIL) ? $candidate : null;
        }

        if (strpos($argument, '--to=') === 0) {
            $candidate = trim(substr($argument, 5));
            return filter_var($candidate, FILTER_VALIDATE_EMAIL) ? $candidate : null;
        }
    }

    return null;
}
