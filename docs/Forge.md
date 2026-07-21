# Forge

**Version:** 2.1
**Status:** Approved
**Last Updated:** 2026-07-16

## Purpose
Defines the official Forge product vision, architecture, customer experience, production workflow, and operating principles.

## Authority
This document is the authoritative source for Forge functionality.

## Dependencies
None.

---

# 1. Vision
Forge exists to replace paper order forms and paper production tracking with a fast, visual, and professional workflow built specifically for The Hilltop Shop.

Forge Version 1 guides a custom order from customer submission through production, packing, and fulfillment.

Forge should always improve speed, accuracy, order location, and customer confidence while reducing staff workload and reliance on memory.

# 2. Mission
**Capture custom orders better than paper and guide them safely through production.**

# 3. Core Principles
- Customer First
- Visual First
- Conversation Driven
- Simplicity Wins
- One Decision Per Step
- Product Driven
- Offline Tolerant
- Tablet First
- Production Aware
- Physical and Digital Workflows Must Match

# 4. The Forge Test
Every proposed feature should satisfy at least one of the following:

- Makes ordering faster
- Makes production faster
- Reduces mistakes
- Makes orders easier to locate
- Eliminates paper
- Prevents relying on memory

If a feature does not satisfy at least one of these tests, it should normally wait for Version 2.

# 5. Version 1 Scope

## Included
- Custom Ornaments
- Custom Signs
- General Custom Request
- Customer Information
- Shipping and Pickup
- Order Review
- Durable Local Order Storage
- Staff Dashboard
- Orders Queue
- Production Tray Assignment
- Item-Level Production Completion
- Production Batch View and Filtering
- Ready-to-Pack Queue
- Packing Verification
- Tray Release and Reuse
- WooCommerce Integration
- Shipment and Pickup Status

## Not Included
- Retail Inventory
- Point of Sale
- Payment Processing
- Marketing Automation
- AI Assistant
- Advanced Analytics
- Employee Assignments
- Time Tracking
- Productivity Metrics
- Shift Scheduling
- Workload Balancing
- Employee Permissions Beyond a Staff PIN

Forge Version 1 assumes production is performed by Kyle and Meagan or another two-person-equivalent workflow. It is not intended to operate as enterprise manufacturing software.

# 6. Customer Experience

Welcome → Choose Product → Choose Ornament → Customize Product → Add Another Item → Customer Information → Review → Review & Pay → Staff Payment Confirmation → Thank You

Customer information is collected once after all products have been added. Shipping is the default fulfillment method.

Forge does not process payments in Version 1. Payments continue through external methods such as Square, cash, or Venmo. The order remains an unsaved Forge draft until a staff member confirms payment with a one-time stateless Staff PIN verification. That verification requires an internet connection, does not open or preserve a Staff Tools session, and only then allows Forge to save and submit the order.

# 7. Staff Experience
The staff experience is protected by a Staff PIN.

Modules:
- Dashboard
- Orders
- Production
- Ready to Pack
- Customers
- Settings

The staff interface should answer four practical questions:

1. What needs to be made?
2. Where is every active order?
3. What is ready to pack?
4. What is still waiting or blocked?

# 8. Product System
Products define their own fields, options, sizes, colors, rules, images, and pricing. Forge generates forms from the Product Catalog whenever possible.

Product definitions control customer customization and pricing. Production trays and production statuses belong to the order workflow rather than individual product definitions.

# 9. Order Lifecycle

Customer Submission → Durable Local Save → WooCommerce Synchronization → Production Tray Assignment → Batch Production → Item Completion → Ready to Pack → Packing Verification → Packed → Shipped or Picked Up

Important lifecycle rules:

- A customer order is safely stored before synchronization is attempted.
- WooCommerce remains the primary customer and order record after synchronization is available.
- Forge remains the production workflow system.
- Production completion does not automatically mean an order has been packed or fulfilled.
- Packing verification must occur before shipment or pickup completion.

# 10. Production Tray System
Production Trays are a locked Version 1 workflow decision.

## Purpose
Each active customer order is assigned to one physical production tray. Every completed item for that order remains in the assigned tray until packing is verified.

The digital tray number in Forge must match the permanent number on the physical tray.

Example:

- Order #1042
- Customer: Hemenway
- Tray 12
- 2 of 3 Items Complete

## Physical Direction
The preferred physical tray is a shallow, durable, stackable industrial optical-laboratory or eyeglass job tray.

Each physical tray should have:

- A permanent tray number
- A reusable dry-erase customer label

Example:

- Permanent label: `Tray 12`
- Reusable customer label: `HEMENWAY`

## Assignment Rules
- One active order may have no more than one assigned tray.
- One tray may be assigned to no more than one active order.
- Tray assignment is a staff action.
- An order remains associated with its tray through production and packing.
- The tray is released only after packing verification is completed.
- A released tray becomes available for another order.
- Historical order records must preserve which tray was used even after the tray is released.

# 11. Item-Level Production Completion
Forge tracks production completion for each order item.

