# Forge

**Version:** 2.3
**Status:** Approved
**Last Updated:** 2026-08-06

## Purpose

Defines the current Forge product vision, operating model, customer experience, production workflow, architecture, and locked Version 1 decisions.

## Authority

This document is the authoritative source for Forge functionality. Implementation details are further defined by:

- `UI_Guidelines.md`
- `Database_Schema.md`
- `Product_Definitions.yaml`
- `Backlog.md`
- `WooCommerce_Integration.md`

When documents conflict, the most recently approved document controls. `Backlog.md` controls development priority and feature status.

---

# 1. Vision

Forge replaces paper order forms and paper production tracking with a fast, visual workflow built specifically for The Hilltop Shop.

Forge guides a custom order from customer entry through durable storage, production tray assignment, item completion, packing confirmation, and operational completion.

Forge should improve:

- Ordering speed
- Order accuracy
- Production visibility
- Physical order location
- Recovery from connectivity problems
- Customer confidence

Forge should reduce:

- Paper
- Duplicate entry
- Reliance on memory
- Lost or invisible orders
- Production mistakes

# 2. Mission

**Capture custom orders better than paper and guide them safely through production.**

# 3. Core Principles

- Customer First
- Visual First
- Simplicity Wins
- One Decision Per Step
- Product Driven
- Durability Before Velocity
- Offline Tolerant
- Tablet First
- Production Aware
- Physical and Digital Workflows Must Match
- Build for the Actual Two-Person Shop

Forge must never trade order durability or recoverability for speed or feature growth.

A normal completed confirmation must not appear before Forge has either:

1. Confirmed the order on the shared Forge server, or
2. Clearly told the user that the order is saved only on the current tablet and is still waiting to upload.

Failures must remain visible and recoverable rather than silently disappearing.

# 4. The Forge Test

Every proposed feature should satisfy at least one of the following:

- Makes ordering faster
- Makes production faster
- Reduces mistakes
- Makes orders easier to locate
- Eliminates paper
- Prevents relying on memory
- Improves order recovery or data safety

Features that do not pass this test should normally wait.

# 5. Current Implementation Checkpoint

Confirmed checkpoint as of 2026-08-06:

```text
Repository: khemenway08/forge
Branch: develop
Commit: 48b48e84bece23bf6378d78ab9001f27b382b9fc
Commit message: Prepare build 20260731-49
Live public build: 20260731-49
Service-worker cache: forge-starter-v49
Automated Node tests: 390 passed
```

Confirmed manual reliability test:

- An order was submitted while offline on an iPad.
- Forge displayed the local saved recovery state.
- Refresh restored the same pending order.
- Reconnecting uploaded the order.
- The order appeared once in Staff Orders.

# 6. Version 1 Scope

## Included and Implemented

### Customer ordering

- The Hilltop Shop customer branding
- Welcome and product-category flow
- Ornament ordering flows
- Multi-item orders
- Customer information
- Shipping and pickup selection
- Final review
- External payment-method recording
- Durable local order save
- Shared Forge server order storage
- Automatic upload retry
- Recovery after refresh or temporary closure
- Thank-you and local-pending states
- Event-gated public ordering
- Test Sessions

### Staff and production

- Forge staff branding
- Staff PIN protection for staff tools
- Staff dashboard
- Staff Orders queue and order detail
- Sequential human-readable Forge order numbers
- Production tray assignment
- Tray conflict prevention
- Item-level completed quantities
- Production progress counts
- Production filters and batch summaries
- Ready-to-Pack queue
- Completion confirmation and tray release
- Order cancellation and tray release
- Internal notes
- Event management
- Completed-order history and filters

### Hilltop Design Catalog

- Staff-only isolated module
- Designs
- Hats
- Materials
- Shortlist
- Finished Hats
- Search and filtering
- Card ordering and sorting
- Design, hat, and material linking
- Finished-hat linking workspace

The catalog remains isolated from customer ordering, payment, production trays, active order status, and inventory.

## Included but Not Fully Proven

