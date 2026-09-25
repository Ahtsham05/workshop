# Product Photos — "Find from web" and the image gallery

Written for: developers and admins maintaining this app.

A product used to have exactly one photo, added either by uploading a file or by pressing
**Find from name**, which grabbed the single first Pexels hit and stored it. That is fine
for a category banner and wrong for a shop catalog: a mobile shop wants *this* phone, not a
stock photo of "a phone", and it wants to look at a few candidates before committing one.

Products now have an ordered gallery of up to **8** photos, and the photo section offers a
real image picker that searches the web by product name and/or barcode.

---

## What a user sees

**Add / Edit Product → Product photos**

| Empty | Filled |
|---|---|
| "Add photos of this product" with **Find from web**, **Upload**, **Camera**. Drag & drop anywhere on the card also works. | A grid of tiles. The first tile is badged **MAIN**. Every tile has a full-view button (⤢); the others get ★ (make main) and 🗑 (remove) on hover/touch. Tiles are drag-reorderable. |

**Find from web** opens the picker:

- Search box pre-filled with the product name, plus a green chip for the barcode when the
  product has one. Tapping the chip toggles the barcode lookup on/off.
- Results are a grid of candidates. Tap to select (up to the number of free slots), ⤢ to
  view any candidate full size before deciding — with ← → to move through the results and
  a **Select this image** button in the viewer.
- A **Paste image link** chip accepts a URL the user found themselves.
- Chips under the search box report which sources answered and which did not.
- **Nothing is uploaded while browsing.** Only the images the user confirms with **Add
  images** are downloaded and stored.

The first photo is the main one: it is what the product list, POS, invoices, prints and
every report already render. Reordering or pressing ★ changes it.

---

## Where the images come from

`server/src/services/webImageSearch.service.js` asks every applicable provider in parallel,
then merges, dedupes and ranks the candidates. Providers are tiered by how likely they are
to be the *real* product:

| Provider | Needs | Matches on | Notes |
|---|---|---|---|
| Open Food Facts | — | barcode | Keyless. Groceries, drinks, household, cosmetics. The actual packaging photo. |
| UPCitemdb (trial) | — | barcode | Keyless, rate-limited per IP. General merchandise, electronics, phones. |
| Google Programmable Search | `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` | name | **The one worth configuring.** Best name-based results by a wide margin. |
| DuckDuckGo images | — | name | Keyless but undocumented; answers 403 from some networks. Best-effort. |
| Openverse | — | name | Keyless, stable. Aggregates Flickr, Wikimedia, museums. |
| Wikimedia Commons | — | name | Keyless, freely licensed. Good on brands. |
| Pexels | `PEXELS_API_KEY` | name | Stock photography. Presentable, generic; ranked last. |

**Every provider is best-effort.** One that is unconfigured, rate-limited or down is
reported back in `providers[]` (and shown as a chip in the dialog) and skipped — it never
fails the search. The picker works with zero API keys configured.

### Ranking

`scoreResult()` is deliberately simple and explainable:

1. Provider tier dominates — a barcode hit is the real product, a web hit probably is, a
   stock photo is a stand-in.
2. Then "is this shaped like a product shot": roughly square and decently sized scores
   higher, because a 1600×400 banner crop looks wrong in every grid, list row and receipt
   this app renders a product image into.
3. A small bonus for `.png` — usually a clean catalog cut-out.

---

## Setting up Google Programmable Search (optional, recommended)

1. Create an engine at <https://programmablesearchengine.google.com> with **Image search**
   and **Search the entire web** both ON.
2. Copy the engine id (`cx`) from the engine's setup page.
3. Enable the *Custom Search API* in Google Cloud Console and create an API key.
4. Put both in the server environment:

```
GOOGLE_CSE_API_KEY=...
GOOGLE_CSE_CX=...
```

The free tier is 100 queries/day. Without it the picker falls back to the keyless
providers and says so in the dialog.

---

## API

Both endpoints are under `/v1/image-search` and need only a signed-in user.

### `POST /search`

