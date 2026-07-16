# WooCommerce Integration

**Version:** 1.1
**Status:** Approved
**Last Updated:** 2026-07-16

## Purpose

Defines how Forge creates, updates, and synchronizes customer orders with WooCommerce while keeping Forge responsible for the internal production-tray, item-completion, packing, and fulfillment workflow.

## Authority

This document is the authoritative source for Forge-to-WooCommerce integration behavior.

## Dependencies

- `Forge.md`
- `Product_Definitions.yaml`
- `Database_Schema.md`
- `UI_Guidelines.md`

---

# 1. Integration Goal

WooCommerce is the primary customer and order record for Forge Version 1 after server synchronization is available.

Forge captures the customer experience and production-specific details, then creates a complete WooCommerce order containing:

- Customer contact information
- Billing and shipping information
- Fulfillment method
- Every item in the order
- Item pricing
- Personalization details
- Customer-visible notes
- Forge order identifiers
- Approved private integration metadata

Forge remains authoritative for:

- Production tray assignment
- Tray availability and reuse
- Item-level production status
- Production progress
- Production notes and open flags
- Ready-to-Pack eligibility
- Packing verification
- Packed status
- Internal production history

Forge must retain its local order record even when WooCommerce synchronization is delayed or fails.

A WooCommerce outage must not erase an order or require the customer to enter it again.

---

# 2. Approved Architecture

```text
Customer iPad
    ↓
Forge Progressive Web App
    ↓
Durable Local Save
    ↓
Forge server-side integration
    ↓
WooCommerce REST API
    ↓
WooCommerce customer and order record

Forge local/server order
    ↓
Production Tray
    ↓
Batch Production
    ↓
Ready to Pack
    ↓
Packing Verification
    ↓
Shipped or Picked Up
```

The browser-facing Forge application must never communicate with WooCommerce using secret API credentials.

All authenticated WooCommerce requests must originate from the Forge server.

Production work may continue from a safely stored Forge order while WooCommerce synchronization is pending. Staff must be able to see that the order is waiting to sync.

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
3. Forge records the original submission timestamp.
4. Forge attempts WooCommerce synchronization.
5. Forge records the WooCommerce order ID after success.
6. Forge displays confirmation to the customer.

A temporary internet failure must not erase the order.

Production tray assignment is an internal staff action and must not occur during the customer submission interaction.

If WooCommerce is unavailable, a safely saved Forge order may still be assigned a tray and moved through production. The pending synchronization state must remain visible until resolved.

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

Production actions, tray assignment, packing, and fulfillment updates must reuse the same linked WooCommerce order. They must never create a replacement order.

---

# 7. WooCommerce Order Status

Forge production status and WooCommerce order status are related but are not the same lifecycle.

Initial status rules:

| Forge condition | WooCommerce status |
|---|---|
| Submitted and payment not confirmed | `pending` |
| External payment confirmed and order not fulfilled | `processing` |
| Tray assigned | No automatic WooCommerce status change |
| In production | No automatic WooCommerce status change |
| Ready to pack | No automatic WooCommerce status change |
| Packed but not shipped or picked up | No automatic WooCommerce status change |
| Shipped or picked up, with payment requirements satisfied | `completed` |
| Order cancelled | `cancelled` |
| Payment failed or invalid | `failed` |

Forge does not process card payments in Version 1.

Payments may occur through Square, cash, Venmo, or another external method.

Only staff may confirm external payment.

Forge stores the external payment method as approved order metadata and updates WooCommerce payment status only after staff confirmation.

Production completion alone must not mark a WooCommerce order `completed`.

Packing alone must not mark a WooCommerce order `completed`.

WooCommerce should normally become `completed` only after the order has been shipped or picked up and any required payment confirmation has occurred.

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

Packing verification does not mean the order has shipped.

Forge records a separate shipped state and fulfillment timestamp before completing the WooCommerce order.

## Pickup

When pickup is selected:

- Shipping address is not required.
- WooCommerce receives a local pickup shipping line.
- The order includes `forge_fulfillment_method: pickup`.
- Optional needed-by date is included in metadata.

Packing verification does not mean the customer has picked up the order.

Forge records a separate picked-up state and fulfillment timestamp before completing the WooCommerce order.

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

