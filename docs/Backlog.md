# Backlog

**Version:** 1.3
**Status:** Approved
**Last Updated:** 2026-07-31

## Purpose

Defines the current Forge roadmap, records what is already implemented and working, and keeps the remaining priorities aligned with The Hilltop Shop's real two-person workflow.

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

## Repository and Live Checkpoint

```text
Branch: develop
Commit: ac3a02f66a7768236d93617a8b4223a477d2b37d
Message: Enable keyboard capitalization for entry names
Working tree: clean
origin/develop: matches local develop
Current live public build: 20260730-48
Current live service-worker cache: forge-starter-v48
```

## Completed and Working

### Customer Order Experience

- Customer welcome and product-category flow
- Ornament ordering flows
- Multi-item orders
- Customer information
- Order review
- External payment handoff
- Stateless Staff PIN payment confirmation
- Order submission and thank-you flow
- Event-gated public ordering
- Test Sessions
- Persistent Person/Pet Name entry
- Person and Pet reordering, editing, and removal
- Pet icon and Custom Icon handling
- Mobile keyboard word capitalization
- Spellcheck, autocorrect, and autocomplete disabled for engraving names

### Staff and Production

- Staff PIN authentication
- Staff dashboard
- Staff Orders queue and order detail
- Server-backed order storage
- Sequential Forge order numbers currently used by the application
- Production tray assignment
- Tray conflict prevention
- Item-level production completion
- Production progress counts
- Ready-to-Pack queue
- Packing verification
- Packed timestamps
- Tray release and reuse
- Order cancellation with safe tray release
- Production filtering and batch summaries
- Staff notes and production notes
- Event management
- Completed-order history and filters

### Hilltop Design Catalog

- Staff-only isolated module
- Designs
- Hats
- Materials
- Shortlist
- Finished Hats
- Visual catalog cards
- Search and filtering
- Catalog ordering and sorting
- Design, hat, and material linking
- Finished-hat linking workspace
- Cost-related catalog data where currently implemented
- Isolation from customer ordering, orders, payments, production, and inventory

### Deployment and Reliability

- Hostinger protected deployment workflow
- Timestamped rollback backups
- Health and live-version verification
- Production read-only baseline checks
- Service-worker build/cache versioning
- Focused three-file deployment successfully used for build `20260730-48`

---

# 3. Current Priority Order

The obsolete milestone sequence has been replaced by the actual remaining work. Documentation and roadmap alignment are completed for this checkpoint and must be maintained whenever a major milestone changes.

## Priority 1 — Order Lifecycle and Data-Loss Audit

**Priority:** Critical
**Status:** Next

Purpose:

- Prove exactly how a customer order moves from draft to durable server record and identify every point where it could be lost, duplicated, falsely confirmed, or left invisible to staff.

Required investigation:

- Trace customer entry through payment confirmation, UUID assignment, order number assignment, local save, server save, confirmation, Staff Orders, production updates, and packing.
- Identify the authoritative record at each stage.
- Confirm whether customer success can appear before durable server storage.
- Determine behavior when Wi-Fi drops before, during, or immediately after submission.
- Determine behavior when Submit is tapped repeatedly.
- Determine behavior when Safari refreshes or closes.
- Determine whether a local order can fail to reach the server without a clear staff warning.
- Confirm production, tray, note, completion, and packing changes survive refresh and reopening.
- Document every recovery path.
- Do not make source changes during the audit unless separately approved.

## Priority 2 — Database Backup and Restore Verification

**Priority:** Critical
**Status:** Planned

Required work:

- Confirm current automatic database backup behavior.
- Record backup frequency, retention, and storage location.
- Confirm backups are stored separately from the live database.
- Include order, item, event, tray, note, completion, cancellation, outbound message, and catalog data where applicable.
- Document the exact restore procedure.
- Perform a controlled restore test into a nonproduction database.
- Verify restored record counts and relationships.
- Never test restoration over the live database.
- Never claim backups are proven until a restore drill passes.

## Priority 3 — Submission and Duplicate-Prevention Hardening

**Priority:** Critical
**Status:** Planned

Required outcomes:

- One immutable Forge order UUID per submitted order.
- Idempotent server submission behavior.
- Repeated taps cannot create duplicate orders.
- Submit remains disabled while saving.
- Clear saving, success, and failure states.
- No success message before the approved durable-save condition is met.
- Failed or interrupted submissions remain recoverable.
- Staff can clearly identify pending, failed, or incomplete submissions.
- Two simultaneous iPad submissions cannot receive conflicting order numbers.

## Priority 4 — Multi-iPad and Failure Test Matrix

**Priority:** Critical
**Status:** Planned

Required scenarios:

- Two iPads submit simultaneously.
- One customer taps Submit repeatedly.
- Wi-Fi disconnects before payment confirmation.
- Wi-Fi disconnects during submission.
- Wi-Fi disconnects immediately after submission.
- Page refresh during submission.
- Safari closes and reopens.
- Event ends while a draft is open.
- One device runs an older cached build.
- Two staff devices edit the same order.
- Production completion changes followed by immediate refresh.
- Packing action followed by immediate refresh.

For every scenario record:

- Expected behavior.
- Actual behavior.
- Whether any data can be lost.
- Whether a duplicate can occur.
- What the customer sees.
- What staff sees.
- Exact recovery procedure.

