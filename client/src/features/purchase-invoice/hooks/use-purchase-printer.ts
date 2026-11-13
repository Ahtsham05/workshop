import { useCallback } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useCurrencyMeta } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import {
  PAPER_FORMATS,
  resolveSheetSize,
  resolveThermalSize,
  withPrintOrientation,
  type PaperSize,
  type PrintOrientation,
} from '@/features/invoice/utils/paper-format'
import type { InvoiceTemplate } from '@/features/invoice/utils/invoice-template'

/**
 * The one "print this saved purchase" routine (thermal or sheet, branch header, Urdu
 * preference). Shared by the purchase list's row menu and the purchase view, so a print
 * looks the same wherever it is started from.
 */
export function usePurchasePrinter() {
  const { t } = useLanguage()
  const currencyMeta = useCurrencyMeta()
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'

  const printPurchase = useCallback(
    async (purchase: any, paperSize: PaperSize = defaultPaperSize) => {
      try {
        const printModule = await import('@/utils/purchasePrintUtils')
        const branchDetails = {
          name: resolveBranchCompanyName(orgData?.name, branchData?.name),
          nameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim(),
          address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
            .filter(Boolean)
            .join(', '),
          phone: branchData?.phone,
          email: branchData?.email,
          logo: orgData?.logo?.url,
          isTrial: orgData?.subscription?.isTrial,
          invoiceNote: branchData?.invoiceNote,
          currencyMeta,
        }

        const paperFormat = PAPER_FORMATS[withPrintOrientation(paperSize, printOrientation)]
        const html =
          paperFormat.family === 'thermal'
            ? printModule.generatePurchaseInvoiceHTML(
                purchase,
                purchase?.supplier?.name || 'N/A',
                t,
                branchDetails,
                preferredLanguage,
                getInvoicePrintInUrdu(),
                resolveThermalSize(paperSize)
              )
            : printModule.generatePurchaseInvoiceA4HTML(
                purchase,
                purchase?.supplier?.name || 'N/A',
                t,
                branchDetails,
                preferredLanguage,
                getInvoicePrintInUrdu(),
                withPrintOrientation(resolveSheetSize(paperSize), printOrientation),
                invoiceTemplate
              )

        const printWindow = window.open(
          '',
          '_blank',
          `width=${paperFormat.popup.width},height=${paperFormat.popup.height},scrollbars=yes,resizable=yes`
        )
        if (printWindow) {
          printWindow.document.write(html)
          printWindow.document.close()
          printWindow.print()
        } else {
          toast.error(t('Allow pop-ups to print'))
        }
      } catch (printError) {
        console.error('Failed to print purchase:', printError)
        toast.error(t('Failed to print purchase'))
      }
    },
    [branchData, t, preferredLanguage, orgData, defaultPaperSize, invoiceTemplate, printOrientation, currencyMeta]
  )

  return { printPurchase, defaultPaperSize, branchData, orgData }
}
