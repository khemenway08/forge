<?php
declare(strict_types=1);

namespace Forge\Server;

final class EmailConfigurationException extends \RuntimeException
{
}

final class EmailDeliveryException extends \RuntimeException
{
}

final class EmailMessage
{
    public string $toAddress;
    public string $subject;
    public string $htmlBody;
    public string $textBody;
    public string $fromAddress;
    public string $fromName;
    public ?string $replyToAddress;

    public function __construct(
        string $toAddress,
        string $subject,
        string $htmlBody,
        string $textBody,
        string $fromAddress,
        string $fromName,
        ?string $replyToAddress
    )
    {
        $this->toAddress = $toAddress;
        $this->subject = $subject;
        $this->htmlBody = $htmlBody;
        $this->textBody = $textBody;
        $this->fromAddress = $fromAddress;
        $this->fromName = $fromName;
        $this->replyToAddress = $replyToAddress;
    }
}

interface EmailTransportInterface
{
    public function send(EmailMessage $message): void;
}

final class RecordingEmailTransport implements EmailTransportInterface
{
    /** @var array<int, EmailMessage> */
    private array $messages = [];
    private ?\Throwable $nextFailure = null;

    public function send(EmailMessage $message): void
    {
        if ($this->nextFailure !== null) {
            $failure = $this->nextFailure;
            $this->nextFailure = null;
            throw $failure;
        }

        $this->messages[] = $message;
    }

    /** @return array<int, EmailMessage> */
    public function messages(): array
    {
        return $this->messages;
    }

    public function failOnce(\Throwable $failure): void
    {
        $this->nextFailure = $failure;
    }
}

final class NullEmailTransport implements EmailTransportInterface
{
    public function send(EmailMessage $message): void
    {
        unset($message);
    }
}

final class PhpMailerSmtpEmailTransport implements EmailTransportInterface
{
    /** @var array<string, mixed> */
    private array $config;
    /** @var callable|null */
    private $mailerFactory;

    /**
     * @param array<string, mixed> $config
     */
    public function __construct(array $config, ?callable $mailerFactory = null)
    {
        $this->config = normalizePrivateEmailConfig($config);
        $this->mailerFactory = $mailerFactory;
    }

    public function send(EmailMessage $message): void
    {
        if (!class_exists('\\PHPMailer\\PHPMailer\\PHPMailer')) {
            throw new EmailConfigurationException('SMTP mailer dependency is not installed.');
        }

        $mailer = $this->createMailer();

        try {
            configurePhpMailerSmtpTransport($mailer, $this->config, $message);
            $mailer->send();
        } catch (\PHPMailer\PHPMailer\Exception $exception) {
            throw new EmailDeliveryException(sanitizePhpMailerError($exception->getMessage()), 0, $exception);
        }
    }

    private function createMailer()
    {
        if (is_callable($this->mailerFactory)) {
            return ($this->mailerFactory)();
        }

        return new \PHPMailer\PHPMailer\PHPMailer(true);
    }
}

/**
 * @param array<string, mixed> $config
 * @return array{
 *   FORGE_EMAIL_ENABLED: bool,
 *   FORGE_EMAIL_TRANSPORT: string,
 *   FORGE_EMAIL_HOST: string,
 *   FORGE_EMAIL_PORT: int,
 *   FORGE_EMAIL_ENCRYPTION: string,
 *   FORGE_EMAIL_USERNAME: string,
 *   FORGE_EMAIL_PASSWORD: string,
 *   FORGE_EMAIL_FROM_ADDRESS: string,
 *   FORGE_EMAIL_FROM_NAME: string,
 *   FORGE_EMAIL_REPLY_TO: ?string,
 *   FORGE_EMAIL_CONNECT_TIMEOUT: int,
 *   FORGE_EMAIL_SEND_TIMEOUT: int
 * }
 */
