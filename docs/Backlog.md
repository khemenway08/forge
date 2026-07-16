# Backlog

**Version:** 1.2
**Status:** Approved
**Last Updated:** 2026-07-16

## Purpose

Defines the approved Forge Version 1 development sequence and separates immediate production requirements from deferred ideas.

## Authority

This document is the authoritative source for Forge milestone priority and feature status.

## Dependencies

- `Forge.md`
- `UI_Guidelines.md`
- `Database_Schema.md`
- `Product_Definitions.yaml`
- `WooCommerce_Integration.md`

---

# 1. Prioritization Rule

Every proposed Forge feature must satisfy at least one part of the Forge Test:

- Makes ordering faster
- Makes production faster
- Reduces mistakes
- Makes orders easier to locate
- Eliminates paper
- Prevents relying on memory

Features that do not satisfy at least one of these should normally wait for Version 2.

Forge Version 1 is designed for The Hilltop Shop's two-person workflow. It must not become enterprise manufacturing software.

---

# 2. Current Confirmed Checkpoint

## Completed and Working

- Customer ordering flow
- Multiple ornament types
- Dynamic product catalog
- Shared pricing engine
- Reindeer quantity discount
- Payload builder
- Development payload preview
- Durable local order storage using IndexedDB
- Order submission flow
- Thank You screen
- Staff local orders queue
- Staff order detail viewer
- Production filtering data foundation
- Successful iPad testing

The customer workflow has been validated by a first-time user completing an order without instruction.

## Latest Confirmed Repository Checkpoint

```text
Branch: develop
Commit: 429d530
Message: Add read-only staff local orders queue
```

---

# 3. Version 1 Critical Development Sequence

The following milestone order is approved. Work should proceed one feature at a time unless a small supporting change is inseparable from the active milestone.

## Milestone 1 — Production Tray Assignment

**Priority:** Critical
**Status:** Next

Forge must allow staff to assign one available physical production tray to one submitted order.

Required behavior:

- Display available tray numbers.
- Assign one tray to an order.
- Prevent one tray from being assigned to multiple active orders.
- Prevent one order from receiving multiple active trays.
- Display order number, customer name, tray number, and production status together.
- Preserve the tray assignment in the order record.
- Support older IndexedDB orders without requiring data deletion.
- Keep the existing order queue and detail viewer visually consistent.

Not included in this milestone:

- Item completion controls
- Ready-to-Pack queue
- Packing verification
- Tray release
- Batch counts
- WooCommerce synchronization

---

## Milestone 2 — Item-Level Production Completion

**Priority:** Critical
**Status:** Planned

Forge must track completion for every physical item in an assigned order.

Required behavior:

- Each order item begins as pending.
- Staff can mark an item or required quantity complete.
- Completed items represent finished pieces placed in the assigned tray.
- Forge automatically calculates order progress.
- Display progress such as `2 of 3 Complete`.
- Blocked or unresolved items remain visibly incomplete.
- Completion changes must persist after refresh or app closure.

Forge must not require employee assignment or record which person completed an item.

---

## Milestone 3 — Ready-to-Pack Queue

**Priority:** Critical
**Status:** Planned

Forge must automatically identify orders eligible for packing.

Required behavior:

- Only orders with all required production items complete may enter Ready to Pack.
- Open blocking flags prevent automatic readiness.
- Display order number, customer, tray number, fulfillment method, and item summary.
- Keep Ready to Pack separate from Packed, Shipped, and Picked Up.

---

## Milestone 4 — Packing Verification and Tray Release

**Priority:** Critical
**Status:** Planned

Forge must provide a final physical verification step before an order is packed.

Required behavior:

- Show every expected item in the tray.
- Require staff verification before selecting **Pack Order**.
- Record the packed timestamp.
- Change the order status to packed.
- Release the production tray immediately after packing.
- Make the released tray available for another order.
- Preserve the historical tray number on the completed order.
- Keep fulfillment status separate from packing status.

Cancelling an active order must also release its tray safely.

---

## Milestone 5 — Production Batch View and Filtering

**Priority:** Critical
**Status:** Planned

Forge must help staff produce similar items together while preserving each item's customer tray destination.

### Production Filtering

Required filters:

- Product
- Ornament Type
- Size
- Tree Color
- Bow Color
- Year
- Production Status
- Shipping / Pickup
- Event
- Open Flags

Rules:

