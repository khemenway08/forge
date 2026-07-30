<?php
declare(strict_types=1);

namespace Forge\Server;

final class EmailRenderer
{
    public const HILLTOP_LOGO_URL = 'https://thehilltopshop.com/wp-content/uploads/2025/09/The-Hilltop-Shop-Logo-1-600x335.png';

    /** @var array<string, mixed> */
    private array $emailConfig;

    /**
     * @param array<string, mixed> $emailConfig
     */
    public function __construct(array $emailConfig = [])
    {
        $this->emailConfig = $emailConfig;
    }

    /**
     * @param array<string, mixed> $orderPayload
     */
    public function renderOrderConfirmationSubject(array $orderPayload): string
    {
        $orderNumber = normalizeNullableOrderNumber($orderPayload['forge_order_number'] ?? null);
        return $orderNumber === null
            ? 'The Hilltop Shop order confirmation'
            : sprintf('The Hilltop Shop order confirmation #%d', $orderNumber);
    }

    /**
     * @param array<string, mixed> $orderPayload
     */
    public function renderOrderConfirmationHtml(array $orderPayload, string $replyToAddress): string
    {
        $summary = buildOrderConfirmationSummary($orderPayload, $replyToAddress, $this->emailConfig);
        $itemMarkup = implode('', array_map(static function (array $item): string {
            return renderEmailItemCardHtml($item);
        }, $summary['items']));

        $shippingMarkup = '';
        if ($summary['shipping_address_lines'] !== []) {
            $shippingMarkup = sprintf(
                '<tr><td style="padding: 0 0 20px 0;">'
                . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e6dbce; border-radius: 14px; background-color: #fffaf3;">'
                . '<tr><td style="padding: 18px 20px;">'
                . '<div style="font-size: 13px; line-height: 1.5; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8c6b4f; padding-bottom: 8px;">Shipping address</div>'
                . '<div style="font-size: 16px; line-height: 1.6; color: #231f1c;">%s</div>'
                . '</td></tr></table>'
                . '</td></tr>',
                implode('<br>', array_map('Forge\\Server\\escapeEmailHtml', $summary['shipping_address_lines']))
            );
        }

        $footerMarkup = '';
        if ($summary['footer_links'] !== []) {
            $buttonMarkup = implode('', array_map(static function (array $link): string {
                return sprintf(
                    '<a href="%s" style="display: inline-block; margin: 0 10px 10px 0; padding: 12px 18px; border-radius: 999px; border: 1px solid #d4b89a; background-color: #fff8ee; color: #5a3d2b; font-size: 14px; line-height: 1.2; font-weight: 700; text-decoration: none;">%s</a>',
                    escapeEmailHtml($link['url']),
                    escapeEmailHtml($link['label'])
                );
            }, $summary['footer_links']));

            $footerMarkup = sprintf(
                '<tr><td style="padding-top: 10px;">'
                . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="border-top: 1px solid #eadbc9;">'
                . '<tr><td style="padding: 24px 0 0 0;">'
                . '<div style="font-size: 20px; line-height: 1.3; font-weight: 700; color: #2a2420; padding-bottom: 8px;">Stay connected with The Hilltop Shop</div>'
                . '<div style="font-size: 15px; line-height: 1.7; color: #5d5147; padding-bottom: 16px;">Follow along for new designs, upcoming shows, and behind-the-scenes projects.</div>'
                . '<div>%s</div>'
                . '</td></tr></table>'
                . '</td></tr>',
                $buttonMarkup
            );
        }

        return sprintf(
            '<!doctype html>'
            . '<html lang="en">'
            . '<body style="margin: 0; padding: 0; background-color: #f6efe7;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width: 100%%; background-color: #f6efe7;">'
            . '<tr>'
            . '<td align="center" style="padding: 28px 16px;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width: 100%%; max-width: 620px; background-color: #ffffff; border: 1px solid #eadbc9; border-radius: 22px;">'
            . '<tr><td style="padding: 28px 28px 8px 28px; text-align: center;">'
            . '<img src="%s" alt="The Hilltop Shop" width="240" style="display: block; margin: 0 auto; width: 100%%; max-width: 240px; height: auto; border: 0;">'
            . '</td></tr>'
            . '<tr><td style="padding: 0 28px 30px 28px;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0">'
            . '<tr><td style="padding-bottom: 24px; text-align: center;">'
            . '<div style="font-size: 15px; line-height: 1.3; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8c6b4f; padding-bottom: 10px;">Order confirmed</div>'
            . '<div style="font-size: 30px; line-height: 1.2; font-weight: 700; color: #221d19; padding-bottom: 10px;">%s</div>'
            . '<div style="font-size: 16px; line-height: 1.6; color: #4b4038;">Hello %s,</div>'
            . '</td></tr>'
            . '<tr><td style="padding-bottom: 20px;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="border-left: 4px solid #b4835a; background-color: #fbf5ee; border-radius: 14px;">'
            . '<tr><td style="padding: 16px 18px; font-size: 15px; line-height: 1.7; color: #3c322b;">Please review all spelling and personalization carefully. Reply promptly if anything needs to be corrected.</td></tr>'
            . '</table>'
            . '</td></tr>'
            . '<tr><td style="padding-bottom: 20px;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0">'
            . '<tr>'
            . '<td valign="top" width="50%%" style="padding: 0 8px 12px 0;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e6dbce; border-radius: 14px; background-color: #fffdf9;">'
            . '<tr><td style="padding: 16px 18px;">'
            . '<div style="font-size: 13px; line-height: 1.5; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8c6b4f; padding-bottom: 6px;">Payment method</div>'
            . '<div style="font-size: 17px; line-height: 1.5; color: #231f1c;">%s</div>'
            . '</td></tr></table>'
            . '</td>'
            . '<td valign="top" width="50%%" style="padding: 0 0 12px 8px;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e6dbce; border-radius: 14px; background-color: #fffdf9;">'
            . '<tr><td style="padding: 16px 18px;">'
            . '<div style="font-size: 13px; line-height: 1.5; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8c6b4f; padding-bottom: 6px;">Delivery method</div>'
            . '<div style="font-size: 17px; line-height: 1.5; color: #231f1c;">%s</div>'
            . '</td></tr></table>'
            . '</td>'
            . '</tr>'
            . '</table>'
            . '</td></tr>'
            . '%s'
            . '<tr><td style="padding: 6px 0 10px 0;">'
            . '<div style="font-size: 13px; line-height: 1.5; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8c6b4f;">Order items</div>'
            . '</td></tr>'
            . '%s'
            . '<tr><td style="padding-top: 8px; padding-bottom: 22px;">'
            . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #d8c0a7; border-radius: 16px; background-color: #fff8ee;">'
            . '<tr><td style="padding: 18px 20px; text-align: center;">'
            . '<div style="font-size: 13px; line-height: 1.5; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8c6b4f; padding-bottom: 6px;">Order subtotal</div>'
            . '<div style="font-size: 30px; line-height: 1.2; font-weight: 700; color: #221d19;">%s</div>'
            . '<div style="font-size: 13px; line-height: 1.5; color: #6e5a49; padding-top: 8px;">Applicable sales tax is added during payment.</div>'
            . '</td></tr></table>'
            . '</td></tr>'
            . '<tr><td style="font-size: 15px; line-height: 1.7; color: #4b4038;">Reply to <a href="mailto:%s" style="color: #5a3d2b; font-weight: 700; text-decoration: underline;">%s</a> if you need help or need to request a correction.</td></tr>'
            . '%s'
            . '</table>'
            . '</td></tr>'
            . '</table>'
            . '</td>'
            . '</tr>'
            . '</table>'
            . '</body>'
            . '</html>',
            escapeEmailHtml($summary['logo_url']),
            escapeEmailHtml($summary['order_number_text'] === '' ? 'Order confirmed' : 'Order ' . $summary['order_number_text']),
            escapeEmailHtml($summary['customer_name']),
            escapeEmailHtml($summary['payment_method_label']),
            escapeEmailHtml($summary['delivery_method_label']),
            $shippingMarkup,
            $itemMarkup,
            escapeEmailHtml($summary['order_total']),
            escapeEmailHtml($replyToAddress),
            escapeEmailHtml($replyToAddress),
            $footerMarkup
        );
    }

