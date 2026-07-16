# Database Schema

**Version:** 1.2
**Status:** Approved
**Last Updated:** 2026-07-16

## Purpose

Defines the Forge Version 1 data model for customer orders, structured production attributes, production trays, item completion, packing, and fulfillment.

## Authority

This document is the authoritative source for Forge data-storage behavior.

## Dependencies

- `Forge.md`
- `Product_Definitions.yaml`
- `WooCommerce_Integration.md`

---

# 1. Data Principles

Forge data must support the complete Version 1 workflow:

```text
Customer Submission
→ Production Tray
→ Batch Production
→ Ready to Pack
→ Packed
→ Shipped or Picked Up
```

The schema must:

- Preserve every submitted order even when synchronization is unavailable.
- Preserve the original product configuration as a historical snapshot.
- Store structured attributes for searching, filtering, and batching.
- Track the physical tray currently holding an order.
- Track completion at the individual order-item level.
- Preserve tray-assignment history after a tray is released and reused.
- Avoid employee-management, time-tracking, productivity, and workforce-scheduling data.

WooCommerce remains the primary customer and order record after server synchronization is implemented. Forge remains authoritative for production workflow, tray assignment, item completion, packing verification, and production notes.

---

# 2. Identifier Rules

## Forge Order UUID

Every submitted order receives an immutable `forge_order_uuid`.

Rules:

- Generated once at submission.
- Never reused.
- Used for local storage, server synchronization, WooCommerce duplicate prevention, and production records.
- Must remain stable throughout the order lifecycle.

## Forge Order Number

Every submitted order also receives a human-readable `forge_order_number`.

Example:

```text
1042
```

The human-readable number is for staff and customer reference. The UUID remains the permanent technical identifier.

## Order Item ID

Every order item receives an immutable `order_item_id` unique within Forge.

The item ID must remain stable when:

- The order is filtered.
- The item is marked complete.
- The order is synchronized.
- The order is packed.

## Tray Number

Each physical production tray has one permanent positive integer `tray_number`.

Examples:

```text
1
12
23
```

Tray numbers are reusable only after the prior order has been packed and the assignment has been released.

---

# 3. Order Record

Each submitted order stores the customer, fulfillment, pricing, synchronization, and production information required to complete the order.

## Required Order Fields

| Field | Type | Purpose |
|---|---|---|
| `forge_order_uuid` | UUID/string | Permanent Forge identifier |
| `forge_order_number` | string/integer | Human-readable order number |
| `submitted_at` | timestamp | Original customer submission time |
| `updated_at` | timestamp | Most recent record update |
| `customer_json` | object | Complete customer-information snapshot |
| `fulfillment_method` | enum | `shipping` or `pickup` |
| `fulfillment_json` | object | Shipping or pickup details |
| `pricing_json` | object | Submitted pricing snapshot |
| `order_items` | array/relation | Complete submitted items |
| `sync_status` | enum | WooCommerce synchronization state |
| `woocommerce_order_id` | nullable string/integer | Linked WooCommerce order after sync |
| `production_status` | enum | Current Forge production lifecycle state |
| `current_tray_number` | nullable integer | Active physical tray assignment |
| `total_item_count` | integer | Number of production items in the order |
| `completed_item_count` | integer | Number of completed production items |
| `ready_to_pack_at` | nullable timestamp | When all required items became complete |
| `packed_at` | nullable timestamp | When packing verification was completed |
| `fulfilled_at` | nullable timestamp | When shipped or picked up |
| `open_flags` | array | Active order-level exceptions requiring attention |

## Derived Count Rules

`total_item_count` and `completed_item_count` are derived from the active order items.

They must not be maintained as independent, manually editable values.

Rules:

- `total_item_count` equals the number of production items in the order.
- `completed_item_count` equals the number of items with `production_status: complete`.
- Progress is displayed as `completed_item_count of total_item_count Complete`.
- Quantity greater than one must be represented consistently according to the existing order-item model. If one line item represents multiple physical pieces, completion tracking must still account for each required physical piece or explicitly track completed quantity.

Example:

```text
2 of 3 Complete
```

---

# 4. Production Status

