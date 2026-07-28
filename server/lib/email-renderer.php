<?php
declare(strict_types=1);

namespace Forge\Server;

final class EmailRenderer
{
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
        $summary = buildOrderConfirmationSummary($orderPayload, $replyToAddress);
        $itemMarkup = implode('', array_map(static function (array $item): string {
            $details = [];
            foreach ($item['details'] as $detail) {
                $details[] = '<li>' . escapeEmailHtml($detail) . '</li>';
            }

            return sprintf(
                '<li><strong>%s</strong> &times; %d%s%s</li>',
                escapeEmailHtml($item['name']),
                $item['quantity'],
                $item['item_total'] !== null ? ' — ' . escapeEmailHtml($item['item_total']) : '',
                $details === [] ? '' : '<ul>' . implode('', $details) . '</ul>'
            );
        }, $summary['items']));

        $shippingMarkup = $summary['shipping_address_lines'] === []
            ? ''
            : '<p><strong>Shipping address:</strong><br>' . implode('<br>', array_map('Forge\\Server\\escapeEmailHtml', $summary['shipping_address_lines'])) . '</p>';

        return sprintf(
            '<!doctype html><html lang="en"><body style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.5;">'
            . '<h1 style="margin-bottom: 0.25rem;">The Hilltop Shop</h1>'
            . '<p style="margin-top: 0;">Order confirmation%s</p>'
            . '<p>Hello %s,</p>'
            . '<p>Please review your order details carefully. Contact The Hilltop Shop promptly if any spelling, personalization, or order information is incorrect.</p>'
            . '<p><strong>Recorded payment method:</strong> %s</p>'
            . '<p><strong>Delivery method:</strong> %s</p>'
            . '%s'
            . '<h2 style="margin-bottom: 0.5rem;">Order summary</h2>'
            . '<ul>%s</ul>'
            . '<p><strong>Order total:</strong> %s</p>'
            . '<p>Reply to <a href="mailto:%s">%s</a> if you need help with this order.</p>'
            . '</body></html>',
            $summary['order_number_text'] === '' ? '' : ' ' . escapeEmailHtml($summary['order_number_text']),
            escapeEmailHtml($summary['customer_name']),
            escapeEmailHtml($summary['payment_method_label']),
            escapeEmailHtml($summary['delivery_method_label']),
            $shippingMarkup,
            $itemMarkup,
            escapeEmailHtml($summary['order_total']),
            escapeEmailHtml($replyToAddress),
            escapeEmailHtml($replyToAddress)
        );
    }

    /**
     * @param array<string, mixed> $orderPayload
     */
    public function renderOrderConfirmationText(array $orderPayload, string $replyToAddress): string
    {
        $summary = buildOrderConfirmationSummary($orderPayload, $replyToAddress);
        $lines = [
            'The Hilltop Shop',
            $summary['order_number_text'] === '' ? 'Order confirmation' : 'Order confirmation ' . $summary['order_number_text'],
            '',
            'Hello ' . $summary['customer_name'] . ',',
            '',
            'Please review your order details carefully. Contact The Hilltop Shop promptly if any spelling, personalization, or order information is incorrect.',
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
        $lines[] = 'Order total: ' . $summary['order_total'];
        $lines[] = '';
        $lines[] = 'Reply to ' . $replyToAddress . ' if you need help with this order.';

        return implode("\n", $lines);
    }
}

/**
 * @param array<string, mixed> $orderPayload
 * @return array{
 *   order_number_text: string,
 *   customer_name: string,
 *   payment_method_label: string,
 *   delivery_method_label: string,
 *   shipping_address_lines: array<int, string>,
 *   items: array<int, array{name: string, quantity: int, item_total: ?string, details: array<int, string>}>,
 *   order_total: string
 * }
 */
function buildOrderConfirmationSummary(array $orderPayload, string $replyToAddress): array
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
    ];
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
