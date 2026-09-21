# Price Updates (supplier price lists → costs & selling prices)

Turns a supplier's **WhatsApp message, PDF, Excel/CSV sheet or photo** into updated product costs and
selling prices. Every change is reviewed line by line before anything is written, recorded per product,
and the whole update can be **undone**.

**Where it is:** sidebar → Catalog & Inventory → **Price Updates** (`/price-updates`) · a
**Update Prices** button on the Products page · a **Price history** tab on every product page.
**Permissions:** `viewPriceUpdates` (History) and `managePriceUpdates` (read a list, apply, undo). The
Admin and Manager system roles get both on the next server start; custom roles must be ticked in
Roles → Price Updates.

## Using it

1. **Give the list.** Paste the message, or drop a PDF / Excel / CSV / photo. A PDF or photo becomes
   *editable text* in the box first, so a misread line can be fixed before matching. Optionally pick the
   supplier (their naming is then remembered).
2. **Review.** Each line is matched to a product; costs and selling prices are computed by your
   **pricing rule** and can be typed over. Filter by *Ready / Needs review / Not matched / No change /
   Warnings*. Nothing uncertain is ticked for you (see *Safety*).
3. **Apply.** Updates are written with a before/after record. A risky update (a price below cost, or a
   change of 25% or more) asks once for confirmation. **Undo this update** is on the result screen and
   in History.

### What can be pasted
Anything a supplier sends — the parser is deliberately forgiving:

| Sent as | Read as |
|---|---|
| `Galaxy A15 4/128 - 38,500`, `= 38500`, `: 38500`, `→ Rs. 38,500`, `38500/-` | name + price |
| `*SAMSUNG*` then `A15 4/128 - 38500` | brand heading = context for the lines under it |
| `Infinix Hot 40i` then `Price: 27,500` | name on one line, price on the next |
| `Tecno Spark 20 DP 31000 RP 33999` | dealer (cost) + retail (selling) |
| `62.5k`, `1.2 lac`, `45 hazar`, Urdu digits `۳۸۵۰۰` | numbers |
| `Product \| Dealer \| Retail` tables (PDF, Excel paste) | columns, incl. multi-column pages |

Ignored automatically: WhatsApp timestamps/senders, dates, phone numbers, emoji, greetings, and RAM/ROM
or size numbers (`4/128`, `128GB`, `A15`, `1.5m`) — these are never mistaken for prices. Every skipped
line is listed on the review screen so nothing vanishes silently. Lines that look like a **per-dozen /
carton price**, a **range**, or a **"+500" change** are flagged.

Scanned PDFs and photos need AI reading (`GEMINI_API_KEY` on the server; the same key the product/purchase
scanners use). Text-based PDFs, Excel/CSV and pasted text need no AI at all.

### Pricing rule
"Margin %" here means **markup on cost** — `price = cost × (1 + margin/100)` — the same definition the
product form uses.

- *Keep my margin %* (default) · *Keep my profit amount* · *Set a fixed margin %* · *Use the list's selling
  price* · *Don't change selling prices*
- Rounding to 1 / 5 / 10 / 50 / 100 (nearest / up / down), optional **minimum margin**, and **Don't lower
  selling prices**. A price below cost is never rewritten silently — the row is flagged instead.
- What the list contains is a choice too: costs, selling prices, or two columns. Labels in the list
  (`DP`, `RP`, a `Dealer` header, a `Retail` column) are trusted over that choice.
- A value you type on a row always wins and survives rule changes; the rule and list type are remembered
  per browser.

## Safety model (why a wrong price can't sneak in)

- A match is **high** (pre-ticked) only if every model/number/RAM-ROM token agrees in both directions, no
  variant word differs (`Pro`/`Pro Max`, `PTA`/`Non-PTA`, `Plus`, `Ultra`…), the words cover the line, and no
  second product scores about the same. Otherwise it is **review** (a suggestion; cannot be applied until a
  human confirms it) or **unmatched**. `A15 4/128` never matches `A15 6/128`; `iPhone 15 Pro` never matches
  `iPhone 15 Pro Max` on its own.
