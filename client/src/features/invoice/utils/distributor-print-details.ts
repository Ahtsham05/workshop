/**
 * Fills in the extra details the Distributor invoice layout prints — product barcodes (UPC),
 * who created the invoice, the salesman, the customer's address / terms / tax number and
 * the business's website and tax number. Other templates never print these, so callers only
 * run this when the branch's template is 'distributor'.
 *
 * Everything is best-effort: each lookup uses the RTK Query cache when it can, gives up
 * after a short timeout, and leaves the print data as it was on any failure — printing must
 * never be blocked by a slow or missing lookup.
 */
import { formatPaymentMethod } from '@/lib/payment-modes'
import { store } from '@/stores/store'
import { invoiceApi } from '@/stores/invoice.api'
import { customerApi } from '@/stores/customer.api'
import { organizationApi } from '@/stores/organization.api'
import type { InvoiceTemplate } from './invoice-template'
import type { PrintInvoiceData } from './print-utils'

const LOOKUP_TIMEOUT_MS = 2500

interface RefLike {
  _id?: string
  id?: string
  name?: string
  barcode?: string
  sku?: string
}

interface SourceItem {
  name?: string
  productId?: string | RefLike | null
  variantId?: string | RefLike | null
  barcode?: string
  sku?: string
  taxAmount?: number
}

interface CustomerLike {
  address?: string
  billingAddress?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; countryCode?: string }
  email?: string
  phone?: string
  taxNumber?: string
  paymentTerms?: string
}

/** The invoice a print was built from: a saved invoice, an API response or an unsaved draft. */
export interface InvoicePrintSource {
  _id?: string
  id?: string
  items?: SourceItem[]
  createdBy?: string | RefLike | null
  salesmanId?: string | RefLike | null
  customerId?: unknown
  createdAt?: string
  type?: string
  paymentMode?: string
  paymentMethod?: string
  walletType?: string
  paymentReference?: string
  splitPaymentMethod?: string
  splitWalletType?: string
  splitPaidAmount?: number
}

function withTimeout<T>(promise: Promise<T>): Promise<T | undefined> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), LOOKUP_TIMEOUT_MS)),
  ])
}

type QueryRequest = PromiseLike<{ data?: unknown; isUninitialized?: boolean }> & { unsubscribe: () => void }

/**
 * Reads one RTK Query endpoint outside React: subscribe, await, then release the
 * subscription. Until an API's middleware has seen its first action the very first
 * `initiate()` resolves "uninitialized" without fetching (e.g. printing from a ledger
 * before anything else touched the invoices API) — so that case is retried once.
 */
async function readQuery<T>(start: () => QueryRequest): Promise<T | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const request = start()
    try {
      const result = await withTimeout(Promise.resolve(request))
      if (result && !result.isUninitialized) return result.data as T | undefined
    } finally {
      request.unsubscribe()
    }
  }
  return undefined
}

const refOf = (value: unknown): RefLike | undefined =>
  value && typeof value === 'object' ? (value as RefLike) : undefined

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  const ref = refOf(value)
  return ref ? String(ref._id || ref.id || '') : ''
}

const nameOf = (value: unknown): string => String(refOf(value)?.name || '').trim()

const isObjectId = (value: string) => /^[a-f0-9]{24}$/i.test(value)

function itemCode(item: SourceItem | undefined): string {
  if (!item) return ''
  const product = refOf(item.productId)
  const variant = refOf(item.variantId)
  return String(variant?.barcode || product?.barcode || item.barcode || variant?.sku || product?.sku || item.sku || '').trim()
}

