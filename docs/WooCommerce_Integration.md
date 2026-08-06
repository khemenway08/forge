# WooCommerce Integration

**Version:** 1.2
**Status:** Deferred Design — Approved
**Last Updated:** 2026-08-06

## Purpose

Defines the approved direction for a future Forge-to-WooCommerce integration without describing WooCommerce as part of the current live order path.

## Authority

This document controls future WooCommerce integration behavior. It does not state that the integration is currently implemented.

## Dependencies

- `Forge.md`
- `Product_Definitions.yaml`
- `Database_Schema.md`
- `UI_Guidelines.md`

---

# 1. Current Status

WooCommerce synchronization is deferred.

Current live order path:

```text
Customer Tablet
→ Forge IndexedDB Local Save
→ Forge Shared Server Database
→ Staff Orders and Production
```

Future optional path:

```text
Durable Forge Server Order
→ Server-Side WooCommerce Integration
→ WooCommerce Order Record
```

Do not begin WooCommerce work until Forge backup, restore, duplicate prevention, multi-tablet recovery, and show procedures are proven.

# 2. Integration Goal

WooCommerce may later provide a searchable commercial order record for:

- Customer contact information
- Billing and shipping details
- Fulfillment method
- Ordered products
- Prices
- Personalization
- Customer communication
- Commercial order status

Forge remains authoritative for:

- Immutable Forge order UUID
- Complete submitted order snapshot
- Local recovery
- Production tray assignment
- Tray availability and history
- Item completion
- Ready-to-Pack eligibility
- Internal completion
- Production notes
- Events
- Internal catalog data

WooCommerce must never become the only durable copy of a Forge order.

# 3. Approved Architecture

```text
Customer Tablet
    ↓
Forge Progressive Web App
    ↓
IndexedDB Local Save
    ↓
Forge Server API
    ↓
Forge Shared Database
    ↓
WooCommerce Sync Worker or Server Integration
    ↓
WooCommerce REST API
```

Rules:

- The browser never receives WooCommerce secret credentials.
- All authenticated WooCommerce requests originate from the Forge server.
- Forge stores the order before WooCommerce is contacted.
- WooCommerce outages do not block Forge production after a safe Forge save.
- Synchronization state is visible to staff.

# 4. Prerequisites

Before implementation begins:

- Database restore drill passes.
- Two-tablet simultaneous submission test passes.
- Duplicate prevention is accepted.
- Local-pending recovery is documented.
- Stable Forge lifecycle is approved.
- Payment-handoff pilot is reviewed.
- Current order payload and schema are documented.
- Email ownership between Forge and WooCommerce is decided.
- Tax handling is decided.

# 5. API Access and Security

Use a dedicated WooCommerce integration user with only required permissions.

Required operations may include:

- Read orders
- Create orders
- Update orders
- Read customers for matching
- Create private order notes when approved

Credential rules:

- HTTPS only
- Credentials stored in private server configuration
- No credentials in browser JavaScript
- No credentials in source control
- No credentials in Markdown, screenshots, logs, or customer-visible responses
- Rotate credentials if exposure is suspected

# 6. Customer Record Strategy

Forge must not automatically create WordPress login accounts for show customers.

Approved approach:

1. Search for an existing WooCommerce customer by normalized email address.
2. When one reliable match exists, link the order to that customer.
3. Otherwise create a guest order with complete billing and shipping information.
4. Do not send account-creation or password emails.
5. Preserve the original submitted customer name and email in Forge.

A future optional account feature requires separate approval.

# 7. Order Creation Timing

A WooCommerce order may be created only from a durable Forge server order.

Required sequence:

1. Customer completes the Forge order.
2. Forge saves the order locally.
3. Forge shared server acknowledges the order.
4. Forge returns the shared order number.
5. A server-side integration creates or links the WooCommerce order.
6. Forge stores the linked WooCommerce order ID and synchronization state.