Item-level production status, completion timestamps, and tray placement remain internal Forge data by default.

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

Production tray numbers, production status, packing checklist state, and staff production notes must not appear as customer-visible line-item metadata.

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
| `forge_has_open_flags` | Indicates production exceptions without exposing their private content |

Sensitive credentials and private implementation details must never be written to order metadata.

## Internal Forge Data Not Synchronized by Default

The following remain in Forge unless a later approved revision explicitly authorizes private WooCommerce metadata:

- Current production tray number
- Tray availability
- Tray assignment history
- Item production statuses
- Item completion timestamps
- Completed item counts
- Ready-to-Pack timestamp
- Packing verification checklist
- Packed timestamp
- Tray release details
- Staff production notes
- Internal production exception details

A tray number is an internal physical-location tool. It must not appear in customer emails, customer notes, packing slips, storefront screens, or customer-visible order details.

---

# 14. Notes and Visibility

Forge supports three note types.

## Customer-visible note

May be added to a WooCommerce customer note when intentionally selected.

## Staff internal note

May be synchronized as a private WooCommerce order note when useful for customer service, payment, cancellation, or fulfillment.

## Production note

Remains in Forge by default.

Production notes may be copied to a private WooCommerce order note only when there is a clear operational reason and staff intentionally selects that action.

Custom icon descriptions tied to one item should remain line-item metadata rather than a general order note.

Tray numbers, tray-label text, item completion controls, packing checklist results, and routine production progress should remain in Forge.

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

A quote-required production item must not be treated as production-complete until its approved price and artwork requirements are resolved.

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

A tax or total mismatch must not be hidden merely because production has started.

---

# 17. Customer Emails

WooCommerce order emails must not be sent until the order has been successfully created.

Version 1 rules:

- Send one order confirmation after successful synchronization.
- Do not send duplicate confirmation emails during retries.
- Quote-required orders use wording that the request was received and pricing will be confirmed.
- Pickup and shipping orders use the appropriate fulfillment language.
- Tray assignment must not trigger a customer email.
- Item completion must not trigger a customer email.
- Ready-to-Pack status must not trigger a customer email.
- Packing verification must not trigger a customer email unless a later approved communication rule explicitly requires it.
- Shipment or pickup communication must use the appropriate customer-facing fulfillment language.

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

A safely stored pending order may continue through tray assignment and production. Forge must preserve all later production changes while the WooCommerce order remains unsynchronized.

When synchronization succeeds, Forge must create or update the one matching WooCommerce order without duplicating production actions or sending duplicate confirmation emails.

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
- Do not release or reassign the production tray because of a WooCommerce synchronization failure.
- Do not erase item completion or packing history.

---

# 20. Updates After Creation

Forge may update WooCommerce when:

- Staff confirms external payment
- Customer information is corrected
- Fulfillment method changes
- Order pricing is finalized
- Order is cancelled
- A shipping order is shipped
- A pickup order is picked up

The following internal production actions do not normally require a WooCommerce update:

- Assigning a production tray
- Changing an item from pending to in progress
- Marking an item complete
- Moving an order to Ready to Pack
- Completing packing verification
- Releasing a tray
- Reassigning a tray after an approved internal correction

Production-only status changes must not overwrite WooCommerce customer-facing status.

Packing does not equal fulfillment.

When a shipping order is marked shipped, Forge may update the linked WooCommerce order to `completed` when payment requirements are satisfied.

When a pickup order is marked picked up, Forge may update the linked WooCommerce order to `completed` when payment requirements are satisfied.

Order cancellation must update WooCommerce when a linked order exists. Forge must also release any active tray according to `Database_Schema.md`.

Forge must log every synchronization attempt and meaningful status update.

---

# 21. Production Workflow Boundary

Forge is the operational source of truth for the physical shop workflow.

The following sequence occurs inside Forge:

```text
Submitted
→ Tray Assigned
→ In Production
→ Ready to Pack
→ Packed
→ Shipped or Picked Up
```

WooCommerce should not attempt to manage physical tray availability or item-by-item completion.

The digital Forge tray number must match the permanent number on the physical production tray, but that number remains internal to The Hilltop Shop.

The permanent Forge order record must preserve tray history even after the physical tray is released and reused.