- Writes are **guarded on the value that was read**: if a product changed while the list was being reviewed
  (a purchase, another user) it is *skipped and reported*, never overwritten.
- Only the caller's own organization **and branch** can be touched. A product with real variants is
  updated on the *variant*; its legacy price/cost fields are never written.
- The audit line is written **before** the product update (no transaction is needed or used), and stock,
  ledgers, cash book and existing invoices are never touched — only `cost`/`price`. Desktop sync versions
  are bumped like any product save.
- **Undo** restores each field only if the product still holds the value the update wrote; anything
  changed since is left alone and reported (with an explicit *Restore anyway*).
- **Saved matches** are learned only from a match a human confirmed or picked — never from an automatic
  one — so one bad auto-match can't become permanent. Manage them under *View saved matches*.

## Product price history
The **Price history** tab on a product lists every update that touched it (source, supplier, undone or
not) with a step chart of cost vs selling price. It complements the *Selling price vs cost* chart, which
shows average *realised* prices from purchases and sales. Variant products get a variant picker.

## API (`/v1/price-updates`)

| Method & path | Permission | Purpose |
|---|---|---|
| `POST /analyze` | manage | text or structured rows → parsed lines + matches (writes nothing) |
| `POST /extract` (multipart `file`) | manage | PDF / image → text (pdf.js, else AI) |
| `GET /products/search?q=` | manage | manual "change match" search |
| `POST /apply` | manage | apply reviewed items → batch + per-product history |
| `GET /batches`, `GET /batches/:id` | view | History |
| `POST /batches/:id/rollback` `{force?}` | manage | Undo |
| `GET /history/:productId` | view **or** viewProducts | a product's price timeline |
| `GET /aliases`, `DELETE /aliases/:id` | view / manage | saved matches |

Models: `PriceUpdateBatch` (header), `PriceChange` (one before/after line per product — also the product
timeline), `PriceListAlias` (saved matches). All are organization + branch scoped.

## Code map
- Server: `utils/priceListParser.js` (text → rows) · `utils/priceMatcher.js` (matching) ·
  `services/priceUpdate.service.js` · `services/priceListExtract.service.js` · controller/route/validation.
- Client: `lib/price-update-rules.ts` (pricing rules) · `features/price-updates/` (`lib/session.ts` holds the
  review-state and apply-payload rules) · `stores/priceUpdate.api.ts` (apply/undo invalidate the product,
  purchasable-catalog and analytics caches via `invalidateProductCaches`).

## Tests
- `cd server && npx jest tests/unit/utils/priceListParser.test.js tests/unit/utils/priceMatcher.test.js tests/unit/services/priceUpdate.service.test.js tests/unit/services/priceListExtract.service.test.js tests/integration/priceUpdate.route.test.js`
- The matcher's safety guards and the service's write guards are mutation-checked (removing a guard fails a
  test). Real PDFs are read in a child process (`tests/utils/extractPdfChild.js`) because Jest's CommonJS
  sandbox cannot dynamic-import pdf.js's ES module.
- The client has no test runner; `price-update-rules.ts` and `features/price-updates/lib/session.ts` are
  pure and were checked with assertion scripts, and the whole flow was exercised in a headless browser
  against the real routes/services over an in-memory database.

## Not built (deliberately, for a later pass)
- Applying one list to the same products in **other branches**.
- **Creating new products** from unmatched lines.
- Purchases and manual product edits do not write price-history lines (only Price Updates do).
- Batch-level selling prices (batch/expiry-tracked stock) are not changed by an update.
- Scheduling an update for a future effective date.
- Dependency note: `pdfjs-dist@4.10.38` (pinned: supports Node 20 and 24). It brings ~70 MB into
  `node_modules`, most of it optional native canvas binaries that text extraction does not use.