A local-only pending order must not create a WooCommerce order from the browser.

# 8. Current Payment Metadata and Future Mapping

Current Forge behavior:

- Customer or staff selects Card/Square, Cash, or Venmo.
- Pressing **Payment Received — Submit Order** records the method and current timestamp.
- Forge does not independently verify the external payment.
- There is no backend payment approval queue.
- There is no active customer-flow payment PIN.

Future WooCommerce behavior must not misrepresent that metadata as gateway-verified payment.

Possible approved mappings after pilot review:

- Create the WooCommerce order as `processing` when The Hilltop Shop accepts the recorded method as sufficient payment confirmation.
- Create the order as `on-hold` when staff review is still required.
- Store a private note explaining the external method.

The final mapping must be chosen after the real-show payment pilot. Do not hardcode an assumption before that decision.

# 9. Duplicate Prevention

Every synchronized order uses the immutable `forge_order_uuid`.

Before creating a WooCommerce order:

1. Check Forge for an existing linked WooCommerce ID.
2. Search WooCommerce metadata for the same Forge UUID when necessary.
3. Reuse the existing WooCommerce order when found.
4. Create a new order only when no matching record exists.
5. Store the WooCommerce order ID in Forge.

Retries must not create replacement orders.

# 10. WooCommerce Order Status

Forge production status and WooCommerce commercial status are different systems.

Current Forge statuses:

- Submitted
- Tray Assigned
- In Production
- Ready to Pack
- Completed
- Cancelled

Recommended future mapping principles:

| Forge condition | WooCommerce behavior |
|---|---|
| New durable Forge order | Create according to approved external-payment rule |
| Tray assigned | No Woo status change |
| In production | No Woo status change |
| Ready to Pack | No Woo status change |
| Forge completed | Do not automatically mark Woo completed unless fulfillment meaning is approved |
| Forge cancelled | Cancel linked Woo order when safe and approved |

Because current Forge `completed` means internal production completion and tray release, it must not automatically prove carrier shipment or customer pickup.

Until separate fulfillment actions exist, WooCommerce completion may remain a manual staff action or use another approved rule.

# 11. Fulfillment Mapping

## Shipping

WooCommerce should receive:

- Customer name
- Address lines
- City
- State
- Postal code
- Country
- Phone when supported
- Approved shipping method
- Approved shipping amount

## Pickup

WooCommerce should receive:

- Local pickup shipping line or method
- Pickup location when configured
- Forge fulfillment method metadata
- Needed-by information when collected

Forge completion must not automatically claim the package shipped or the customer picked it up.

# 12. Customer Field Mapping

| Forge field | WooCommerce destination |
|---|---|
| Customer full name | Billing first and last name |
| Email | Billing email |
| Phone | Billing phone |
| Address | Billing and shipping fields as applicable |
| Fulfillment method | Shipping line and private metadata |
| Needed-by date | Private order metadata |
| Preferred contact | Private order metadata |

When splitting one full-name field:

- Preserve the original full name in metadata.
- Use a conservative first-name and remaining-name split.
- Do not alter the stored Forge customer snapshot.

# 13. Order Item Mapping

Each Forge payload line becomes one WooCommerce line item or approved custom line.

Include:

- Product display name snapshot
- Quantity
- Unit price
- Line total
- Product definition ID and version
- Size and colors
- Family or primary personalization
- Ordered people and pets
- Pet icons
- Year
- Custom request details
- Customer-visible item notes

Do not expose:

- Tray number
- Staff internal note
- Production status
- Item completion timestamps
- Packing or tray-release details
- Technical sync errors

# 14. Order Metadata

Recommended private metadata:

