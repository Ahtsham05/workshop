// html2canvas-pro, not html2canvas: the app's Tailwind v4 styles use oklch()/oklab() colours,
// which the original library throws on ("unsupported color function") — every in-app PDF failed.
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

declare global {
  interface Window {
    __buildInvoicePdfInOpener?: (invoiceRootHtml: string, headHtml?: string) => Promise<Blob>
  }
}

const PDF_MARGIN_MM = 8
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
/** Standard A4 CSS-pixel width at 96dpi (210mm) — same constant used for the template preview
 * thumbnails in Settings -> Printing. Capturing at this fixed width, rather than whatever the
 * host container happens to be, is what makes wrapping/font proportions match true print
 * layout consistently every time. */
const A4_CSS_WIDTH_PX = 794
/** Pixels per CSS pixel in the captured page. 3 ≈ 290 DPI on A4 — print-shop sharpness for the
 *  small policy text and thin table rules. Was 2 (≈190 DPI), which looked soft next to a laptop
 *  print. A 3× A4 canvas is ~8 MP, well under iOS Safari's ~16.7 MP canvas limit. */
const CAPTURE_SCALE = 3
/** JPEG quality for each page image. 0.97 removes the grey smudging JPEG puts around small text
 *  (visible at 0.92) and builds ~7× faster than lossless PNG, which jsPDF re-encodes in JS — too
 *  slow on phones — for the same look at 300 DPI. */
const PAGE_JPEG_QUALITY = 0.97

/**
 * Captures invoice HTML as a true A4-page PDF. Two earlier approaches both had real problems:
 * slicing one tall screenshot across fixed-height pages re-drew the same image at shifting
 * offsets and could show a row twice at the slice boundary; capturing everything as one giant
 * custom-height page avoided that but no longer looked like "A4" (a long invoice came out
 * taller than several A4 sheets stacked, not proportioned like one). `generateA4InvoiceHTML`
 * already splits the invoice into complete `.invoice-print-page` chunks sized for one real A4
 * sheet each (never mid-row) — capturing each chunk on its own true 210x297mm page reuses that
 * boundary instead of guessing one from pixels, so it's always genuine A4 proportions, one PDF
 * page per chunk, with zero risk of duplicating a row.
 */
/** Templates whose page already is a full A4 sheet with its own margins built in (Distributor's
 *  `.ds-page`): placed edge to edge, so the PDF fills the page like the printed sheet instead of
 *  shrinking inside a second border. */
const isFullSheetPage = (chunk: HTMLElement) => chunk.classList.contains('ds-page')

async function buildPdfFromChunks(chunks: HTMLElement[]): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const margin = isFullSheetPage(chunk) ? 0 : PDF_MARGIN_MM
    const printableWidth = A4_WIDTH_MM - margin * 2
    const printableHeight = A4_HEIGHT_MM - margin * 2
    // Belt-and-suspenders: force the chunk itself full-width with !important, in case some
    // ancestor's !important rule (e.g. the A4-half/two-up layout's `max-width: 1200px
    // !important`) is still constraining it despite injectFlatPageStyle.
    const prevChunkCss = chunk.style.cssText
    // Fixed width, not 100% — 100% would just resolve to whatever the host container's size
    // happens to be, defeating the point of a fixed reference width.
    chunk.style.setProperty('max-width', 'none', 'important')
    chunk.style.setProperty('width', `${A4_CSS_WIDTH_PX}px`, 'important')
    chunk.style.setProperty('margin', '0', 'important')

    // Measured AFTER setting the fixed width above, so this reflects the true height at that
    // exact width.
    const captureWidth = A4_CSS_WIDTH_PX
    const captureHeight = chunk.scrollHeight || undefined

    // html2canvas lays the clone out in a virtual window sized windowWidth x windowHeight;
    // left at its default (the real browser window's height), content taller than that forces
    // it to scroll-and-stitch internally, which is what produced a repeated row — sizing the
    // virtual window to the chunk's own full height up front avoids that path entirely.
    // Paint on a canvas that belongs to the invoice's own frame. html2canvas otherwise creates its
    // canvas in the app document, whose fonts are not the invoice's (e.g. no Poppins there): the
    // text was laid out in one font and painted in another — letters drifted, spaces vanished
    // ("SOLDTO"), and a wider fallback clipped the invoice number.
    const capture = () => {
      const rect = chunk.getBoundingClientRect()
      const canvas = chunk.ownerDocument.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(rect.width * CAPTURE_SCALE))
      canvas.height = Math.max(1, Math.ceil(rect.height * CAPTURE_SCALE))
      return html2canvas(chunk, {
        canvas,
        scale: CAPTURE_SCALE,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: captureWidth,
        windowHeight: captureHeight,
        // html2canvas measures the text in its own copy of the page — make that copy finish
        // loading the same fonts first, or it measures in a fallback font.
        onclone: (cloneDoc) => loadUsedFonts(cloneDoc),
      })
    }
    let canvas = await capture()
    // A page drawn before the browser finished laying it out comes back 0×0 (seen with the
    // Distributor template) — give layout a moment and draw it once more.
    if (!canvas.width || !canvas.height) {
      await new Promise((r) => setTimeout(r, 150))
      canvas = await capture()
    }
    if (!canvas.width || !canvas.height) throw new Error('Invoice page rendered empty')

    chunk.style.cssText = prevChunkCss

    const naturalHeight = (canvas.height * printableWidth) / canvas.width
    // Only shrinks (never stretches) if a chunk is unexpectedly taller than one real A4 page —
    // the normal case is naturalHeight <= printableHeight and scale stays 1.
    const fitScale = naturalHeight > printableHeight ? printableHeight / naturalHeight : 1
    const imgWidth = printableWidth * fitScale
    const imgHeight = naturalHeight * fitScale

    if (i > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', PAGE_JPEG_QUALITY), 'JPEG', margin, margin, imgWidth, imgHeight)
  }

  return pdf.output('blob')
}