Examples:

- 0 of 3 Complete
- 2 of 3 Complete
- 3 of 3 Complete

Rules:

- Each item begins as not complete.
- Staff marks an item complete after it has been produced and placed in the assigned tray.
- Forge calculates order progress automatically from item completion states.
- When all required items are complete, the order moves to Ready to Pack.
- Open production flags or unresolved quote-required work may prevent an order from becoming Ready to Pack.

# 12. Production Batch Workflow
Items may be produced in batches across multiple customer orders.

Forge should group and filter structured item attributes such as:

- Product
- Size
- Tree Color
- Bow Color
- Year
- Production Status
- Fulfillment Method
- Event
- Open Flags

Example batch counts:

- 14 × Large Family Tree / Green / Red Bow
- 8 × Present Stack / White Bow
- 3 × Veteran Flag
- 2 × Custom Icon Requests

Batch production never changes the rule that finished items are returned to the tray assigned to their customer order.

# 13. Ready-to-Pack and Packing Workflow
Only orders with all required production items complete may appear in Ready to Pack.

The packing screen should display:

- Order number
- Customer name
- Tray number
- Fulfillment method
- Every expected item
- Completion confirmation for each item
- Open flags or blocking notes

Staff verifies the physical tray contents against the packing checklist.

When staff selects **Pack Order**:

- The order is marked packed.
- The packed timestamp is recorded.
- The tray is released immediately.
- The tray becomes available for another order.
- The historical tray assignment remains attached to the order record.

Packed does not necessarily mean shipped or picked up. Fulfillment is tracked separately.

# 14. Physical Shop Alignment
Forge should mirror the real production path:

Laser → Assembly → Production Tray Rack → Packing Table → Shipping or Pickup

Forge should not require a major shop redesign. Version 1 assumes one dedicated production-tray storage area.

Initial physical planning target:

- Approximately 24 trays
- Expandable to approximately 36 trays
- Simple shelving sized to the selected tray dimensions

# 15. Data Philosophy
WooCommerce is the primary customer and order system.

Forge manages:

- Product definitions
- Personalization
- Durable local order capture
- Production tray assignment
- Item completion
- Production batching
- Internal notes and flags
- Packing verification
- Fulfillment workflow

The full historical order configuration must always be preserved. Structured attributes may also be stored for filtering, reporting, and batching.

Forge must never rely only on paper or staff memory to determine:

- Where an order is located
- Which items are complete
- Which orders are ready to pack
- Which trays are available

# 16. System Architecture

Customer iPad → Forge Progressive Web App → Durable Local Save → Forge Server Integration → WooCommerce → Production Dashboard → Production Trays → Packing → Shipping or Pickup

Forge should operate as a Progressive Web App and remain tolerant of temporary internet loss.

The browser-facing application must never contain WooCommerce secret credentials.

# 17. Design Philosophy
Customer UI uses The Hilltop Shop branding.

Staff UI uses Forge branding.

Customer screens should remain warm, calm, visual, and product-focused.

Staff production screens should remain industrial, fast, readable, and focused on the next physical action.

# 18. Personalization Rules
1. Product
2. Size
3. Colors
4. Family Name
5. People
6. Pets

Customers control engraving order. Forge preserves that order through production and WooCommerce synchronization.

# 19. Product Images
Always use real product photography. Keep the product visible during customization whenever space allows.

# 20. Locked Decisions
- Shipping after products
- Multi-item orders before customer information
- WooCommerce is the primary customer and order record
- Forge is the production workflow system
- Forge does not process payments in Version 1
- Customer controls personalization order
- Tablet-first design
- Hilltop branding for customers
- Forge branding for staff
- Hats excluded from Version 1
- Product definitions drive forms
- Production trays replace paper order packets during production
- One active tray per order
- Item-level production completion
- Ready-to-Pack requires all required items complete
- Packing verification releases the tray
- Tray numbers are reusable but assignment history is permanent
- Version 1 is optimized for a two-person shop
- Enterprise workforce-management features are excluded

# 21. Future Vision
Potential future features include:

- Retail products
- Inventory
- AI assistant
- Barcode workflows
- Shipping-label purchasing and printing
- Customer accounts
- Expanded analytics
- Additional employee roles and permissions

Future features must not complicate the Version 1 workflow unless they pass the Forge Test.

# 22. Success Criteria
- Faster than paper
- Fewer ordering and production errors
- Every active order is easy to locate
- Item completion is visible without checking paper
- Ready-to-Pack orders are identified automatically
- Packing is verified before fulfillment
- Production trays are safely reused
- WooCommerce receives complete orders
- Multiple iPads are supported
- Kyle or Meagan can operate the core workflow without special training

# 23. Version History

## Version 2.1
Expanded Forge Version 1 from order capture into a complete small-shop workflow covering production trays, item completion, packing verification, tray reuse, and fulfillment. Added the Forge Test and explicitly excluded enterprise workforce-management features.

## Version 2.0
Initial software specification.
