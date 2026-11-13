import { useCallback, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useCurrencyMeta } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { permissionMessage } from '@/lib/permission-messages'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindowForFormat } from '../utils/print-utils'
import { prepareSheetPrintData } from '../utils/distributor-print-details'
import { PAPER_FORMATS, resolveThermalSize, resolveSheetFormat, type PaperSize, type PrintOrientation } from '../utils/paper-format'
import type { InvoiceTemplate } from '../utils/invoice-template'
import { fetchBalanceBeforeInvoice } from '../utils/invoice-print-balance'
import { withCustomerContactForPrint } from '../utils/invoice-print-whatsapp'
import {
  fetchAndStashPrintContact,
  resolveCustomerIdString,
  stashPrintContact,
  type PrintWindowContact,
} from '../utils/invoice-print-contact-bridge'
import { getInvoicePrintInUrdu } from '../utils/print-preferences'

/** What the printer needs to know about the invoice's customer. All optional: a populated
 *  `customerId` (invoice-by-id) or a `customer` object (list rows) already carries them. */
export interface InvoicePrintCustomer {
  name?: string
  nameUrdu?: string
  linkedSupplierId?: string | null
}

export interface UseInvoicePrinterOptions {
  /** Extra customer lookup, e.g. the list's already-loaded customers map. */
  lookupCustomer?: (customerId: string) => InvoicePrintCustomer | undefined
}

const refOf = (value: unknown): Record<string, any> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, any>) : undefined

/**
 * The one "print this saved invoice" routine — thermal or sheet, with the customer's
 * previous balance and WhatsApp contact attached. Used by the invoice list (rows + 2-per-page)
 * and the invoice view dialog, so a print looks the same wherever it is started from.
 */