Order production status is separate from payment status, WooCommerce synchronization status, and customer-visible WooCommerce order status.

## Approved Order Production Statuses

| Status | Meaning |
|---|---|
| `submitted` | Order safely saved but no tray assigned |
| `tray_assigned` | A production tray is assigned; work has not yet been marked in progress |
| `in_production` | At least one item is being produced or completed |
| `ready_to_pack` | All required items are complete and the order is eligible for packing |
| `packed` | Packing verification completed and the tray released |
| `shipped` | Packed shipping order has been handed off for shipment |
| `picked_up` | Packed pickup order has been collected |
| `cancelled` | Order cancelled and no longer active |

## Status Transition Rules

Approved normal transitions:

```text
submitted
→ tray_assigned
→ in_production
→ ready_to_pack
→ packed
→ shipped or picked_up
```

Rules:

- Assigning a tray changes `submitted` to `tray_assigned`.
- Completing or starting an item may change `tray_assigned` to `in_production`.
- When every required item is complete, Forge changes the order to `ready_to_pack`.
- Only `ready_to_pack` orders appear in the packing queue.
- Packing verification changes the order to `packed` and releases the tray.
- `packed` does not automatically mean `shipped` or `picked_up`.
- Cancelling an order releases any active tray assignment.
- Reopening or reversing a completed production step must be an intentional staff action and must preserve history.

---

# 5. Order Item Record

Every submitted item stores both its full historical configuration and normalized production information.

## Required Order Item Fields

| Field | Type | Purpose |
|---|---|---|
| `order_item_id` | UUID/string | Stable item identifier |
| `forge_order_uuid` | UUID/string | Parent order |
| `product_definition_id` | string | Product definition used at submission |
| `product_definition_version` | string | Product-definition snapshot version |
| `product_display_name` | string | Submitted display-name snapshot |
| `quantity` | integer | Number ordered |
| `unit_price` | decimal | Submitted unit-price snapshot |
| `line_total` | decimal | Submitted calculated line total |
| `configuration_json` | object | Complete historical personalization snapshot |
| `production_attributes` | object | Structured searchable production values |
| `production_status` | enum | Current item production state |
| `completed_quantity` | integer | Number of physical pieces completed |
| `completed_at` | nullable timestamp | When the item became fully complete |
| `production_note` | nullable string | Internal production-specific note |
| `open_flags` | array | Item-level exceptions requiring attention |

## Approved Item Production Statuses

| Status | Meaning |
|---|---|
| `pending` | Not yet started |
| `in_production` | Work has begun |
| `complete` | All required quantity is finished and placed in the assigned tray |
| `blocked` | Cannot be completed until an exception is resolved |
| `cancelled` | Item removed from active production through an intentional order change |

## Item Completion Rules

- A newly submitted item begins as `pending`.
- Marking an item complete means the finished physical item has been placed into the order's assigned production tray.
- `completed_quantity` cannot exceed `quantity`.
- An item becomes `complete` only when `completed_quantity` equals `quantity`.
- If a completed item is reopened, `completed_at` is cleared or superseded by an audit event.
- Item completion must update the parent order's derived counts immediately.
- When all non-cancelled items are complete, the parent order becomes `ready_to_pack`.
- A blocked item prevents the order from becoming `ready_to_pack`.

---

# 6. Structured Production Attributes

Every order item stores searchable attributes in addition to `configuration_json`.

`configuration_json` remains the complete historical record. Structured attributes exist to support fast searching, filtering, production counts, and batch grouping.

## Common Attributes

Store these fields when applicable:

- `product_definition_id`
- `category`
- `ornament_type`
- `size`
- `tree_color`
- `bow_color`
- `family_name`
- `year`
- `icon`
- `letter`
- `people_count`
- `pet_count`
- `fulfillment_method`
- `production_status`
- `open_flags`

Rules:

- Use stable product-definition and option keys rather than display-text parsing whenever available.
- Non-applicable values must be omitted or stored as `null` consistently.
- Structured values must not replace or reduce `configuration_json`.
- Customer-selected people and pet ordering remains preserved in the full configuration snapshot.
- Custom icon and custom artwork requests must create discoverable open flags.
- Historical items must retain submitted display names, prices, and configuration even after product definitions change.

