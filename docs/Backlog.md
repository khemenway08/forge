# Backlog

**Version:** 1.4
**Status:** Approved
**Last Updated:** 2026-08-06

## Purpose

Defines the current Forge roadmap, records what is implemented, and orders the remaining work according to the actual needs of The Hilltop Shop's two-person workflow.

## Authority

This document is the authoritative source for Forge priority and feature status.

## Dependencies

- `Forge.md`
- `UI_Guidelines.md`
- `Database_Schema.md`
- `Product_Definitions.yaml`
- `WooCommerce_Integration.md`

---

# 1. Prioritization Rule

A feature should move forward only when it clearly:

- Makes ordering faster
- Makes production faster
- Reduces mistakes
- Makes orders easier to locate
- Eliminates paper
- Prevents relying on memory
- Improves data safety or recovery

Forge Version 1 is for Kyle and Meagan. Do not add enterprise workforce features or broad speculative modules.

# 2. Current Confirmed Checkpoint

## Repository and Live Checkpoint

```text
Repository: khemenway08/forge
Branch: develop
Commit: 48b48e84bece23bf6378d78ab9001f27b382b9fc
Message: Prepare build 20260731-49
origin/develop: matched confirmed local checkpoint
Live public build: 20260731-49
Live service-worker cache: forge-starter-v49
Automated Node tests: 390 passed
```

## Confirmed Manual Reliability Result

One real iPad test passed:

- Submit while offline
- Local saved state displayed
- Refresh preserved the same pending order
- Reconnect uploaded automatically
- Order appeared once in Staff Orders

## Completed and Working

### Customer Order Experience

- Customer welcome and product-category flow
- Ornament ordering flows
- Multi-item orders
- Customer information
- Final review
- Card/Square, Cash, and Venmo method selection
- **Payment Received — Submit Order** action
- Durable local IndexedDB save
- Initial server upload attempt before normal success
- Local saved recovery state
- Automatic retry scheduling
- Refresh and restart recovery
- Order submission and thank-you flow
- Event-gated public ordering
- Test Sessions
- Persistent Person/Pet name entry
- Person and Pet reordering, editing, and removal
- Pet icon and Custom Icon handling
- Mobile word capitalization
- Spellcheck, autocorrect, and autocomplete disabled for engraving names

### Staff and Production

- Staff PIN authentication for staff tools
- Staff dashboard
- Shared server-backed Staff Orders queue
- Order detail
- Sequential Forge order numbers
- Production tray assignment
- Tray conflict prevention
- Item-level completed quantities
- Production progress counts
- Ready-to-Pack queue
- Completion confirmation
- `completed_at` timestamps
- Tray release and reuse
- Order cancellation with tray release
- Production filtering and batch summaries
- Staff internal notes
- Event management
- Completed-order history and filters

### Hilltop Design Catalog

- Staff-only isolated module
- Designs
- Hats
- Materials
- Shortlist
- Finished Hats
- Visual cards
- Search and filtering
- Sorting and ordering
- Design, hat, and material linking
- Finished-hat linking workspace
- Isolation from customer orders and production

### Deployment and Reliability

- Protected Hostinger deployment workflow
- Deployment package verification
- Timestamped rollback backup
- Health and live-version checks
- Public/private file separation
- Service-worker build/cache versioning
- Build `20260731-49` deployed and manually verified

# 3. Current Decisions That Must Not Be Rebuilt Accidentally

## Payment Handoff

Current live behavior:

- Customer or staff selects a payment method.
- The final button becomes available.
- Pressing it immediately submits the order.
- There is no customer-flow payment PIN.
- There is no backend Awaiting Payment Approval queue.
- The Staff PIN protects staff tools only.

Decision:

- Leave this flow unchanged for one or two real shows.
- Review actual unpaid, accidental, abandoned, or mismatched orders afterward.
- Do not add a PIN or approval queue without evidence.

## Completion

Current live behavior:

- Ready-to-Pack orders use **Complete & Release Tray**.
- Completion changes the order to `completed`.
- `completed_at` is recorded.
- The tray is released.

Decision:

- Keep this as the current Version 1 terminal production action.
- Separate shipped and picked-up actions remain deferred.
- Durable item-by-item packing-verification history remains an open decision, not a completed feature.

## Current Data Authority

- Forge server database is the current shared operational source of truth.
- IndexedDB is the local durability and recovery layer.
- WooCommerce is not currently synchronized.

# 4. Priority Order

## Priority 1 — Approve and Save the Reconciled Documents

**Priority:** Critical
**Status:** Completed — 2026-08-06

Completed work:

- Reviewed the five rewritten source documents.
- Resolved the documented workflow and architecture conflicts.
- Approved the reconciled Forge source documents.
- Changed all document statuses from draft to approved.
- Saved the replacement files locally.
- Replaced the ChatGPT Project source copies.

Repository housekeeping:

- Commit the approved documentation update separately from runtime changes when repository work resumes.

No application behavior changed during this documentation task.

## Priority 2 — Show Tablet and Physical Security Plan

**Priority:** Critical Operational
**Status:** Not Started

Decisions needed:

- Use personal iPads temporarily or buy dedicated show tablets.
- Select tablet model and quantity.
- Choose rugged cases.
- Choose inexpensive stable stands.
- Add a cable-lock or tether method.
- Configure Guided Access or equivalent kiosk restriction.
- Disable personal notifications, saved passwords, and purchasing.
- Plan charging, extension power, and backup battery.
- Decide hotspot or venue-network approach.

Avoid expensive full kiosk enclosures unless real show use proves they are necessary.

## Priority 3 — Physical Production Tray Setup

**Priority:** Critical Operational
**Status:** Not Started

Required work:

- Select shallow durable optical/eyeglass-style trays.
- Confirm outside dimensions.
- Buy an initial practical quantity.
- Add permanent tray numbers.
- Add reusable dry-erase customer labels.
- Select or build tray storage.
- Match physical tray numbers to Forge configuration.

Do not add more tray software before the physical system is proven.

## Priority 4 — Database Backup and Restore Verification

**Priority:** Critical
**Status:** Planned

Required work:

- Confirm current automatic backup behavior.
- Record frequency, retention, and storage location.
- Confirm backups are separate from the live database.
- Include order, tray, item completion, event, notes, outbound message, and catalog tables.
- Document the exact restore procedure.
- Restore into a nonproduction database.
- Verify record counts and relationships.
- Never test restoration over production.

A backup is not proven until a restore drill succeeds.

## Priority 5 — Full Two-Tablet and Failure Test Matrix

**Priority:** Critical
**Status:** Partially Started

Already passed:

- One offline submission
- Refresh recovery
- Reconnect upload
- No duplicate in Staff Orders

Still required:

- Two tablets submit simultaneously.
- Repeated final-button taps.
- Wi-Fi loss before final submission.
- Wi-Fi loss during upload.
- Wi-Fi loss immediately after upload begins.
- Refresh during submission.
- Browser closes and reopens.
- Event closes while a draft is open.
- One device uses an older cached build.
- Two staff devices update the same order.
- Item completion followed by immediate refresh.
- Completion and tray release followed by immediate refresh.

Record expected result, actual result, customer view, staff view, and recovery procedure for each case.

## Priority 6 — Show Operations and Recovery Checklist

**Priority:** High
**Status:** Planned

Create three short checklists:

### Morning of show

- Build and health check
- Active event check
- Tablet charge and network check
- Test order
- Staff PIN check
- Square, cash, and Venmo readiness
- Starting order count

### During show

- What to do when a tablet says Order Saved on This iPad
- What to do when an order needs staff attention
- How to verify the order reached Staff Orders
- When not to clear browser data or close the tablet
- How to switch to the backup tablet

### End of show

- Count Forge orders
- Count Square orders
- Count cash orders
- Count Venmo orders
- Compare totals and payment methods
- Confirm no pending local orders
- Close the event
- Verify database backup

## Priority 7 — Payment Handoff Pilot Review

**Priority:** High
**Status:** Waiting for One or Two Shows

Collect evidence on:

- Unpaid submitted orders
- Accidental submissions
- Abandoned orders
- Payment method mistakes
- Forge/payment count mismatches
- Whether customers press the final button without staff involvement

Possible later responses, only if needed:

- Staff-only final action
- Small handoff screen change
- Temporary staff confirmation control
- Backend payment-review state

Do not choose a solution before observing the actual problem.

## Priority 8 — Device Identification and Local-Pending Visibility

**Priority:** High
**Status:** Planned

Current gap:

- The submission code sends `device_id: null`.
- A server Staff Orders screen on another device cannot display an order that exists only in one tablet's IndexedDB.

Potential work:

- Assign a stable business-safe device ID to each show tablet.
- Display the originating device in staff diagnostics.
- Show local pending and failed counts clearly on each tablet.
- Provide a simple staff recovery screen for that tablet.

Do not expose technical identifiers to customers unless needed for recovery instructions.

## Priority 9 — Durable Completion Verification Decision

**Priority:** Medium
**Status:** Decision After Real Use

Current behavior:

- Completion records the final order status and timestamp.
- Tray release history is preserved.
- A separate durable item-by-item packing-verification record is not stored.

Decide after real production use whether Forge needs:

- Per-item verification acknowledgments
- A permanent packing verification record
- Packing notes
- Reopen or correction history

Do not build an audit-heavy system unless it prevents a real mistake.

## Priority 10 — Remaining Reliability Hardening

**Priority:** Medium
**Status:** Planned

- Stronger server payload validation
- Old cached-build compatibility gate
- Cancellation invariant review
- Completion-receipt edge cases
- New-session duplicate-risk review
- Ready-to-Pack pagination beyond current result limits
- Migration `009` bookkeeping investigation without blindly running it

## Priority 11 — WooCommerce Synchronization

**Priority:** Later
**Status:** Deferred Until Stability Passes

Do not begin until:

- Backup restore is proven.
- Two-tablet submission testing passes.
- Duplicate prevention is accepted.
- Local pending recovery is documented.
- Current payment pilot is reviewed.
- Current Forge order lifecycle is stable.

WooCommerce must be an additional synchronized record, not a new place where an order can disappear.

## Priority 12 — Hilltop Design Catalog Refinement

**Priority:** Later / Incremental
**Status:** Parked

Continue only after the operational priorities above.

Potential later work:

- Better asset ingestion
- More catalog fields
- Bulk edits
- Export and print tools
- Finished Hat location inventory only after the Blank Hat inventory foundation is proven

## Priority 13 — Additional Customer Product Categories

**Priority:** Later
**Status:** Parked

Potential order:

1. Signs
2. Kitchen
3. General Custom Request

Add one customer product flow at a time. Do not redesign the completed ornament system.

# 5. Parked and Explicitly Excluded

Do not build now:

- Employee assignments
- Employee activity tracking
- Time tracking
- Productivity metrics
- Shift scheduling
- Workload balancing
- Advanced analytics
- Broad role permissions
- Customer accounts
- AI assistant
- Marketing automation
- Promotional SMS
- Carrier tracking
- Shipping-label purchasing
- Separate shipped and picked-up actions

# 6. Development Workflow

For each software task:

1. Confirm the repository is on `develop`.
2. Confirm local and `origin/develop` status.
3. Read the approved source documents.
4. Implement only the selected task.
5. Preserve completed screens and interactions.
6. Run focused tests.
7. Run the full suite when appropriate.
8. Run `git diff --check`.
9. Provide manual testing steps.
10. Do not commit, push, migrate, deploy, or send email unless explicitly instructed.

Documentation-only changes should be committed separately from runtime changes.

# 7. Version History

## Version 1.4 — 2026-08-06

Updated the live checkpoint to build `20260731-49`, recorded the completed submission-recovery hardening, removed the outdated claim that customer submission uses a payment PIN, replaced the packed workflow with the current completed workflow, made physical show readiness and backup verification the leading priorities, and deferred WooCommerce until reliability is proven.

## Version 1.3 — 2026-07-31

Replaced the original milestone list with a stability-first roadmap.
