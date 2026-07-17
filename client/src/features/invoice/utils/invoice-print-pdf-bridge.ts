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
/** Printable-area height/width ratio for one A4 page at PDF_MARGIN_MM — used to pad short invoices up to a full page. */
const A4_PRINTABLE_RATIO = (297 - PDF_MARGIN_MM * 2) / (210 - PDF_MARGIN_MM * 2)

async function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = PDF_MARGIN_MM
  const printableWidth = pageWidth - margin * 2
  const printableHeight = pageHeight - margin * 2
  const imgWidth = printableWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight)
  heightLeft -= printableHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', margin, position + margin, imgWidth, imgHeight)
    heightLeft -= printableHeight
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

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(root.scrollWidth || 0, 720),
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