## Backward Compatibility

Previously stored orders may not contain `production_attributes`.

Forge must:

- Continue loading those orders without requiring IndexedDB deletion.
- Derive normalized attributes at read time using a pure normalization function.
- Avoid rewriting an old record merely because staff viewed or filtered it.
- Store normalized attributes directly on new submissions when practical.
- Reuse the same normalization rules for future server and WooCommerce synchronization.

---

# 7. Production Tray Record

A production tray represents one numbered physical optical-laboratory-style job tray in the shop.

## Required Tray Fields

| Field | Type | Purpose |
|---|---|---|
| `tray_number` | positive integer | Permanent physical tray number |
| `tray_status` | enum | Current availability |
| `current_order_uuid` | nullable UUID/string | Order currently assigned to the tray |
| `assigned_at` | nullable timestamp | Start of current assignment |
| `updated_at` | timestamp | Most recent tray update |

## Approved Tray Statuses

| Status | Meaning |
|---|---|
| `available` | Ready to receive an order |
| `assigned` | Currently holding an active order |
| `out_of_service` | Temporarily unavailable because of loss, damage, cleaning, or another physical issue |

## Tray Rules

- `tray_number` is unique and permanent.
- One tray may have no more than one active order.
- One order may have no more than one active tray.
- An available tray has no `current_order_uuid`.
- Assigning a tray sets `tray_status` to `assigned`.
- Packing or cancelling the assigned order releases the tray.
- Releasing a tray sets `tray_status` to `available` and clears `current_order_uuid`.
- Releasing a tray must not erase the assignment history.
- Tray numbers may be reused for later orders only after release.
- Forge must prevent simultaneous assignment of the same tray to two orders.
- Forge must prevent simultaneous assignment of two trays to one order.

The dry-erase customer surname written on the physical tray is an operational label. Forge stores the customer name in the order record and does not need a separate permanent tray-label field.

---

# 8. Tray Assignment History

Every tray assignment creates a permanent history record.

## Required Assignment Fields

| Field | Type | Purpose |
|---|---|---|
| `tray_assignment_id` | UUID/string | Permanent assignment-event identifier |
| `tray_number` | integer | Physical tray used |
| `forge_order_uuid` | UUID/string | Assigned order |
| `assigned_at` | timestamp | Assignment time |
| `released_at` | nullable timestamp | Release time |
| `release_reason` | nullable enum/string | Why the tray became available |

## Approved Release Reasons

- `packed`
- `cancelled`
- `reassigned`
- `administrative_correction`

Rules:

- An active assignment has no `released_at`.
- A tray assignment becomes historical when `released_at` is populated.
- Historical assignments are immutable except for documented administrative correction.
- Order history must continue to show which tray was used after the tray is released.
- The active tray reference and the historical assignment record must be updated together.

---

# 9. Packing Verification

Packing verifies that every completed item belonging to one order is physically present before the tray is released.

## Required Packing Record Fields

| Field | Type | Purpose |
|---|---|---|
| `packing_verification_id` | UUID/string | Permanent verification identifier |
| `forge_order_uuid` | UUID/string | Packed order |
| `tray_number` | integer | Tray used immediately before packing |
| `verified_item_ids` | array | Items confirmed during packing |
| `verified_at` | timestamp | Verification completion time |
| `packing_note` | nullable string | Internal exception or packing note |

Rules:

- Only an order with `production_status: ready_to_pack` may be packed.
- Every non-cancelled item must be complete and verified.
- The verification record preserves the tray number even after release.
- Completing packing sets the order status to `packed`.
- Completing packing releases the active tray in the same logical operation.
- Forge must never release the tray first and leave the order unpacked because of a partial failure.
- Packing does not automatically mark a shipping order as shipped or a pickup order as picked up.

---

# 10. Production Filtering Requirements

Forge Version 1 must allow staff to filter production data by:

- Product
- Ornament type
- Size
- Tree color
- Bow color
- Year
- Production status
- Shipping or pickup
- Event, when event data exists
- Open production flags
- Tray number
- Ready-to-pack state

Production filters operate at the order-item level when matching item attributes.

