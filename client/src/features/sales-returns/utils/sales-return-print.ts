/**
 * Prints a sales return as a "RETURN INVOICE" in the Distributor (US wholesale) layout: same
 * letterhead, barcode, Sold To, grey bands and balance band as the sales invoice, with the
 * original invoice number / date, refund method, reason and condition of the goods.
 *
 * Opens the same print window as invoices, so Print, Save PDF and WhatsApp send all work.
 */
import type { SalesReturn } from '@/stores/returns.api'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import {
  generateA4InvoiceHTML,
  openPrintWindowForFormat,
  type PrintInvoiceData,
} from '@/features/invoice/utils/print-utils'
import { prepareSheetPrintData, type InvoicePrintSource } from '@/features/invoice/utils/distributor-print-details'
import { fetchBalanceBeforeInvoice } from '@/features/invoice/utils/invoice-print-balance'
import { withCustomerContactForPrint } from '@/features/invoice/utils/invoice-print-whatsapp'
import { resolveCustomerIdString, type PrintWindowContact } from '@/features/invoice/utils/invoice-print-contact-bridge'
import { PAPER_FORMATS, resolveSheetFormat, type PaperSize, type PrintOrientation } from '@/features/invoice/utils/paper-format'

interface Named {
  _id?: string
  id?: string
  name?: string
  nameUrdu?: string
  phone?: string
  whatsapp?: string
}

/** The original invoice, as the returns list populates it. */
type InvoiceRef = InvoicePrintSource & { invoiceNumber?: string; invoiceDate?: string }

export interface SalesReturnPrintContext {
  orgData?: { name?: string; nameUrdu?: string; logo?: { url?: string }; subscription?: { isTrial?: boolean } } | null
  branchData?: {
    name?: string
    nameUrdu?: string
    phone?: string
    email?: string
    location?: { address?: string; addressUrdu?: string; city?: string; country?: string }
  } | null
  currencyMeta?: PrintInvoiceData['currencyMeta']
  paperSize: PaperSize
  printOrientation: PrintOrientation
}

const obj = <T>(value: unknown): T | undefined => (value && typeof value === 'object' ? (value as T) : undefined)
const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  const o = obj<{ _id?: string; id?: string }>(value)
  return o ? String(o._id || o.id || '') : ''
}
const round2 = (n: number) => Math.round(n * 100) / 100

export async function buildSalesReturnPrintData(ret: SalesReturn, ctx: SalesReturnPrintContext): Promise<PrintInvoiceData> {
  const { orgData, branchData } = ctx
  const invoice = obj<InvoiceRef>(ret.invoiceId)
  const customer = obj<Named>(ret.customerId)
  const customerId = idOf(ret.customerId)
  const returnId = String(ret._id || ret.id || '')
  const createdBy = obj<{ name?: string }>(ret.createdBy)

  const items = (ret.items || []).map((item) => {
    const line = item as typeof item & { unit?: string; taxAmount?: number }
    return {
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit: line.unit,
      unitPrice: Number(item.price) || 0,
      subtotal: Number(item.total) || 0,
      taxAmount: Number(line.taxAmount) || 0,
    }
  })
  const subtotal = round2(items.reduce((s, it) => s + it.subtotal, 0))
  const total = Number(ret.totalAmount) || 0
  // The reversed tax only prints when the return total actually includes it; otherwise the
  // Tax column / row would not add up to the Return Total.
  const tax = Number((ret as SalesReturn & { taxAmount?: number }).taxAmount) || 0
  const taxIncluded = tax > 0 && Math.abs(total - (subtotal + tax)) < 0.01
  if (!taxIncluded) items.forEach((it) => (it.taxAmount = 0))

  // Balance before / after this return, straight from the customer ledger row it posted.
  const previousBalance = customerId ? await fetchBalanceBeforeInvoice(customerId, returnId) : 0
  const returnDate = ret.date || ret.createdAt

  const printData = withCustomerContactForPrint(
    {
      invoiceNumber: ret.returnNumber,
      warehouseId: ret.warehouseId,
      items,
      customerId: customerId || 'walk-in',
      customerName: customer?.name || ret.customerName,
      customerNameUrdu: customer?.nameUrdu || undefined,
      walkInCustomerName: customerId ? undefined : ret.customerName,
      type: 'cash',
      subtotal,
      tax: taxIncluded ? tax : 0,
      discount: 0,
      total,
      paidAmount: total,
      balance: 0,
      invoiceDate: returnDate,
      invoiceDateTime: returnDate,
      invoicedBy: createdBy?.name?.trim() || undefined,
      invoiceAddress: branchData?.location?.address?.trim() || undefined,
      invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
      companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
      companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
      companyAddress:
        [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') ||
        undefined,
      companyPhone: branchData?.phone,
      companyEmail: branchData?.email,
      companyLogo: orgData?.logo?.url,
      isTrial: orgData?.subscription?.isTrial,
      printInUrdu: false,
      previousBalance,
      newBalance: previousBalance - total,
      currencyMeta: ctx.currencyMeta,
      salesReturn: {
        originalInvoiceNumber: invoice?.invoiceNumber,
        originalInvoiceDate: invoice?.invoiceDate || invoice?.createdAt,
        refundMethod: ret.refundMethod,
        status: ret.status,
        reason: ret.reason,
        damageDescription: ret.damageDescription,
      },
    },
    { customerId: ret.customerId },
    customer,
  )

  // Product codes (SKU column), customer address / tax number and business details come from
  // the same lookup the invoice print uses — run against the ORIGINAL invoice, whose lines
  // carry the products. Return-specific values set above (date, returned by) take precedence.
  return prepareSheetPrintData(printData, invoice ? { ...invoice, customerId: ret.customerId } : { customerId: ret.customerId }, 'distributor')
}

export async function printSalesReturn(ret: SalesReturn, ctx: SalesReturnPrintContext): Promise<void> {
  const data = await buildSalesReturnPrintData(ret, ctx)
  // A return invoice is a sheet document; a branch set to a receipt roll prints it on A4.
  const sheet = PAPER_FORMATS[ctx.paperSize]?.family === 'thermal' ? 'a4' : resolveSheetFormat(ctx.paperSize, ctx.printOrientation)
  const html = generateA4InvoiceHTML(data, sheet, 'distributor')
  const customerIdStr = resolveCustomerIdString(ret.customerId)
  const contact: PrintWindowContact = {
    customerId: customerIdStr,
    phone: data.customerPhone,
    whatsapp: data.customerWhatsapp || data.customerPhone,
  }
  openPrintWindowForFormat(html, sheet, contact)
}
