# Multi-entry transaction engine

The engine gives every multi-row transaction screen the same fast, keyboard-first entry:
- purchases, sales and returns,
- receipts, issues, transfers, scrap, adjustments and opening stock.

A screen supplies one `TransactionConfig`. The engine handles everything else:
- row state, keyboard navigation and product search,
- barcode scan, bulk paste, batch and serial pickers,
- validation display, totals, drafts and saving.

No module's business rules live in the engine. The first real screen built on it is the
raw material receipt (`features/manufacturing/pages/material-receipt-entry.tsx`).

```tsx
<TransactionEntry
  config={config}                      // columns, maths, validation, totals
  products={useCatalogProductSource()} // or your own ProductSource
  stock={useCatalogStockSource()}      // batches, serials, warehouses
  onSave={async ({ header, rows }, mode) => { /* call your API */ }}
  saveActions={[{ mode: 'draft', label: 'Save Draft', validate: false }]}
/>
```

## Config (`types.ts`)

| Part | What it does |
| --- | --- |
| `columns` | Each column has a `kind` (below), a `width` (a grid track), and optional `editable(row)`, `skipOnEnter`, `decimals` and `render` |
| `createRow()` / `isRowEmpty(row)` | Builds a blank row. An empty row is ignored by validation and saving |
| `applyProduct(row, product)` | Fills a row when a product is picked (unit, default rate, and resetting batch and serials) |
| `computeRow(row)` | Derives values after every change (amount, tax…). It also re-runs when the header changes |
| `validateRow(row)` | Returns `{ [columnKey]: message }`. The message is shown on that cell and under the row |
| `validateHeader(header, rows)` | Returns header errors, shown under each field |
| `totals(rows)` | Extra footer figures. Row count and total quantity are always shown |
| `headerFields` | Fields of kind `text`, `date`, `select`, `textarea`, `warehouse` or `custom`. A custom field gets `{ value, onChange, id, next }` |
| `applyPaste(row, line)` | Maps a pasted line onto a row. The default sets quantity and rate |
| `scan.behavior` | `increment` (the default) adds 1 to an existing row; `new-row` always adds a row |

**Column kinds:**
- `product`: autocomplete.
- `quantity`, `rate`, `number`.
- `unit`, `select`, `warehouse`, `batch`: native selects.
- `serial`: a picker with `serialMode: 'pick' | 'enter'`.
- `text`, `date`.
- `computed`: read-only.

## Keyboard

| Key | Action |
| --- | --- |
| Enter | Pick the product, or go to the next logical field (skipping disabled and `skipOnEnter` cells). From the last field it opens a new row on Product. It never submits a form |
| Tab / Shift+Tab | Next / previous field (row buttons are out of the tab order) |
| ↑ ↓ | Move through autocomplete results; elsewhere, go to the same column in the row above or below |
| Esc | Close the list or picker (and restore the product) |
| Ctrl+Enter / Alt+Enter | Save / Save & New — from anywhere on the page (not from a dialog or another entry) |
| Insert, Ctrl+D, Ctrl+Delete, Ctrl+Shift+↑↓ | Insert above, duplicate, delete, move a row |
| Delete on the row number | Delete the selected rows |
| Paste into Product | Spreadsheet rows (tab or CSV) become rows |

## Behaviour worth knowing

- **Re-renders:** the state lives outside React (`store.ts`) and each row subscribes to
  its own slice. Typing re-renders only that row and the totals. Measured with 600 rows:
  about 3.7 ms per keystroke commit. Rows off screen use `content-visibility: auto`.
- **Search:** the default source searches the `/products/purchasable` catalog in memory.
  It is loaded once and cached by RTK Query. Exact barcode or SKU matches win. A typed or
  scanned code plus Enter picks the product directly. The server's lookup-by-code is the
  fallback.
- **Validation:**
  - Leaving a started row shows its errors; a save attempt shows all of them.
  - Fixing a field clears its error live.
  - Valid rows are never discarded.
  - For server errors, return `{ rowErrors }` from `onSave`. Use `rowErrorsFromApi(err, rows)`
    for the `ROW_ERRORS` shape.
- **Drafts:** drafts reuse `lib/form-draft` (per user and branch, kept 14 days) and the
  standard "Unsaved draft restored" notice. Products are re-linked to the live catalog.
  Drafts are off for edit screens (`initial`) and with `draft={false}`.
- **Limits:** a document holds up to `maxRows` filled rows (default 1,000). The blank row
  for typing is extra.
- **Phones:** on phones each row becomes a card with the same cells and the same keyboard
  order.

## Tests

- **Logic:** store operations, navigation, search ranking and the paste parser are pure
  modules.
- **Full browser:** the engine was checked end to end in Chromium: every key above, scan,
  paste, serials, drafts, validation, 600 rows, and the phone layout. See
  `docs/manufacturing/phase-8.md`.