function normalizePrivateEmailConfig(array $config): array
{
    $emailEnabled = normalizePrivateEmailEnabledFlag($config['FORGE_EMAIL_ENABLED'] ?? null);
    $transport = strtolower(trim((string) ($config['FORGE_EMAIL_TRANSPORT'] ?? 'smtp')));
    if (!in_array($transport, ['smtp'], true)) {
        throw new EmailConfigurationException('Email transport is not configured.');
    }

    $host = trim((string) ($config['FORGE_EMAIL_HOST'] ?? ''));
    $username = trim((string) ($config['FORGE_EMAIL_USERNAME'] ?? ''));
    $password = trim((string) ($config['FORGE_EMAIL_PASSWORD'] ?? ''));
    $fromAddress = trim((string) ($config['FORGE_EMAIL_FROM_ADDRESS'] ?? ''));
    $fromName = trim((string) ($config['FORGE_EMAIL_FROM_NAME'] ?? ''));
    $replyTo = normalizeNullableString($config['FORGE_EMAIL_REPLY_TO'] ?? null);
    $encryption = strtolower(trim((string) ($config['FORGE_EMAIL_ENCRYPTION'] ?? 'tls')));
    $port = (int) ($config['FORGE_EMAIL_PORT'] ?? 0);
    $connectTimeout = (int) ($config['FORGE_EMAIL_CONNECT_TIMEOUT'] ?? 10);
    $sendTimeout = (int) ($config['FORGE_EMAIL_SEND_TIMEOUT'] ?? 20);

    if (
        $host === ''
        || $username === ''
        || $password === ''
        || $fromAddress === ''
        || $fromName === ''
        || $port <= 0
        || !in_array($encryption, ['ssl', 'tls'], true)
    ) {
        throw new EmailConfigurationException('Email transport is not configured.');
    }

    return [
        'FORGE_EMAIL_ENABLED' => $emailEnabled,
        'FORGE_EMAIL_TRANSPORT' => $transport,
        'FORGE_EMAIL_HOST' => $host,
        'FORGE_EMAIL_PORT' => $port,
        'FORGE_EMAIL_ENCRYPTION' => $encryption,
        'FORGE_EMAIL_USERNAME' => $username,
        'FORGE_EMAIL_PASSWORD' => $password,
        'FORGE_EMAIL_FROM_ADDRESS' => $fromAddress,
        'FORGE_EMAIL_FROM_NAME' => $fromName,
        'FORGE_EMAIL_REPLY_TO' => $replyTo,
        'FORGE_EMAIL_CONNECT_TIMEOUT' => max(1, $connectTimeout),
        'FORGE_EMAIL_SEND_TIMEOUT' => max(1, $sendTimeout),
    ];
}

/**
 * @param mixed $value
 */
function normalizePrivateEmailEnabledFlag($value): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_int($value)) {
        return $value !== 0;
    }

    if (!is_string($value)) {
        return false;
    }

    $normalized = strtolower(trim($value));
    if ($normalized === '') {
        return false;
    }

    return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
}

function buildEmailTransportFromEnvironment(): EmailTransportInterface
{
    return new PhpMailerSmtpEmailTransport(loadPrivateEmailConfig());
}

/**
 * @param object $mailer
 * @param array<string, mixed> $config
 */
function configurePhpMailerSmtpTransport($mailer, array $config, EmailMessage $message): void
{
    $mailer->isSMTP();
    $mailer->Host = $config['FORGE_EMAIL_HOST'];
    $mailer->Port = $config['FORGE_EMAIL_PORT'];
    $mailer->SMTPAuth = true;
    $mailer->Username = $config['FORGE_EMAIL_USERNAME'];
    $mailer->Password = $config['FORGE_EMAIL_PASSWORD'];
    $mailer->Timeout = $config['FORGE_EMAIL_CONNECT_TIMEOUT'];
    $smtpInstance = $mailer->getSMTPInstance();
    if (is_object($smtpInstance) && property_exists($smtpInstance, 'Timelimit')) {
        $smtpInstance->Timelimit = $config['FORGE_EMAIL_SEND_TIMEOUT'];
    }
    $mailer->CharSet = 'UTF-8';
    $mailer->SMTPSecure = $config['FORGE_EMAIL_ENCRYPTION'];
    $mailer->setFrom($message->fromAddress, $message->fromName, false);
    $mailer->addAddress($message->toAddress);
    if ($message->replyToAddress !== null) {
        $mailer->addReplyTo($message->replyToAddress);
    }
    $mailer->isHTML(true);
    $mailer->Subject = $message->subject;
    $mailer->Body = $message->htmlBody;
    $mailer->AltBody = $message->textBody;
}

function sanitizePhpMailerError(string $message): string
{
    $normalized = preg_replace('/\s+/', ' ', trim($message));
    if (!is_string($normalized) || $normalized === '') {
        return 'Email delivery failed.';
    }

    $normalized = preg_replace('/([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/i', '[redacted-email]', $normalized);
    $normalized = preg_replace('/password[^ ]*/i', 'credentials', (string) $normalized);

    return sanitizeOutboundMessageError((string) $normalized);
}
