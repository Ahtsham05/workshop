# Manufacturing — Phase 7 (Production Order detail)

The production-order page (also used by assembly orders) is now a full work order. It has:
- a header with a progress bar,
- ten tabs: Overview, Materials, Operations, Assemblies, WIP, Quality, Scrap, Costs,
  Documents and Activity.

Phase 7 also adds four capabilities the earlier phases didn't have:
- a **routing** (operations), tracked step by step,
- a **production team**,
- **material reservations**,
- **order documents**.

## Header

- **Order:** number, product, status and priority, plus the BOM link.
- **Progress bar:** good units against plan (e.g. *72% complete*). This is the same
  completion % as the order list. Output still in QC or rework is shown as a lighter
  segment. The line beside the bar reads *29 of 40 pcs good · 3 in QC / rework · 11 to
  produce*.
- **Lifecycle stepper:** Draft → Planned → Released → In Production → Completed.
- **Actions:** unchanged. The ⋯ menu adds **Print job card**, and *Refresh from BOM*
  now refreshes the routing too.
- **Tab in the URL:** the open tab is kept as `?tab=costs` etc., so it survives a reload
  and can be linked.

## Tabs

| Tab | What it shows |
| --- | --- |
| **Overview** | Product, BOM, quantity, produced, good, rejected, remaining, start and due dates (with *N days late*), warehouse and locations, operator and production team. Also: the stock → WIP → QC → finished-goods flow, work waiting on QC or rework, the routing at a glance, material readiness, and notes |
| **Materials** | One row per line, each with a progress bar, showing Required · Reserved · Issued · Consumed · Remaining · Shortage. On phones each line becomes a card that keeps all six figures. Below: the issue and return history |
| **Operations** | The production timeline (see below) |
| **Assemblies** | Parent and sub-assembly orders, each with progress, plus *Create sub-assembly orders*. Then the genealogy trace |
| **WIP** | WIP value, lots, location and oldest lot; the lots table; the order's stock ledger |
| **Quality** | Produced, inspected, first-pass yield, rejected, awaiting QC and in rework. Then outputs waiting for inspection, the rework queue, and every output with its inspection result |
| **Scrap** | Scrap value, records, scrap rate (of net material issued) and units rejected. Then a breakdown by stage and by reason, and the records |
| **Costs** | Planned, actual to date, forecast at completion and variance (see below) |
| **Documents** | Attachments (uploads and links), the production records the system generated (issues, returns, output reports, receipts, scrap notes), and *Print job card* |
| **Activity** | Everything that happened, newest first, grouped by day and filterable by status, operations, materials, output and QC, scrap and documents |

## Operations (routing)

**On the BOM.** A BOM version now has a **Routing**: an ordered list of steps. Each step
has:
- a work center,
- setup minutes and run minutes per unit,
- a cost per hour (labour plus machine),
- work instructions.

It is edited in the BOM editor and shown on a new **Routing** tab of the BOM drawer. A
locked BOM version can still have its routing changed through the API, because orders
keep their own copy.

**On the order.** An order copies the routing when it is created, with planned time =
setup + run × quantity. It re-copies the routing when its recipe changes, or when *Refresh
from BOM* is used, as long as no step has started. On the order you can also add a step
(after any other step), edit, reorder, skip, or remove steps that haven't started. These
changes affect this order only.

**Floor actions** (`executeProduction`):

| Action | Allowed when | Effect |
| --- | --- | --- |
| Start | Step pending; order Released or In Production | Records who started it and when |
| Complete | Step pending or in progress; order Released, In Production or Paused | Records the time worked (see below), the finish time and an optional note |
| Skip | Step pending | Marks the step skipped |
| Reopen | Step completed or skipped | Puts it back in progress or pending |

- **Release → In Production:** starting or completing the first step on a Released order
  moves it to In Production, as a first material issue does. This is recorded in the
  status history.
- **Concurrent taps:** writes are conditional on the step's current status, so if two
  people tap at once, one gets *changed by someone else*.
- **Time worked:** the *Complete* dialog pre-fills it with the elapsed time when that fits
  in a shift (≤ 12 h). Otherwise it pre-fills the planned time. The server applies the
  same rule when no minutes are sent: a step opened on Monday and closed on Tuesday isn't
  counted as 29 hours worked. Instead it is left *not recorded* and costed at plan.

**Timeline.** The timeline shows the routing steps, then two automatic stages:
- **Quality check**, driven by output and inspections. It reads *quality checks are off*
  when the setting is off.
- **Finished goods**, driven by receipts.

Each step shows ✓ completed, ● in progress, ○ pending or – skipped, with who did it and
when, time worked against plan, notes and instructions.

## Reservations

Stock on hand is promised to open orders **in queue order**:
1. Orders on the floor (in production or paused), then released orders, then planned
   orders.
2. Within each group, by priority, then planned start, then age.

**Reserved** is what is left for this order's outstanding lines after the orders ahead of
it have taken theirs. **Shortage** is the outstanding quantity that isn't covered. The
Materials tab shows which earlier orders are holding the stock.

