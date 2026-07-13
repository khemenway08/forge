# WooCommerce Integration

**Version:** 1.0  
**Status:** Approved  
**Last Updated:** 2026-07-13

## Purpose

Defines how Forge creates, updates, and synchronizes customer orders with WooCommerce.

## Authority

This document is the authoritative source for Forge-to-WooCommerce integration behavior.

## Dependencies

- `Forge.md`
- `Product_Definitions.yaml`
- `Database_Schema.md`

---

# 1. Integration Goal

WooCommerce is the primary customer and order record for Forge Version 1.

Forge captures the customer experience and production-specific details, then creates a complete WooCommerce order containing:

- Customer contact information
- Billing and shipping information
- Fulfillment method
- Every item in the order
- Item pricing
- Personalization details
- Customer-visible notes
- Forge order identifiers
- Internal production metadata

Forge must retain its local order record even when WooCommerce synchronization is delayed or fails.

---

# 2. Approved Architecture

```text
Customer iPad
    ↓
Forge Progressive Web App
    ↓
Forge server-side integration
    ↓
WooCommerce REST API
    ↓
WooCommerce order
```

The browser-facing Forge application must never communicate with WooCommerce using secret API credentials.

All authenticated WooCommerce requests must originate from the Forge server.

---

# 3. WooCommerce API Access

Forge will use WooCommerce REST API credentials created for a dedicated integration user.

Required access:

- Read orders
- Create orders
- Update orders
- Read customers when matching an existing customer
- Create order notes when required

Credential rules:

- Use HTTPS only.
- Store credentials in server environment configuration.
- Never place credentials in JavaScript, source control, Markdown files, screenshots, or customer-visible responses.
- Use the minimum permissions required.
- Rotate credentials if exposure is suspected.

---

# 4. Customer Record Strategy

Forge Version 1 will not automatically create WordPress login accounts for every show customer.

Instead:

1. Search WooCommerce for an existing customer using the submitted email address.
2. If a matching customer exists, attach the order to that customer.
3. If no matching customer exists, create the order as a guest order with complete billing and shipping information.
4. Preserve the customer information in the WooCommerce order.

This prevents unwanted account emails and passwords while still keeping customer information searchable in WooCommerce.

A future version may offer customer account creation as an optional feature.

---

# 5. Order Creation Timing

Forge creates the WooCommerce order only after the customer:

1. Adds all desired products.
2. Enters customer information.
3. Reviews the complete order.
4. Selects **Place My Order**.

Before submission, the order remains a Forge draft and must not create a WooCommerce order.

After submission:

1. Forge saves the complete local order first.
2. Forge assigns a permanent Forge order UUID.
3. Forge attempts WooCommerce synchronization.
4. Forge records the WooCommerce order ID after success.
5. Forge displays confirmation to the customer.

A temporary internet failure must not erase the order.

---

# 6. Duplicate Prevention

Every submitted Forge order receives an immutable `forge_order_uuid`.

That value must be included in WooCommerce order metadata.

Before retrying a failed synchronization, Forge must determine whether a WooCommerce order already exists for that UUID.

If a matching WooCommerce order exists:

- Link the Forge order to the existing WooCommerce order.
- Do not create a duplicate.

If no matching order exists:

- Retry order creation.

The customer pressing the submit button multiple times must not create multiple orders.

---

# 7. WooCommerce Order Status

Initial status rules:

| Forge condition | WooCommerce status |
|---|---|
| Submitted and payment not confirmed | `pending` |
| Payment confirmed externally | `processing` |
| Production and fulfillment completed | `completed` |
| Order cancelled | `cancelled` |
| Payment failed or invalid | `failed` |

Forge does not process card payments in Version 1.

Payments may occur through Square, cash, Venmo, or another external method.

Only staff may confirm external payment.

Forge stores the external payment method as order metadata and updates WooCommerce payment status only after staff confirmation.

---

# 8. Fulfillment Mapping

## Shipping

Shipping is the default selection.

WooCommerce receives:

- Shipping first and last name
- Address line 1
- Address line 2
- City
- State
- Postal code
- Country
- Phone when supported
- Configured shipping method
- Configured shipping total

Shipping cost must come from Forge or WooCommerce configuration and must not be hardcoded into the customer interface.

## Pickup

When pickup is selected:

- Shipping address is not required.
- WooCommerce receives a local pickup shipping line.
- The order includes `forge_fulfillment_method: pickup`.
- Optional needed-by date is included in metadata.

