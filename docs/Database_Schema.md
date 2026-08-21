# Database Schema

**Version:** 1.3
**Status:** Approved
**Last Updated:** 2026-08-06

## Purpose

Defines the current Forge data model and clearly separates:

- Tablet-local durability
- Shared Forge server storage
- Production workflow data
- Catalog data
- Future WooCommerce synchronization

## Authority

This document is the authoritative source for current Forge data-storage behavior. SQL migrations remain the executable source for exact production schema changes.

## Dependencies

- `Forge.md`
- `Product_Definitions.yaml`
- `UI_Guidelines.md`
- `WooCommerce_Integration.md`

---

# 1. Current Data Architecture

Forge currently uses two active storage layers.

## Tablet-local storage

IndexedDB stores a complete local order record before shared-server confirmation.

Purpose:

- Survive refresh
- Survive temporary closure
- Survive temporary network loss
- Preserve one immutable order UUID
- Support automatic retry
- Provide a recovery path when the shared server cannot be reached

## Shared Forge server database

The Forge server database is the current shared operational source of truth after upload succeeds.

Purpose:

- Make orders visible across staff devices
- Assign sequential Forge order numbers
- Prevent duplicate storage for the same UUID
- Support tray assignment
- Support item completion
- Support Ready-to-Pack and completion
- Preserve notes, events, cancellations, tray history, and catalog data

## WooCommerce

WooCommerce is not currently synchronized and is not part of the current active data path.

Future synchronization must begin from a durable Forge server record. A WooCommerce failure must never erase or invalidate the Forge order.

# 2. Data Principles

- Every submitted order has one immutable `forge_order_uuid`.
- The complete submitted order is preserved as a historical payload snapshot.
- The payload hash supports conflict and duplicate detection.
- Production data is stored separately from the immutable submitted payload where operational updates are required.
- One active order may have at most one tray.
- One tray may serve at most one active order.
- Tray history remains after release.
- Item completed quantity cannot exceed required quantity.
- A normal completed customer confirmation requires shared-server acknowledgement.
- A local-only order must remain visibly pending or in need of staff attention.
- No feature may require clearing customer orders from IndexedDB.
- Employee, timekeeping, productivity, and shift data are excluded.

# 3. Identifier Rules

## Forge Order UUID

`forge_order_uuid` is the permanent technical identifier.

Rules:

- Generated once for a submitted order session.
- Preserved through local save, upload, retry, refresh, and production.
- Primary key for the shared order record.
- Never reused for a different order.
- Same UUID with the same payload is idempotent.
- Same UUID with a different payload is a conflict requiring staff attention.

## Forge Order Number

`forge_order_number` is the sequential human-readable reference used by staff and customers.

Rules:

- Assigned by the shared Forge server.
- Unique when present.
- Not used as the permanent technical identity.
- Concurrent submission behavior must remain covered by testing.

## Line ID

Each submitted payload item includes a stable line identifier used to connect the immutable order payload to mutable item-production data.

## Tray Number

Each physical tray has one permanent positive integer `tray_number`.

Tray numbers may be reused only after the active assignment is released.

# 4. Local Order Record

The local IndexedDB record stores the complete submitted order plus upload state.

Important fields include:

| Field | Purpose |
|---|---|
| `forge_order_uuid` | Permanent order identity |
| `payload` or normalized submitted record | Complete submitted order snapshot |
| `forge_order_number` | Server-assigned reference after upload |
| `server_upload_status` | `pending`, `uploading`, `stored`, `failed`, or `conflict` |
| `server_upload_attempt_count` | Number of attempted uploads |
| `last_server_upload_attempt_at` | Most recent attempt time |
| `last_server_upload_error` | Sanitized recoverable or nonrecoverable error |
| `server_upload_next_retry_at` | Persisted retry schedule |
| `server_upload_needs_staff_attention` | Indicates a nonretryable condition |
| `server_received_at` | Server acknowledgement time when available |
| `server_payload_sha256` | Server-confirmed payload hash |

