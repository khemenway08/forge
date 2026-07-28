<?php
declare(strict_types=1);

namespace Forge\Server;

final class EmailService
{
    private PdoOutboundMessageRepository $outboundMessages;
    private EmailTransportInterface $transport;
    private EmailRenderer $renderer;
    /** @var array<string, mixed> */
    private array $emailConfig;
    /** @var callable */
    private $clock;

    /**
     * @param array<string, mixed> $emailConfig
     */
    public function __construct(
        PdoOutboundMessageRepository $outboundMessages,
        EmailTransportInterface $transport,
        EmailRenderer $renderer,
        array $emailConfig = [],
        ?callable $clock = null
    )
    {
        $this->outboundMessages = $outboundMessages;
        $this->transport = $transport;
        $this->renderer = $renderer;
        $this->emailConfig = $emailConfig;
        $this->clock = $clock ?? static function (): \DateTimeImmutable {
            return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        };
    }

    /**
     * @param array<string, mixed> $orderPayload
     */
    public function scheduleOrderConfirmation(array $orderPayload): void
    {
        if (!$this->isAutomaticOrderEmailEnabled()) {
            return;
        }

        $createdMessage = $this->outboundMessages->createOrderConfirmationMessage($orderPayload);
        $record = $createdMessage->record;

        if (!$createdMessage->created) {
            return;
        }

        if ($record->status === OutboundMessageStatus::SKIPPED_TEST) {
            return;
        }

        $attemptedAt = $this->currentUtcIso8601();

        try {
            $normalizedConfig = normalizePrivateEmailConfig($this->emailConfig);
            $orderContext = is_array($record->renderContext['order'] ?? null) ? $record->renderContext['order'] : [];
            $replyToAddress = $normalizedConfig['FORGE_EMAIL_REPLY_TO'] ?? $normalizedConfig['FORGE_EMAIL_FROM_ADDRESS'];
            $message = new EmailMessage(
                $record->recipientEmail,
                $this->renderer->renderOrderConfirmationSubject($orderContext),
                $this->renderer->renderOrderConfirmationHtml($orderContext, (string) $replyToAddress),
                $this->renderer->renderOrderConfirmationText($orderContext, (string) $replyToAddress),
                $normalizedConfig['FORGE_EMAIL_FROM_ADDRESS'],
                $normalizedConfig['FORGE_EMAIL_FROM_NAME'],
                is_string($replyToAddress) && trim($replyToAddress) !== '' ? trim($replyToAddress) : null
            );
            $this->transport->send($message);
            $this->outboundMessages->markSent($record->messageId, $attemptedAt);
        } catch (EmailConfigurationException | EmailDeliveryException $exception) {
            $this->outboundMessages->markFailed($record->messageId, $exception->getMessage(), $attemptedAt);
        }
    }

    /**
     * @param array<string, mixed> $orderPayload
     */
    public function isAutomaticOrderEmailEnabled(array $orderPayload = []): bool
    {
        unset($orderPayload);
        return normalizePrivateEmailEnabledFlag($this->emailConfig['FORGE_EMAIL_ENABLED'] ?? null);
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

        throw new \RuntimeException('Email service clock must return a DateTimeInterface value.');
    }
}