---

# 9. Customer Field Mapping

| Forge field | WooCommerce destination |
|---|---|
| Customer full name | Billing first/last name |
| Email | Billing email |
| Phone | Billing phone |
| Preferred contact | Order metadata |
| Address line 1 | Shipping and billing address 1 |
| Address line 2 | Shipping and billing address 2 |
| City | Shipping and billing city |
| State | Shipping and billing state |
| Postal code | Shipping and billing postcode |
| Country | Shipping and billing country |
| Fulfillment method | Shipping line and metadata |
| Needed-by date | Order metadata |

When a single full-name field is used, Forge must split it conservatively:

- First word becomes first name.
- Remaining words become last name.
- Preserve the original full name in metadata.

---

# 10. Order Item Mapping

Each Forge order item becomes one WooCommerce line item.

The line item must contain:

- Product display name
- Quantity
- Unit price
- Line total
- Forge product definition ID
- Selected size
- Selected colors
- Family name or last name
- Year or established year
- Ordered people and pets
- Pet types
- Pet icons
- Custom icon descriptions
- Product-specific fields
- Item-specific customer notes

Forge may use dedicated hidden WooCommerce products or custom line items.

The Version 1 implementation must favor accurate order records over storefront inventory tracking.

Retail inventory is outside Version 1 scope.

---

# 11. Product Identification

Every Forge line item includes:

- `forge_product_definition_id`
- `forge_product_display_name`
- `forge_product_category`
- `forge_product_version`

Product pricing and display names are snapshots from the time of order.

Changing `Product_Definitions.yaml` later must not alter historical WooCommerce orders.

---

# 12. Personalization Metadata

Personalization must be readable in the WooCommerce order screen without opening Forge.

Recommended line-item metadata labels:

- Size
- Tree Color
- Bow Color
- Family Name
- Year
- People
- Pets
- Veteran Edge Text
- Sign Icon
- Established Year
- Custom Request

People and pets must appear in the exact order selected by the customer.

Example:

```text
People & Pets:
1. Kyle — Person
2. Meagan — Person
3. Scout — Dog — Paw
4. Whiskers — Cat — Fish
```

Custom icon requests must include both:

- Selected value: `Custom Icon`
- Customer description

Internal flags must not be exposed as customer-visible line-item text.

---

# 13. Order Metadata

Every WooCommerce order created by Forge must include:

| Metadata key | Purpose |
|---|---|
| `forge_order_uuid` | Duplicate prevention and permanent link |
| `forge_order_number` | Human-readable Forge number |
| `forge_source` | Value: `customer_kiosk` |
| `forge_device_id` | Identifies originating iPad |
| `forge_submitted_at` | Original submission time |
| `forge_sync_version` | Integration schema version |
| `forge_fulfillment_method` | Shipping or pickup |
| `forge_preferred_contact` | Text or email |
| `forge_needed_by` | Optional date |
| `forge_external_payment_method` | Staff-entered payment source |
| `forge_has_open_flags` | Indicates production exceptions |

Sensitive credentials and private implementation details must never be written to order metadata.

---

# 14. Notes and Visibility

Forge supports three note types.

## Customer-visible note

May be added to a WooCommerce customer note when intentionally selected.

## Staff internal note

May be synchronized as a private WooCommerce order note.

## Production note

Remains in Forge by default.

Production notes may be copied to a private WooCommerce note only when useful for staff operations.

Custom icon descriptions tied to one item should remain line-item metadata rather than a general order note.

---

# 15. Pricing Rules

Forge calculates item prices from `Product_Definitions.yaml`.

WooCommerce receives the calculated price as a snapshot.

Approved rules include:

- Size-based ornament pricing
- Reindeer quantity discount when two or more reindeer ornaments exist in the same order
- Fixed-price Veteran Flag customization
- Quote-required custom requests

## Quote-required items

A quote-required custom request must not be silently assigned a zero-dollar final price.

Approved Version 1 behavior:

1. Create the request in Forge.
2. Create the WooCommerce order with the custom item clearly labeled **Quote Required**.
3. Set order status to `pending`.
4. Add an internal flag for custom artwork.
5. Staff updates the price before requesting or recording payment.

---

# 16. Taxes

WooCommerce remains responsible for final tax handling.

Forge must not maintain a separate tax-rate table.

The integration must use WooCommerce-compatible tax calculations or send order data through a server-side process that allows WooCommerce to calculate totals.

