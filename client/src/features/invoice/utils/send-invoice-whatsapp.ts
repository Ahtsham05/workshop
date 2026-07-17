import { whatsappApi } from '@/stores/whatsapp.api'
import { store } from '@/stores/store'

import { buildInvoicePdfInOpener } from './invoice-print-pdf-bridge'
import { buildInvoicePdfDownloadFilename } from './invoice-print-whatsapp'
import { generateA4InvoiceHTML, type PrintInvoiceData } from './print-utils'
import type { InvoiceTemplate } from './invoice-template'

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function extractPrintRootHtml(fullHtml: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(fullHtml, 'text/html')
  const root = doc.getElementById('invoice-print-root')
  if (root) return root.outerHTML
  const body = doc.body
  if (body?.innerHTML.trim()) {
    return `<div id="invoice-print-root">${body.innerHTML}</div>`
  }
  return fullHtml
}

function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Failed to send on WhatsApp'
  const e = err as { data?: { message?: string }; message?: string }
  return e.data?.message || e.message || 'Failed to send on WhatsApp'
}

/** Save flow helper: build a full A4 invoice PDF (matching the on-screen print view — not a half-sheet/thermal layout) from print data and send via connected WhatsApp. */
export async function sendInvoiceReceiptWhatsApp(params: {
  printData: PrintInvoiceData
  phone: string
  caption?: string
  template?: InvoiceTemplate
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const phone = params.phone.trim()
  if (!phone) {
    return { success: false, error: 'No phone or WhatsApp number' }
  }

  const html = generateA4InvoiceHTML(params.printData, 'a4', params.template ?? 'standard')
  const rootHtml = extractPrintRootHtml(html)
  const blob = await buildInvoicePdfInOpener(rootHtml)
  const pdfBase64 = await blobToBase64(blob)
  const filename = buildInvoicePdfDownloadFilename(params.printData)
  const companyName =
    (params.printData.printInUrdu
      ? params.printData.companyNameUrdu || params.printData.companyName
      : params.printData.companyName || params.printData.companyNameUrdu) || ''
  // Falls back to the invoice_pdf template's own greeting when no name is known — Meta
  // rejects an empty template parameter, so this must never be ''.
  const customerName = params.printData.walkInCustomerName || params.printData.customerName || 'there'

  try {
    const result = await store
      .dispatch(
        whatsappApi.endpoints.sendInvoicePdfWhatsApp.initiate({
          phone,
          pdfBase64,
          filename,
          caption:
            params.caption ||
            `Invoice ${params.printData.invoiceNumber}${companyName ? ` from ${companyName}` : ''}`,
          invoiceNumber: params.printData.invoiceNumber,
          templateParams: [customerName, params.printData.invoiceNumber],
        }),
      )
      .unwrap()
    return { success: true, message: result.message }
  } catch (err) {
    return { success: false, error: extractErrorMessage(err) }
  }
}

/** Purchase receipt PDF send — reuses the same WhatsApp endpoint. */
export async function sendDocumentPdfWhatsApp(params: {
  html: string
  phone: string
  filename: string
  caption: string
  invoiceNumber?: string
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const phone = params.phone.trim()
  if (!phone) {
    return { success: false, error: 'No phone or WhatsApp number' }
  }

  const rootHtml = extractPrintRootHtml(params.html)
  const blob = await buildInvoicePdfInOpener(rootHtml)
  const pdfBase64 = await blobToBase64(blob)

  try {
    const result = await store
      .dispatch(
        whatsappApi.endpoints.sendInvoicePdfWhatsApp.initiate({
          phone,
          pdfBase64,
          filename: params.filename,
          caption: params.caption,
          invoiceNumber: params.invoiceNumber,
        }),
      )
      .unwrap()
    return { success: true, message: result.message }
  } catch (err) {
    return { success: false, error: extractErrorMessage(err) }
  }
}
