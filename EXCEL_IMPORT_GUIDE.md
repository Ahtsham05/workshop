# Excel / CSV Import

How spreadsheet import works across the app: products, customers, suppliers, brands,
categories, sub-categories and students.

## The rule everything follows

**A bad row costs that row, never the file.** Rows that can't be imported are listed with
the Excel row number and a reason the shopkeeper can act on, and everything else imports.
The only hard stop is a file with nothing importable in it.

Corollaries, each of which used to be violated somewhere:

- A file is never rejected for having its header on row 4 instead of row 1.
- A column is never missed for being called "Sale Price" instead of `price`.
- A row that's already saved is skipped (or updated) — not reported as an error.
- A request never 400s over one row's content; the server answers 201 with a per-row
  breakdown even when every row failed.
- Anything the import decides for the user (a defaulted unit, a supplier name that matched
  nothing, a dropped email) is shown, not silent.

## Architecture

```
client/src/lib/excel-import.ts          Parsing engine — no React, no feature knowledge
client/src/components/excel-import-dialog.tsx   The one import dialog UI
client/src/features/<feature>/components/<x>-import-dialog.tsx   Field list + row builder

server/src/utils/importRow.js           Cell parsing (numbers, dates, phone/name keys)
server/src/utils/importSheet.js         Server-side sheet reader (for uploaded files)
server/src/services/<x>.service.js      bulkAdd* — per-row validation, duplicates, writes
```

A feature's import dialog supplies three things and nothing else: the field list, a
`buildRow` that turns one row's cells into an API object, and an `importBatch` that sends
a batch. File handling, column matching, validation reporting, batching, progress,
partial success and the failure report all live in the shared dialog.

### The parsing engine (`client/src/lib/excel-import.ts`)

- `readWorkbook(file)` — accepts `.xlsx .xlsm .xlsb .xls .csv .ods`, case-insensitively,
  and turns an unreadable/encrypted/oversized file into a sentence the user can act on
  (`SpreadsheetError`).
- `summarizeSheets()` / `pickBestSheet()` — scores each sheet by how well its header
  matches the expected fields, so an "Instructions" first tab doesn't read as "empty".
- `parseSheet()` — finds the header row anywhere in the first 25 rows, maps each column to
  a field through the alias table, and returns rows with **true Excel row numbers**. Blank
  rows, a header repeated mid-file and a trailing "Total" line are dropped. With no
  recognisable header it falls back to template column order (and skips a first row that
  looks like an unfamiliar header). An `overrides` argument re-runs the parse with the
  user's own column choices.
- `parseNumeric()` — `Rs 62,000`, `1,250.50`, `1.250,50`, `(500)` → -500, `2,999/-`,
  `۱,۲۵۰`, non-breaking spaces. Returns `{ empty, ok, value, raw }`; `empty` and `not ok`
  are different answers.
- `parseText()` — with `{ code: true }` for barcodes/SKUs/phones, which keeps a 13-digit
  barcode from being printed as `8.9e+12` and strips Excel's leading apostrophe.
- `parseDate()` — real date cells, Excel serials, and text; slash dates are read
  **day-first**, falling back to month-first only when day-first is impossible.
- `downloadTemplate()` / `downloadIssueReport()` — the template is generated from the same
  field list the parser matches against, so the two can't drift; the issue report hands
  back only the rows that need fixing, with the reason next to each.

### The dialog (`client/src/components/excel-import-dialog.tsx`)

Select a file → it parses immediately (no separate "Parse" click) → it shows the sheet, the
header row, the column mapping (editable), how many rows are ready and how many need
fixing → Import sends batches of 500 with a progress bar → the summary separates:

| Bucket | Meaning |
| --- | --- |
| imported | written (inserts + updates) |
| already saved, left unchanged | `skipped` — deliberate, not a failure |
| imported with a note | `warnings` — the row is in, with something to know |
| could not be saved | `errors` — downloadable as a fix-and-re-upload file |

