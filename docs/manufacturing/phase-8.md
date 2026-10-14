# Manufacturing — Phase 8 (Multi-entry transaction engine)

Phase 8 adds one reusable entry engine for every multi-row transaction screen, in
`client/src/components/transaction-engine/`. Screens supply a configuration; the engine
supplies the behaviour. The developer guide is in the folder's `README.md`.

## What's in it

| Requirement | Where |
| --- | --- |
| Transaction header | `transaction-header.tsx`, built from config fields. Enter moves through them into the first row |
| Entry grid / row | `transaction-entry.tsx` (grid, toolbar, totals, save) and `entry-row.tsx` (memoised per row; cards on phones) |
| Product autocomplete | `cells/product-cell.tsx`: debounced search, ↑↓, Enter or Tab picks, Esc restores |
| Barcode lookup | The toolbar scan box, plus Enter on a typed or scanned code in the Product cell |
| Quantity / rate / number | `cells/number-cell.tsx`: keeps exactly what's typed, writes the parsed number to the row live |
| Unit, warehouse, batch, select | `cells/select-cell.tsx`: native selects (type-ahead, the phone's own picker) |
| Serial selection | `cells/serial-cell.tsx`: pick in-stock units or enter new ones; scanner-friendly; duplicates refused |
| Row calculations / validation / totals | Config `computeRow`, `validateRow`, `validateHeader` and `totals`; errors shown on the affected row |
| Draft state | `use-entry-draft.ts`, on the app's existing `lib/form-draft` storage |
| Keyboard navigation | `engine-context.tsx`: a focus registry plus "next logical field" |
| Data sources | `sources.ts`: the existing catalog, lookup-by-code, IMEI and branch APIs. No new product, stock or warehouse system |

**Row actions:**
- Add, insert, duplicate, clear, move and delete, from the row menu and the keyboard.
- Multi-select delete.
- Bulk paste, both through a dialog and by pasting into a Product cell. Unmatched lines
  stay in the box with their line numbers.
- Barcode scan, which increments an existing row or fills a new one.

## Keyboard

Enter goes to the next field. On the last field it opens a new row focused on Product.
Disabled cells and cells marked `skipOnEnter` are skipped, and Enter never submits a form.

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Move between fields |
| ↑↓ | Move through results, or to the same column in another row |
| Esc | Close the list or picker |
| Ctrl+Enter | Save |
| Alt+Enter | Save & New |
| Insert | Insert a row above |
| Ctrl+D | Duplicate the row |
| Ctrl+Delete | Delete the row |
| Ctrl+Shift+↑↓ | Move the row |
| Delete on the row number | Delete the selected rows |

## Verified

**Logic:** 13 checks on the pure modules:
- store operations (including that an unchanged row keeps its object, so it skips
  rendering),
- the row cap,
- navigation order,
- search ranking,
- the paste parser (tabs, quoted CSV, header row, decimal commas).

1,000 pasted rows take about 11 ms in the store; an edit takes about 0.4 ms.

**Browser:** 52 checks in Chromium against a mocked 800-product catalog:
- Keyboard entry:
  - every key in the table above;
  - Enter never submitting the surrounding `<form>` (submit count stayed 0).
- Barcode, serials and batches:
  - an exact-barcode Enter;
  - scan increment;
  - an unknown barcode;
  - the serial picker (pick, refuse unknown, close and move on);
  - choosing a batch by keyboard.
- Validation:
  - header and row errors, with valid rows kept;
  - errors clearing live;
  - server row errors placed on their row.
- Bulk paste: through the dialog and by pasting into the Product cell.
- Drafts: restored after a reload, with products re-linked to the live catalog.
- Large documents:
  - 600 rows render with about 3.7 ms per keystroke commit (max 8.7 ms);
  - the first render of a 600-row paste takes about 3.8 s.
- Phones: the card layout has no sideways scroll and keeps the same keyboard flow.

**Bugs fixed during testing:**
- The paste box grew taller than the screen.
- A draft restored before the catalog loaded lost its batch options.
- The row cap counted the blank row.