## Priority 5 — Focused Deployment Tooling

**Priority:** High
**Status:** Planned

Keep the previously documented requirements:

- Explicit file allowlist.
- Exact dry-run manifest.
- Refuse unexpected files.
- Back up only files being replaced.
- Public-only deployment cannot include private/vendor files.
- Preserve the full deployment workflow for larger releases.
- Automated safety tests.
- Never use `rsync --delete`.

Deployment hardening supports stability but comes after proving the order save and recovery lifecycle.

## Priority 6 — Monitoring, Recovery, and Show Checklist

**Priority:** High
**Status:** Planned

Required work:

- Health status.
- Database connectivity.
- Current live build and service-worker cache.
- Recent successful order write.
- Failed order submissions.
- Duplicate UUID attempts.
- Pending or stuck records.
- Outbound email failures.
- Clear logs without exposing customer data or credentials.
- Morning-of-show checklist.
- During-show recovery instructions.
- End-of-show order-count and backup verification.

## Priority 7 — Customer Review and Payment Flow Audit

**Priority:** High
**Status:** Planned

Keep the previously documented flow audit, but place it after stability and recovery work.

Target flow:

Customize → Customer Information → One Final Review → Payment Handoff → Staff Confirmation → Submit

Required investigation:

- Identify every current review screen or modal.
- Determine whether any information is repeated.
- Verify payment-method selection.
- Verify submit-button enablement.
- Preserve payment security and Staff PIN confirmation.
- Do not simplify by removing the final accuracy check.
- Do not redesign completed customization screens.

## Priority 8 — PWA and Offline Hardening

**Priority:** High
**Status:** Planned / Incremental

Keep:

- Reliable update activation.
- Clear online and offline state.
- Reliable reopen and refresh.
- Defined offline-capable actions.
- Safe retry and recovery states.
- Hostinger and CDN cache behavior.
- No false sync or email success claims.

Offline behavior must be based on the findings from the order lifecycle audit.

## Priority 9 — Migration and Schema Bookkeeping Audit

**Priority:** High
**Status:** Planned / Diagnostic

Observed deployment-check result:

```text
009_sequential_order_numbers: missing
010_forge_events: present
014_outbound_messages: present
015_completed_at: present
```

Required investigation:

- Confirm sequential order-number uniqueness under concurrent submissions.
- Do not run migration `009` merely because it is reported missing.
- Determine whether its schema effect exists, was superseded, or lacks only its migration record.
- Make no production schema change until proven necessary.

## Priority 10 — WooCommerce Synchronization

**Priority:** High
**Status:** Deferred Until Stability Passes

Clarify:

- WooCommerce adds another persistence system and network dependency.
- Do not begin the integration until Forge's own order save, duplicate prevention, backup, restore, and recovery behavior have been proven.
- All existing WooCommerce requirements remain approved.
- This is still a Version 1 goal, but not the next active development task.

## Priority 11 — Hilltop Design Catalog Refinement

**Priority:** High
**Status:** Later / Incremental

## Priority 12 — Physical Production Tray Setup

**Priority:** Operational
**Status:** Operational

Remaining physical work:

- Select shallow durable trays.
- Confirm dimensions.
- Purchase initial quantity.
- Add permanent tray numbers.
- Add reusable customer labels.
- Purchase or build tray storage.
- Match the configurable Forge tray inventory to the physical trays.

## Priority 13 — Additional Customer Product Categories

**Priority:** Later
**Status:** Later

Potential sequence:

- Signs
- Kitchen
- General Custom Request

Rules:

- Add one product flow at a time.
- Do not redesign the completed ornament system.
- Validate each flow before starting another.

---

# 4. Parked / Deferred

- Separate Mark Shipped action
- Separate Mark Picked Up action
- Carrier tracking
- Shipping-label purchasing
- Retail inventory
- Employee assignments
- Employee activity tracking
- Time tracking
- Productivity metrics
- Shift scheduling
- Advanced analytics
- Customer accounts
- AI assistant
- Marketing automation
- Promotional SMS
- Broad multi-role permissions

Packing should remain a single practical staff action for the current two-person shop.

Do not add another required tap after packing unless a later operational need, WooCommerce synchronization rule, pickup-management problem, or carrier integration justifies it.

Final shipment and pickup concepts should remain documented as future lifecycle possibilities, but they are not the next immediate feature.

---

# 5. Supporting Ongoing Work

## Progressive Web App Hardening

**Priority:** High
**Status:** Planned / Incremental

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

# 6. Known Documentation Follow-Up

These source documents still contain older assumptions and need a later focused review:

- `docs/UI_Guidelines.md`
- `docs/Database_Schema.md`
- `docs/WooCommerce_Integration.md`

They remain important reference documents, but when they conflict with this Backlog they are not the authoritative source for the current priority order.

---

# 7. Explicitly Excluded From Version 1

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

# 8. Version 2 Candidates

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

# 9. Physical Production Research

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

# 10. Development Workflow

For every feature:

1. Confirm the repository is on `develop` and synchronized.
2. Read the approved source documents.
3. Implement only the active milestone.
4. Preserve completed screens and interaction patterns.
5. Perform manual QA.
6. Report exact files changed.
7. Provide Git verification commands.
8. Do not commit or push unless Kyle explicitly instructs it.
