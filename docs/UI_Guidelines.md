# UI Guidelines

**Version:** 2.2
**Status:** Approved
**Last Updated:** 2026-08-06

## Purpose

Defines the official Forge interface standards for the customer ordering experience, staff production workflow, reliability states, and Hilltop Design Catalog.

## Authority

This document is the authoritative source for Forge interface decisions.

## Dependencies

- `Forge.md`
- `Database_Schema.md`
- `Product_Definitions.yaml`

---

# 1. Brand Identity

Forge contains two distinct experiences.

## Customer Experience

**Brand:** The Hilltop Shop
**Purpose:** Warm, welcoming, handcrafted, boutique.

Use only approved The Hilltop Shop branding and real product photography.

## Staff Experience

**Brand:** Forge
**Purpose:** Industrial, efficient, focused.

The staff interface is for Kyle and Meagan. It should prioritize speed, visibility, touch use, and mistake prevention rather than enterprise controls.

# 2. Brand Personality

## Customer

- Warm
- Friendly
- Simple
- Visual
- Calm
- Product-focused

## Staff

- Industrial
- Rugged
- Fast
- Minimal
- Professional
- Production-focused

Kyle or Meagan should understand an order's current state without training or interpretation.

# 3. Official Logos

## Customer Interface

Use only approved The Hilltop Shop logos.

## Staff Interface

Use only approved Forge logos.

Rules:

- Never recreate official logos with AI.
- Never substitute fonts inside official logo artwork.
- Use approved vector or exported assets.
- Do not place Forge branding on customer ordering screens.
- Do not place Hilltop branding on staff screens except intentional customer-order previews.

# 4. Color System

## Customer Palette

- Background: Warm Cream
- Cards: White
- Primary: Forest Green
- Accent: Leather Brown
- Text: Charcoal
- Success: Green
- Warning: Amber
- Error: Red

## Staff Palette

- Background: Dark Charcoal
- Panels: Steel Gray
- Primary: Forge Orange
- Text: White
- Secondary Text: Light Gray
- Success: Green
- Warning: Amber
- Error: Red

## Status Rules

- Color supports a text label; it never replaces one.
- Green is reserved for confirmed success or completion.
- Amber is for waiting, local-only, incomplete, or attention-needed states.
- Red is for errors, blocked work, cancellation, or destructive actions.
- Forge Orange identifies primary staff actions and active navigation.

# 5. Typography

Use one interface font family throughout Forge.

Operational information such as order number, tray number, progress, and status must be quickly scannable.

Do not use decorative fonts for operational data.

# 6. Layout Targets

- Primary: iPad landscape
- Secondary: Desktop
- Responsive: Phone

Customer screens prioritize clarity over density.

Staff screens may be denser, but touch targets and order readability must remain comfortable while standing at a workbench.

# 7. Navigation

## Customer

- Linear workflow
- One obvious primary action per screen
- No unnecessary menu
- No staff controls

## Staff

Current approved areas:

- Dashboard
- Orders
- Ready to Pack
- Events and administrative tools
- Hilltop Design Catalog

Rules:

- Use consistent staff navigation.
- Make the active area obvious.
- Preserve quick movement between Orders and Ready to Pack.
- Do not add employee, scheduling, time, or productivity navigation.

# 8. Component Library

## Customer Components

- Product Card
- Option Card
- Color Card
- Size Card
- Person/Pet Entry Composer
- Ordered Entry Row
- Order Summary Card
- Customer Information Card
- Payment Method Choice
- Submission Status Panel

## Shared Components

- Status Badge
- Primary Button
- Secondary Button
- Confirmation Dialog
- Empty State
- Error Message
- Waiting/Recovery Message

## Staff Components

- Staff Order Card
- Tray Badge
- Tray Selection Control
- Production Progress Indicator
- Production Item Row
- Completed-Quantity Control
- Open Flag Badge
- Ready-to-Pack Card
- Completion Confirmation
- Staff Note Field

New components extend the existing design system. Do not redesign completed screens solely to introduce a component.