- Multi-tablet simultaneous submission behavior
- Multiple staff devices editing the same order
- Full backup and restore recovery
- Old cached-build compatibility
- Originating tablet identification
- Durable item-by-item packing-verification history
- Show-day monitoring and recovery procedures

## Deferred

- WooCommerce synchronization
- Separate Mark Shipped action
- Separate Mark Picked Up action
- Carrier tracking
- Shipping-label purchasing
- Retail inventory
- Customer accounts
- Marketing automation
- Promotional SMS
- AI assistant
- Advanced analytics
- Employee assignments
- Time tracking
- Productivity metrics
- Shift scheduling
- Broad employee-role permissions

# 7. Customer Experience

Current customer flow:

```text
Welcome
→ Choose Product
→ Choose Ornament
→ Customize Product
→ Add Another Item or Continue
→ Customer Information
→ Final Review
→ Select Recorded Payment Method
→ Payment Received — Submit Order
→ Server-Confirmed Thank You or Local Saved Recovery State
```

Customer information is collected once after all products have been added. Shipping remains the default fulfillment method unless the customer selects pickup.

Forge does not process payments. Payment continues through Square, cash, or Venmo.

## Current Payment Handoff Pilot

The current live application works as follows:

1. The customer or staff selects Card/Square, Cash, or Venmo.
2. Selecting a method enables **Payment Received — Submit Order**.
3. Pressing the button records the selected method and the current confirmation timestamp.
4. Forge saves and submits the order.
5. The submitted order enters Staff Orders without a separate backend approval step.

There is no payment PIN in the active customer submission path. The Staff PIN protects staff tools only.

This workflow is being intentionally left unchanged for the first one or two real shows. After those shows, The Hilltop Shop will review whether it caused:

- Unpaid orders
- Accidental submissions
- Abandoned orders in Staff Orders
- Payment-count mismatches
- Confusion about who should press the final button

Do not add a PIN or backend approval queue without evidence that the pilot workflow needs a control.

# 8. Staff Experience

The staff area is protected by a Staff PIN.

Current modules include:

- Dashboard
- Orders
- Ready to Pack
- Events and administrative tools
- Hilltop Design Catalog

The staff interface should answer four practical questions:

1. What needs to be made?
2. Where is every active order?
3. What is ready for final confirmation?
4. What is waiting, blocked, cancelled, or complete?

Forge is optimized for Kyle and Meagan. It must not behave like enterprise manufacturing or workforce software.

# 9. Product System

Products define their own:

- Fields
- Options
- Sizes
- Colors
- Personalization rules
- Images
- Prices
- Production attributes

`Product_Definitions.yaml` is the product-definition source of truth.

Production trays, production status, completion quantities, and staff notes belong to the order workflow rather than product definitions.

# 10. Current Order Lifecycle

Current implemented lifecycle:

```text
Draft
→ Local Save
→ Initial Server Upload Attempt
→ Submitted
→ Tray Assigned
→ In Production
→ Ready to Pack
→ Completed
```

Alternative terminal state:

```text
Submitted / Tray Assigned / In Production / Ready to Pack
→ Cancelled
```

## Lifecycle Meaning

- **Draft:** Not yet submitted and not present in Staff Orders.
- **Local Save:** Complete order record is stored on the current tablet.
- **Submitted:** The shared Forge server has stored the order and no tray is assigned.
- **Tray Assigned:** A physical production tray is assigned.
- **In Production:** At least one physical item has production progress.
- **Ready to Pack:** All required quantities are complete and no blocking condition prevents completion.
- **Completed:** Staff confirmed the physical order is packed or otherwise operationally complete, and the tray was released.
- **Cancelled:** The order is removed from active production and any tray is released.

## Important Distinction

In the current Version 1 implementation, **Completed** is Forge's final internal production state. It means the tray workflow is finished and the tray has been released.

It does not independently prove that a shipping carrier received the package or that a pickup customer physically collected it. Separate shipped and picked-up actions remain deferred.

# 11. Durable Submission and Recovery

Forge uses a local-first, server-confirmed submission process:

1. Generate or retain one immutable Forge order UUID.
2. Save the complete order to IndexedDB on the current tablet.
3. Attempt the initial server upload.
4. Show the normal completed confirmation only after server acknowledgement.
5. When upload cannot be confirmed, display **Order Saved on This iPad** or **Needs Staff Attention** instead of a false completed message.
6. Preserve the same order UUID and payload through retries and refresh.
7. Retry recoverable failures after approximately 15 seconds, 60 seconds, and then 5-minute intervals.
8. Retry again on startup, reconnect, visibility change, scheduled retry, or manual retry.

A local-only order is recoverable only from the tablet that stored it until the shared server confirms the upload.

# 12. Production Tray System

Production trays remain a locked Version 1 workflow decision.

Each active production order may be assigned to one numbered physical tray. Every completed item for the order should remain in that tray until final confirmation.

The digital tray number must match the permanent physical tray number.

Example:

```text
Order 1042
Customer: Hemenway
Tray 12
2 of 3 Complete
```

## Physical Direction

Preferred tray type:

- Shallow
- Durable plastic
- Stackable
- Optical-laboratory or eyeglass job-tray style

Each tray should have:

- Permanent tray number
- Reusable dry-erase customer label

## Assignment Rules

- One active order may have no more than one assigned tray.
- One tray may be assigned to no more than one active order.
- Tray assignment is a staff action.
- Assigned and out-of-service trays are not selectable as available.
- Completion or cancellation releases the active tray.
- Historical assignment records preserve which tray was used.

# 13. Item-Level Production Completion

Forge tracks completed quantity for each order line.

Examples:

- 0 of 3 Complete
- 2 of 3 Complete
- 3 of 3 Complete

Rules:

- Each item begins pending.
- Staff records physical completion after the finished piece is placed in the assigned tray.
- Completed quantity cannot exceed required quantity.
- Forge calculates order progress automatically.
- When every required quantity is complete, the order becomes Ready to Pack.
- Blocking conditions must prevent false readiness.

# 14. Production Batch Workflow

Items may be grouped across orders for efficient production.

Useful grouping and filtering fields include:

- Product
- Ornament type
- Size
- Tree color
- Bow color
- Year
- Production status
- Fulfillment method
- Event
- Open flags
- Tray number

Batch production never changes tray ownership. Each completed physical item returns to the tray assigned to its customer order.

# 15. Ready-to-Pack and Completion Workflow

Only orders with all required quantities complete should enter Ready to Pack.

The completion view should show:

- Order number
- Customer name
- Tray number
- Fulfillment method
- Every expected item
- Required and completed quantities
- Key personalization details
- Blocking notes when applicable

Current primary action:

**Complete & Release Tray**

When staff confirms completion:

- The order becomes `completed`.
- `completed_at` is recorded.
- The active tray is released.
- The tray becomes available for another order.
- Historical tray assignment remains preserved.

The current implementation does not create a separate durable item-by-item packing-verification record. Whether that record is worth adding should be decided after real show use, not assumed.

# 16. Physical Shop Alignment

Forge should mirror the actual production path:

```text
Laser
→ Assembly
→ Production Tray Rack
→ Packing Table
→ Shipping or Pickup
```

The software must not require a major shop redesign.

Initial physical planning remains:

- Approximately 24 trays
- Expandable later
- Simple shelving sized to the selected trays
- Permanent tray numbering
- Reusable customer labels

The physical tray setup is not yet complete and remains an operational priority.

# 17. Data Philosophy

## Current Source of Truth

The current shared operational order record is the Forge server database.

The current tablet-local record is a recovery layer and temporary source when the server cannot be reached.

WooCommerce is not currently synchronized and is not the current source of truth for Forge orders.

## Ownership

Forge currently manages:

- Complete submitted order snapshots
- Customer and fulfillment information
- Product and personalization snapshots
- Payment-method metadata
- Event association
- Order number and UUID
- Tray assignment
- Item completion
- Production status
- Internal notes
- Cancellation
- Completion and tray release
- Outbound confirmation-message records
- Hilltop Design Catalog data

WooCommerce may later become a connected commercial record, but Forge must remain independently durable.