/**
 * Neutralizes the on-screen "floating card" look (`@media screen` max-width, centered
 * margin, box-shadow, rounded corners) that the print popup adds for browser preview — a PDF
 * should read as a flat printed page, not a screenshot of a preview widget.
 */
const FLAT_PAGE_CSS = `
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  #invoice-print-root {
    max-width: none !important;
    margin: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    border: none !important;
  }
  .no-print { display: none !important; }
  .ds-page { box-shadow: none !important; }
`

/** Until the written frame has fired `load` and painted twice — drawing before that can
 *  capture a page with no layout yet (an empty 0×0 canvas). */
async function waitForFrameLayout(frame: HTMLIFrameElement, doc: Document): Promise<void> {
  if (doc.readyState !== 'complete') {
    await Promise.race([
      new Promise((resolve) => frame.addEventListener('load', resolve, { once: true })),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ])
  }
  const win = frame.contentWindow
  // Timer fallback: some browsers throttle animation frames in off-screen frames.
  const nextFrame = () =>
    Promise.race([
      new Promise<void>((resolve) => (win?.requestAnimationFrame ?? requestAnimationFrame)(() => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 50)),
    ])
  await nextFrame()
  await nextFrame()
  void doc.body?.offsetHeight // force layout
}

/** `@import url(...)` rules in the invoice CSS (the Distributor template loads Poppins this way). */
const CSS_IMPORT_RE = /@import\s+url\(\s*(['"]?)([^'")]+)\1\s*\)\s*;?/g

/** Pulls the `@import`ed stylesheet URLs out of the invoice CSS (handled by inlineStylesheets). */
function hoistCssImports(html: string): { html: string; urls: string[] } {
  const urls = new Set<string>()
  const stripped = html.replace(CSS_IMPORT_RE, (_match, _quote, url: string) => {
    urls.add(url)
    return ''
  })
  return { html: stripped, urls: [...urls] }
}

/** Font CSS already fetched this session (Google Fonts CSS is small and immutable per URL). */
const stylesheetText = new Map<string, Promise<string | null>>()

function fetchStylesheet(url: string): Promise<string | null> {
  let hit = stylesheetText.get(url)
  if (!hit) {
    hit = fetch(url, { mode: 'cors', credentials: 'omit' })
      .then((res) => (res.ok ? res.text() : null))
      .catch(() => null)
    stylesheetText.set(url, hit)
    hit.then((text) => text === null && stylesheetText.delete(url))
  }
  return hit
}

/**
 * The invoice's web-font stylesheets as inline `<style>` blocks. They must be inline: html2canvas
 * measures the text in its own copy of the page, and in that copy a `<link>`ed (or `@import`ed)
 * stylesheet never loads — the copy had no Poppins at all, measured every word in a fallback font
 * and the PDF came out with squeezed words and lost spaces. An inline `<style>` is copied with
 * its `@font-face` rules, so the copy loads the very same font files (from the HTTP cache).
 * A stylesheet that can't be fetched falls back to a `<link>`.
 */
async function inlineStylesheets(urls: string[]): Promise<string> {
  const blocks = await Promise.all(
    urls.map(async (url) => {
      const css = await fetchStylesheet(url)
      return css !== null
        ? `<style data-pdf-font>${css.replace(/<\/style/gi, '<\\/style')}</style>`
        : `<link rel="stylesheet" href="${url.replace(/"/g, '&quot;')}">`
    }),
  )
  return blocks.join('')
}

const linkHrefs = (html: string) =>
  [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .filter((m) => !/rel=["']?(preconnect|dns-prefetch)/i.test(m[0]))
    .map((m) => m[1])

/** Longest we wait for the invoice's stylesheets / web fonts / logo before drawing anyway. */
const STYLESHEET_WAIT_MS = 4000

async function waitForStylesheets(doc: Document): Promise<void> {
  const pending = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((link) => !link.sheet)
    .map(
      (link) =>
        new Promise((resolve) => {
          link.addEventListener('load', resolve, { once: true })
          link.addEventListener('error', resolve, { once: true })
        }),
    )
  if (!pending.length) return
  await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, STYLESHEET_WAIT_MS))])
}

/** Asks for every web font the page's text actually uses, then waits for them — `fonts.ready`
 *  alone can resolve before a font a heading needs has even been requested. */
async function loadUsedFonts(doc: Document): Promise<void> {
  const fonts = doc.fonts
  if (!fonts) return
  const wanted = new Set<string>()
  const view = doc.defaultView
  doc.body?.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (!el.childNodes.length) return
    const cs = view?.getComputedStyle(el)
    if (!cs) return
    wanted.add(`${cs.fontStyle} ${cs.fontWeight} 16px ${cs.fontFamily}`)
  })
  const loads = [...wanted].map((font) => fonts.load(font).catch(() => []))
  await Promise.race([
    Promise.all(loads).then(() => fonts.ready),
    new Promise((r) => setTimeout(r, STYLESHEET_WAIT_MS)),
  ])
}

