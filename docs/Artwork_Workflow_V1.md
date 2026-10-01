# Forge Artwork Workflow V1

**Status:** Approved working specification\
**Date:** 2026-09-30\
**Project:** Forge --- The Hilltop Shop

## Purpose

This is the authoritative V1 scope for Forge artwork preparation and
production-file preparation. V1 solves repetitive file-management work:
finding Illustrator masters, creating customer folders, naming files,
finding artwork again, identifying ornament types, opening files for
production, and reducing missed ornaments.

**V1 is not full Illustrator or laser automation.** Forge is the artwork
launcher, file index, checklist, and production-preparation control
center. Illustrator remains the artwork editor.

**Critical safety rule: Forge must never modify or overwrite a master
Illustrator template.**

## Target Workflow

### 1. Prepare Artwork --- order by order

From a Forge order, click **Prepare Artwork** for an ornament.

Forge: 1. Determines the correct master from product/configuration. 2.
Creates the customer/order folder if needed. 3. Copies the master; never
edits the master. 4. Generates the correct `_LIVE.ai` filename. 5.
Records the artwork/file association. 6. Opens the LIVE copy in Adobe
Illustrator on the Mac.

Staff personalizes normally in the customer `_LIVE.ai` working file.
Editable artwork may remain off the Illustrator artboard. Staff manually
creates the outlined/merged production-ready version on the artboard and
presses **Command-S**. Both states remain together in the same customer
working file. Continue to the next ornament/order.

### 2. Proof

From Staff Orders, Meagan opens the **Proofing Queue** and chooses **Start
Proofing**. The active queue contains prepared customer working files on
nonterminal orders that have not been approved for their current proof
revision. Tray assignment and production batches do not affect eligibility.
Forge asks the local launcher to render a missing or corrected proof as needed,
then presents items sequentially without requiring Meagan to use Illustrator or
return to the order list between items.

The launcher renders the Illustrator artboard as a read-only PNG preview. The
proof contains only the artboard; it does not include the Illustrator workspace
or editable artwork parked outside the artboard, and rendering must leave the
`_LIVE.ai` file unchanged.

Forge displays that preview beside the submitted order and personalization.
Staff records either **Approve** or **Correction Needed** with a correction
note. Forge records the authenticated staff session automatically; the proofing
screen does not ask for a separate name. Either decision advances to the next
item in the current proofing pass. An approved item leaves the active queue. A
correction remains visible on the order and identifiable for a later pass; a
fresh render after the LIVE artwork is fixed creates a new proof revision and
returns the current decision to **Waiting for Proof** while retaining the prior
proof history. Proof state is separate from Forge's physical production status
and does not change tray or item completion.

### 3. Production Artwork

Forge provides a production view grouped by **ornament type and
meaningful production variant**, for example:

``` text
Christmas Tree — Small       7
Christmas Tree — Large       4
Grinch Tree                  3
Antler — 5 Name              2
Antler — 7 Name              1
Large Tree Frame             4
```

Opening a group should show the expected count plus customer/order/tray and
access to each associated customer working file. Forge provides **Open All
Artwork** as a convenience action for the prepared customer working files in
one canonical product/variant group. Production-file creation still requires
the production-assembly decisions listed later in this document.

### 4. Build Production File on Mac

The intended next phase opens the relevant customer working files and a
separate combined production file. Only the manually prepared artwork on
each customer file's artboard is eligible for production assembly; editable
off-artboard artwork is not.

The exact production-template selection, group-opening behavior, transfer
from customer artboards, placement/nesting, readiness signal, and production
filename lifecycle must be approved before implementation.

### 5. Shop / Laser

`READY_TO_LASER` contains assembled production batch files. Those are
what the Windows/shop computer needs. LightBurn remains the
laser-production application.

------------------------------------------------------------------------

## File Roles

### MASTER

Reusable Illustrator source. Stored with the product masters, currently
under:

`13_PRODUCTS/ORNAMENTS/[PRODUCT FOLDER]/`

Forge never edits or overwrites it.

### Customer Working File (`_LIVE.ai`)

Persistent customer artwork containing both working states:

- editable/live-text artwork may remain off the Illustrator artboard;
- manually outlined/merged production-ready artwork is placed on the
  artboard.

Example:

`SMITH_JOHN_CHRISTMAS-TREE-SMALL_LIVE.ai`

All corrections return to this file. The `_LIVE.ai` suffix remains the
current naming convention; it does not mean that every object in the file
must remain live text. Forge does not create or associate a separate
`_OUTLINED.ai` customer file.

### PRODUCTION

Actual multi-customer production batch.

Example:

`2026-09-28_CHRISTMAS-TREE-SMALL_PRODUCTION.ai`

This is what belongs in `READY_TO_LASER`.

------------------------------------------------------------------------

## Target Folder Structure

``` text
07_PRODUCTION/
├── CUSTOMER_ARTWORK/
│   └── YYYY/
│       └── LASTNAME_FIRSTNAME_ORDERNUMBER/
│           └── LASTNAME_FIRSTNAME_ORNAMENT-TYPE_LIVE.ai
├── READY_TO_LASER/
│   ├── 2026-09-28_CHRISTMAS-TREE-SMALL_PRODUCTION.ai
│   ├── 2026-09-28_CHRISTMAS-TREE-LARGE_PRODUCTION.ai
│   └── 2026-09-28_GRINCH-TREE_PRODUCTION.ai
└── SENT_TO_LASER/
    └── YYYY-MM-DD/
```

The shop Windows computer does not need the master library or full LIVE
customer-artwork library. It needs Ready-to-Laser production files.

`YYYY` under `CUSTOMER_ARTWORK` is the Forge order year.

Historical ornament artwork under `03_PROJECTS/Ornaments` remains the
legacy archive and must not be moved or rewritten. New Forge-created
ornament artwork uses `07_PRODUCTION/CUSTOMER_ARTWORK` from this workflow
forward.

Exact Mac/Windows shared-storage implementation remains TBD.

## Naming

Customer folder:

`LASTNAME_FIRSTNAME_ORDERNUMBER`

Example:

`SMITH_JOHN_1042`

Customer artwork targets:

`LASTNAME_FIRSTNAME_ORNAMENT-TYPE_LIVE.ai`

Normal user-facing filenames do not include personalization text. This
keeps files immediately recognizable in Finder and Illustrator without
creating long or unpredictable filenames from customer-entered text.

Examples:

``` text
SMITH_JOHN_CHRISTMAS-TREE-SMALL_LIVE.ai
HEMENWAY_KYLE_ANTLER-9-NAME_LIVE.ai
```

If the same order contains more than one artwork file of the same
ornament type and meaningful production variant, append a simple numeric
discriminator to the ornament type/variant portion. The first file has no
number; later files use `-2`, `-3`, and so on:

``` text
SMITH_JOHN_CHRISTMAS-TREE-SMALL_LIVE.ai
SMITH_JOHN_CHRISTMAS-TREE-SMALL-2_LIVE.ai
SMITH_JOHN_CHRISTMAS-TREE-SMALL-3_LIVE.ai
```

Forge retains the actual order-line/artwork association internally. Technical
identifiers such as Forge UUIDs and line IDs do not appear in normal
user-facing filenames. The discriminator belongs to the persistent customer
working file and remains stable when that file is reopened.

Production target:

`YYYY-MM-DD_ORNAMENT-TYPE[-VARIANT]_PRODUCTION.ai`

Special-character sanitization, filename length, and repeated
production-batch naming must be finalized during implementation.

------------------------------------------------------------------------

## Template Selection Rules

Forge must support different selection strategies.

-   **Acrylic Star/Tree:** single template.
-   **Christmas Tree:** by size --- Small / Large.
-   **Antler Ornament:** by personalization-position count --- 3
    through 10. People and pets both consume positions.
-   **Baby's First Christmas:** single master containing internal
    name-length/layout options; user selects the internal layout
    manually.
-   **Large Tree Frame:** master completed; mapping to be recorded.
-   Other products are added as clean masters are established.

Guiding rule: automate variant selection only where it meaningfully
saves time. V1 does not need automatic Illustrator artboard/layer
selection.

The existing master library remains in place for V1; do not reorganize or
rename it as part of this workflow. Forge uses explicit
product/variant-to-master mappings and never guesses a master from a
folder or filename.

### Artwork Template Setup

Forge Staff Admin Tools provides self-service artwork-template
registration using the canonical `product_definition_id`. Registrations
support **Single Master**, **By Size**, and **By Personalization Position
Count**. Exact filenames or the constrained `{count}` pattern are stored
by Forge; absolute Mac paths remain only in the local launcher registry.

A registered family may be empty or partially complete. The designated
production Mac validates each configured variant independently and reports
cached readiness to Forge. Missing files remain `master_missing` for their
specific variants without invalidating the family or another Ready variant.
Staff Orders reads this cached state without requiring the launcher to be
online.

------------------------------------------------------------------------

## Prepare Artwork Requirements

When clicked:

1.  Identify configured master.
2.  Determine the Forge order year and create
    `CUSTOMER_ARTWORK/YYYY/LASTNAME_FIRSTNAME_ORDERNUMBER` if needed.