# 18. System Architecture

Current architecture:

```text
Customer Tablet
    ↓
Forge Progressive Web App
    ↓
IndexedDB Local Order Record
    ↓
Forge Server API
    ↓
Forge Shared Database
    ↓
Staff Orders and Production Workflow
```

Future optional extension:

```text
Forge Shared Database
    ↓
Server-Side WooCommerce Integration
    ↓
WooCommerce Order Record
```

The browser-facing application must never contain WooCommerce credentials or private server configuration.

# 19. Design Philosophy

Customer screens use The Hilltop Shop branding and should remain:

- Warm
- Calm
- Visual
- Product-focused
- Easy for a first-time customer

Staff screens use Forge branding and should remain:

- Industrial
- Fast
- Readable
- Touch-friendly
- Focused on the next physical action

Completed screens should not be redesigned as part of unrelated work.

# 20. Personalization Rules

General order:

1. Product
2. Size when applicable
3. Colors when applicable
4. Family or primary personalization
5. People and pets when applicable

For the persistent people/pet entry pattern:

- Type a name.
- Tap **Add**.
- Type the next name.
- Tap **Add**.
- Repeat as needed.

There is no separate Save or Done Adding Names action.

Forge preserves the customer-selected order through production and future synchronization.

# 21. Product Images

Always use real approved product photography for customer ordering.

Do not replace actual product designs with generated illustrations, clip art, or redesigned artwork.

Keep the product visible during customization whenever space allows.

# 22. Locked Decisions

- Multi-item orders are completed before customer information.
- Shipping is the default fulfillment choice.
- Forge does not process payments.
- The current payment-method submission flow remains a pilot until real-show evidence supports a change.
- Staff PIN protects staff tools, not the active customer submission button.
- Forge server storage is the current shared source of truth.
- WooCommerce integration is deferred.
- Tablet-first design remains primary.
- Hilltop branding is customer-facing.
- Forge branding is staff-facing.
- Product definitions drive customer forms.
- Physical numbered trays replace paper production packets.
- One active tray per order.
- One active order per tray.
- Item-level completed quantities determine production progress.
- Ready to Pack requires all required quantities complete.
- Complete & Release Tray is the current final internal production action.
- Completion releases the tray and preserves assignment history.
- Separate shipped and picked-up actions are deferred.
- Version 1 is optimized for Kyle and Meagan.
- Employee-management features are excluded.

# 23. Near-Term Priorities

1. Approve and save the reconciled source documents.
2. Choose and secure the tablets used at shows.
3. Complete the physical production-tray setup.
4. Verify database backup and restore in a nonproduction environment.
5. Run the full two-tablet and interruption test matrix.
6. Create morning-of-show, during-show recovery, and end-of-show reconciliation checklists.
7. Review the payment handoff after one or two real shows.
8. Add device identification and improve visibility of tablet-local pending orders when justified.
9. Decide whether durable item-by-item packing verification is necessary.
10. Begin WooCommerce work only after stability and recovery are proven.

# 24. Success Criteria

- Faster than paper
- Fewer ordering and production mistakes
- Every shared order is visible to staff
- A local-only order is clearly identified and recoverable
- Every active order has a known physical location after tray assignment
- Production progress is visible without checking paper
- Ready-to-Pack orders are identified automatically
- Completion safely releases trays
- Multiple tablets can submit without duplicate or conflicting orders
- Backups can be restored successfully
- Kyle or Meagan can operate the core workflow without special training

# 25. Version History

## Version 2.3 — 2026-08-06

Reconciled the product definition with live build `20260731-49`. Removed the outdated customer payment-PIN workflow, documented the current payment pilot, changed the active terminal production state from Packed to Completed, documented local-first/server-confirmed submission recovery, made Forge server storage the current source of truth, and marked WooCommerce as deferred.

## Version 2.2 — 2026-07-31

Recorded the earlier implementation checkpoint, tray workflow, Hilltop Design Catalog, and stability priorities.

## Version 2.1

Expanded Forge into the production-tray and item-completion workflow.

## Version 2.0

Initial software specification.
