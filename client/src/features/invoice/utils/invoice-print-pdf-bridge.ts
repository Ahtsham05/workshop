import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

declare global {
  interface Window {
    __buildInvoicePdfInOpener?: (invoiceRootHtml: string, options?: BuildInvoicePdfOptions) => Promise<Blob>
  }
}

export type BuildInvoicePdfOptions = {
  /** Pads short content up to one full A4 page instead of a page sized to fit only the content — for full-sheet A4/A5 invoices, never for thermal receipts. */
  fillFullPage?: boolean
}

const PDF_MARGIN_MM = 8
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
/** Printable-area height/width ratio for one A4 page at PDF_MARGIN_MM — used to pad short invoices up to a full page. */
const A4_PRINTABLE_RATIO = (A4_HEIGHT_MM - PDF_MARGIN_MM * 2) / (A4_WIDTH_MM - PDF_MARGIN_MM * 2)

/**
 * One continuous page, always A4-width, sized to fit the whole invoice — no page-splitting.
 * The previous version sliced a single tall image across fixed 297mm-tall A4 pages by
 * re-drawing the full image at shifting offsets per page; when a table row landed on a slice
 * boundary it visibly rendered twice (once at the bottom of one page, again at the top of the
 * next), and short invoices left a near-blank trailing page. A WhatsApp PDF is read on a
 * screen, not laid on a printer bed, so there's no reason to fragment it — a single tall page
 * (same approach already used for thermal receipts via `pageCss: '80mm auto'`) reads cleanly
 * end-to-end and can never duplicate a row at a page break.
 */
async function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const margin = PDF_MARGIN_MM
  const printableWidth = A4_WIDTH_MM - margin * 2
  const imgWidth = printableWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const pageHeight = imgHeight + margin * 2

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [A4_WIDTH_MM, pageHeight] })
  pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight)
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
export async function buildInvoicePdfInOpener(invoiceRootHtml: string, options?: BuildInvoicePdfOptions): Promise<Blob> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-12000px;top:0;width:720px;max-width:720px;background:#fff;z-index:-1;pointer-events:none;overflow:visible'
  host.innerHTML = invoiceRootHtml
  injectFlatPageStyle(host)
  document.body.appendChild(host)

  const root = (host.querySelector('#invoice-print-root') ?? host.firstElementChild ?? host) as HTMLElement

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined)
    }
    await new Promise((r) => setTimeout(r, 150))

    if (options?.fillFullPage) {
      const width = root.scrollWidth || 720
      const minHeight = Math.ceil(width * A4_PRINTABLE_RATIO)
      if (root.scrollHeight < minHeight) {
        root.style.minHeight = `${minHeight}px`
      }
    }

    // html2canvas lays the clone out in a virtual window sized windowWidth x windowHeight;
    // left at its default (the real browser window's height, ~800-1000px), content taller
    // than that forces it to scroll-and-stitch internally, which is what produced the
    // repeated row — sizing the virtual window to the full content height up front avoids
    // that path entirely.
    const captureWidth = Math.max(root.scrollWidth || 0, 720)
    const captureHeight = root.scrollHeight || undefined
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: captureWidth,
      windowHeight: captureHeight,
    })

    return canvasToPdfBlob(canvas)
  } finally {
    document.body.removeChild(host)
  }
}

export function ensureInvoicePrintPdfBridge(): void {
  if (window.__buildInvoicePdfInOpener) return
  window.__buildInvoicePdfInOpener = buildInvoicePdfInOpener
}

ensureInvoicePrintPdfBridge()
