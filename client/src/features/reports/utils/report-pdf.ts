// This app's Tailwind v4 theme defines colors via oklch(), which the stock `html2canvas`
// package (last updated for CSS Color 3) can't parse and throws on. `html2canvas-pro` is a
// maintained fork with the same API that adds support for oklch/lab/lch/color().
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'
import { whatsappApi } from '@/stores/whatsapp.api'
import { store } from '@/stores/store'

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const MARGIN_MM = 8

/**
 * Captures an on-screen report container as a multi-page A4 PDF. Unlike the invoice print
 * bridge, report sections aren't pre-split into page-sized chunks, so this takes one tall
 * screenshot and slices it into fixed-height A4 bands instead.
 */
export async function buildReportPdf(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const printableWidth = A4_WIDTH_MM - MARGIN_MM * 2
  const printableHeight = A4_HEIGHT_MM - MARGIN_MM * 2
  const pxPerMm = canvas.width / printableWidth
  const pageHeightPx = Math.floor(printableHeight * pxPerMm)

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let renderedHeight = 0
  let pageIndex = 0

  while (renderedHeight < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    const ctx = pageCanvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context unavailable')
    ctx.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

    const imgHeightMm = sliceHeight / pxPerMm
    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_MM, MARGIN_MM, printableWidth, imgHeightMm)

    renderedHeight += sliceHeight
    pageIndex += 1
  }

  return pdf.output('blob')
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Failed to send on WhatsApp'
  const e = err as { data?: { message?: string }; message?: string }
  return e.data?.message || e.message || 'Failed to send on WhatsApp'
}

/** Builds a PDF from the given element and sends it via the org's connected WhatsApp number. */
export async function sendReportPdfWhatsApp(params: {
  element: HTMLElement
  phone: string
  filename: string
  caption: string
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const phone = params.phone.trim()
  if (!phone) {
    return { success: false, error: 'Enter a phone number first' }
  }

  const blob = await buildReportPdf(params.element)
  const pdfBase64 = await blobToBase64(blob)

  try {
    const result = await store
      .dispatch(
        whatsappApi.endpoints.sendWhatsAppDocument.initiate({
          phone,
          pdfBase64,
          filename: params.filename,
          caption: params.caption,
        }),
      )
      .unwrap()
    return { success: true, message: result.message }
  } catch (err) {
    return { success: false, error: extractErrorMessage(err) }
  }
}