export function useInvoicePrinter({ lookupCustomer }: UseInvoicePrinterOptions = {}) {
  const { t } = useLanguage()
  const { hasExplicitPermission } = usePermissions()
  const currencyMeta = useCurrencyMeta()
  const canPrint = hasExplicitPermission('printInvoices')
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'
  const [printingId, setPrintingId] = useState<string | null>(null)

  const customerOf = useCallback(
    (invoice: any): InvoicePrintCustomer & { id?: string } => {
      const id = resolveCustomerIdString(invoice.customerId)
      const populated = refOf(invoice.customerId) || refOf(invoice.customer)
      const looked = id ? lookupCustomer?.(id) : undefined
      return {
        id,
        name: populated?.name || looked?.name,
        nameUrdu: populated?.nameUrdu || looked?.nameUrdu,
        linkedSupplierId: populated?.linkedSupplierId || looked?.linkedSupplierId,
      }
    },
    [lookupCustomer]
  )

  const buildInvoicePrintData = useCallback(
    async (invoice: any) => {
      const customer = customerOf(invoice)
      const isWalkIn = invoice.customerId === 'walk-in' || !customer.id
      const customerName = isWalkIn
        ? invoice.walkInCustomerName || t('walk_in_customer')
        : customer.name || invoice.customerName || t('unknown_customer')
      const customerNameUrdu = isWalkIn ? '' : String(customer.nameUrdu || '').trim()
      // A supplier's shadow-customer account has its own isolated CustomerLedger balance —
      // pull the supplier's true net balance (purchases + sales combined) instead when linked.
      const previousBalance = await fetchBalanceBeforeInvoice(
        customer.id,
        invoice._id || invoice.id,
        customer.linkedSupplierId ? String(customer.linkedSupplierId) : undefined
      )
      const invoiceTotal = Number(invoice.total || 0)
      const invoicePaid = Number(invoice.paidAmount || 0)

      const printData = withCustomerContactForPrint(
        {
          invoiceNumber: invoice.invoiceNumber,
          warehouseId: invoice.warehouseId,
          items: (invoice.items || []).map((item: any) => ({
            name: item.name,
            nameUrdu: item.nameUrdu || (typeof item.productId === 'object' ? item.productId?.nameUrdu : undefined),
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            discountAmount: item.discountAmount,
            imeis: item.imeis,
          })),
          customerId: isWalkIn ? invoice.customerId : customer.id,
          customerName,
          customerNameUrdu: customerNameUrdu || undefined,
          walkInCustomerName: invoice.walkInCustomerName,
          type: invoice.type,
          subtotal: invoice.subtotal || 0,
          tax: invoice.tax || 0,
          taxLines: invoice.taxLines || [],
          discount: invoice.discount || 0,
          total: invoice.total || 0,
          paidAmount: invoice.paidAmount || 0,
          balance: invoice.balance || 0,
          notes: invoice.notes,
          termsAndConditions: invoice.termsAndConditions,
          invoiceAddress: branchData?.location?.address?.trim() || undefined,
          invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
          deliveryCharge: invoice.deliveryCharge || 0,
          serviceCharge: invoice.serviceCharge || 0,
          companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
          companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
          companyAddress:
            [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') ||
            undefined,
          companyPhone: branchData?.phone,
          companyEmail: branchData?.email,
          companyTaxNumber: undefined,
          companyLogo: orgData?.logo?.url,
          isTrial: orgData?.subscription?.isTrial,
          language: invoice.language,
          isUrduOnly: invoice.isUrduOnly,
          userPreferredLanguage: preferredLanguage,
          invoiceNote: branchData?.invoiceNote,
          printInUrdu: getInvoicePrintInUrdu(),
          printAsQuotation: invoice.type === 'quotation',
          previousBalance,
          newBalance: previousBalance + invoiceTotal - invoicePaid,
          currencyMeta,
        },
        invoice
      )

      const customerIdStr = resolveCustomerIdString(invoice.customerId)
      let contactPhone = printData.customerPhone
      let contactWhatsapp = printData.customerWhatsapp
      if (customerIdStr) {
        stashPrintContact({ customerId: customerIdStr, phone: contactPhone, whatsapp: contactWhatsapp })
        try {
          const fetched = await fetchAndStashPrintContact(customerIdStr)
          contactPhone = fetched.phone || contactPhone
          contactWhatsapp = fetched.whatsapp || contactWhatsapp
        } catch {
          /* prompt in print window if still missing */
        }
      }
      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: contactPhone,
        whatsapp: contactWhatsapp || contactPhone,
      }
      if (contactPhone || contactWhatsapp) {
        Object.assign(printData, {
          customerPhone: contactPhone,
          customerWhatsapp: contactWhatsapp || contactPhone,
        })
      }

      return { printData, printContact }
    },
    [customerOf, t, branchData, orgData, preferredLanguage, currencyMeta]
  )

  const printInvoice = useCallback(
    async (invoice: any, paperSize: PaperSize = defaultPaperSize) => {
      if (!canPrint) {
        toast.error(permissionMessage(t, 'no_permission_print_invoice'))
        return
      }
      try {
        setPrintingId(invoice.id || invoice._id)
        const { printData, printContact } = await buildInvoicePrintData(invoice)

        if (PAPER_FORMATS[paperSize].family === 'thermal') {
          const htmlContent = generateInvoiceHTML(printData, resolveThermalSize(paperSize))
          openPrintWindowForFormat(htmlContent, paperSize, printContact)
        } else {
          const sheetSize = resolveSheetFormat(paperSize, printOrientation)
          const sheetData = await prepareSheetPrintData(printData, invoice, invoiceTemplate)
          const htmlContent = generateA4InvoiceHTML(sheetData, sheetSize, invoiceTemplate)
          openPrintWindowForFormat(htmlContent, sheetSize, printContact)
        }

        toast.success(`Printing invoice ${invoice.invoiceNumber}`)
      } catch (error) {
        console.error('Print error:', error)
        toast.error('Failed to print invoice')
      } finally {
        setPrintingId(null)
      }
    },
    [canPrint, t, buildInvoicePrintData, defaultPaperSize, printOrientation, invoiceTemplate]
  )

  return {
    canPrint,
    printInvoice,
    buildInvoicePrintData,
    printingId,
    defaultPaperSize,
    invoiceTemplate,
    printOrientation,
    branchData,
    orgData,
  }
}
