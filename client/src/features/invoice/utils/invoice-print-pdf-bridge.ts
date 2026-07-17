import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

declare global {
  interface Window {
    __buildInvoicePdfInOpener?: (invoiceRootHtml: string) => Promise<Blob>
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
async function buildPdfFromChunks(chunks: HTMLElement[]): Promise<Blob> {
  const margin = PDF_MARGIN_MM
  const printableWidth = A4_WIDTH_MM - margin * 2
  const printableHeight = A4_HEIGHT_MM - margin * 2
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
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
    const canvas = await html2canvas(chunk, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: captureWidth,
      windowHeight: captureHeight,
    })

    chunk.style.cssText = prevChunkCss

    const naturalHeight = (canvas.height * printableWidth) / canvas.width
    // Only shrinks (never stretches) if a chunk is unexpectedly taller than one real A4 page —
    // the normal case is naturalHeight <= printableHeight and scale stays 1.
    const fitScale = naturalHeight > printableHeight ? printableHeight / naturalHeight : 1
    const imgWidth = printableWidth * fitScale
    const imgHeight = naturalHeight * fitScale

    if (i > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgWidth, imgHeight)
  }

  return pdf.output('blob')
}

/**
 * Neutralizes the on-screen "floating card" look (`@media screen` max-width, centered
 * margin, box-shadow, rounded corners) that the print popup adds for browser preview — a PDF
 * should read as a flat printed page, not a screenshot of a preview widget.
 */
function injectFlatPageStyle(host: HTMLElement): void {
  const style = document.createElement('style')
  style.textContent = `
    body, #invoice-print-root {
      max-width: none !important;
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      border: none !important;
    }
  `
  host.appendChild(style)
}

/** Build invoice PDF in the main app (bundled html2canvas + jspdf). Used when print popup CDN libs fail. */
export async function buildInvoicePdfInOpener(invoiceRootHtml: string): Promise<Blob> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    `position:fixed;left:-12000px;top:0;width:${A4_CSS_WIDTH_PX}px;max-width:${A4_CSS_WIDTH_PX}px;background:#fff;z-index:-1;pointer-events:none;overflow:visible`
  host.innerHTML = invoiceRootHtml
  injectFlatPageStyle(host)
  document.body.appendChild(host)

  const root = (host.querySelector('#invoice-print-root') ?? host.firstElementChild ?? host) as HTMLElement

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined)
    }
    await new Promise((r) => setTimeout(r, 150))

    const pageEls = root.querySelectorAll<HTMLElement>('.invoice-print-page')
    const chunks = pageEls.length ? Array.from(pageEls) : [root]

    return await buildPdfFromChunks(chunks)
  } finally {
    document.body.removeChild(host)
  }
}

export function ensureInvoicePrintPdfBridge(): void {
  if (window.__buildInvoicePdfInOpener) return
  window.__buildInvoicePdfInOpener = buildInvoicePdfInOpener
}

ensureInvoicePrintPdfBridge()