| Case | Treatment |
| --- | --- |
| Draft order | Reserves nothing. Its shortage shows what would be missing after all open orders |
| Optional line | Never claims stock |
| Closed order | Needs nothing |

Nothing is locked, so issuing stays first come, first served.

`getOrderRequirements` still returns the on-hand-only `shortageQuantity`. The order
list's *Has shortage* flag uses that figure, so the flag means *on hand doesn't cover it*.
The new fields are `reservedQuantity`, `heldByEarlierOrders[Quantity]`,
`netShortageQuantity`, `netShortageCount` and `reserving`.

## Costs

| | Planned | Actual | Forecast |
| --- | --- | --- | --- |
| **Material** | Required × today's standard unit cost (the cost an issue would be valued at now). Optional lines are planned at what was actually taken | Net issued: issues − returns, at the FIFO cost each moved at, read from the issue documents | Actual + still-to-issue × standard |
| **Conversion** | Planned minutes × step rate | Recorded minutes, *plus* running steps' elapsed time capped at plan (*est.*) | Actual for finished steps, plan for the rest, 0 for skipped |

- **Variance** = forecast − planned. Over plan shows red, under plan green; a change
  under 0.5% shows as *on plan*.
- **Unit costs:** planned and forecast per unit, plus what good units were actually
  received into stock at.
- **Where the material value is:** finished goods, QC, rework, WIP, scrapped, returned.

**Conversion cost is for analysis only.** Stock stays valued at material cost, as before.

## Documents

Files are **PDF, JPG, PNG or WEBP up to 10 MB**:
- The server checks the type from the file's bytes. The file name and declared type
  aren't trusted.
- Files are stored **privately** on Cloudinary (`type: 'private'`, under
  `manufacturing-docs/<org>/`), the same way billing proofs are stored
  (`services/billing/proofStorage.js`).
- Downloads go through a **signed URL that expires after 10 minutes**, fetched when
  needed (`GET …/documents/:id/url`).
- The storage key is never sent to clients.

Anything else (CAD files, shared folders) is attached as an **http(s) link**.

Each document has a category: drawing, specification, work instruction, quality record,
certificate, photo or other. An order holds up to 30 documents.

**Permissions:**
- Attaching needs `manageProductionOrders` or `executeProduction`.
- Removing is allowed for managers, and for the person who attached the document.

**Job card** (print / save as PDF): the order details, team, materials with a *picked by*
column, the routing with *done / worked / sign-off* columns, a QC box, and signature
lines.

## Production team

Every order can now have an **operator**; before this, only assembly orders could. It can
also have a **production team** of up to 20 users of the organization, chosen with a
searchable multi-select in the order dialog. The server stores names alongside ids
(`team: [{ userId, name }]`) and rejects users from other organizations.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /manufacturing/production-orders/:id/operations` | Add a step (`afterOperationId` optional) — `manageProductionOrders` |
| `PATCH / DELETE …/operations/:operationId` | Edit, or remove a step that hasn't started |
| `POST …/operations/reorder` | `operationIds` in the new order (every step exactly once) |
| `POST …/operations/:operationId/action` | `start` / `complete` / `skip` / `reopen`, optional `at` (never in the future), `actualMinutes`, `note` — `executeProduction` |
| `GET …/costs` | Planned / actual / forecast costs, per line and per step |
| `GET …/activity` | The merged event timeline (structured; the client words and translates it) |
| `POST …/documents` (multipart `file`) · `POST …/documents/link` | Attach a file or a link |
| `GET …/documents/:documentId/url` · `DELETE …/documents/:documentId` | Signed download URL; remove |

`POST/PATCH /production-orders` accept `teamMemberIds`, and BOM create, update and
version accept `operations`. Every write to an order is recorded in the audit log.

## Demo data

The fan-factory demo now has routings:
- **Fans:** Cutting → Welding → Painting → Assembly → Packing.
- **Stator, motor, blade and exhaust lines:** their own routings.

Completed orders have every step done with realistic times worked. The orders still
running show the steps part done:

| Order | Steps done | In progress | Pending |
| --- | --- | --- | --- |
| Ceiling fans | Cutting, Welding | Painting | Assembly, Packing |
| Motors | Die-casting, Machining | Motor assembly | Run test |
| Pedestal fans (paused) | Cutting, Welding, Painting | Assembly | Packing |

The person loading the demo leads the active orders. Up to three colleagues are added as
the team.

## Verified

- **Tests:** 41 manufacturing integration tests pass on a replica set, 13 of them new
  (`tests/integration/manufacturingOrderDetail.test.js`). They cover:
  - routing snapshot, re-plan, edit, reorder and prune,
  - step rules, the release → in-production move, and the conditional write against
    concurrent taps,
  - team validation,
  - queue reservations (stage, priority, start date, drafts, optional lines),
  - planned and actual costs including returns,
  - activity events,
  - documents: type sniffing, a private key that never reaches the client, signed URLs,
    and removal rights.
- **Build:** typecheck, ESLint and Prettier are clean.