WooCommerce synchronization must never:

- Assign a production tray
- Release a production tray
- Mark an individual production item complete
- Determine packing eligibility
- Replace the Forge packing checklist
- Erase internal production history
- Expose tray details to the customer

---

# 22. Customer Matching

Email is the primary matching field.

Phone may be used as a secondary staff aid but must not automatically merge customers by itself.

When multiple WooCommerce customers share an email or matching is ambiguous:

- Do not merge records automatically.
- Create the order with the submitted information.
- Flag for staff review only if necessary.

Production tray assignment must never be used as a customer-matching field.

---

# 23. Error Handling

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
- Tray numbers
- Production notes
- Internal sync history

Staff errors should distinguish between:

- Order safely stored but waiting to sync
- WooCommerce order update failure
- Internal production action failure
- Fulfillment update failure

A WooCommerce error must not falsely report that tray assignment, item completion, or packing succeeded when the internal Forge transaction failed.

---

# 24. Security

- API credentials remain server-side.
- All traffic uses HTTPS.
- Staff actions require authentication.
- Logs must redact credentials and sensitive request headers.
- Customer data access is limited to authorized staff.
- Integration keys use the minimum required permissions.
- Credentials are not committed to GitHub.
- Tray assignment and packing actions require the Staff PIN-protected Forge interface.
- Customer-facing WooCommerce content must not expose internal tray or production records.

Forge Version 1 does not require employee-specific permissions, employee assignments, or individual productivity tracking.

---

# 25. Testing Requirements

Before production use, automated or repeatable tests must verify:

## Order creation and customer records

- One-item order creation
- Multi-item order creation
- Shipping order
- Pickup order
- Existing customer match
- Guest order creation
- Customer information correction

## Products and pricing

- Reindeer quantity discount
- Ordered people and pets
- Custom pet icon
- Quote-required custom request
- Pricing update
- Tax calculation behavior

## Reliability

- Offline save
- Retry after connection returns
- Duplicate-submit prevention
- Duplicate-sync prevention
- Production continuing while sync is pending
- Production changes preserved through later synchronization
- No duplicate customer confirmation emails

## Payment and WooCommerce status

- Payment-status update
- Tray assignment does not change WooCommerce status
- Item completion does not change WooCommerce status
- Ready-to-Pack does not change WooCommerce status
- Packing does not mark WooCommerce completed
- Shipping can complete an eligible WooCommerce order
- Pickup can complete an eligible WooCommerce order
- Cancellation updates WooCommerce when linked

## Privacy and visibility

- Tray number is not customer-visible
- Tray number is not included in customer emails
- Production notes remain private
- Packing checklist remains internal
- Private metadata does not appear on storefront or customer account screens

Testing must use non-production test orders until explicitly approved.

---

# 26. Setup Checklist

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
- Verify that tray assignment sends no customer email.
- Verify that item completion sends no customer email.
- Verify that packing does not mark an order completed.
- Verify that shipped and picked-up states map correctly.
- Verify tray and production details remain private.
- Complete all integration tests.
- Create and successfully fulfill one staff-only live test order from submission through tray assignment, production, packing, and fulfillment.

---

# 27. Official WooCommerce Interfaces

The implementation should use official WooCommerce APIs and order interfaces rather than direct SQL writes.

The WooCommerce REST API supports creating and updating orders, customers, and order notes.

Forge must remain compatible with WooCommerce High-Performance Order Storage by avoiding direct assumptions about WordPress database tables.

Forge production-tray and packing records must remain in Forge-managed storage rather than being written directly into WordPress or WooCommerce database tables.

---

# 28. Version History

## Version 1.1 — 2026-07-16

Expanded the integration specification to support the approved Forge production workflow.

Added:

- Forge authority over production trays, item completion, packing, and tray reuse
- Separation between Forge production status and WooCommerce order status
- Rules preventing production and packing from prematurely completing WooCommerce orders
- Internal-only handling of tray numbers and packing records
- Offline production while WooCommerce synchronization is pending
- Shipment and pickup fulfillment mapping
- Additional production privacy, reliability, and testing requirements

## Version 1.0 — 2026-07-13

Initial approved WooCommerce integration specification for Forge Version 1.