/** Longest we wait for web fonts / the logo before drawing anyway (fallback fonts, no logo). */
const ASSET_WAIT_MS = 2500

async function waitForAssets(doc: Document): Promise<void> {
  const pending: Promise<unknown>[] = []
  if (doc.fonts?.ready) pending.push(doc.fonts.ready.catch(() => undefined))
  Array.from(doc.images).forEach((img) => {
    if (img.complete) return
    pending.push(
      new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      }),
    )
  })
  if (!pending.length) return
  await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, ASSET_WAIT_MS))])
}

/**
 * Builds the invoice PDF (bundled html2canvas-pro + jspdf).
 *
 * The invoice is drawn inside its own hidden, same-origin iframe that holds ONLY the invoice
 * markup. html2canvas copies the whole document an element lives in before drawing it — when
 * this ran in the app document that meant cloning the sidebar, the open invoice list and every
 * app stylesheet for each page, which is what made Share sit on "Preparing PDF…" for seconds
 * on phones. A tiny document clones in a few milliseconds, and the app's styles can no longer
 * leak into (or break) the invoice.
 *
 * @param invoiceRootHtml `#invoice-print-root` plus its `<style>` tags (see extractPrintRootHtml).
 * @param headHtml optional extra `<head>` markup — the print HTML's web-font `<link>`s, so the
 *   PDF uses the same fonts as the printed invoice (served from the browser cache).
 */
export async function buildInvoicePdfInOpener(invoiceRootHtml: string, headHtml = ''): Promise<Blob> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = `position:fixed;left:-12000px;top:0;width:${A4_CSS_WIDTH_PX}px;height:1123px;border:0;pointer-events:none;`
  document.body.appendChild(frame)

  try {
    const doc = frame.contentDocument
    if (!doc) throw new Error('PDF frame unavailable')
    const { html: bodyHtml, urls } = hoistCssImports(invoiceRootHtml)
    const fontCss = await inlineStylesheets([...new Set([...linkHrefs(headHtml), ...urls])])
    doc.open()
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8">${fontCss}<style>${FLAT_PAGE_CSS}</style></head><body>${bodyHtml}</body></html>`,
    )
    doc.close()
    // Order matters: font CSS first, then layout, then the fonts that layout asks for — only then
    // is the page set in exactly the fonts the print view uses.
    await waitForStylesheets(doc)
    await waitForFrameLayout(frame, doc)
    await loadUsedFonts(doc)
    await waitForAssets(doc)
    void doc.body?.offsetHeight // re-layout with the final fonts

    const root = (doc.getElementById('invoice-print-root') ?? doc.body.firstElementChild ?? doc.body) as HTMLElement
    const pageEls = root.querySelectorAll<HTMLElement>('.invoice-print-page')
    const chunks = pageEls.length ? Array.from(pageEls) : [root]

    return await buildPdfFromChunks(chunks)
  } finally {
    frame.remove()
  }
}

export function ensureInvoicePrintPdfBridge(): void {
  if (window.__buildInvoicePdfInOpener) return
  window.__buildInvoicePdfInOpener = buildInvoicePdfInOpener
}

ensureInvoicePrintPdfBridge()