One item must satisfy the complete active item-filter combination. Separate items in the same order must not be combined to create a false match.

---

# 11. Production Counts and Batch Grouping

Forge should support grouped production counts such as:

- `14 × Tree Ornament / Large / Green / Red Bow`
- `8 × Present Stack / White Bow`
- `3 × Veteran Flag`
- `2 × Custom Icon Requests`

Batch grouping supports manufacturing efficiency. It does not change tray ownership.

Rules:

- Items may be produced in batches across many orders.
- Each completed physical item must return to the tray assigned to its parent order.
- Batch completion updates the corresponding individual order items.
- The dashboard must retain the connection between each batch item, order, customer, and tray.

---

# 12. Open Flags

Open flags identify exceptions that could prevent correct production or fulfillment.

Examples:

- `custom_icon`
- `custom_artwork`
- `missing_information`
- `production_blocked`
- `sync_failed`
- `total_changed_after_tax`

Rules:

- Flags may exist at order or item level.
- Resolving a flag must not erase its historical existence when audit history is implemented.
- A blocking production flag prevents the affected item from being treated as complete.
- Internal flags must not appear in customer-visible WooCommerce content.

---

# 13. Local Storage and Synchronization

Until server synchronization is complete, IndexedDB stores the durable local order record.

Rules:

- Submitted orders must survive refresh, temporary application closure, and temporary internet loss.
- Production updates must use safe, atomic local writes where supported.
- Tray assignment must not create duplicate active assignments after a retry or refresh.
- Packing and tray release must be performed as one logical transaction.
- Future server synchronization must use immutable UUIDs and idempotent operations.
- A failed synchronization must never erase local production data.

When the Forge server becomes available:

- Server data becomes the shared source for multiple staff devices.
- WooCommerce remains the primary customer and commercial order record.
- Forge server data remains authoritative for tray assignment and item-level production workflow.

---

# 14. Data Integrity Constraints

Forge must enforce the following:

1. `forge_order_uuid` is unique and immutable.
2. `order_item_id` is unique and immutable.
3. `tray_number` is unique and permanent.
4. One tray has at most one active assignment.
5. One order has at most one active tray.
6. A released assignment remains in history.
7. `completed_quantity` is between zero and `quantity`.
8. `completed_item_count` never exceeds `total_item_count`.
9. `ready_to_pack` requires every active item to be complete.
10. Packing requires `ready_to_pack` status.
11. Packing records tray release atomically.
12. `shipped` applies only to shipping orders.
13. `picked_up` applies only to pickup orders.
14. Customer, pricing, and configuration snapshots remain historically intact.
15. Production fields never overwrite WooCommerce payment or synchronization fields.

---

# 15. Explicit Version 1 Exclusions

Do not add schema entities or fields for:

- Employee assignments
- Staff productivity metrics
- Time clocks or time tracking
- Shift scheduling
- Workload balancing
- Department routing
- Enterprise role hierarchies
- Employee permissions beyond the separate Staff PIN access model

Forge Version 1 assumes production is operated by Kyle and Meagan.

---

# 16. Migration and Compatibility

Production workflow features will be introduced after orders already exist in IndexedDB.

Migration rules:

- Existing submitted orders default to `production_status: submitted` when no production status exists.
- Existing orders default to `current_tray_number: null`.
- Existing items default to `production_status: pending` and `completed_quantity: 0`.
- Existing order counts are derived from saved item data.
- Missing structured attributes are normalized at read time.
- No feature may require clearing production or customer orders from IndexedDB.
- Viewing an older order must not silently rewrite it.
- Explicit migrations must be versioned, restart-safe, and idempotent.

---

# 17. Version History

## Version 1.2 — 2026-07-16

Added:

- Production tray records
- Tray assignment history
- Order and item production statuses
- Item-level completion
- Ready-to-pack rules
- Packing verification
- Tray release and reuse
- Production workflow integrity constraints
- Version 1 workforce-feature exclusions
- Backward-compatibility rules for existing local orders

Retained and expanded:

- Structured production attributes
- Production filtering
- Production counts and batch grouping

## Version 1.1

Added structured item attributes for production filtering and batching.