3.  Generate the recognizable customer/product LIVE filename, including
    the numeric discriminator when required.
4.  Check whether artwork already exists.
5.  If new, copy master, record association, and open LIVE.
6.  If existing, do not create an uncontrolled duplicate; open/use
    existing LIVE.

Forge must fail clearly rather than guess if the master is missing,
destination cannot be created, path is invalid, or local Mac bridge is
unavailable.

------------------------------------------------------------------------

## Illustrator Customer Working-File Preparation

There is no separate customer OUTLINED derivative and no automated
Illustrator outline/merge action in this workflow.

The approved manual behavior is:

1.  Open the associated customer `_LIVE.ai` working file through Forge.
2.  Personalize the artwork.
3.  Keep editable/live-text artwork off the artboard where useful.
4.  Manually create the outlined/merged production-ready artwork on the
    artboard.
5.  Press **Command-S** so both states remain in the same associated file.

MASTER remains untouched. The customer working file remains editable and is
the only customer artwork file Forge associates with that order line.

------------------------------------------------------------------------

## Artwork Queue Requirements

Forge remembers artwork associations so Finder is not the
production-management system.

Example group:

``` text
CHRISTMAS TREE — SMALL
Expected Artwork: 7

Tray  Customer       Customer Artwork
3     Smith          Open Working File
5     Jones          Open Working File
7     Miller         Open Working File
8     Brown          Open Working File
9     Davis          Open Working File
11    Wilson         Open Working File
14    Taylor         Open Working File
```

The expected quantity must be prominent. This provides reconciliation
before cutting and reduces missed ornaments.

### Group Opening and Future Assembly

**Open All Artwork** opens the existing prepared customer `_LIVE.ai` working
files for one canonical product/variant group through the secure Mac launcher.
It does not create associations or create, copy, rename, save, or modify files.

Future production assembly may use only the manually prepared artwork on each
file's artboard. The safe mechanism for copying artboard artwork into a
combined production file is not yet defined.

### Create Production File

Before this action is implemented, define how Forge selects the batch, how an
item is marked ready for assembly, which production template is used, how the
production filename and repeat runs are handled, whether Forge opens or copies
artboard artwork, and who controls placement/nesting. A production file must
remain separate from every customer working file and must never silently
overwrite an existing file.

### Production Assembly Decisions Required

Do not implement production assembly until these choices are approved:

1.  **Batch membership:** product/variant grouping plus the event, order,
    tray, production status, or explicit staff selection rules that include or
    exclude an item.
2.  **Assembly readiness:** the explicit staff action or state confirming that
    the customer file's on-artboard artwork is ready. `prepared` currently
    confirms file creation/opening only and must not imply assembly readiness.
3.  **Production template:** the explicit product/variant-to-template mapping,
    approved local root, and behavior when a template is missing or invalid.
4.  **Artboard source:** which artboard is production-ready when a customer
    file has multiple artboards, and whether the source must follow a naming or
    index convention.
5.  **Transfer behavior:** whether the launcher only opens the selected
    customer files for manual copying or an approved Illustrator script copies
    artboard contents into the combined production file.
6.  **Placement and nesting:** fully manual placement or a defined automated
    rule, including units, scale, layer, origin, spacing, and material bounds.
7.  **Production destination and naming:** staging versus direct creation in
    `READY_TO_LASER`, batch date/sequence naming, and repeat-run behavior.
8.  **Idempotency and corrections:** how Forge records which order lines were
    included, refuses duplicate inclusion, and handles a customer working file
    changed after assembly without silently overwriting prior production work.

------------------------------------------------------------------------

## Proofing

Working concept:

**Artwork Prepared → Waiting for Proof → Correction Needed OR Proof
Approved → Production Preparation**

Proofing is separate from physical production status.

Meagan needs a fast reference connecting tray, customer/order, ornament,
engraved names/text, pets/icons where relevant, and year/configuration
where relevant. Full Forge order notes remain available for unusual
cases.

------------------------------------------------------------------------

## Trays, Bins, and Batch Work

Tray/bin is the order's home, but V1 must not assume every physical
component remains in its bin throughout production.

Real production includes batch work such as painting several Grinch
Trees together. Forge should preserve customer/tray visibility without
attempting individual physical-piece tracking.

Numbering the existing physical bins is operationally useful but does
not replace Forge's artwork list and expected counts.

------------------------------------------------------------------------

## Generic vs. Personalized Components --- Preserve for Later

Production discovery established two component classes.

Christmas Tree example:

**Generic/interchangeable** - Large Tree - Small Tree - Large Bow -
Small Bow