    /**
     * @param array<string, mixed> $orderPayload
     */
    public function renderOrderConfirmationText(array $orderPayload, string $replyToAddress): string
    {
        $summary = buildOrderConfirmationSummary($orderPayload, $replyToAddress, $this->emailConfig);
        $lines = [
            'The Hilltop Shop',
            $summary['order_number_text'] === '' ? 'Order confirmed' : 'Order confirmed ' . $summary['order_number_text'],
            '',
            'Hello ' . $summary['customer_name'] . ',',
            '',
            'Please review all spelling and personalization carefully. Reply promptly if anything needs to be corrected.',
            '',
            'Recorded payment method: ' . $summary['payment_method_label'],
            'Delivery method: ' . $summary['delivery_method_label'],
        ];

        if ($summary['shipping_address_lines'] !== []) {
            $lines[] = 'Shipping address:';
            foreach ($summary['shipping_address_lines'] as $addressLine) {
                $lines[] = '  ' . $addressLine;
            }
        }

        $lines[] = '';
        $lines[] = 'Order summary:';
        foreach ($summary['items'] as $item) {
            $lines[] = sprintf('- %s x %d%s', $item['name'], $item['quantity'], $item['item_total'] !== null ? ' — ' . $item['item_total'] : '');
            foreach ($item['details'] as $detail) {
                $lines[] = '  • ' . $detail;
            }
        }
        $lines[] = 'Order subtotal: ' . $summary['order_total'];
        $lines[] = 'Applicable sales tax is added during payment.';
        $lines[] = '';
        $lines[] = 'Reply to ' . $replyToAddress . ' if you need help or need to request a correction.';

        if ($summary['footer_links'] !== []) {
            $lines[] = '';
            $lines[] = 'Stay connected with The Hilltop Shop';
            $lines[] = 'Follow along for new designs, upcoming shows, and behind-the-scenes projects.';
            foreach ($summary['footer_links'] as $link) {
                $lines[] = $link['label'] . ': ' . $link['url'];
            }
        }

        return implode("\n", $lines);
    }
}