function customerAddressLines(customer: CustomerLike | undefined): string {
  if (!customer) return ''
  const b = customer.billingAddress || {}
  const cityLine = [b.city, [b.state, b.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const structured = [b.line1, b.line2, [cityLine, b.countryCode].filter(Boolean).join(' ')]
    .map((l) => String(l || '').trim())
    .filter(Boolean)
  if (structured.length) return structured.join('\n')
  return String(customer.address || '').trim()
}

function needsFullInvoice(source: InvoicePrintSource): boolean {
  const items = source.items || []
  const productsPopulated = items.every((it) => refOf(it.productId))
  const creatorPopulated = !source.createdBy || typeof source.createdBy === 'object'
  return !productsPopulated || !creatorPopulated
}

export async function withDistributorPrintDetails(
  printData: PrintInvoiceData,
  source: InvoicePrintSource | null | undefined,
): Promise<PrintInvoiceData> {
  const src: InvoicePrintSource = source || {}
  try {
    const invoiceId = idOf(src._id || src.id)
    const customerId = idOf(printData.customerId ?? src.customerId)

    const [full, customer] = await Promise.all([
      invoiceId && isObjectId(invoiceId) && needsFullInvoice(src)
        ? readQuery<InvoicePrintSource>(() => store.dispatch(invoiceApi.endpoints.getInvoiceById.initiate(invoiceId)))
        : Promise.resolve(undefined),
      customerId && isObjectId(customerId)
        ? readQuery<CustomerLike>(() => store.dispatch(customerApi.endpoints.getCustomerById.initiate(customerId)))
        : Promise.resolve(undefined),
    ])

    const invoice: InvoicePrintSource = full ? { ...src, ...full } : src
    const rawItems = invoice.items || []
    const sourceItems = src.items || []
    const aligned = rawItems.length === printData.items.length

    const items = printData.items.map((item, i) => {
      const raw = aligned ? rawItems[i] : rawItems.find((r) => r?.name === item.name)
      const draft = sourceItems.length === printData.items.length ? sourceItems[i] : undefined
      return {
        ...item,
        code: item.code || itemCode(raw) || itemCode(draft) || undefined,
        taxAmount: item.taxAmount ?? (raw?.taxAmount != null ? Number(raw.taxAmount) : undefined),
      }
    })

    const state = store.getState()
    const currentUser = refOf(state.auth?.data?.user)
    const createdById = idOf(invoice.createdBy)
    const invoicedBy =
      nameOf(invoice.createdBy) ||
      // unsaved draft, or a just-saved invoice whose createdBy came back as a bare id
      (!createdById || createdById === idOf(currentUser) ? String(currentUser?.name || '').trim() : '')

    const org = organizationApi.endpoints.getMyOrganization.select()(state)?.data
    const customerObj: CustomerLike | undefined =
      customer || (refOf(invoice.customerId) as CustomerLike | undefined)

    return {
      ...printData,
      items,
      invoiceDateTime: printData.invoiceDateTime || (invoiceId ? invoice.createdAt : undefined) || undefined,
      invoicedBy: printData.invoicedBy || invoicedBy || undefined,
      salesRep: printData.salesRep || nameOf(invoice.salesmanId) || undefined,
      customerAddress: printData.customerAddress || customerAddressLines(customerObj) || undefined,
      customerEmail: printData.customerEmail || customerObj?.email?.trim() || undefined,
      customerTaxNumber: printData.customerTaxNumber || customerObj?.taxNumber?.trim() || undefined,
      customerPaymentTerms: printData.customerPaymentTerms || customerObj?.paymentTerms || undefined,
      paymentLabel:
        printData.paymentLabel ||
        (Number(printData.paidAmount) > 0 ? formatPaymentMethod({ ...invoice, type: invoice.type ?? printData.type }) : '') ||
        undefined,
      customerPhone: printData.customerPhone || customerObj?.phone?.trim() || undefined,
      companyWebsite: printData.companyWebsite || org?.website?.trim() || undefined,
      companyEmail: printData.companyEmail || org?.email?.trim() || undefined,
      companyTaxNumber: printData.companyTaxNumber || org?.taxNumber?.trim() || undefined,
    }
  } catch {
    // Missing details just print as "-"; never block the print over them.
    return printData
  }
}

/** Runs the lookups only for the Distributor template; every other template is untouched. */
export function prepareSheetPrintData(
  printData: PrintInvoiceData,
  source: InvoicePrintSource | null | undefined,
  template: InvoiceTemplate,
): Promise<PrintInvoiceData> {
  return template === 'distributor' ? withDistributorPrintDetails(printData, source) : Promise.resolve(printData)
}