**Personalized/configured** - Background - Named ornaments - Pet
pieces - Year/configured elements where applicable

This is important future production knowledge. **V1 does not
automatically identify, extract, count, assemble, or track these
components.**

------------------------------------------------------------------------

## Explicit V1 Exclusions

Do not expand V1 to include:

-   automatic name insertion/typesetting,
-   broad Illustrator layer manipulation,
-   automatic generic/personalized component extraction,
-   automatic production-sheet assembly,
-   automatic nesting or material optimization,
-   paint-batch management,
-   individual physical-component tracking,
-   LightBurn control,
-   automatic laser operation,
-   generic-component inventory,
-   component production recipes,
-   redesign of Forge's existing physical production lifecycle.

------------------------------------------------------------------------

## Local Mac / Browser Architecture Requirement

Forge is browser-based while Illustrator and artwork files are local to
the Mac. The browser cannot freely copy arbitrary local files, create
arbitrary folders, or launch arbitrary local documents without an
appropriate bridge.

Forge uses the installed **Forge Artwork Launcher**, registered for the
constrained `forge-artwork://` URL scheme. Authenticated Forge staff issue
a short-lived one-use token; the launcher exchanges it against the fixed
Forge origin, presents the native macOS picker, validates masters read-only,
and reports per-variant results using a separately scoped report token.

The maintained launcher source is tracked at
`tools/forge-artwork-launcher/`. Machine-specific configuration and the
local template registry remain protected under
`~/Library/Application Support/Forge Artwork Launcher/`.

This bridge implements template registration and validation, Prepare
Artwork/Open LIVE Artwork, grouped opening, and artboard-only proof rendering.
It creates or reopens the explicitly associated customer working file, opens
that file in Illustrator when requested, and renders proofs without modifying
the customer file or MASTER.

------------------------------------------------------------------------

## Data Forge Needs to Remember

Exact schema is an implementation decision. Conceptually an artwork
record needs enough information to associate:

-   Forge order,
-   line item/design,
-   product/ornament type,
-   relevant template/production variant,
-   tray where applicable,
-   master/template association,
-   customer `_LIVE.ai` working-file path,
-   artwork-prepared state/time,
-   proof state.

Do not duplicate information Forge already knows unless required for
file association/history.

------------------------------------------------------------------------

## Existing Forge Lifecycle Remains Intact

Artwork workflow state is additional metadata/workflow.

It must not redefine existing physical states such as Submitted, Tray
Assigned, In Production, Ready to Pack, or Completed.

Item completion continues to mean physical production completion, not
artwork preparation.

------------------------------------------------------------------------

## Do Not Re-Architect

Codex/development work must:

-   read approved Forge documentation first,
-   implement only the selected artwork task,
-   avoid unrelated refactors,
-   preserve existing order/tray/production behavior,
-   preserve existing screens unless explicitly changed,
-   add schema changes only when required,
-   maintain tests,
-   report affected files and manual test steps,
-   not commit, push, deploy, migrate, or alter production data unless
    explicitly authorized.

------------------------------------------------------------------------

## V1 Acceptance Scenarios

**Prepare Artwork:** A 9-position Antler selects its explicitly mapped
9-name master, creates the Forge-order-year customer folder and correctly
named `LASTNAME_FIRSTNAME_ANTLER-9-NAME_LIVE.ai` copy, leaves the master
unchanged, opens LIVE in Illustrator, and avoids uncontrolled duplicates.

**Customer working state:** Staff keeps editable artwork and manually prepared
on-artboard production artwork in the same associated `_LIVE.ai` file and
saves it normally. Forge creates no customer OUTLINED derivative.

**Production Group:** Seven Small Christmas Tree artworks display as
`Christmas Tree — Small: 7` with all seven customer/order/tray records.

**Production assembly:** A future approved action uses only production-ready
artwork placed on customer-file artboards and creates or opens a separate
combined production file without modifying customer files or silently
overwriting an existing production file.

**Reconciliation:** The expected ornament-group quantity is visible
before laser production.

------------------------------------------------------------------------

## Recommended Implementation Sequence

### Milestone 0 --- Read-Only Architecture Investigation

No code changes. Determine the smallest reliable Mac/local-file bridge.
Report findings, risks, relevant existing architecture, and recommended
proof-of-concept.

### Milestone 1 --- Local File Bridge Proof of Concept

One test ornament only: copy one master, create one test destination,
open the copy in Illustrator, prove the master remains untouched.

### Milestone 2 --- Dynamic Prepare Artwork