- Filters use structured item attributes.
- One individual item must satisfy the full active filter combination.
- Separate items in one order must not combine to create a false match.
- Previously stored orders without normalized attributes must remain searchable through backward-compatible normalization.

### Production Batch View

Forge should automatically group matching production items and show counts.

Examples:

- 14 × Large Family Tree / Green / Red Bow
- 9 × Present Stack / White Bow
- 3 × Veteran Flag
- 2 × Custom Icon Requests

Batch records must retain:

- Order number
- Customer name
- Tray number
- Item identity
- Item completion state

Finished batch items must be returned to the tray assigned to their customer order.

---

## Milestone 6 — WooCommerce Server Synchronization

**Priority:** Critical
**Status:** Planned

WooCommerce remains the primary customer and order record once synchronization is implemented.

Required behavior is governed by `WooCommerce_Integration.md` and includes:

- Server-side credential handling
- Local save before synchronization
- Immutable Forge order UUID
- Duplicate prevention
- Guest and existing-customer handling
- Complete line-item personalization metadata
- Pending offline queue
- Automatic retry
- Manual retry after repeated failure
- Visible sync status for staff
- No customer data loss during connectivity failures

Production tray data remains internal Forge operational data unless an explicitly approved private WooCommerce metadata mapping is added.

---

## Milestone 7 — Fulfillment Completion

**Priority:** High
**Status:** Planned

Forge must distinguish packing from final fulfillment.

Required behavior:

- Mark packed shipping orders as shipped.
- Mark packed pickup orders as picked up.
- Record the fulfillment timestamp.
- Prevent fulfillment before packing verification.
- Update WooCommerce only when the corresponding integration rules permit it.

Shipping-label purchasing and carrier integrations are not required for Version 1.

---

# 4. Supporting Version 1 Work

These items remain required but should be implemented when they support the active critical milestone.

## Staff PIN Protection

**Priority:** High
**Status:** Planned

Protect staff-only screens with a simple Staff PIN.

Version 1 does not require employee-specific permissions, roles, or activity tracking.

## Progressive Web App Hardening

**Priority:** High
**Status:** Planned

- Installable tablet experience
- Offline-tolerant static application shell
- Reliable refresh and reopening behavior
- Clear connection and synchronization states

## Production Data Migration and Normalization

**Priority:** High
**Status:** Planned / Incremental

- Preserve existing IndexedDB orders.
- Derive missing production fields without forcing database deletion.
- Avoid rewriting historical records merely by viewing them.
- Keep normalization reusable for local, server, and WooCommerce records.

## Error and Recovery States

**Priority:** High
**Status:** Planned / Incremental

Forge must provide plain, actionable recovery messages without exposing technical details.

---

# 5. Explicitly Excluded From Version 1

Do not build:

- Employee assignments
- Time tracking
- Productivity metrics
- Shift scheduling
- Workload balancing
- Employee-specific permissions beyond a Staff PIN
- Retail inventory
- Point-of-sale processing
- Marketing automation
- Promotional SMS
- AI assistant
- Advanced analytics
- Shipping-label purchasing
- Employee performance reporting

These exclusions should not be added indirectly through production screens or database fields.

---

# 6. Version 2 Candidates

Potential later work includes:

- Retail inventory
- Barcode or QR tray scanning
- Shipping-label integration
- Customer accounts
- Optional AI assistance
- Advanced production analytics
- Broader multi-user permissions if the shop genuinely grows beyond the Version 1 operating model

Version 2 candidates are not approved for current implementation merely because they appear in this section.

---

# 7. Physical Production Research

Physical purchasing decisions are operational research rather than application features.

Continue evaluating:

- Industrial optical-laboratory or eyeglass job trays
- Best tray pricing
- Case quantities
- Exact tray dimensions
- Durable permanent number labels
- Reusable dry-erase customer labels
- A 24-tray rack expandable to approximately 36 trays

Software implementation must not hardcode physical dimensions or a maximum of 24 trays. The tray inventory must remain configurable.

---

# 8. Development Workflow

For every feature:

1. Confirm the repository is on `develop` and synchronized.
2. Read the approved source documents.
3. Implement only the active milestone.
4. Preserve completed screens and interaction patterns.
5. Perform manual QA.
6. Report exact files changed.
7. Provide Git verification commands.
8. Do not commit or push unless Kyle explicitly instructs it.
