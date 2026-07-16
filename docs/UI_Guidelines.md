# UI Guidelines

**Version:** 2.1
**Status:** Approved
**Last Updated:** 2026-07-16

## Purpose

Defines the official Forge user interface standards for the customer ordering experience and the staff production workflow.

## Authority

This document is the authoritative source for all Forge user interface decisions.

## Dependencies

- `Forge.md`
- `Database_Schema.md`

---

# 1. Brand Identity

Forge contains two distinct user experiences.

## Customer Experience

**Brand:** The Hilltop Shop
**Purpose:** Warm, welcoming, handcrafted, boutique.

The customer should feel like they are ordering a handcrafted product from a local Texas business.

## Staff Experience

**Brand:** Forge
**Purpose:** Industrial, efficient, focused.

The staff should feel like they are operating practical production software rather than shopping on a website.

The staff interface is designed for The Hilltop Shop's one- or two-person workflow. It should prioritize speed, visibility, and mistake prevention rather than enterprise manufacturing controls.

---

# 2. Brand Personality

## Customer

Characteristics:

- Warm
- Friendly
- Simple
- Visual
- Calm
- Product-focused

Inspiration:

- Modern boutique
- Apple Store simplicity
- Farmhouse warmth

## Staff

Characteristics:

- Industrial
- Rugged
- Fast
- Minimal
- Professional
- Production-focused

Inspiration:

- Milwaukee Packout
- Industrial equipment interfaces
- Practical manufacturing dashboards

The staff experience must remain approachable enough that Kyle or Meagan can understand the current state of an order without training or interpretation.

---

# 3. Official Logos

## Customer Interface

Use only official The Hilltop Shop logos.

## Staff Interface

Use only official Forge logos.

## Rules

- Never recreate logos with AI.
- Never substitute fonts inside official logo artwork.
- Always use official vector or approved exported brand assets.
- Do not place Forge branding on customer-facing ordering screens.
- Do not place The Hilltop Shop branding on staff production screens except where customer-facing order content is intentionally previewed.

---

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

## Status Color Rules

- Color must support a text label, never replace it.
- Production status must remain readable in grayscale or under poor shop lighting.
- Forge Orange identifies primary staff actions and active navigation, not every clickable element.
- Green is reserved for confirmed completion, readiness, or successful actions.
- Amber is reserved for waiting, incomplete, or attention-needed states.
- Red is reserved for errors, blocked work, cancellation, or destructive actions.

---

# 5. Typography

Use one interface font family throughout Forge.

Hierarchy:

- Page Title
- Section Title
- Card Title
- Body
- Caption
- Button Text
- Production Metadata

Brand logos retain their official typography.

Production metadata such as order number, tray number, item count, and status should be visually distinct and quickly scannable. Do not use decorative fonts for operational information.

---

# 6. Layout System

## Primary Target

- iPad Landscape

## Secondary Target

- Desktop

## Responsive Target

- Mobile

Customer screens prioritize clarity over density.

Staff screens may use moderately denser layouts, but touch targets and order readability must not be sacrificed. The interface must remain usable while standing at a workbench or moving between the laser, tray rack, and packing table.

---

# 7. Navigation

## Customer

- Linear workflow
- One primary action per screen
- No unnecessary menus
- No staff controls

## Staff

Approved modules:

- Dashboard
- Orders
- Production
- Ready to Pack
- Customers
- Settings

Rules:

- Use consistent staff navigation across all staff screens.
- Make the active module obvious.
- Preserve quick movement between the orders queue, production work, and packing.
- Do not add employee, scheduling, time-tracking, or productivity navigation in Version 1.

---

# 8. Component Library

## Customer Components

- Product Card
- Color Card
- Size Card
- Icon Card
- Person Card
- Pet Card
- Order Summary Card
- Customer Card

## Shared Components

- Status Badge
- Primary Button
- Secondary Button
- Confirmation Dialog
- Empty State
- Error Message

## Staff Production Components

- Staff Order Card
- Tray Badge
- Tray Selection Control
- Production Progress Indicator
- Production Item Row
- Item Completion Control
- Open Flag Badge
- Ready-to-Pack Card
- Packing Checklist
- Fulfillment Badge

All screens should be assembled from approved components and existing interaction patterns.

New production components must extend the existing staff design system. Do not redesign completed staff screens solely to introduce a new component.

---

# 9. Product Cards

Customer product cards display:

- Product Photo
- Product Name
- Short Description
- Optional Price
- `Tap to Customize`

Selecting a product automatically advances to the next step.