| Key | Purpose |
|---|---|
| `forge_order_uuid` | Permanent duplicate-prevention link |
| `forge_order_number` | Human-readable Forge reference |
| `forge_source` | Customer kiosk or approved source |
| `forge_device_id` | Originating device when implemented |
| `forge_event_id` | Associated event |
| `forge_submitted_at` | Original customer submission time |
| `forge_payload_version` | Forge payload schema version |
| `forge_fulfillment_method` | Shipping or pickup |
| `forge_external_payment_method` | Recorded external method |
| `forge_payment_recorded_at` | Time Forge recorded the method |

Do not store credentials, raw errors, or private implementation details in metadata.

# 15. Pricing and Taxes

Forge sends the submitted item-price snapshot.

Before implementation, decide whether:

- Forge sends final taxes and totals, or
- WooCommerce calculates taxes and returns the final total.

The customer-visible Forge total and WooCommerce total must not silently disagree.

Any mismatch must create a staff-visible condition before commercial completion.

Quote-required items need a separate approved workflow before synchronization.

# 16. Customer Emails

Choose one owner for the initial order confirmation.

Rules:

- Do not send duplicate confirmations from both Forge and WooCommerce.
- Do not send a WooCommerce email before the Woo order exists.
- Retry must not send another initial confirmation.
- Tray assignment and item completion do not trigger customer emails.
- Ready-to-Pack does not trigger a customer email unless separately approved.
- Forge may continue to send its current confirmation email when WooCommerce is not the selected email owner.

# 17. Synchronization State

Future Forge records should distinguish:

- Not queued
- Pending
- Syncing
- Synced
- Retry waiting
- Needs staff attention
- Conflict

Store:

- Attempt count
- Last attempt time
- Next retry time
- Sanitized error code
- Linked WooCommerce order ID
- Last successful sync time

A WooCommerce failure must never modify the local/server order into an unsafe or missing state.

# 18. Retry Rules

Use increasing retry delays and idempotent operations.

Recommended starting pattern:

- First retry after about 15 seconds
- Second retry after about 1 minute
- Later retries at longer intervals

After repeated failure:

- Preserve the Forge order.
- Show staff a clear waiting or attention-needed state.
- Allow manual retry.
- Never ask the customer to re-enter the order.
- Never create a duplicate WooCommerce order.

# 19. Updates After Creation

Potential future WooCommerce updates:

- Customer correction
- Fulfillment-method change
- Price correction
- Cancellation
- Approved external-payment change
- Shipment
- Pickup

Internal production actions normally do not update WooCommerce:

- Tray assignment
- Item completion
- Ready-to-Pack
- Internal completion
- Tray release
- Production note

# 20. Error Handling

Staff messages must be plain and actionable.

Examples:

- Waiting to Sync
- WooCommerce Could Not Be Reached
- Existing WooCommerce Order Found
- Needs Staff Attention

Do not show:

- API credentials
- Raw JSON responses
- Stack traces
- Server file paths
- Customer data in logs beyond what is operationally necessary

# 21. Testing Requirements

Before production release, test:

- New guest customer
- Existing customer match
- Ambiguous or duplicate email match
- Shipping and pickup
- Multi-item order
- Personalization order
- Quote-required item
- Tax and total agreement
- Same UUID retry
- Network failure before Woo creation
- Network failure after Woo creation but before Forge link save
- Duplicate prevention after process restart
- Cancellation
- Email deduplication
- Credential privacy
- Staff-visible sync states

# 22. Explicit Exclusions

This integration does not add:

- Customer WordPress accounts by default
- Browser-side WooCommerce credentials
- Retail inventory management
- Employee tracking
- Production tray metadata in customer-visible content
- Automatic marketing opt-in
- Promotional SMS

# 23. Version History

## Version 1.2 — 2026-08-06

Changed WooCommerce from an assumed active Version 1 architecture to a deferred server-side integration. Made the durable Forge server order the required starting point, aligned the design with the current payment pilot and completed lifecycle, removed the obsolete payment-PIN requirement, and clarified that Forge completion does not prove shipment or pickup.

## Version 1.1 — 2026-07-16

Defined the original WooCommerce-centered target architecture.