Retry delays currently use approximately:

- 15 seconds
- 60 seconds
- 5 minutes for later retries

The local record remains on the originating tablet after server storage and may continue to support local recovery and diagnostics.

# 5. Shared Order Record

The current `forge_orders` table is the shared order header and immutable payload container.

Current implemented fields include:

| Field | Purpose |
|---|---|
| `forge_order_uuid` | Primary key and permanent identifier |
| `forge_order_number` | Sequential human-readable order number |
| `record_version` | Submitted record schema version |
| `source` | Submission source, normally customer kiosk |
| `submitted_at` | Original customer submission time |
| `received_at` | Shared server receipt time |
| `updated_at` | Most recent shared record update |
| `device_id` | Originating device identifier; currently nullable and not populated by active submission |
| `event_id` | Associated Forge event when applicable |
| `internal_note` | Staff internal order note |
| `payload_json` | Complete submitted order snapshot |
| `payload_sha256` | Hash of the complete payload |
| `production_status` | Current operational production state |
| `current_tray_number` | Active tray, or null |
| `ready_to_pack_at` | Time the order became ready |
| `cancelled_at` | Cancellation time |
| `completed_at` | Final internal production-completion time |

## Payload snapshot

`payload_json` preserves:

- Customer information
- Fulfillment choice and address
- Products and quantities
- Submitted pricing snapshot
- Personalization
- Payment-method metadata
- Event context
- Product-definition identifiers and versions
- Item line identifiers

The payload is historical. Later production updates must not rewrite the original customer selections.

# 6. Current Order Production Status

Approved current server statuses:

| Status | Meaning |
|---|---|
| `submitted` | Shared order saved; no active tray |
| `tray_assigned` | Active tray assigned; no completed quantity yet |
| `in_production` | At least one item has production progress |
| `ready_to_pack` | Every required quantity is complete |
| `completed` | Staff completed the final confirmation and released the tray |
| `cancelled` | Order removed from active production |

Normal transition:

```text
submitted
→ tray_assigned
→ in_production
→ ready_to_pack
→ completed
```

Cancellation may occur from an allowed active state and must release the tray in the same transaction.

## Current meaning of Completed

`completed` is the final internal production state in the current implementation.

It means:

- The physical order was confirmed as complete or packed.
- `completed_at` was recorded.
- The active tray was released.

It does not separately record shipment handoff or customer pickup. Those future fulfillment states are deferred.

# 7. Order Item Production Record

The `forge_order_item_production` table stores mutable production progress for each order line.

Current fields:

| Field | Purpose |
|---|---|
| `forge_order_uuid` | Parent order |
| `line_id` | Stable payload line identifier |
| `required_quantity` | Total physical pieces required |
| `completed_quantity` | Physical pieces completed |
| `production_status` | Current line-production state |
| `completed_at` | Time the full quantity became complete |
| `updated_at` | Most recent production update |

Current item statuses:

- `pending`
- `in_production`
- `complete`
- `blocked`
- `cancelled`

Rules:

- `completed_quantity` is never below zero.
- `completed_quantity` never exceeds `required_quantity`.
- A line is complete only when completed quantity equals required quantity.
- A blocked active line prevents Ready-to-Pack.
- Order progress derives from required and completed quantities.
- Item updates use expected and target quantities to prevent conflicting edits.

# 8. Production Tray Record

The `forge_production_trays` table represents the physical tray pool.

Fields:

| Field | Purpose |
|---|---|
| `tray_number` | Permanent physical number |
| `tray_status` | `available`, `assigned`, or `out_of_service` |
| `current_order_uuid` | Active order, or null |
| `assigned_at` | Current assignment start |
| `updated_at` | Most recent tray update |

Rules:

- An available tray has no current order.
- An assigned tray has one current order.
- An out-of-service tray is not selectable.
- Tray assignment and order assignment update together.
- Completion and cancellation release the tray atomically with the order update.