/**
 * @param array<string, mixed> $orderPayload
 * @param array<string, mixed> $emailConfig
 * @return array{
 *   order_number_text: string,
 *   customer_name: string,
 *   payment_method_label: string,
 *   delivery_method_label: string,
 *   shipping_address_lines: array<int, string>,
 *   items: array<int, array{name: string, quantity: int, item_total: ?string, details: array<int, string>}>,
 *   order_total: string,
 *   footer_links: array<int, array{label: string, url: string}>,
 *   logo_url: string
 * }
 */
function buildOrderConfirmationSummary(array $orderPayload, string $replyToAddress, array $emailConfig = []): array
{
    $customer = is_array($orderPayload['customer'] ?? null) ? $orderPayload['customer'] : [];
    $fulfillment = is_array($orderPayload['fulfillment'] ?? null) ? $orderPayload['fulfillment'] : [];
    $pricing = is_array($orderPayload['pricing'] ?? null) ? $orderPayload['pricing'] : [];
    $orderNumber = normalizeNullableOrderNumber($orderPayload['forge_order_number'] ?? null);
    $paymentMethod = trim((string) ($orderPayload['external_payment_method'] ?? ''));
    $items = [];

    foreach (($orderPayload['items'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }

        $details = [];
        foreach (buildEmailItemDetails($item) as $detail) {
            $details[] = $detail;
        }

        $items[] = [
            'name' => trim((string) ($item['product_display_name'] ?? 'Item')),
            'quantity' => max(1, (int) ($item['quantity'] ?? 1)),
            'item_total' => formatEmailPriceFromCents($item['pricing']['line_total_cents'] ?? null),
            'details' => $details,
        ];
    }

    return [
        'order_number_text' => $orderNumber === null ? '' : '#' . $orderNumber,
        'customer_name' => trim((string) ($customer['full_name'] ?? 'Customer')) ?: 'Customer',
        'payment_method_label' => mapExternalPaymentMethodToLabel($paymentMethod),
        'delivery_method_label' => mapFulfillmentMethodToLabel(trim((string) ($fulfillment['method'] ?? 'pickup'))),
        'shipping_address_lines' => buildEmailShippingAddressLines($fulfillment['shipping_address'] ?? null),
        'items' => $items,
        'order_total' => formatEmailPriceFromCents($pricing['estimated_total_cents'] ?? null),
        'footer_links' => buildEmailFooterLinks($emailConfig),
        'logo_url' => EmailRenderer::HILLTOP_LOGO_URL,
    ];
}

/**
 * @param array{name: string, quantity: int, item_total: ?string, details: array<int, string>} $item
 */
function renderEmailItemCardHtml(array $item): string
{
    $detailsMarkup = '';
    if ($item['details'] !== []) {
        $detailRows = [];
        foreach ($item['details'] as $detail) {
            $detailRows[] = sprintf(
                '<tr><td style="padding-top: 8px; font-size: 14px; line-height: 1.6; color: #4c4138;">&bull; %s</td></tr>',
                escapeEmailHtml($detail)
            );
        }
        $detailsMarkup = implode('', $detailRows);
    }

    return sprintf(
        '<tr><td style="padding-bottom: 14px;">'
        . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e6dbce; border-radius: 16px; background-color: #ffffff;">'
        . '<tr><td style="padding: 18px 20px;">'
        . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0">'
        . '<tr>'
        . '<td valign="top" style="font-size: 18px; line-height: 1.4; font-weight: 700; color: #231f1c; padding-right: 12px;">%s</td>'
        . '<td valign="top" align="right" style="font-size: 16px; line-height: 1.4; font-weight: 700; color: #5a3d2b; white-space: nowrap;">Qty %d%s</td>'
        . '</tr>'
        . '%s'
        . '</table>'
        . '</td></tr></table>'
        . '</td></tr>',
        escapeEmailHtml($item['name']),
        $item['quantity'],
        $item['item_total'] !== null ? ' — ' . escapeEmailHtml($item['item_total']) : '',
        $detailsMarkup
    );
}

/**
 * @param array<string, mixed> $emailConfig
 * @return array<int, array{label: string, url: string}>
 */
function buildEmailFooterLinks(array $emailConfig): array
{
    $links = [];
    foreach ([
        ['key' => 'FORGE_FACEBOOK_URL', 'label' => 'Follow on Facebook'],
        ['key' => 'FORGE_INSTAGRAM_URL', 'label' => 'Follow on Instagram'],
        ['key' => 'FORGE_EMAIL_SIGNUP_URL', 'label' => 'Join our email list'],
    ] as $linkConfig) {
        $url = normalizePublicMarketingUrl($emailConfig[$linkConfig['key']] ?? null);
        if ($url === null) {
            continue;
        }

        $links[] = [
            'label' => $linkConfig['label'],
            'url' => $url,
        ];
    }

    return $links;
}

/**
 * @param mixed $value
 */
function normalizePublicMarketingUrl($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = trim($value);
    if ($normalized === '' || !filter_var($normalized, FILTER_VALIDATE_URL)) {
        return null;
    }

    $scheme = strtolower((string) parse_url($normalized, PHP_URL_SCHEME));
    return in_array($scheme, ['http', 'https'], true) ? $normalized : null;
}

/**
 * @param array<string, mixed> $item
 * @return array<int, string>
 */
function buildEmailItemDetails(array $item): array
{
    $details = [];

    $configurationSnapshot = is_array($item['configuration_snapshot'] ?? null) ? $item['configuration_snapshot'] : [];
    foreach ($configurationSnapshot as $key => $value) {
        if ($value === null || $value === '' || is_array($value) || is_object($value)) {
            continue;
        }
        $details[] = sprintf('%s: %s', humanizeEmailFieldLabel((string) $key), trim((string) $value));
    }

    $personalizationEntries = is_array($item['personalization_order'] ?? null) ? $item['personalization_order'] : [];
    foreach ($personalizationEntries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $name = trim((string) ($entry['name'] ?? ''));
        $type = trim((string) ($entry['type'] ?? ''));
        $icon = trim((string) ($entry['icon'] ?? ''));
        $parts = [];
        if ($name !== '') {
            $parts[] = $name;
        }
        if ($type !== '') {
            $parts[] = ucfirst(str_replace('_', ' ', $type));
        }
        if ($icon !== '') {
            $parts[] = 'Icon: ' . $icon;
        }

        if ($parts !== []) {
            $details[] = 'Personalization: ' . implode(' — ', $parts);
        }
    }

    $customerNote = normalizeNullableString($item['customer_note'] ?? null);
    if ($customerNote !== null) {
        $details[] = 'Customer note: ' . $customerNote;
    }

    return $details;
}

/**
 * @param mixed $shippingAddress
 * @return array<int, string>
 */
function buildEmailShippingAddressLines($shippingAddress): array
{
    if (!is_array($shippingAddress)) {
        return [];
    }

    $lines = [];
    foreach (['recipient', 'address_1', 'address_2'] as $field) {
        $value = trim((string) ($shippingAddress[$field] ?? ''));
        if ($value !== '') {
            $lines[] = $value;
        }
    }

    $city = trim((string) ($shippingAddress['city'] ?? ''));
    $state = trim((string) ($shippingAddress['state'] ?? ''));
    $postalCode = trim((string) ($shippingAddress['postal_code'] ?? ''));
    $country = trim((string) ($shippingAddress['country'] ?? ''));

    $cityLine = trim(implode(', ', array_filter([$city, $state], static fn (string $value): bool => $value !== '')));
    if ($postalCode !== '') {
        $cityLine = trim($cityLine . ' ' . $postalCode);
    }
    if ($cityLine !== '') {
        $lines[] = $cityLine;
    }
    if ($country !== '') {
        $lines[] = $country;
    }

    return $lines;
}

function mapExternalPaymentMethodToLabel(string $paymentMethod): string
{
    return match (strtolower(trim($paymentMethod))) {
        'card_square' => 'Card / Square',
        'cash' => 'Cash',
        'venmo' => 'Venmo',
        default => 'Recorded payment method unavailable',
    };
}

function mapFulfillmentMethodToLabel(string $method): string
{
    return strtolower(trim($method)) === 'shipping' ? 'Shipping' : 'Pickup';
}

/**
 * @param mixed $value
 */
function formatEmailPriceFromCents($value): string
{
    $cents = is_numeric($value) ? (int) $value : 0;
    return '$' . number_format($cents / 100, 2, '.', ',');
}

function humanizeEmailFieldLabel(string $key): string
{
    $normalized = preg_replace('/[_-]+/', ' ', trim($key));
    $normalized = preg_replace('/([a-z])([A-Z])/', '$1 $2', (string) $normalized);
    return ucwords(strtolower((string) $normalized));
}

function escapeEmailHtml(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
