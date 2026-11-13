import { buildInvoicePdfInOpener } from './invoice-print-pdf-bridge'
import { buildInvoicePdfDownloadFilename, resolvePrintCustomerLabel } from './invoice-print-whatsapp'
import { extractPrintRootHtml } from './send-invoice-whatsapp'
import { generateA4InvoiceHTML, resolvePrintDocumentNumber, type PrintInvoiceData } from './print-utils'
import { prepareSheetPrintData, type InvoicePrintSource } from './distributor-print-details'
import type { InvoiceTemplate } from './invoice-template'

/** A ready-to-send invoice PDF. Built once when the share screen opens, so the "Share"
 *  tap can hand it to the system share sheet straight away (Safari refuses
 *  `navigator.share` once the tap's user-activation has been spent on async work). */
export interface InvoiceSharePdf {
  file: File
  blob: Blob
  filename: string
}

/** The invoice as an A4 PDF in the branch's own template — the same document the
 *  WhatsApp send and "Save as PDF" produce, never the narrow thermal receipt. */
export async function buildInvoiceSharePdf(params: {
  printData: PrintInvoiceData
  source?: InvoicePrintSource | null
  template?: InvoiceTemplate
}): Promise<InvoiceSharePdf> {
  const template = params.template ?? 'standard'
  const sheetData = await prepareSheetPrintData(params.printData, params.source ?? null, template)
  const html = generateA4InvoiceHTML(sheetData, 'a4', template)
  // Same web fonts as the printed invoice (already in the browser cache from the app/print view).
  const fontLinks = (html.match(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi) || []).join('')
  const blob = await buildInvoicePdfInOpener(extractPrintRootHtml(html), fontLinks)
  const filename = buildInvoicePdfDownloadFilename(params.printData)
  const file = new File([blob], filename, { type: 'application/pdf', lastModified: Date.now() })
  return { file, blob, filename }
}

/** True when this browser can hand a PDF to the OS share sheet (phones, Safari, Chrome on
 *  Windows/macOS/ChromeOS). Linux Chrome and Firefox desktop return false. */
export function canShareInvoiceFile(file: File | null | undefined): boolean {
  if (!file || typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed'

/** Opens the OS share sheet with the PDF. A dismissed sheet is 'cancelled', not an error. */
export async function shareInvoiceFile(pdf: InvoiceSharePdf, title: string, text: string): Promise<ShareOutcome> {
  if (!canShareInvoiceFile(pdf.file)) return 'unsupported'
  try {
    await navigator.share({ files: [pdf.file], title, text })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}

export function downloadInvoicePdf(pdf: InvoiceSharePdf): void {
  const url = URL.createObjectURL(pdf.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = pdf.filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some mobile browsers read the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function openInvoicePdfInNewTab(pdf: InvoiceSharePdf): void {
  const url = URL.createObjectURL(pdf.blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
}

/** Digits wa.me accepts — Pakistani local numbers (03xx…) become 923xx…. */
export function toWhatsAppDigits(phone?: string | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  else if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('03') && digits.length === 11) digits = `92${digits.slice(1)}`
  else if (digits.startsWith('3') && digits.length === 10) digits = `92${digits}`
  return digits.length >= 8 ? digits : null
}

export function whatsappChatUrl(phone: string | null | undefined, text: string): string {
  const digits = toWhatsAppDigits(phone)
  return digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function emailUrl(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${email ? encodeURIComponent(email) : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Short covering message that goes with the PDF (WhatsApp text, email body, share text). */
export function buildInvoiceShareMessage(
  data: PrintInvoiceData,
  formatMoney: (value: number) => string,
  formatDate: (value: string) => string,
): { title: string; text: string } {
  const isQuotation = Boolean(data.printAsQuotation) || data.type === 'quotation'
  const label = isQuotation ? 'Quotation' : 'Invoice'
  const number = resolvePrintDocumentNumber(String(data.invoiceNumber || ''), isQuotation)
  const company = (data.companyName || '').trim()
  const customer = resolvePrintCustomerLabel(data)
  const total = Number(data.total) || 0
  const paid = Number(data.paidAmount) || 0
  const due = Math.max(0, total - paid)

  const lines = [
    customer && customer !== 'Customer' ? `Dear ${customer},` : 'Hello,',
    '',
    `Please find attached ${label.toLowerCase()} ${number}${company ? ` from ${company}` : ''}.`,
    '',
    data.invoiceDate ? `Date: ${formatDate(data.invoiceDate)}` : '',
    `Total: ${formatMoney(total)}`,
    !isQuotation && paid > 0 ? `Paid: ${formatMoney(paid)}` : '',
    !isQuotation && due > 0.004 ? `Amount due: ${formatMoney(due)}` : '',
    !isQuotation && data.dueDate && due > 0.004 ? `Due date: ${formatDate(data.dueDate)}` : '',
    '',
    'Thank you for your business.',
    company,
  ]
  // Drop the blanks left by optional lines, but keep single paragraph breaks.
  const text = lines
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim()

  return { title: `${label} ${number}${company ? ` — ${company}` : ''}`, text }
}