# 9. Tray Assignment History

The `forge_tray_assignment_history` table preserves every tray assignment.

Fields:

| Field | Purpose |
|---|---|
| `tray_assignment_id` | Permanent assignment event identifier |
| `tray_number` | Physical tray used |
| `forge_order_uuid` | Assigned order |
| `assigned_at` | Assignment time |
| `released_at` | Release time, or null while active |
| `release_reason` | Why the tray became available |

Implemented release reasons include operational values for completion, cancellation, test-order deletion, cleanup, and administrative cases.

Historical tray assignment remains available after the tray is reused.

# 10. Event Data

Forge stores server-backed event records used to control public ordering and associate orders with a show or Test Session.

Event data includes the operational fields required to:

- Name an event
- Identify event type
- Store date range and location
- Open or close ordering
- Resolve an active event or public-order token
- Associate submitted orders with an event

Exact event columns are controlled by the applicable migration and server repository.

# 11. Internal Notes

The shared order record includes an internal staff note.

Rules:

- Staff notes are not customer-visible.
- Customer spelling and submitted personalization remain unchanged.
- Staff notes do not replace structured production status.
- Notes must be length-limited and safely rendered.

# 12. Outbound Messages

Forge stores outbound-message records for order-confirmation email delivery and retry control.

Purpose:

- Prevent duplicate confirmation messages
- Track pending, sent, or failed delivery
- Preserve sanitized error state
- Separate order durability from email success

An email failure must not make the order disappear or reverse production progress.

# 13. Hilltop Design Catalog Data

Catalog data is stored in dedicated Forge tables separate from customer orders.

Current catalog areas include:

- Designs
- Hats
- Materials
- Finished Hats
- Linking relationships
- Sort order and display status

## Blank Hat Inventory

Blank Hat stock is stored in the reusable inventory domain, not as quantity columns on `forge_catalog_hats`.

- `forge_inventory_items` identifies an inventory-tracked subject. The current subject type is `catalog_hat`.
- `on_hand_quantity` is nullable: `NULL` means **Not Counted**, while `0` is a confirmed physical count of zero.
- `version` supports optimistic concurrency-safe count and adjustment updates.
- `forge_inventory_movements` is immutable history with the prior and confirmed quantities, reason, optional note, and timestamp.
- The first physical count uses `reason_code = initial_count`, `quantity_before = NULL`, `quantity_after = confirmed quantity`, and `quantity_delta = NULL`. It intentionally does not invent a numeric delta from an unknown quantity.
- Later movements record their signed delta and use `received`, `used_removed`, or `correction` reasons.

Blank Hats have one global on-hand quantity; no inventory location is exposed or stored for them.

## Finished Hat Location Inventory

Finished Hats use the same inventory-item and immutable-movement concepts with `tracking_mode = by_location`.

- `forge_inventory_locations` is the normalized, reusable location directory. It seeds Hilltop as an internal location and supports active/inactive boutique, consignment, and external locations.
- `forge_inventory_location_balances` explicitly assigns a location to an inventory item. Unassigned locations are not applicable to that Finished Hat; an assigned balance with `NULL` quantity is **Not Counted**; `0` is confirmed zero.
- A Finished Hat total is derived only from confirmed assigned balances. No assigned balances is Not Counted; any uncounted assigned balance makes the result partial; only fully counted assignments produce Total On Hand.
- `forge_inventory_movements` optionally carries a location and transfer ID. Transfers write paired immutable Transfer Out and Transfer In movements in one transaction.

Legacy Finished Hat `placement_status` and `location_label` remain catalog metadata only. They do not derive stock, locations, sold quantity, or inventory totals.

Inventory is Hilltop-specific in this release. It contains no Square, WooCommerce, or provider identifiers; a future external mapping boundary can be added without coupling the core inventory records to Square.

Rules:

- Catalog records do not change order totals.
- Catalog records do not assign trays.
- Catalog records do not create production work.
- Catalog costs are internal.
- Deleting or changing a catalog record must not rewrite historical submitted order payloads.