Forge must display the same final total that WooCommerce stores before the customer confirms the order whenever connectivity is available.

If taxes cannot be calculated while offline:

- Clearly mark the displayed total as estimated.
- Finalize tax during synchronization.
- Flag any changed total for staff attention before fulfillment.

---

# 17. Customer Emails

WooCommerce order emails must not be sent until the order has been successfully created.

Version 1 rules:

- Send one order confirmation after successful synchronization.
- Do not send duplicate confirmation emails during retries.
- Quote-required orders use wording that the request was received and pricing will be confirmed.
- Pickup and shipping orders use the appropriate fulfillment language.

The customer-facing confirmation screen may appear immediately after Forge safely saves the order, even when WooCommerce sync remains pending.

In that case, Forge must state that the order was received without falsely claiming an email was already sent.

---

# 18. Offline Queue

When WooCommerce is unreachable:

1. Save the complete order on the iPad and Forge server when possible.
2. Mark sync status as `pending`.
3. Show staff a visible **Waiting to Sync** indicator.
4. Retry automatically when connectivity returns.
5. Preserve the original submission timestamp.
6. Use `forge_order_uuid` to prevent duplicates.

Pending orders must survive:

- Page refresh
- Temporary app closure
- Temporary internet loss

A pending order is not considered lost or invalid.

---

# 19. Retry Rules

Automatic retries should use increasing delays.

Recommended pattern:

- First retry: approximately 15 seconds
- Second retry: approximately 1 minute
- Later retries: increasing intervals
- Continue until success or staff intervention is required

After repeated failure:

- Create an open `sync_failed` flag.
- Preserve the sanitized error message.
- Allow staff to retry manually.
- Never require the customer to re-enter the order.

---

# 20. Updates After Creation

Forge may update WooCommerce when:

- Staff confirms payment
- Customer information is corrected
- Fulfillment method changes
- Order is cancelled
- Production is completed
- Order is fulfilled

Production-only status changes do not need to overwrite the WooCommerce customer-facing status until fulfillment meaningfully changes.

Forge must log each sync attempt.

---

# 21. Customer Matching

Email is the primary matching field.

Phone may be used as a secondary staff aid but must not automatically merge customers by itself.

When multiple WooCommerce customers share an email or matching is ambiguous:

- Do not merge records automatically.
- Create the order with the submitted information.
- Flag for staff review only if necessary.

---

# 22. Error Handling

Customer-facing errors must be plain and actionable.

Approved examples:

- **Your order is saved and waiting to sync.**
- **We could not send the order to the website yet, but your information is safe.**
- **Please ask a Hilltop Shop team member for help.**

Never show customers:

- API responses
- Server paths
- Database errors
- Credential information
- Technical stack traces

---

# 23. Security

- API credentials remain server-side.
- All traffic uses HTTPS.
- Staff actions require authentication.
- Logs must redact credentials and sensitive request headers.
- Customer data access is limited to authorized staff.
- Integration keys use the minimum required permissions.
- Credentials are not committed to GitHub.

---

# 24. Testing Requirements

Before production use, automated or repeatable tests must verify:

- One-item order creation
- Multi-item order creation
- Shipping order
- Pickup order
- Reindeer quantity discount
- Ordered people and pets
- Custom pet icon
- Quote-required custom request
- Existing customer match
- Guest order creation
- Offline save
- Retry after connection returns
- Duplicate-submit prevention
- Payment-status update
- Order cancellation
- WooCommerce confirmation email behavior

Testing must use non-production test orders until explicitly approved.

---

# 25. Setup Checklist

Before enabling live synchronization:

- Confirm WooCommerce is current.
- Confirm HTTPS works on the Forge subdomain.
- Create a dedicated WooCommerce integration user.
- Generate restricted API credentials.
- Store credentials in server configuration.
- Verify WooCommerce order statuses.
- Verify shipping methods.
- Verify tax behavior.
- Verify confirmation emails.
- Complete all integration tests.
- Create and successfully fulfill one staff-only live test order.

---

# 26. Official WooCommerce Interfaces

The implementation should use official WooCommerce APIs and order interfaces rather than direct SQL writes.

The WooCommerce REST API supports creating and updating orders, customers, and order notes.

Forge must remain compatible with WooCommerce High-Performance Order Storage by avoiding direct assumptions about WordPress database tables.

---

# 27. Version History

## Version 1.0

Initial approved WooCommerce integration specification for Forge Version 1.