Rows that fail validation are never sent, and the Import button says so:
*"Import 482 rows, skip 18"*. After an import the parsed file is cleared so the same rows
can't be sent twice.

## Duplicates

Products, customers and suppliers take a `duplicateStrategy`, chosen in the dialog:

| Strategy | Behaviour |
| --- | --- |
| `skip` (default) | Leave the saved record untouched, report the row as skipped |
| `update` | Refresh details from the file |
| `error` | Report the row as a problem |

Matching: **products** by barcode, then SKU. **Customers/suppliers** by phone (last 10
digits, so `+92 300 1234567` and `0300-1234567` are one number), then email, then name —
all case-insensitive.

`update` never touches **stock** (a file's quantity column is an opening balance;
overwriting live stock would undo every sale since) or a customer/supplier **balance** (a
ledger figure). An empty cell means "no change", never "erase what's saved".

Duplicates *within one file* are always caught before sending, naming both rows.

## Server contract

`POST /v1/products/bulk`, `/v1/customers/bulk`, `/v1/suppliers/bulk`, `/v1/brands/bulk`,
`/v1/categories/bulk`, `/v1/sub-categories/bulk-import` all answer **201** with:

```jsonc
{
  "message": "Import finished — imported 482, skipped 16 already in the catalogue, 2 row(s) could not be saved",
  "insertedCount": 482,
  "updatedCount": 0,
  "skippedCount": 16,
  "errors":   [{ "index": 12, "name": "…", "error": "Invalid price \"free\"" }],
  "skipped":  [{ "index": 3,  "name": "…", "reason": "Already in the catalogue…" }],
  "warnings": [{ "index": 7,  "name": "…", "message": "Unit \"pieces\" was not recognized…" }],
  "createdCategories": ["Accessories"]
}
```

`index` is the row's position **within the batch that was sent**, which the dialog maps
back to its Excel row number.

Request validation is deliberately shape-only (`Joi.any()` per field, `.unknown(true)`):
Joi rejects the whole array when one item fails, so per-row rules belong in the service,
which can report per row and import the rest.

Imports also run the side effects a manual create runs — the opening-balance ledger entry
and the subsidiary AR/AP account for customers and suppliers, the shadow Customer record
for suppliers, Master Product Catalog linking for products. A failure there is reported as
a note; it never discards an import that is already written.

## Students (uploads the file, not JSON)

The student import posts the file itself, so the server parses it with
`utils/importSheet.js#readSheetRows` — the same header detection and alias matching the
browser does. `client/src/features/school/students/student-import.tsx` previews with the
shared client engine, and the two field lists (there and in
`student.controller.js#STUDENT_IMPORT_FIELDS`) have to stay in step.

## Adding an import to a new entity

1. Write the field list (`ImportFieldSpec[]`) — `key`, `label`, `aliases` in every spelling
   your users use, `required`, `type`, a `sample` for the template.
2. Write `buildRow(values, { has })` returning `{ value }`, `{ error }` or
   `{ value, warning }`. Use `has(field)` to tell a missing column from an empty cell.
3. Write `importBatch(items)` returning `{ insertedCount, errors, skipped, warnings, notes }`.
4. Render `<ExcelImportDialog …>`. Don't write file handling.
5. On the server, follow `customer.service.js#bulkAddCustomers`: validate per row, match
   duplicates, chunk `insertMany` at 500, attribute write errors back to their row, and
   return the breakdown above.

## Tests

```
server/tests/unit/utils/importRow.test.js        cell parsing
server/tests/unit/utils/importSheet.test.js      header detection, sheet picking, row numbers
server/tests/unit/services/customerImport.test.js  per-row behaviour, duplicates, partial writes
server/tests/unit/services/productImport.test.js   same, for products
```

## When a user still reports an import problem

1. Ask for the file. Almost every report is a shape the alias table hasn't seen — add the
   alias, which fixes it for everyone.
2. Have them open **Check columns** in the dialog: it shows exactly which column fed which
   field, and fixes it in place.
3. Have them use **Download these rows** and send that back — it's the failing rows with
   the reason attached.
