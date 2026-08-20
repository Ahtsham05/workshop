import {
  generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindowForFormat, type PrintInvoiceData,
} from '@/features/invoice/utils/print-utils'
import { PAPER_FORMATS, resolveThermalSize, resolveSheetFormat, type PaperSize, type PrintOrientation } from '@/features/invoice/utils/paper-format'
import type { InvoiceTemplate } from '@/features/invoice/utils/invoice-template'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import type { ImeiEntryInput } from '@/stores/imei.api'
import type { Organization } from '@/stores/organization.api'
import type { Branch } from '@/stores/branch.api'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'

/** Shape of the Invoice an Old/New Phone sale creates — just the fields the print template needs. */
export type PhoneSaleInvoice = {
  invoiceNumber: string
  items?: Array<{ name: string; quantity: number; unitPrice: number; subtotal: number; imeis?: ImeiEntryInput[] }>
  customerName?: string
  walkInCustomerName?: string
  type: 'cash' | 'credit' | 'pending' | 'quotation'
  subtotal?: number
  tax?: number
  discount?: number
  total?: number
  paidAmount?: number
  balance?: number
  notes?: string
  invoiceDate?: string
}

/**
 * Prints a just-created Old/New Phone sale using the exact same professional invoice
 * template as the main Invoice screen (with IMEI numbers on the item line), instead of a
 * bespoke mini-receipt — selling a phone here still creates a real Invoice underneath, so
 * its receipt should look like every other invoice in the app.
 */
export function printPhoneSaleInvoice(
  invoiceRecord: PhoneSaleInvoice,
  org: Organization | undefined,
  branchData: Branch | undefined,
  preferredLanguage: 'en' | 'ur' = 'en',
) {
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'

  const printData: PrintInvoiceData = {
    invoiceNumber: invoiceRecord.invoiceNumber,
    items: (invoiceRecord.items || []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      imeis: item.imeis,
    })),
    customerName: invoiceRecord.customerName,
    walkInCustomerName: invoiceRecord.walkInCustomerName,
    type: invoiceRecord.type,
    subtotal: invoiceRecord.subtotal ?? 0,
    tax: invoiceRecord.tax ?? 0,
    discount: invoiceRecord.discount ?? 0,
    total: invoiceRecord.total ?? 0,
    paidAmount: invoiceRecord.paidAmount ?? 0,
    balance: invoiceRecord.balance ?? 0,
    notes: invoiceRecord.notes,
    invoiceAddress: branchData?.location?.address?.trim() || undefined,
    companyName: resolveBranchCompanyName(org?.name, branchData?.name),
    companyNameUrdu: branchData?.nameUrdu?.trim() || org?.nameUrdu?.trim() || undefined,
    companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
    companyPhone: branchData?.phone,
    companyEmail: branchData?.email,
    companyLogo: org?.logo?.url,
    isTrial: org?.subscription?.isTrial,
    userPreferredLanguage: preferredLanguage,
    invoiceNote: branchData?.invoiceNote,
    printInUrdu: getInvoicePrintInUrdu(),
    invoiceDate: invoiceRecord.invoiceDate,
  }

  if (PAPER_FORMATS[defaultPaperSize].family === 'thermal') {
    openPrintWindowForFormat(generateInvoiceHTML(printData, resolveThermalSize(defaultPaperSize)), defaultPaperSize)
  } else {
    const sheetSize = resolveSheetFormat(defaultPaperSize, printOrientation)
    openPrintWindowForFormat(generateA4InvoiceHTML(printData, sheetSize, invoiceTemplate), sheetSize)
  }
}