# 9. Product Cards

Customer product cards display:

- Real product photo
- Product name
- Short description
- Optional price
- Clear customization action

Selecting a product may automatically advance when the next step is unambiguous.

Never replace the actual product with clip art or a generated redesign.

# 10. Forms

## Customer Form Rules

- Use large touch targets.
- Use a single-column customer-information layout.
- Auto-advance after simple selections when appropriate.
- Preserve explicit Add actions for repeated name entry.
- Auto-focus the persistent name field after adding a name.

Disable for engraving-name fields:

- Spellcheck
- Autocorrect
- Autocomplete
- Automatic text rewriting

Use `autocapitalize="words"` only to assist keyboard capitalization. Do not alter the stored text with JavaScript capitalization logic.

## Staff Form Rules

- Keep actions brief and task-specific.
- Prefer selection controls over typing.
- Do not ask for information Forge already knows.
- Preserve customer spelling exactly.
- Confirm destructive or tray-releasing actions.
- Do not add employee-identification fields.

# 11. Person and Pet Entry

Approved interaction:

1. Type a name.
2. Tap **Add**.
3. The name appears in the ordered list.
4. The field clears and remains ready for the next name.
5. Repeat.

Rules:

- Keep one persistent name field.
- Keep the Add button beside the field.
- Do not require Save.
- Do not require Done Adding Names.
- Do not force the customer to reopen Add Person between entries.
- Add Pet remains available without disturbing the persistent name flow.
- Preserve the displayed order through production.

# 12. Product Preview

Whenever space allows, display the product image during customization.

Staff item details may display the approved product photo, but production data and personalization remain primary.

# 13. Customer Final Review

Use a receipt-style layout.

Display:

- Products
- Quantities
- Options
- Personalization
- Customer
- Fulfillment
- Price summary
- Selected external payment method

Do not expose:

- Tray number
- Production note
- Internal flags
- Database values
- Raw sync errors
- Technical identifiers

# 14. Payment Method and Final Submit

Current live pattern:

- Card/Square
- Cash
- Venmo

Selecting an approved method enables:

**Payment Received — Submit Order**

Rules:

- Do not display a customer-flow Staff PIN.
- Do not display a backend approval state that does not exist.
- Do not claim Forge verified the Square, cash, or Venmo transaction.
- Disable the final button while submission is in progress.
- Prevent repeated taps from starting additional submissions.
- Preserve the final review when a recoverable error occurs.

This pattern remains a show pilot. Changes require actual operational evidence.

# 15. Submission and Recovery States

The customer submission screen must distinguish these states.

## Submitting

Preferred language:

- Submitting Order...
- Forge is saving your order.

The button remains disabled.

## Server confirmed

Preferred presentation:

- Order Saved
- Your order has been saved.
- Display the Forge order number or short reference.

## Saved only on this tablet

Preferred presentation:

- Order Saved on This iPad
- Forge is confirming your order.
- Keep this iPad available while Forge retries.

Do not show the normal completed heading while the saved record is still loading.

## Needs staff attention

Preferred presentation:

- Needs Staff Attention
- Your order is saved on this iPad.
- A staff member needs to finish the upload.

Do not expose technical error codes or stack traces to the customer.

# 16. Staff Information Hierarchy

Prioritize:

1. Tray number
2. Order number
3. Customer name
4. Production status
5. Completion progress
6. Required items
7. Fulfillment method
8. Open flags or recovery issues
9. Contact and address when needed

Before assignment, show **No Tray Assigned** rather than leaving the field blank.

# 17. Staff Order Card

Display when available:

- Order number
- Customer name
- Tray badge
- Production status
- Progress such as `2 of 3 Complete`
- Fulfillment method
- Open-flag or attention indicator

Rules:

- Do not overload the card with full details.
- Use the detail viewer for complete personalization.
- Escape customer-provided text before rendering.
- Embedded actions require clear labels and independent focus.

# 18. Tray Badge

Assigned format:

```text
TRAY 12
```

Unassigned format:

```text
NO TRAY ASSIGNED
```

Rules:

- High contrast
- Bold whole number
- Same terminology everywhere
- Assigned and out-of-service trays never appear available

# 19. Tray Selection Control

Requirements:

- Display only configured trays.
- Distinguish available, assigned, and out-of-service.
- Sort numerically.
- Use at least 44px touch targets.
- Prevent invalid selection.
- Show the selected order and customer before assignment.
- Use one primary action: **Assign Tray**.
- Confirm the resulting tray number after success.

Do not require typing a tray number.

# 20. Production Progress Indicator

Preferred formats:

```text
0 of 3 Complete
2 of 3 Complete
3 of 3 Complete
```

Rules:

- Always show readable text.
- A bar may support the text but not replace it.
- Progress is based on physical required quantities.
- Open blocking conditions remain visible.
- Complete progress does not automatically mean the order's final completion action occurred.

# 21. Production Item Row

Display as applicable:

- Product name
- Required quantity
- Completed quantity
- Size
- Colors
- Year
- Family or primary personalization
- Ordered people and pets
- Custom request
- Item status
- Completion control
- Tray context

Use plain labels rather than raw keys.

# 22. Item Completion Control

An item is recorded complete only after the physical piece is produced and placed into the assigned tray.

Requirements:

- Distinguish pending and complete.
- Support quantity greater than one accurately.
- Update order progress immediately after server confirmation.
- Prevent accidental duplicate increments.
- Use expected current quantity when saving to detect conflicts.
- Remain touch and keyboard accessible.
- Do not ask who completed the item.

Preferred labels:

- Mark Complete
- Completed
- 1 of 2 Complete

# 23. Production Status

Current approved labels:

- Submitted
- Tray Assigned
- In Production
- Ready to Pack
- Complete
- Cancelled

Rules:

- Labels match the actual lifecycle.
- Ready to Pack requires every active required quantity complete.
- Complete means the final internal production action succeeded and the tray was released.
- Complete does not independently mean shipped or picked up.
- Do not expose internal enum values such as `tray_assigned`.

# 24. Open Flags and Waiting States

Examples:

- Custom Icon Required
- Custom Artwork Required
- Missing Information
- Waiting on Material
- Waiting to Retry
- Saved on This iPad
- Needs Staff Attention

Rules:

- Show plain explanation.
- Distinguish blocking from informational.
- Blocking production issues prevent Ready to Pack.
- Waiting to Retry is not labeled Syncing when no request is active.
- Do not rely on color alone.
- Do not show raw technical details.

# 25. Ready-to-Pack Queue

Show only orders eligible for final completion.

Each card should display:

- Tray number
- Order number
- Customer name
- Fulfillment method
- Complete item summary
- Ready-to-Pack status

Rules:

- Do not mix incomplete orders into the queue.
- Keep completed and cancelled orders out.
- Blocking conditions prevent readiness.
- Selecting an order opens the completion confirmation.

# 26. Completion Confirmation

The current completion view confirms that the physical order is complete or packed and that the tray can be released.

Display:

- Tray number
- Order number
- Customer name
- Every expected item
- Required and completed quantities
- Key personalization
- Fulfillment method
- Shipping or pickup details when useful

Primary action:

**Complete & Release Tray**

Requirements:

- Action is unavailable until the order is Ready to Pack.
- Explain that the tray will become available.
- Require confirmation because tray release changes physical state.
- After success, show the order as Complete and the tray as available.
- Preserve historical tray number in order detail.
- Do not claim the order shipped or was picked up.

The current interface does not require a separate checkbox for every item during completion because item quantities were already completed during production. A future durable packing checklist requires separate approval.

# 27. Production Batch View

Display:

- Grouped production description
- Total required quantity
- Remaining quantity
- Relevant attributes
- Individual order references
- Customer names
- Tray numbers
- Item completion state

Rules:

- Tray destination remains visible.
- Grouping does not merge different personalization.
- Batch actions update the actual order-item records.
- Staff must not need paper to route completed items.