Use real Forge order/product/customer data: template mapping, folder
creation, generated filename, duplicate detection, persistent
association, Open LIVE.

### Milestone 3 --- Customer Working-File Workflow

Approved manual Illustrator workflow: editable artwork may remain off-artboard;
production-ready outlined/merged artwork is placed on the artboard; both states
are saved together in the associated `_LIVE.ai` file. No additional customer
file or automation is required.

### Milestone 4 --- Production Assembly Design

Approve batch selection, assembly readiness, production-template mapping,
artboard transfer behavior, placement/nesting responsibility, production-file
naming, and repeat-run safeguards.

### Milestone 5 --- Read-Only Production Artwork Queue

Initial convenience slice implemented: active, prepared customer working files
are grouped by canonical product/variant and can be opened together through the
secure Mac launcher. No artwork state or production-management state is added.
A richer queue with customer/order/tray and readiness management remains
outside this slice.

### Milestone 6 --- Approved Production Assembly Bridge

Implement only the group opening, production-file creation, and artboard
transfer behavior approved in Milestone 4, with overwrite safeguards.

### Milestone 7 --- Proofing Integration

Implemented as a sequential Manual Proofing queue in Staff Orders, with the
individual proof action retained in Staff Order Detail. Missing and corrected
previews are requested from the secure local launcher when encountered. Proof
previews, decisions, correction notes, staff identity, revisions, and history
are stored as additive artwork metadata. No OCR or automatic comparison is
performed.

### Milestone 8 --- Operational Validation

Use V1 on real orders before considering Phase 2.

------------------------------------------------------------------------

## First Codex Task

Use this as the first Codex prompt:

> Read the approved Forge project documentation and
> `Artwork_Workflow_V1.md`. Do not modify code. Inspect the current
> Forge architecture and determine the smallest viable method for a
> Forge browser action on the Mac to copy a designated local `.ai`
> master to a designated `CUSTOMER_ARTWORK` path, give the copy a
> generated filename, and open that copy in Adobe Illustrator. The
> master must never be modified. Report the relevant existing
> architecture/files, viable implementation options,
> risks/security/browser constraints, your recommended proof-of-concept,
> and the exact files/components that proof-of-concept would affect. Do
> not implement, commit, push, deploy, migrate, or change production
> data.

------------------------------------------------------------------------

## Future Phase 2 --- Preserve, Do Not Build Yet

Parked ideas:

-   generic vs. personalized component understanding,
-   aggregate generic component quantities,
-   material/finish grouping,
-   batch painting/manufacturing stages,
-   automatic personalized-artwork extraction,
-   automatic production-file assembly,
-   automatic expected-vs-included reconciliation,
-   component-level production recipes.

------------------------------------------------------------------------

## Development Checkpoint

**Current state --- 2026-09-30**

-   Workflow scoped.
-   Real production bottlenecks identified.
-   Proof-sheet concept validated with real active orders.
-   Representative clean master library established.
-   Mac/browser bridge proof-of-concept completed.
-   Artwork-template readiness and self-service template setup implemented.
-   Christmas Tree Small and Large masters validated on the designated
    production Mac through the native launcher workflow.
-   Prepare Artwork/Open LIVE Artwork implemented and manually validated for
    Small Tree, Large Tree, same-variant discriminators, association reuse,
    MASTER protection, and launcher completion reporting.
-   Single customer working-file workflow approved; no separate OUTLINED file
    or association will be created.
-   Open All Artwork groups existing prepared customer working files by
    canonical product/variant and opens them without creating or changing
    artwork.
-   Manual Proofing renders the associated customer file's artboard without
    changing the file and records staff decisions separately from production.

Representative clean masters: - Acrylic Star/Tree - Christmas Tree ---
Small - Christmas Tree --- Large - Baby's First Christmas --- single
master with internal options - Antler Ornament --- 3 through 10 position
masters - Large Tree Frame

Completing the entire master library is not a prerequisite for the
architecture proof-of-concept.

------------------------------------------------------------------------

## Definition of Success

A normal cycle becomes:

> Forge order → Prepare Artwork → correct customer LIVE file opens →
> personalize → manually keep editable artwork off-artboard and place the
> production-ready outlined/merged artwork on the artboard → Command-S →
> continue through orders → Production Artwork → select ornament group →
> see expected quantity → open the associated customer working files and a
> separate combined production file using the approved assembly workflow →
> assemble on Mac → save to `READY_TO_LASER` →
> open on Windows/LightBurn and manufacture.

The user should no longer need to remember where artwork lives,
repeatedly type filenames, manually create customer folders, open random
files to discover ornament type, or rely on memory to determine whether
every ornament has been included.