# 14. Completion Verification

Current durable records preserve:

- Item completed quantities
- Item completion timestamps
- Order Ready-to-Pack time
- Order `completed_at`
- Tray release history

The current schema does **not** define a separate durable packing-verification table containing every checked item.

That remains a future decision. Do not describe a dedicated packing-verification record as implemented unless a migration and server workflow are added.

# 15. Payment Metadata

The submitted payload currently records:

- Selected external payment method
- Payment confirmation timestamp generated when the final submit action is pressed

Current accepted methods include:

- `card_square`
- `cash`
- `venmo`

This metadata records the selected workflow state. The current application does not independently verify Square, cash, or Venmo payment receipt.

There is no backend payment-approval record in the current schema.

# 16. Device Identification

The shared schema supports nullable `device_id`, but active customer submission currently sends a null device identifier.

Consequences:

- Staff cannot reliably identify which tablet originated a shared order.
- A local-only pending order can be recovered only from the tablet storing it.
- Cross-device diagnostics are limited.

Stable business-safe device identification remains planned.

# 17. Data Integrity Constraints

Forge must enforce:

1. Unique immutable `forge_order_uuid`.
2. Unique human-readable order number when assigned.
3. Same UUID and same payload is idempotent.
4. Same UUID and different payload is a conflict.
5. Unique permanent tray number.
6. One active tray per order.
7. One active order per tray.
8. Active assignment and tray state remain consistent.
9. Released assignment remains in history.
10. Completed quantity remains within valid range.
11. Ready to Pack requires all active required quantities complete.
12. Completion requires Ready-to-Pack state and releases the tray atomically.
13. Cancellation releases an active tray atomically.
14. Original `payload_json` remains historically intact.
15. Failed upload never erases the tablet-local record.
16. Email failure never erases the order.
17. Catalog data remains isolated from order production.

# 18. Migration and Compatibility

Current migration sequence includes:

```text
001  Create Forge orders
002  Add production trays and assignment history
003  Add item production completion and ready-to-pack time
004  Create catalog designs
005  Create catalog hats
006  Create catalog materials
007  Create catalog finished hats
008  Add catalog sort order
009  Add sequential order numbers
010  Create Forge events
011  Add internal order notes
012  Add legacy cleanup tombstones
013  Add cancelled_at
014  Create outbound messages
015  Add completed_at
016  Add Design create idempotency
017  Create reusable inventory items and movements
```

Compatibility rules:

- Never clear production or customer records merely to deploy a feature.
- Older local records must normalize safely at read time.
- Viewing an old record must not silently rewrite it.
- Migrations must be versioned, restart-safe, and reviewed before production use.
- Migration `009` has a production bookkeeping discrepancy under investigation. Do not run it blindly merely because a check reports it missing.

# 19. Future WooCommerce Fields

WooCommerce-specific fields such as linked WooCommerce order ID, Woo status, sync attempts, and commercial fulfillment state are not part of the current active schema unless explicitly added later.

Future integration must:

- Preserve Forge UUID
- Preserve the complete Forge order
- Remain idempotent
- Never expose credentials to the browser
- Never treat WooCommerce as the only copy of an order

# 20. Explicit Exclusions

Do not add schema entities for:

- Employee assignment
- Employee performance
- Time clocks
- Productivity tracking
- Shift scheduling
- Workload balancing
- Enterprise departments
- Broad role hierarchies
- Marketing automation
- Promotional SMS

# 21. Version History

## Version 1.3 — 2026-08-06

Replaced the future-state schema description with the current local-plus-server architecture. Documented the implemented order, item, tray, history, event, message, and catalog storage; changed the terminal production state from packed to completed; documented the absence of a durable packing-verification table, device identification, backend payment approval, and active WooCommerce fields.

## Version 1.2 — 2026-07-16

Defined the original target production-tray, item-completion, packing, and fulfillment model.