# 28. Search and Filters

Supported fields include:

- Product
- Ornament type
- Size
- Tree color
- Bow color
- Year
- Production status
- Shipping or pickup
- Event
- Open flags
- Tray number

Requirements:

- Readable labels
- Meaningful available options
- Clear filters action
- Results summary
- One individual item must satisfy the complete item-filter combination
- Text search may search broader order information

# 29. Hilltop Design Catalog

The catalog is a protected staff-only workspace.

Current sections:

- Designs
- Hats
- Materials
- Shortlist
- Finished Hats

Rules:

- Reuse Forge staff layout and navigation.
- Use large visual cards.
- Keep search and filters compact.
- Keep customer orders, trays, production, payment, and inventory isolated.
- Do not surface internal costs to customers.
- Catalog refinements must not redesign the customer order flow.

# 30. Loading, Empty, and Error States

## Loading

- Use brief loading text or restrained progress.
- Disable duplicate actions while saving.

## Empty

Examples:

- No orders yet
- No trays available
- No orders ready to pack
- No catalog items match these filters

## Error

- Use plain actionable language.
- Preserve current data.
- Do not claim success after a failed save.
- Never show credentials, server paths, raw responses, or stack traces.

# 31. Confirmation and Reversal

Require explicit confirmation for:

- Tray release
- Complete Order
- Cancellation
- Reopening completed production
- Permanent local-data deletion

Preferred practical language:

```text
Complete this order and release Tray 12?
```

Routine reversible actions should not be slowed by unnecessary dialogs.

# 32. Motion

Allowed:

- Fade
- Slide
- Auto-scroll
- Small state transitions

Not allowed:

- Flashing
- Decorative delays
- Large celebration effects
- Motion that hides operational state

# 33. Accessibility

- Minimum touch target: 44px
- Keyboard navigation
- Visible focus
- Accessible contrast
- Text label for every status and icon
- No drag-only required interaction
- No color-only meaning
- Proper form labels and announcements where practical

# 34. Responsive Behavior

## Desktop

Use multi-column layouts when they improve scanning.

## iPad Landscape

Primary target for customer and staff use.

Tray assignment, item completion, and final completion must remain comfortable for touch.

## Phone

Use one column. Keep tray, customer, status, and primary action visible without removing required production information.

# 35. Physical and Digital Alignment

Digital:

```text
Tray 12 — Hemenway — 2 of 3 Complete
```

Physical:

```text
Permanent number: 12
Dry-erase label: HEMENWAY
```

Use the word **tray** consistently. Do not switch between bin, tote, slot, or job box in the interface.

# 36. Two-Person Shop Scope

Do not add:

- Employee assignment
- Employee avatars
- Time clocks
- Productivity ranking
- Completion-by-person fields
- Shift controls
- Workload balancing
- Role-specific production dashboards

The Staff PIN protects staff tools but does not turn Forge into an enterprise workforce platform.

# 37. Change Discipline

When changing Forge:

1. Reuse existing layout and components.
2. Implement only the active milestone.
3. Preserve completed customer behavior.
4. Verify iPad landscape first.
5. Verify desktop and phone.
6. Test old stored orders.
7. Add recovery states before claiming reliability.
8. Do not redesign unrelated screens.

# 38. UX Philosophy

- The customer should know what to do next.
- Staff should know where every active order is.
- Every screen should have one obvious primary action.
- Product images should answer questions before long text.
- Reduce typing.
- Preserve customer spelling.
- Production status must match physical reality.
- Waiting and failure states must be honest.
- Forge should eliminate paper and memory-based tracking rather than recreate them digitally.

# 39. Version History

## Version 2.2 — 2026-08-06

Aligned the UI rules with build `20260731-49`: removed the customer payment-PIN pattern, documented the payment pilot and server-confirmed/local-saved states, replaced Pack Order with Complete & Release Tray, changed the active terminal status from Packed to Complete, and documented the current persistent name-entry pattern.

## Version 2.1 — 2026-07-16

Defined the original customer and production UI system.
