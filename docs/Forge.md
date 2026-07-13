# Forge

**Version:** 2.0  
**Status:** Approved  
**Last Updated:** 2026-07-13

## Purpose
Defines the official Forge product vision, architecture, customer experience, and operating principles.

## Authority
This document is the authoritative source for Forge functionality.

## Dependencies
None.

---

# 1. Vision
Forge exists to replace paper order forms with a fast, visual, and professional ordering experience built specifically for custom makers.

Forge should always improve speed, accuracy, and customer confidence while reducing staff workload.

# 2. Mission
**Capture custom orders better than paper.**

# 3. Core Principles
- Customer First
- Visual First
- Conversation Driven
- Simplicity Wins
- One Decision Per Step
- Product Driven
- Offline Tolerant
- Tablet First

# 4. Version 1 Scope

## Included
- Custom Ornaments
- Custom Signs
- General Custom Request
- Customer Information
- Shipping
- Order Review
- Staff Dashboard
- Production Queue
- WooCommerce Integration

## Not Included
- Retail Inventory
- POS
- Marketing Automation
- AI Assistant
- Analytics
- Employee Scheduling

# 5. Customer Experience

Welcome → Choose Product → Choose Ornament → Customize Product → Add Another Item → Customer Information → Review → Submit Order → Thank You

Customer information is collected once after all products have been added. Shipping is the default fulfillment method.

# 6. Staff Experience
Protected by Staff PIN.

Modules:
- Dashboard
- Orders
- Production
- Customers
- Settings

# 7. Product System
Products define their own fields, options, sizes, colors, rules, images, and pricing. Forge generates forms from the Product Catalog whenever possible.

# 8. Order Lifecycle
Customer → Customization → Customer Information → Review → WooCommerce Order → Production Queue → Completed

# 9. Data Philosophy
WooCommerce is the primary customer and order system. Forge manages personalization, production workflow, internal notes, and product definitions.

# 10. System Architecture
Customer iPad → Forge Web App → WooCommerce → Production Dashboard

Forge should operate as a Progressive Web App (PWA).

# 11. Design Philosophy
Customer UI uses The Hilltop Shop branding.
Staff UI uses Forge branding.

# 12. Personalization Rules
1. Product
2. Size
3. Colors
4. Family Name
5. People
6. Pets

Customers control engraving order. Forge preserves that order.

# 13. Product Images
Always use real product photography. Keep the product visible during customization.

# 14. Locked Decisions
- Shipping after products
- Multi-item orders before customer information
- WooCommerce is the primary order record
- Customer controls personalization order
- Tablet-first design
- Hilltop branding for customers
- Forge branding for staff
- Hats excluded from Version 1
- Product definitions drive forms

# 15. Future Vision
Retail products, inventory, AI assistant, barcode workflows, shipping labels, customer accounts.

# 16. Success Criteria
- Faster than paper
- Fewer production errors
- WooCommerce receives complete orders
- Multiple iPads supported
- New staff trained in under 30 minutes

# 17. Version History
## Version 2.0
Initial software specification.