Always use real product photography. Do not replace approved product photos with illustration, clip art, or generated product representations.

---

# 10. Forms

## Customer Form Rules

- Auto-advance after selections when appropriate.
- Auto-focus newly created fields.
- Use a single-column customer-information layout.
- Use large touch targets.

Disable for personalization-name fields:

- Spell Check
- Auto Correct
- Auto Fill
- Auto Complete when it may alter customer-entered names

## Staff Form Rules

- Keep staff actions brief and task-specific.
- Prefer selection controls over typing when assigning trays or changing approved statuses.
- Do not require staff to enter information Forge already knows.
- Preserve customer-entered spelling exactly.
- Use confirmation only when an action changes production state, releases a tray, cancels an order, or may be difficult to reverse.

---

# 11. Personalization

Customer personalization order:

1. Product
2. Size
3. Colors
4. Family Name
5. People
6. Pets

People and pets share one ordered list.

Customers may reorder names.

Forge preserves that order through production, packing, and WooCommerce synchronization.

Staff production screens must display the complete personalization needed to make the item without requiring staff to reconstruct it from abbreviated labels.

---

# 12. Product Preview

Whenever space allows, display the product image while customization is taking place.

Customers should always understand what they are ordering.

Staff item-detail screens may also display the approved product photo as a reference, but production data and personalization remain the primary content.

---

# 13. Customer Review Screen

Use a receipt-style layout.

Display:

- Product
- Options
- Family
- People
- Pets
- Customer
- Shipping or Pickup

Staff-only information must not appear on customer review screens.

Never expose:

- Production notes
- Internal flags
- Tray numbers
- Database information
- Sync errors
- Implementation details

---

# 14. Staff Information Hierarchy

Staff order and production screens should prioritize information in this order:

1. Tray Number
2. Order Number
3. Customer Name
4. Production Status
5. Completion Progress
6. Required Items
7. Fulfillment Method
8. Open Flags or Blocking Issues
9. Contact and address details when needed

Tray number is the primary physical-location reference after assignment. It must be prominent wherever an active order is shown.

Before tray assignment, the interface must clearly display `No Tray Assigned` rather than leaving the tray field blank.

---

# 15. Staff Order Card

The existing staff order-card design should remain intact unless a small extension is required for production information.

An active production order card should display, when available:

- Order number
- Customer name
- Tray badge
- Production status
- Progress such as `2 of 3 Complete`
- Fulfillment method
- Open-flag indicator

Rules:

- Do not overload the card with full customer details.
- Use the order detail viewer for complete information.
- Entire-card navigation may be used when it does not conflict with embedded controls.
- Embedded actions must have clear labels and independent keyboard focus.
- Customer-provided text must be safely escaped before rendering.

---

# 16. Tray Badge

The tray badge links the digital order to the physical production tray.

## Assigned State

Preferred format:

```text
TRAY 12
```

Rules:

- Use a high-contrast, bold treatment.
- Display the tray number as a whole number without leading zeros.
- Keep the same visual treatment across Orders, Production, Ready to Pack, and Packing.
- Do not abbreviate the label to an unexplained number.

## Unassigned State

Preferred label:

```text
NO TRAY ASSIGNED
```

Use a neutral or warning treatment, not an error treatment, unless assignment is required before the current action can continue.

## Available Tray State

In tray-selection interfaces, available trays should be clearly selectable and assigned trays should not be selectable.

Do not display an assigned tray as available, even temporarily.

---

# 17. Tray Selection Control

Tray assignment should be simple enough to complete while standing at the tray rack.

Requirements:

- Display only valid tray records.
- Clearly distinguish available, assigned, and out-of-service trays.
- Use large numbered controls with at least 44px touch targets.
- Sort tray numbers numerically.
- Prevent selection of assigned or out-of-service trays.
- Show the selected customer and order before final assignment.
- Use one obvious primary action such as `Assign Tray`.
- Confirm successful assignment with the resulting tray number.

Do not require typing a tray number when a selectable list or grid can prevent mistakes.

---

# 18. Production Progress Indicator

Production progress must communicate actual physical completion.

Preferred text formats:

```text
0 of 3 Complete
2 of 3 Complete
3 of 3 Complete
```

Rules:

- Always include readable text.
- A simple progress bar may support the text but must not replace it.
- Do not use percentage alone.
- Progress is calculated from required item quantities, not from screens visited or time elapsed.
- Open blocking flags must remain visible even when the numerical progress is complete.
- Completed styling must not imply packed or shipped.