```jsonc
// request
{ "query": "Samsung Galaxy A15", "barcode": "8801643...", "page": 1, "perPage": 24 }

// response
{
  "results": [{
    "id": "…", "provider": "openfoodfacts", "providerLabel": "Barcode match",
    "url": "https://…", "thumbUrl": "https://…", "width": 800, "height": 800,
    "title": "…", "sourceUrl": "https://…", "author": "…",
    "exactMatch": true,
    "token": "…"          // HMAC over the URL — see Security
  }],
  "providers": [{ "key": "google", "label": "Web", "status": "not_configured", "count": 0 }],
  "page": 1,
  "hasMore": true
}
```

Either `query` or `barcode` is required. A `barcode` that is not 6–20 digits is ignored
rather than wasting the two barcode-provider calls.

### `POST /import`

```jsonc
{ "images": [{ "url": "https://…", "token": "…", "provider": "google", "sourceUrl": "https://…" }],
  "context": "product" }
```

Max 8 per call. Returns `{ images: [{ url, publicId, width, height, source, sourceUrl }], failures: [...] }`.
Failures are **per image and reported**, not thrown: picking six photos and losing the lot
because one CDN 404'd is worse than saving five and saying so. If *every* image fails, the
call errors.

---

## Security

Importing fetches a URL chosen on the client, so:

- **SSRF guard.** `assertFetchableUrl()` rejects non-http(s) URLs and anything resolving to
  loopback, private, link-local (incl. `169.254.169.254` cloud metadata), CGNAT, multicast
  or IPv6 unique-local addresses — re-checked at **every redirect hop**, since a public
  hostname is free to 302 to `http://127.0.0.1`.
- **Result tokens.** Each search result carries a short HMAC (`config.jwt.secret`) over its
  URL, proving this server produced it. An untokened URL is still accepted (that is what
  makes **Paste image link** work) but only through the same guard.
- **Magic-byte sniffing.** Content-type headers lie and image CDNs omit them, so
  `sniffImageFormat()` checks the file's own signature. An HTML error page never reaches
  Cloudinary as a product photo.
- **Caps.** 8MB per download, 8 images per import request, redirect depth 5, request
  timeouts on every outbound call.

---

## Data model

`Product.images` is the ordered gallery; `Product.image` stays as the primary and is
**mirrored from `images[0]`**. Every existing read path (list rows, POS tiles, invoices,
reports, analytics, branch sync) still reads `image` and is untouched.

The mirroring lives in schema hooks in `server/src/models/product.model.js`, not in one
service, because many callers write only `image`: Excel import, the AI scan, price-list
updates, branch sync and the multipart PATCH. The rules:

- gallery changed → primary becomes `images[0]` (or is cleared when the gallery is empty)
- only primary set → it moves to the **front** of the gallery, deduped, so replacing the
  main photo never silently drops the rest

`masterProduct.service.js` writes products with `insertMany`, which bypasses those hooks,
so it sets both fields itself — see the comment there.

Covered by `server/tests/unit/models/product.images.test.js` (13 cases) and
`server/tests/unit/services/webImageSearch.test.js` (29 cases).

---

## Components

| File | Role |
|---|---|
| `client/src/components/web-image-search-dialog.tsx` | The picker. Search, grid, multi-select, full-size preview, import. |
| `client/src/components/product-image-gallery.tsx` | The editor: tiles, main photo, reorder, remove, upload, camera, full view. |
| `client/src/components/image-gallery-viewer.tsx` | Read-only: thumbnail with a photo count that opens a lightbox. Used in the product list and detail header. |
| `client/src/components/image-upload.tsx` | The older single-image control (categories, sub-categories, brands) — now also offers **Find from web** in single-select mode. |
| `client/src/stores/imageSearch.api.ts` | RTK Query endpoints for search/import. |

Both new grids use **container queries** (`@container`, `@[30rem]:…`), not viewport
breakpoints: the photo section is one narrow column of a four-column form, so `sm:`/`md:`
would fire on a wide desktop while the card itself is 350px.
