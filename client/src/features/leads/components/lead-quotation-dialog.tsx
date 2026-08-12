import { useState } from 'react'
import { useSelector } from 'react-redux'
import { format } from 'date-fns'
import { FileText, Loader2, MessageCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { PrintFormatButton } from '@/components/print-format-button'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { useGetInvoiceByIdQuery } from '@/stores/invoice.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  generateInvoiceHTML,
  generateA4InvoiceHTML,
  openPrintWindowForFormat,
  type PrintInvoiceData,
} from '@/features/invoice/utils/print-utils'
import {
  PAPER_FORMATS,
  resolveThermalSize,
  resolveSheetFormat,
  useBranchPaperSize,
  useBranchPrintOrientation,
  type PaperSize,
} from '@/features/invoice/utils/paper-format'
import type { InvoiceTemplate } from '@/features/invoice/utils/invoice-template'
import { sendInvoiceReceiptWhatsApp } from '@/features/invoice/utils/send-invoice-whatsapp'
import { formatCurrency } from '../utils/stage-config'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  finalized: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400',
  refunded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

interface LeadQuotationDialogProps {
  invoiceId: string | null
  onOpenChange: (open: boolean) => void
  /** Fallbacks for the print header when the quotation was raised against a walk-in (lead) customer. */
  leadName?: string
  leadPhone?: string
  leadWhatsapp?: string
}

export function LeadQuotationDialog({ invoiceId, onOpenChange, leadName, leadPhone, leadWhatsapp }: LeadQuotationDialogProps) {
  const { t } = useLanguage()
  const open = !!invoiceId
  const { data: invoice, isLoading, error } = useGetInvoiceByIdQuery(invoiceId, { skip: !invoiceId })

  // This dialog is mounted unconditionally by LeadDetailSheet (same reason as
  // LeadMutateDialog's users query) — gate on invoiceId so opening the sheet for a
  // lead never fetches branch/org print data before a quotation is actually clicked.
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId || !invoiceId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !invoiceId })
  const defaultPaperSize = useBranchPaperSize()
  const printOrientation = useBranchPrintOrientation()
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'

  const [printing, setPrinting] = useState(false)
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false)
  const whatsappNumber = (leadWhatsapp || leadPhone || '').trim()

  const buildPrintData = (): PrintInvoiceData | null => {
    if (!invoice) return null
    return {
      invoiceNumber: invoice.invoiceNumber,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (invoice.items || []).map((item: any) => ({
        name: item.name,
        nameUrdu: item.nameUrdu,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        discountAmount: item.discountAmount,
        imeis: item.imeis,
      })),
      customerId: invoice.customerId,
      customerName: invoice.customerName || leadName,
      walkInCustomerName: invoice.walkInCustomerName || leadName,
      type: invoice.type,
      subtotal: invoice.subtotal || 0,
      tax: invoice.tax || 0,
      discount: invoice.discount || 0,
      total: invoice.total || 0,
      paidAmount: invoice.paidAmount || 0,
      balance: invoice.balance || 0,
      notes: invoice.notes,
      invoiceAddress: branchData?.location?.address?.trim() || undefined,
      deliveryCharge: invoice.deliveryCharge || 0,
      serviceCharge: invoice.serviceCharge || 0,
      companyName: orgData?.name || branchData?.name,
      companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
      companyPhone: branchData?.phone,
      companyEmail: branchData?.email,
      companyLogo: orgData?.logo?.url,
      invoiceDate: invoice.createdAt,
      printAsQuotation: invoice.type === 'quotation',
      customerPhone: leadPhone,
      customerWhatsapp: whatsappNumber || undefined,
    }
  }

  const handlePrint = async (paperSize: PaperSize = defaultPaperSize) => {
    const printData = buildPrintData()
    if (!printData) return
    setPrinting(true)
    try {
      if (PAPER_FORMATS[paperSize].family === 'thermal') {
        const htmlContent = generateInvoiceHTML(printData, resolveThermalSize(paperSize))
        openPrintWindowForFormat(htmlContent, paperSize)
      } else {
        const sheetSize = resolveSheetFormat(paperSize, printOrientation)
        const htmlContent = generateA4InvoiceHTML(printData, sheetSize, invoiceTemplate)
        openPrintWindowForFormat(htmlContent, sheetSize)
      }
      toast.success(t('Printing quotation'))
    } catch {
      toast.error(t('Failed to print quotation'))
    } finally {
      setPrinting(false)
    }
  }

  const handleSendWhatsApp = async () => {
    const printData = buildPrintData()
    if (!printData || !whatsappNumber) return
    setSendingWhatsapp(true)
    try {
      const result = await sendInvoiceReceiptWhatsApp({
        printData,
        phone: whatsappNumber,
        template: invoiceTemplate,
        templateCategory: 'quotation',
      })
      if (result.success) {
        toast.success(t('Quotation sent on WhatsApp'))
      } else {
        toast.error(result.error || t('Failed to send quotation on WhatsApp'))
      }
    } finally {
      setSendingWhatsapp(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="!w-fit !max-w-[min(96vw,900px)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
              <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            {t('Quotation Details')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('Loading...')}</p>
        ) : error || !invoice ? (
          <p className="py-10 text-center text-sm text-destructive">{t('Failed to load quotation details')}</p>
        ) : (
          <div className="min-w-[600px] space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">{t('Quotation Number')}</p>
                <p className="font-mono text-sm font-medium">{invoice.invoiceNumber || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('Date')}</p>
                <p className="text-sm font-medium">{invoice.createdAt ? format(new Date(invoice.createdAt), 'MMM dd, yyyy') : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('Customer')}</p>
                <p className="text-sm font-medium">{invoice.customerName || invoice.walkInCustomerName || leadName || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('Status')}</p>
                <Badge className={STATUS_BADGE[invoice.status] || ''}>{t(invoice.status || 'draft')}</Badge>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Product')}</TableHead>
                    <TableHead>{t('Quantity')}</TableHead>
                    <TableHead>{t('price')}</TableHead>
                    <TableHead className="text-right">{t('Total')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(invoice.items || []).map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="max-w-[240px] truncate" title={item.name}>{item.name}</TableCell>
                      <TableCell>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</TableCell>
                      <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.subtotal)}</TableCell>
                    </TableRow>
                  ))}
                  {(!invoice.items || invoice.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">{t('No items')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('Subtotal')}</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {Number(invoice.discount || 0) > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>{t('Discount')}</span>
                  <span>-{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              {Number(invoice.tax || 0) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('Tax')}</span>
                  <span>{formatCurrency(invoice.tax)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>{t('Total')}</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={handleSendWhatsApp}
            disabled={!invoice || sendingWhatsapp || !whatsappNumber}
            title={!whatsappNumber ? t('No WhatsApp or phone number on this lead') : undefined}
            className="border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
          >
            {sendingWhatsapp ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1.5 h-4 w-4" />}
            {sendingWhatsapp ? t('Sending...') : t('Send on WhatsApp')}
          </Button>
          <PrintFormatButton
            onPrint={handlePrint}
            defaultPaperSize={defaultPaperSize}
            disabled={!invoice || printing}
            mainButtonContent={printing ? t('Printing...') : undefined}
            label={t('Print')}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