---

# 19. Production Item Row

Each production item row should display enough information to make and route the item correctly.

Display as applicable:

- Product name
- Quantity
- Size
- Colors
- Year
- Family name or personalization
- Ordered people and pets
- Custom icon or artwork request
- Item status
- Completion control
- Assigned tray context

Rules:

- Preserve exact customer spelling and personalization order.
- Keep product-specific details grouped with that item.
- Use plain labels rather than raw database keys.
- Do not hide unresolved custom requests inside expandable technical data.
- Multiple quantities must show how many physical pieces are complete.

---

# 20. Item Completion Control

An item is marked complete only after the finished physical piece has been placed into the assigned tray.

Requirements:

- The control must clearly distinguish pending and complete states.
- For quantity greater than one, support accurate completed quantity rather than a misleading single checkbox.
- Completion changes must be easy to verify and difficult to trigger accidentally.
- The resulting order-level progress must update immediately.
- The control must remain usable with touch and keyboard input.
- Do not ask which employee completed the item.
- Do not display productivity timers or completion-speed metrics.

Preferred labels:

- `Mark Complete`
- `Completed`
- `1 of 2 Complete`

Avoid vague labels such as `Done` when the physical meaning is not obvious.

---

# 21. Production Status

Use a small, approved set of plain-language statuses.

Approved customer-order production labels:

- Submitted
- Tray Assigned
- In Production
- Ready to Pack
- Packed
- Shipped
- Picked Up
- Cancelled

Rules:

- Status labels must match the actual lifecycle.
- Production completion, packing, and fulfillment are separate states.
- Do not show `Ready to Pack` until every required item is complete and no blocking flag remains.
- Do not show `Shipped` or `Picked Up` before packing verification.
- Do not expose internal enum values to users.

---

# 22. Open Flags and Waiting States

Forge must make unresolved work visible without turning every exception into a complex workflow.

Examples:

- Custom Icon Required
- Custom Artwork Required
- Missing Information
- Waiting on Material
- Sync Failed

Rules:

- Display a readable flag label and short explanation.
- Distinguish blocking flags from informational notes.
- Blocking flags must prevent automatic Ready-to-Pack status.
- Do not rely on color alone.
- Do not show technical errors or stack traces.
- Staff should be able to understand why an order is waiting without relying on memory.

---

# 23. Ready-to-Pack Queue

The Ready-to-Pack screen shows only orders that are eligible for packing.

Each card should display:

- Tray number
- Order number
- Customer name
- Fulfillment method
- Complete item summary
- Ready-to-Pack status

Rules:

- Do not mix incomplete orders into the Ready-to-Pack queue.
- Keep packed orders out of the active Ready-to-Pack queue.
- Open blocking flags must prevent an order from appearing as ready.
- Selecting an order opens the packing-verification screen.

---

# 24. Packing Checklist

Packing verification confirms that the physical contents of the tray match the submitted order.

Display:

- Tray number
- Order number
- Customer name
- Every expected item
- Required quantity
- Key personalization details
- Fulfillment method
- Shipping or pickup information as needed

Requirements:

- Every expected item must be verified before `Pack Order` becomes available.
- Use a clear checklist or quantity-verification control.
- Keep one primary action: `Pack Order`.
- Clearly explain that packing releases the tray for reuse.
- Show a confirmation before finalizing packing if the release cannot be easily undone.
- After success, display that the order is packed and the tray is available.
- Preserve the historical tray number in the completed order detail.

Do not present packing as shipment completion. Shipping and pickup are later fulfillment actions.

---

# 25. Production Batch View

The production batch view groups similar items for efficient manufacturing while preserving each customer's tray destination.

A batch group should display:

- Grouped product description
- Total required quantity
- Remaining quantity
- Relevant production attributes
- Individual order references
- Customer names
- Tray numbers
- Item completion state

Example:

```text
14 × Large Family Tree / Green / Red Bow
```

Rules:

- Tray destination must remain visible for every individual item.
- Staff must not need paper to remember where a completed item belongs.
- Grouping must not merge or obscure different personalization.
- Batch completion updates the corresponding order items, not a separate disconnected count.

---

# 26. Search and Filters

Production filters should be compact, predictable, and based on structured attributes.

Supported Version 1 filters include:

- Product
- Ornament Type
- Size
- Tree Color
- Bow Color
- Year
- Production Status
- Shipping or Pickup
- Event
- Open Flags

Requirements:

- Use readable labels rather than internal keys.
- Show only meaningful available options.
- Provide a clear-filters action.
- Preserve filter controls when no results match.
- Show a concise results summary.
- One individual item must satisfy the complete active item-filter combination.
- Text search may search broader order information.

---

# 27. Motion

Allowed:

- Fade
- Slide
- Auto-scroll
- Small state transitions that confirm completion or assignment

Not allowed:

- Flashing
- Decorative transitions
- Large animations
- Celebration effects that delay production work

Motion should support usability and state recognition, never distract.

---

# 28. Accessibility

- Every icon includes a text label or accessible name.
- Minimum touch target: 44px.
- Support keyboard navigation.
- Maintain accessible color contrast.
- Use visible keyboard focus.
- Do not rely on drag-only controls.
- Do not rely on color alone for tray, status, completion, or error states.
- Associate labels and instructions with their controls.
- Announce important status changes when practical.

---

# 29. Responsive Behavior

## Desktop

- Multi-column layouts may be used.
- Keep order details and production actions visible without excessive line length.

## iPad Landscape

- This is the primary staff and customer target.
- Important production controls should fit without tiny text or dense desktop-only tables.
- Tray assignment and item completion must remain comfortable for touch.

## Phone

- Use a single-column layout.
- Stack filters and metadata logically.
- Keep tray number, customer, status, and primary action visible.
- Do not remove required production information merely to make the screen smaller.

---

# 30. Loading, Empty, and Error States

## Loading

- Use clear, brief loading text or a restrained progress indicator.
- Do not allow duplicate actions while an assignment or status update is saving.

## Empty States

Examples:

- No local orders yet
- No trays available
- No orders ready to pack
- No production items match these filters

Empty states should explain the condition and offer one relevant next action when available.

## Errors

- Use plain, actionable language.
- Preserve the current order data when an action fails.
- Never show API responses, database paths, credentials, or stack traces.
- A failed save must not visually claim that the action succeeded.

---

# 31. Confirmation and Reversal

Require explicit confirmation for actions that:

- Release a tray
- Pack an order
- Cancel an order
- Remove completion from an already packed workflow
- Permanently delete local data

Routine reversible actions should not be slowed by unnecessary confirmation dialogs.

Confirmation text should state the practical result, such as:

```text
Pack this order and release Tray 12?
```

---

# 32. Physical and Digital Workflow Alignment

Forge must mirror the physical shop.

Digital example:

```text
Tray 12 — Hemenway — 2 of 3 Complete
```

Physical example:

```text
Permanent tray number: 12
Dry-erase customer label: HEMENWAY
```

Rules:

- Use the same tray number terminology everywhere.
- Do not introduce alternate names such as bin, tote, slot, job box, or container in the interface.
- Staff should be able to move from Forge to the physical tray rack without translating labels.
- Completed items must always retain a visible tray destination until packing.

---

# 33. Two-Person Shop Scope

Version 1 assumes Kyle and Meagan operate the production workflow.

Do not add:

- Employee assignment controls
- Employee avatars
- Time clocks
- Productivity rankings
- Completion-by-person fields
- Shift controls
- Workload balancing
- Role-specific production dashboards

A Staff PIN may protect staff screens, but the interface should not behave like an enterprise workforce platform.

---

# 34. UI Rules

## Always Use

- Real product photos
- Official logos
- Image-based customer selection
- Large touch targets
- One obvious primary action per task
- Plain production language
- Visible tray destination
- Explicit completion state
- Existing components before inventing new patterns

## Never Use

- Long customer-facing radio-button lists
- Hidden required fields
- Multiple competing primary buttons
- Decorative effects
- Raw database values
- Color-only statuses
- Employee-management features in Version 1
- A full-screen redesign when a small component extension will solve the need

---

# 35. Change Discipline

Completed screens must not be redesigned as part of unrelated feature work.

When adding a production feature:

1. Reuse the existing layout and components.
2. Add only the information and controls required for the active milestone.
3. Preserve customer ordering behavior.
4. Verify iPad landscape first.
5. Confirm desktop and phone remain usable.
6. Test existing orders and backward compatibility.

New components should extend the design system without invalidating previously approved screens.

---

# 36. UX Philosophy

Forge should feel effortless and practical.

Rules:

- The customer should never wonder what to do next.
- Staff should never wonder where an active order is located.
- Every step should feel direct and intentional.
- Product images should answer questions before text.
- Reduce typing whenever possible.
- Every screen should present one obvious primary action.
- Production status must reflect physical reality.
- Forge should eliminate paper and memory-based tracking rather than recreating them digitally.
