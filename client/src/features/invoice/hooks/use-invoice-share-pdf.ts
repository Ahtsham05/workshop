import { useCallback } from 'react'
import type { PrintInvoiceData } from '../utils/print-utils'
import { buildInvoiceSharePdf, type InvoiceSharePdf } from '../utils/invoice-share'
import { useInvoicePrinter } from './use-invoice-printer'
import type { ApiRecord } from '../components/mobile/mobile-utils'

export interface InvoiceShareBuild {
  pdf: InvoiceSharePdf
  printData: PrintInvoiceData
}

/** Recently built share PDFs, keyed by invoice + version + template. A PDF is built once and
 *  reused — the posted-invoice screen builds it in the background, so Share opens ready. */
const cache = new Map<string, Promise<InvoiceShareBuild>>()
const MAX_CACHED = 6

const keyOf = (invoice: ApiRecord, template: string) =>
  [invoice._id || invoice.id || invoice.invoiceNumber, invoice.updatedAt || invoice.total || '', template].join('|')

/** Builds (or reuses) the invoice's share PDF and the print data its message is written from. */
export function useInvoiceSharePdf() {
  const printer = useInvoicePrinter()
  const { buildInvoicePrintData, invoiceTemplate, branchData } = printer

  const getSharePdf = useCallback(
    (invoice: ApiRecord): Promise<InvoiceShareBuild> => {
      const key = keyOf(invoice, invoiceTemplate)
      const hit = cache.get(key)
      if (hit) return hit
      const build = (async () => {
        const { printData } = await buildInvoicePrintData(invoice)
        const withDates: PrintInvoiceData = {
          ...printData,
          dueDate: printData.dueDate || (invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : undefined),
          invoiceDate: printData.invoiceDate || (invoice.invoiceDate ? String(invoice.invoiceDate) : undefined),
        }
        const pdf = await buildInvoiceSharePdf({ printData: withDates, source: invoice, template: invoiceTemplate })
        return { pdf, printData: withDates }
      })()
      // A failed build must not stick — the next attempt retries.
      build.catch(() => cache.delete(key))
      cache.set(key, build)
      while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string)
      return build
    },
    [buildInvoicePrintData, invoiceTemplate],
  )

  /** Branch print settings (template) have loaded — building before that would use 'standard'. */
  const ready = Boolean(branchData)

  return { getSharePdf, ready, printer }
}
