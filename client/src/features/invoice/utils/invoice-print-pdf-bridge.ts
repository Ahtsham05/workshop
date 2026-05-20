import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

declare global {
  interface Window {
    __buildInvoicePdfInOpener?: (invoiceRootHtml: string) => Promise<Blob>
  }
}

async function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 8
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

/** Build invoice PDF in the main app (bundled html2canvas + jspdf). Used when print popup CDN libs fail. */
export async function buildInvoicePdfInOpener(invoiceRootHtml: string): Promise<Blob> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-12000px;top:0;width:720px;max-width:720px;background:#fff;z-index:-1;pointer-events:none;overflow:visible'
  host.innerHTML = invoiceRootHtml
  document.body.appendChild(host)

  const root = host.querySelector('#invoice-print-root') ?? host.firstElementChild ?? host

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined)
    }
    await new Promise((r) => setTimeout(r, 150))

    const canvas = await html2canvas(root as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max((root as HTMLElement).scrollWidth || 0, 720),
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
