# Forge Artwork Workflow V1

**Status:** Approved working specification\
**Date:** 2026-09-28\
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

Staff personalizes normally, presses **Command-S**, then uses the
Illustrator finalization workflow to create OUTLINED. Continue to the
next ornament/order.

### 2. Proof

Meagan proofs artwork against Forge order data. Artwork proof state is
separate from Forge's physical production status. The already-tested
proof-sheet concept remains part of V1.

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

Opening a group shows the expected count plus customer/order/tray and: -
**Open LIVE** - **Open OUTLINED** - **Open All OUTLINED** - **Create
Production File**

### 4. Build Production File on Mac

**Open All OUTLINED** opens all customer OUTLINED files for that
ornament group in Illustrator.

**Create Production File** creates a correctly named file from that
ornament's production template directly in `READY_TO_LASER` and opens
it.

The user manually copies the required pieces from the open OUTLINED
files, arranges/nests them, and saves the production file.

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

### LIVE

Editable customer artwork with live text.

Example:

`SMITH_JOHN_CHRISTMAS-TREE-SMALL_LIVE.ai`

All corrections return to LIVE.

### OUTLINED

Production-safe derivative of LIVE.

Example:

`SMITH_JOHN_CHRISTMAS-TREE-SMALL_OUTLINED.ai`

OUTLINED is used to assemble production batches and can be regenerated
from LIVE.

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
│           ├── LASTNAME_FIRSTNAME_ORNAMENT-TYPE_LIVE.ai
│           └── LASTNAME_FIRSTNAME_ORNAMENT-TYPE_OUTLINED.ai
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

`LASTNAME_FIRSTNAME_ORNAMENT-TYPE_OUTLINED.ai`

Normal user-facing filenames do not include personalization text. This
keeps files immediately recognizable in Finder and Illustrator without
creating long or unpredictable filenames from customer-entered text.

Examples:

``` text
SMITH_JOHN_CHRISTMAS-TREE-SMALL_LIVE.ai
SMITH_JOHN_CHRISTMAS-TREE-SMALL_OUTLINED.ai
HEMENWAY_KYLE_ANTLER-9-NAME_LIVE.ai
HEMENWAY_KYLE_ANTLER-9-NAME_OUTLINED.ai
```

If the same order contains more than one artwork file of the same
ornament type and meaningful production variant, append a simple numeric
discriminator to the ornament type/variant portion. The first file has no
number; later files use `-2`, `-3`, and so on:

``` text
SMITH_JOHN_CHRISTMAS-TREE-SMALL_LIVE.ai
SMITH_JOHN_CHRISTMAS-TREE-SMALL-2_LIVE.ai
SMITH_JOHN_CHRISTMAS-TREE-SMALL-3_LIVE.ai
SMITH_JOHN_CHRISTMAS-TREE-SMALL-2_OUTLINED.ai
```

The OUTLINED derivative retains the LIVE file's discriminator. Forge
retains the actual order-line/artwork association internally. Technical
identifiers such as Forge UUIDs and line IDs do not appear in normal
user-facing filenames.

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

## Illustrator LIVE → OUTLINED Finalization

V1 should investigate a small Illustrator script/action.

Desired one-shortcut behavior:

1.  Save LIVE first.
2.  Preserve LIVE with editable text.
3.  Create a copy in the same folder.
4.  Rename `_LIVE.ai` to `_OUTLINED.ai`.
5.  Outline the required artwork/text on the copy only.
6.  Save OUTLINED.
7.  Leave Illustrator in a predictable state.

**LIVE must never be destructively outlined.**

------------------------------------------------------------------------

## Artwork Queue Requirements

Forge remembers artwork associations so Finder is not the
production-management system.

Example group:

``` text
CHRISTMAS TREE — SMALL
Expected Artwork: 7

Tray  Customer       LIVE          OUTLINED
3     Smith          Open LIVE     Open OUTLINED
5     Jones          Open LIVE     Open OUTLINED
7     Miller         Open LIVE     Open OUTLINED
8     Brown          Open LIVE     Open OUTLINED
9     Davis          Open LIVE     Open OUTLINED
11    Wilson         Open LIVE     Open OUTLINED
14    Taylor         Open LIVE     Open OUTLINED
```

The expected quantity must be prominent. This provides reconciliation
before cutting and reduces missed ornaments.

### Open All OUTLINED

One action opens every available OUTLINED file for the selected ornament
group on the Mac. Missing OUTLINED files must be clearly identified, not
silently skipped. Forge does not combine or manipulate artwork.

### Create Production File

For the selected ornament group:

1.  Determine configured production template.
2.  Generate production filename.
3.  Create it directly in `READY_TO_LASER`.
4.  Open it in Illustrator.
5.  Do not automatically copy customer artwork into it in V1.
6.  Never silently overwrite an existing production file.

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

This bridge currently proves template registration and validation. It does
not yet implement Prepare Artwork, create customer files, or open Illustrator.

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
-   LIVE file path,
-   OUTLINED file path,
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

**OUTLINED:** Finalization saves LIVE first, creates OUTLINED, outlines
only the copy, and leaves LIVE editable.

**Production Group:** Seven Small Christmas Tree artworks display as
`Christmas Tree — Small: 7` with all seven customer/order/tray records.

**Open All OUTLINED:** One action opens all valid OUTLINED files;
missing files are clearly identified.

**Create Production File:** Forge creates a correctly named production
file from the configured production template in `READY_TO_LASER`, opens
it, and does not silently overwrite an existing file.

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

### Milestone 3 --- Illustrator Finalization Proof

Test LIVE → OUTLINED: save LIVE, create copy, outline copy only,
predictable state.

### Milestone 4 --- Artwork Queue

Grouped view with expected counts, customer, order/tray, Open LIVE, Open
OUTLINED.

### Milestone 5 --- Open All OUTLINED

Group-level opening.

### Milestone 6 --- Create Production File

Production-template mapping, generated filename, `READY_TO_LASER`
destination, opening, overwrite safeguards.

### Milestone 7 --- Proofing Integration

Integrate the validated proof workflow with artwork records/states.

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

**Current state --- 2026-09-29**

-   Workflow scoped.
-   Real production bottlenecks identified.
-   Proof-sheet concept validated with real active orders.
-   Representative clean master library established.
-   Mac/browser bridge proof-of-concept completed.
-   Artwork-template readiness and self-service template setup implemented.
-   Christmas Tree Small and Large masters validated on the designated
    production Mac through the native launcher workflow.
-   Prepare Artwork has not begun.

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
> personalize → one finalization action safely creates OUTLINED →
> continue through orders → Production Artwork → select ornament group →
> see expected quantity → Open All OUTLINED → Create Production File →
> manually assemble on Mac → save → file is already in `READY_TO_LASER` →
> open on Windows/LightBurn and manufacture.

The user should no longer need to remember where artwork lives,
repeatedly type filenames, manually create customer folders, open random
files to discover ornament type, or rely on memory to determine whether
every ornament has been included.
