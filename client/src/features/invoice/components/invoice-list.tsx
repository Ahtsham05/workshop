import { useEffect, useMemo, useState } from 'react'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { invoiceTermsToSafeHtml } from '@/lib/rich-text-utils'
import { usePermissions } from '@/context/permission-context'
import { permissionMessage } from '@/lib/permission-messages'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SimplePagination } from '@/components/ui/simple-pagination'
import {
  ArrowLeft,
  Eye,
  Edit,
  Trash2,
  Plus,
  Receipt,
  Info,
  Clock,
  FileCheck,
  Columns2,
  Loader2,
  Zap,
  Flag,
  Banknote,
  Wallet,
  Users,
  TrendingUp,
  AlertTriangle,
  FileDown,
} from 'lucide-react'
import { useGetInvoicesListQuery, useGetInvoicesSummaryQuery, useLazyExportInvoicesQuery, useUpdateInvoiceFlagMutation } from '@/stores/invoice.api'
import { FlagBadge, FlagPickerPopover } from '@/components/flag-badge'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { generateInvoiceHTML, generateA4InvoiceHTML, generateA4LandscapeTwoInvoicesHTML, openPrintWindowForFormat } from '../utils/print-utils'
import { PAPER_FORMATS, resolveThermalSize, resolveSheetFormat, type PaperSize, type PrintOrientation } from '../utils/paper-format'
import type { InvoiceTemplate } from '../utils/invoice-template'
import { PrintFormatButton } from '@/components/print-format-button'
import { fetchBalanceBeforeInvoice } from '../utils/invoice-print-balance'
import { withCustomerContactForPrint } from '../utils/invoice-print-whatsapp'
import {
  fetchAndStashPrintContact,
  resolveCustomerIdString,
  stashPrintContact,
  type PrintWindowContact,
} from '../utils/invoice-print-contact-bridge'
import { useGetAllCustomersQuery } from '../../../stores/customer.api'
import { InvoiceDeleteDialog } from './invoice-delete-dialog'
import { QuotationConvertDialog } from './quotation-convert-dialog'
import { CustomerPaymentDialog } from './customer-payment-dialog'
import { InvoiceFiltersToolbar } from './invoice-filters-toolbar'
import { useInvoiceFilters } from '../hooks/use-invoice-filters'
import { exportInvoicesToCsv, exportInvoicesToPdf } from '../utils/invoice-export'
import { DUE_STATUS_META, SETTLEMENT_STATUS_META, resolveInvoiceSettlement } from '../utils/invoice-settlement'
import { BilingualName } from '@/components/bilingual-name'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { CreatedByCell, useCanViewCreatedBy } from '@/components/created-by-cell'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getInvoicePrintInUrdu, setInvoicePrintInUrdu } from '../utils/print-preferences'
import { formatImeiEntries } from '@/stores/imei.api'
import { TaxBreakdownSummary } from './tax-breakdown-summary'
import type { TaxLine } from '@/stores/taxCalculator.api'

interface InvoiceListProps {
  onBack?: () => void
  onCreateNew?: () => void
  onEdit?: (invoice: any) => void
  onConvertPending?: () => void
  initialTypeFilter?: string
}

const typeColors: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-800',
  credit: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  quotation: 'bg-violet-100 text-violet-800',
  'pending-converted': 'bg-green-500 text-white', // Converted pending invoices - bright green
}

function salesmanName(ref: { name?: string; email?: string } | string | null | undefined): string {
  if (!ref) return '—'
  return typeof ref === 'string' ? ref : ref.name || ref.email || '—'
}

/** One headline number above the table. Mirrors purchase-list.tsx's identical StatCard. */
function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: React.ReactNode
  icon: any
  tone?: 'default' | 'warning' | 'danger' | 'success'
}) {
  const toneClass = {
    default: 'text-primary bg-primary/10',
    success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    warning: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    danger: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  }[tone]

  return (
    <Card>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClass)}>
          <Icon className='h-5 w-5' />
        </div>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='truncate text-xl font-semibold tabular-nums'>{value}</p>
          {hint && <div className='text-[11px] text-muted-foreground'>{hint}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

export function InvoiceList({ onBack, onCreateNew, onEdit,
  onConvertPending,
  initialTypeFilter,
}: InvoiceListProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const { hasExplicitPermission } = usePermissions()
  const canCreate = hasExplicitPermission('createInvoices')
  const canEdit = hasExplicitPermission('editInvoices')
  const canDelete = hasExplicitPermission('deleteInvoices')
  const canPrint = hasExplicitPermission('printInvoices')
  const canViewCreatedBy = useCanViewCreatedBy()
  const [updateInvoiceFlag] = useUpdateInvoiceFlagMutation()
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')

  const {
    filters,
    draft,
    queryParams,
    activeFilterCount,
    patchImmediate,
    patchDraft,
    applyDraft,
    resetAll,
    toggleQuickFilter,
    savedViews,
    saveView,
    applyView,
    deleteView,
  } = useInvoiceFilters()

  // Seeds the "Invoice Type" filter from the caller (e.g. the Pending Invoices shortcut) —
  // once, on mount, same as the old useState(initialTypeFilter || 'all') did.
  useEffect(() => {
    if (initialTypeFilter && initialTypeFilter !== 'all') {
      patchImmediate({ type: initialTypeFilter })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  /** id → invoice number, so a selection survives paging and can be matched to export rows. */
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null)
  const [printingInvoiceId, setPrintingInvoiceId] = useState<string | null>(null)
  const [printInUrdu, setPrintInUrdu] = useState(() => getInvoicePrintInUrdu())
  const [quotationToConvert, setQuotationToConvert] = useState<any>(null)
  const [twoUpMode, setTwoUpMode] = useState(false)
  const [twoUpSelection, setTwoUpSelection] = useState<any[]>([])
  const [printingTwoUp, setPrintingTwoUp] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentCustomerId, setPaymentCustomerId] = useState<string | undefined>()

  // Any filter change re-anchors the list at page 1 — staying on page 7 of a result set
  // that now has two pages just shows an empty table.
  useEffect(() => {
    setPage(1)
    setSelected({})
  }, [queryParams, limit])

  const listParams = useMemo(() => ({ ...queryParams, page, limit }), [queryParams, page, limit])
  const { data: invoicesResponse, isLoading, isFetching, error } = useGetInvoicesListQuery(listParams)
  const { data: summary } = useGetInvoicesSummaryQuery(queryParams)
  const [triggerExport, { isFetching: isExporting }] = useLazyExportInvoicesQuery()

  const { data: customersData } = useGetAllCustomersQuery({ includeEmployees: true, includeSuppliers: true })
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'

  // Create a customer lookup map for efficient customer name resolution
  const customerMap = new Map()
  if (customersData?.results) {
    customersData.results.forEach((customer: any) => {
      customerMap.set(customer._id || customer.id, customer)
    })
  } else if (Array.isArray(customersData)) {
    customersData.forEach((customer: any) => {
      customerMap.set(customer._id || customer.id, customer)
    })
  }

  const getCustomerName = (invoice: any) => {
    if (invoice.customerId === 'walk-in') {
      return invoice.walkInCustomerName || t('walk_in_customer')
    }
    if (invoice.customer && invoice.customer.name) {
      return invoice.customer.name
    }
    if (invoice.customerId && customerMap.has(invoice.customerId)) {
      const customer = customerMap.get(invoice.customerId)
      return customer.name
    }
    if (invoice.customerName) {
      return invoice.customerName
    }
    if (invoice.customerId && invoice.customerId !== 'walk-in') {
      return `${t('customer_id')}: ${String(invoice.customerId).substring(0, 8)}...`
    }
    return t('unknown_customer')
  }

  const getCustomerPicture = (invoice: any) => {
    if (invoice.customerId === 'walk-in') return undefined
    const fromPopulate = invoice.customer?.picture
    if (fromPopulate?.url) return fromPopulate
    if (invoice.customerId && customerMap.has(invoice.customerId)) {
      return customerMap.get(invoice.customerId)?.picture
    }
    return undefined
  }

  const getCustomerUrdu = (invoice: any): string => {
    if (invoice.customerId === 'walk-in') return ''
    const cid = invoice.customerId
    if (cid && typeof cid === 'object' && cid.nameUrdu) {
      return String(cid.nameUrdu).trim()
    }
    const idKey =
      cid && typeof cid === 'object' && cid._id != null ? String(cid._id) : cid != null ? String(cid) : ''
    if (!idKey || idKey === 'walk-in') return ''
    if (invoice.customer?.nameUrdu) return String(invoice.customer.nameUrdu).trim()
    if (customerMap.has(idKey)) {
      const customer = customerMap.get(idKey)
      return customer?.nameUrdu?.trim() || ''
    }
    return ''
  }

  const getCustomerPhone = (invoice: any) => {
    if (invoice.customerId === 'walk-in') return '-'
    if (invoice.customer && invoice.customer.phone) {
      return invoice.customer.phone
    }
    if (invoice.customerId && customerMap.has(invoice.customerId)) {
      const customer = customerMap.get(invoice.customerId)
      return customer.phone || '-'
    }
    return '-'
  }

  /** Builds sheet/thermal-agnostic print data + WhatsApp/SMS contact for one invoice. Shared by single and 2-per-page printing. */
  const buildInvoicePrintData = async (invoice: any) => {
      const customerName = getCustomerName(invoice)
      const walkInCustomerName = invoice.walkInCustomerName
      const customerNameUrdu = getCustomerUrdu(invoice)
      const customerId =
        typeof invoice.customerId === 'object'
          ? invoice.customerId?._id || invoice.customerId?.id
          : invoice.customerId
      // A supplier's shadow-customer account has its own isolated CustomerLedger balance —
      // pull the supplier's true net balance (purchases + sales combined) instead when linked.
      const linkedSupplierId = customerMap.get(customerId)?.linkedSupplierId
      const previousBalance = await fetchBalanceBeforeInvoice(customerId, invoice._id || invoice.id, linkedSupplierId)
      const invoiceTotal = Number(invoice.total || 0)
      const invoicePaid = Number(invoice.paidAmount || 0)

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoice.invoiceNumber,
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
        customerId: invoice.customerId,
        customerName: customerName,
        customerNameUrdu: customerNameUrdu || undefined,
        walkInCustomerName: walkInCustomerName,
        type: invoice.type,
        subtotal: invoice.subtotal || 0,
        tax: invoice.tax || 0,
        taxLines: invoice.taxLines || [],
        discount: invoice.discount || 0,
        total: invoice.total || 0,
        paidAmount: invoice.paidAmount || 0,
        balance: invoice.balance || 0,
        notes: invoice.notes,
        invoiceAddress: branchData?.location?.address?.trim() || undefined,
        invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
        deliveryCharge: invoice.deliveryCharge || 0,
        serviceCharge: invoice.serviceCharge || 0,
        companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
        companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
        companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
        companyPhone: branchData?.phone,
        companyEmail: branchData?.email,
        companyTaxNumber: undefined,
        companyLogo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        language: invoice.language,
        isUrduOnly: invoice.isUrduOnly,
        userPreferredLanguage: preferredLanguage,
        invoiceNote: branchData?.invoiceNote,
        printInUrdu,
        printAsQuotation: invoice.type === 'quotation',
        previousBalance,
        newBalance: previousBalance + invoiceTotal - invoicePaid,
        currencyMeta,
      }, invoice)

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
  }

  const handlePrintInvoice = async (invoice: any, paperSize: PaperSize = defaultPaperSize) => {
    if (!canPrint) {
      toast.error(permissionMessage(t, 'no_permission_print_invoice'))
      return
    }
    try {
      setPrintingInvoiceId(invoice._id)
      const { printData, printContact } = await buildInvoicePrintData(invoice)

      if (PAPER_FORMATS[paperSize].family === 'thermal') {
        const htmlContent = generateInvoiceHTML(printData, resolveThermalSize(paperSize))
        openPrintWindowForFormat(htmlContent, paperSize, printContact)
      } else {
        const sheetSize = resolveSheetFormat(paperSize, printOrientation)
        const htmlContent = generateA4InvoiceHTML(printData, sheetSize, invoiceTemplate)
        openPrintWindowForFormat(htmlContent, sheetSize, printContact)
      }

      toast.success(`Printing invoice ${invoice.invoiceNumber}`)
    } catch (error) {
      console.error('Print error:', error)
      toast.error('Failed to print invoice')
    } finally {
      setPrintingInvoiceId(null)
    }
  }

  /** Combines two different invoices onto a single landscape A4 sheet (two A5-proportioned halves) — for printers that only carry A4 stock. */
  const handlePrintTwoUp = async () => {
    if (!canPrint) {
      toast.error(permissionMessage(t, 'no_permission_print_invoice'))
      return
    }
    if (twoUpSelection.length !== 2) return
    try {
      setPrintingTwoUp(true)
      const [left, right] = twoUpSelection
      const [{ printData: leftData }, { printData: rightData }] = await Promise.all([
        buildInvoicePrintData(left),
        buildInvoicePrintData(right),
      ])
      const htmlContent = generateA4LandscapeTwoInvoicesHTML(leftData, rightData, invoiceTemplate)
      openPrintWindowForFormat(htmlContent, 'a4')
      toast.success(`Printing ${left.invoiceNumber} & ${right.invoiceNumber} on one A4 sheet`)
      setTwoUpMode(false)
      setTwoUpSelection([])
    } catch (error) {
      console.error('Print error:', error)
      toast.error('Failed to print combined invoices')
    } finally {
      setPrintingTwoUp(false)
    }
  }

  const toggleTwoUpSelection = (invoice: any) => {
    setTwoUpSelection((prev) => {
      const exists = prev.some((inv) => inv._id === invoice._id)
      if (exists) return prev.filter((inv) => inv._id !== invoice._id)
      if (prev.length >= 2) return prev
      return [...prev, invoice]
    })
  }

  const handleDelete = (invoice: any) => {
    if (!canDelete) {
      toast.error(permissionMessage(t, 'no_permission_delete_invoice'))
      return
    }
    setInvoiceToDelete(invoice)
    setDeleteDialogOpen(true)
  }

  const openPaymentFor = (invoice?: any) => {
    const rawId = invoice?.customerId
    const id = typeof rawId === 'object' ? rawId?._id || rawId?.id : rawId
    setPaymentCustomerId(id && id !== 'walk-in' ? String(id) : undefined)
    setPaymentDialogOpen(true)
  }

  /** CSV/PDF run off the server's export endpoint so they cover the whole filtered set,
   *  not just the page on screen — and honour a selection when one is active. */
  const runExport = async (kind: 'csv' | 'pdf') => {
    try {
      const response = await triggerExport(queryParams).unwrap()
      const selectedInvoiceNumbers = new Set(Object.values(selected))
      const exportRows = selectedInvoiceNumbers.size
        ? response.results.filter((row) => selectedInvoiceNumbers.has(row.invoiceNumber))
        : response.results

      if (exportRows.length === 0) {
        toast.error(t('Nothing to export'))
        return
      }

      if (kind === 'csv') {
        exportInvoicesToCsv(exportRows)
        toast.success(`${exportRows.length} ${t('rows exported')}`)
      } else {
        const opened = exportInvoicesToPdf(exportRows, {
          title: t('Invoice Report'),
          subtitle: resolveBranchCompanyName(orgData?.name, branchData?.name),
          formatMoney,
        })
        if (!opened) toast.error(t('Allow pop-ups to export a PDF'))
      }

      if (response.truncated) {
        toast.warning(`${t('Export capped at')} ${response.limit} ${t('rows — narrow the filters for the rest')}`)
      }
    } catch {
      toast.error(t('Export failed'))
    }
  }

  const invoiceList = invoicesResponse?.results || []
  const totalItems = invoicesResponse?.totalResults || 0
  const totalPages = invoicesResponse?.totalPages || 1

  const allOnPageSelected = invoiceList.length > 0 && invoiceList.every((invoice: any) => selected[invoice.id || invoice._id])

  const toggleSelectAll = () => {
    setSelected((previous) => {
      const next = { ...previous }
      for (const invoice of invoiceList) {
        const id = invoice.id || invoice._id
        if (allOnPageSelected) delete next[id]
        else next[id] = invoice.invoiceNumber
      }
      return next
    })
  }

  const toggleSelect = (id: string, invoiceNumber: string) =>
    setSelected((previous) => {
      const next = { ...previous }
      if (next[id]) delete next[id]
      else next[id] = invoiceNumber
      return next
    })

  const selectedIds = useMemo(() => Object.keys(selected), [selected])

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600">{t('error_loading_invoices')}: {t('unknown_error')}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }

  const columnCount = 13 + (twoUpMode ? 1 : 0) + (canViewCreatedBy ? 1 : 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">{t('invoice_management')}</h1>
            <p className="text-muted-foreground mt-1">{t('manage_customer_invoices')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
          <Button variant="outline" className="whitespace-nowrap" asChild>
            <Link to="/fast-billing">
              <Zap className="h-4 w-4 mr-2" />
              Fast Billing
            </Link>
          </Button>
          <Button variant="outline" className="whitespace-nowrap" onClick={onConvertPending}>
            <Clock className="h-4 w-4 mr-2" />
            {t('convert_pending_invoices')}
          </Button>
          {canPrint && (
            <Button
              variant={twoUpMode ? 'default' : 'outline'}
              className="whitespace-nowrap"
              onClick={() => {
                setTwoUpMode((v) => !v)
                setTwoUpSelection([])
              }}
              title="Print two different invoices on one A4 sheet (half A5 each) — for printers loaded with A4 paper"
            >
              <Columns2 className="h-4 w-4 mr-2" />
              {twoUpMode ? 'Cancel 2-per-page' : 'Print 2 per page'}
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" className="whitespace-nowrap" onClick={() => openPaymentFor()}>
              <Banknote className="h-4 w-4 mr-2" />
              {t('Record Customer Payment')}
            </Button>
          )}
          {canCreate && (
            <Button className="whitespace-nowrap" onClick={onCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              {t('create_invoice')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex h-8 items-center gap-1.5">
          <Label htmlFor="invoice-print-urdu" className="text-sm text-muted-foreground">{t('urdu_print')}</Label>
          <Switch
            id="invoice-print-urdu"
            checked={printInUrdu}
            onCheckedChange={(v) => {
              setPrintInUrdu(v)
              setInvoicePrintInUrdu(v)
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('urdu_print_hint')}
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {t('urdu_print_hint')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {twoUpMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <div className="text-sm">
            <span className="font-medium">{twoUpSelection.length}/2 invoices selected</span>
            <span className="text-muted-foreground"> — pick two invoices to combine onto one A4 sheet (two A5-sized halves).</span>
          </div>
          <Button size="sm" disabled={twoUpSelection.length !== 2 || printingTwoUp} onClick={handlePrintTwoUp}>
            {printingTwoUp ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Columns2 className="h-4 w-4 mr-2" />
            )}
            Print 2 per page
          </Button>
        </div>
      )}

      {/* Stat cards */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          label={t('Total Invoices')}
          value={String(summary?.invoiceCount ?? 0)}
          hint={`${formatMoney(summary?.totalValue ?? 0)} ${t('in value')}`}
          icon={Receipt}
        />
        <StatCard
          label={t('Customers')}
          value={String(summary?.customerCount ?? 0)}
          hint={t('in the current view')}
          icon={Users}
          tone='success'
        />
        <StatCard
          label={t('Outstanding Amount')}
          value={formatMoney(summary?.totalOutstanding ?? 0)}
          hint={
            <p className='truncate'>
              {summary?.unpaidCount ?? 0} {t('unpaid')} · {summary?.partialCount ?? 0} {t('partial')}
            </p>
          }
          icon={Wallet}
          tone='warning'
        />
        <StatCard
          label={summary?.overdueAmount ? t('Overdue') : t('This Month')}
          value={formatMoney(summary?.overdueAmount ? summary.overdueAmount : summary?.thisMonthValue ?? 0)}
          hint={
            summary?.overdueAmount
              ? `${summary.overdueCount} ${t('invoice(s) past due')}`
              : `${t('billed since the 1st')}`
          }
          icon={summary?.overdueAmount ? AlertTriangle : TrendingUp}
          tone={summary?.overdueAmount ? 'danger' : 'default'}
        />
      </div>

      {/* Filters */}
      <InvoiceFiltersToolbar
        filters={filters}
        draft={draft}
        activeFilterCount={activeFilterCount}
        onPatchImmediate={patchImmediate}
        onPatchDraft={patchDraft}
        onApplyDraft={applyDraft}
        onReset={resetAll}
        onToggleQuickFilter={toggleQuickFilter}
        savedViews={savedViews}
        onSaveView={saveView}
        onApplyView={applyView}
        onDeleteView={deleteView}
        onExportCsv={() => runExport('csv')}
        onExportPdf={() => runExport('pdf')}
        isExporting={isExporting}
      />

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('invoices_list')} ({totalItems})</CardTitle>
        </CardHeader>
        <CardContent className='p-0 sm:p-6'>
          {/* Selection bar */}
          {selectedIds.length > 0 && (
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-primary/5 px-4 py-2.5'>
              <p className='text-sm font-medium'>
                {selectedIds.length} {t('selected')}
              </p>
              <div className='flex items-center gap-2'>
                <Button size='sm' variant='outline' onClick={() => runExport('csv')}>
                  <FileDown className='mr-2 h-3.5 w-3.5' />
                  {t('Export selected')}
                </Button>
                <Button size='sm' variant='ghost' onClick={() => setSelected({})}>
                  {t('Clear')}
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10'>
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label={t('Select all')}
                      disabled={invoiceList.length === 0}
                    />
                  </TableHead>
                  {twoUpMode && <TableHead className="w-10" />}
                  <TableHead>{t('invoice_number')}</TableHead>
                  <TableHead>{t('customer')}</TableHead>
                  <TableHead>{t('phone')}</TableHead>
                  <TableHead>{t('type')}</TableHead>
                  <TableHead>{t('payment_method') || 'Payment'}</TableHead>
                  <TableHead>{t('bill_number')}</TableHead>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead className='text-right'>{t('amount')}</TableHead>
                  <TableHead className='text-right'>{t('Paid Amount')}</TableHead>
                  <TableHead className='text-right'>{t('Remaining')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  {canViewCreatedBy && <TableHead>{t('created_by') || 'Created By'}</TableHead>}
                  <TableHead>{t('salesman') || 'Salesman'}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {Array.from({ length: columnCount + 1 }).map((__, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className='h-4 w-full' />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && invoiceList.map((invoice: any) => {
                  const isSelectedForTwoUp = twoUpSelection.some((inv) => inv._id === invoice._id)
                  const id = invoice.id || invoice._id
                  const settlement = resolveInvoiceSettlement(invoice)
                  const statusMeta = SETTLEMENT_STATUS_META[settlement.settlementStatus]
                  const dueMeta = DUE_STATUS_META[settlement.dueStatus]
                  const isOverdue = settlement.dueStatus === 'overdue'
                  return (
                  <TableRow key={id} className={isSelectedForTwoUp ? 'bg-primary/5' : undefined}>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={Boolean(selected[id])}
                        onCheckedChange={() => toggleSelect(id, invoice.invoiceNumber)}
                        aria-label={t('Select row')}
                      />
                    </TableCell>
                    {twoUpMode && (
                      <TableCell>
                        <Checkbox
                          checked={isSelectedForTwoUp}
                          onCheckedChange={() => toggleTwoUpSelection(invoice)}
                          disabled={!isSelectedForTwoUp && twoUpSelection.length >= 2}
                          aria-label={`Select ${invoice.invoiceNumber} for 2-per-page printing`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {invoice.invoiceNumber}
                        <FlagBadge flag={invoice.flag} />
                        {invoice.offlinePending && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                            {t('Pending sync') || 'Pending sync'}
                          </Badge>
                        )}
                      </div>
                      {invoice.dueDate && (
                        <p className={cn('text-[11px]', isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                          {t('Due')} {format(new Date(invoice.dueDate), 'dd MMM yyyy')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className='max-w-[14rem]'>
                      <div className='flex min-w-0 items-center gap-2'>
                        <ContactPhotoCell
                          picture={getCustomerPicture(invoice)}
                          name={getCustomerName(invoice)}
                          className='h-8 w-8 shrink-0'
                        />
                        <div className='min-w-0 flex-1'>
                          <BilingualName primary={getCustomerName(invoice)} secondary={getCustomerUrdu(invoice)} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getCustomerPhone(invoice)}
                    </TableCell>
                    <TableCell>
                      <Badge className={typeColors[
                        invoice.type === 'pending' && invoice.isConvertedToBill === true
                          ? 'pending-converted'
                          : invoice.type || 'cash'
                      ]}>
                        {invoice.type === 'pending' && invoice.isConvertedToBill === true
                          ? t('converted_pending')
                          : t(invoice.type || 'cash')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.paymentMethod && invoice.paymentMethod !== 'cash' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {invoice.paymentMethod === 'wallet' && invoice.walletType
                            ? invoice.walletType
                            : invoice.paymentMethod === 'bank'
                              ? 'Bank'
                              : invoice.paymentMethod === 'card'
                                ? 'Card'
                                : invoice.paymentMethod}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Cash</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {invoice.billNumber ? (
                        <span className="font-mono text-sm font-medium text-green-600">
                          {invoice.billNumber}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>{formatMoney(invoice.total || 0)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{formatMoney(settlement.settledAmount)}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      <span
                        className={cn(
                          settlement.remainingAmount > 0.001
                            ? 'font-medium text-rose-600 dark:text-rose-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        {formatMoney(Math.max(0, settlement.remainingAmount))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-col items-start gap-1'>
                        <Badge variant='outline' className={cn('font-normal', statusMeta.className)}>
                          {t(statusMeta.label)}
                        </Badge>
                        {isOverdue && (
                          <Badge variant='outline' className={cn('font-normal', dueMeta.className)}>
                            {t(dueMeta.label)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {canViewCreatedBy && (
                      <TableCell>
                        <CreatedByCell createdBy={invoice.createdBy} />
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">
                      {salesmanName(invoice.salesmanId)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedInvoice(invoice)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader className="sticky top-0 bg-white z-10">
                              <DialogTitle>{t('invoice_details')} - {invoice.invoiceNumber}</DialogTitle>
                            </DialogHeader>
                            <div className="overflow-y-auto pr-4">
                              {selectedInvoice && (
                                <InvoiceDetails
                                  invoice={selectedInvoice}
                                  getCustomerName={getCustomerName}
                                  getCustomerUrdu={getCustomerUrdu}
                                />
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>

                        {canEdit && invoice.type === 'quotation' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setQuotationToConvert(invoice)}
                            title={t('convert_to_invoice') || 'Convert to Invoice'}
                            className="text-emerald-700 hover:text-emerald-800"
                          >
                            <FileCheck className="h-4 w-4" />
                          </Button>
                        )}

                        {canCreate && settlement.remainingAmount > 0.001 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPaymentFor(invoice)}
                            title={t('Record Payment')}
                            className="text-sky-700 hover:text-sky-800"
                          >
                            <Banknote className="h-4 w-4" />
                          </Button>
                        )}

                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit?.(invoice)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}

                        {canEdit && (
                          <FlagPickerPopover
                            flag={invoice.flag}
                            onSave={async (data) => {
                              try {
                                await updateInvoiceFlag({ id: invoice._id, ...data }).unwrap()
                                toast.success(invoice.flag ? 'Flag updated' : 'Invoice flagged for review')
                              } catch {
                                toast.error('Failed to update flag')
                              }
                            }}
                            onClear={async () => {
                              try {
                                await updateInvoiceFlag({ id: invoice._id, clear: true }).unwrap()
                                toast.success('Flag cleared')
                              } catch {
                                toast.error('Failed to clear flag')
                              }
                            }}
                            trigger={
                              <Button variant="ghost" size="sm">
                                <Flag
                                  className="h-4 w-4"
                                  style={invoice.flag ? { color: invoice.flag.color, fill: invoice.flag.color } : undefined}
                                />
                              </Button>
                            }
                          />
                        )}

                        {canPrint && (
                          <PrintFormatButton
                            size="sm"
                            defaultPaperSize={defaultPaperSize}
                            allowedFormats={['thermal80', 'thermal58', 'a4', 'a5', 'a4-half-left', 'a4-half-right']}
                            disabled={printingInvoiceId === invoice._id}
                            onPrint={(paperSize) => handlePrintInvoice(invoice, paperSize)}
                            label=""
                          />
                        )}

                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(invoice)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}

                {!isLoading && invoiceList.length === 0 && (
                  <TableRow className='hover:bg-transparent'>
                    <TableCell colSpan={columnCount + 1} className='h-48'>
                      <div className='flex flex-col items-center justify-center gap-2 text-center'>
                        <Receipt className='h-10 w-10 text-muted-foreground/50' />
                        <p className='font-medium'>{t('no_invoices_found')}</p>
                        <p className='text-sm text-muted-foreground'>
                          {activeFilterCount > 0 || filters.search
                            ? t('Try widening or clearing the filters.')
                            : t('Create your first invoice to see it here.')}
                        </p>
                        {activeFilterCount > 0 || filters.search ? (
                          <Button variant='outline' size='sm' onClick={resetAll} className='mt-2'>
                            {t('Reset filters')}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className={cn('px-2 pb-2 pt-4', isFetching && !isLoading && 'opacity-60')}>
            <SimplePagination
              currentPage={page}
              totalPages={totalPages}
              totalResults={totalItems}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              pageSizeOptions={[10, 20, 50, 100]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      {invoiceToDelete && (
        <InvoiceDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          currentRow={invoiceToDelete}
        />
      )}

      <QuotationConvertDialog
        invoice={quotationToConvert}
        open={!!quotationToConvert}
        onOpenChange={(open) => {
          if (!open) setQuotationToConvert(null)
        }}
      />

      <CustomerPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        defaultCustomerId={paymentCustomerId}
      />
    </div>
  )
}

function InvoiceDetails({
  invoice,
  getCustomerName,
  getCustomerUrdu,
}: {
  invoice: any
  getCustomerName: (invoice: any) => string
  getCustomerUrdu: (invoice: any) => string
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const settlement = resolveInvoiceSettlement(invoice)
  const statusMeta = SETTLEMENT_STATUS_META[settlement.settlementStatus]

  return (
    <div className="space-y-4 pb-4">
      {/* Invoice Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{t('invoice_number')}</Label>
          <p className="font-medium">{invoice.invoiceNumber}</p>
        </div>
        <div>
          <Label>{t('date')}</Label>
          <p className="font-medium">
            {format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
        <div>
          <Label>{t('customer')}</Label>
          <div className='mt-1'>
            <BilingualName primary={getCustomerName(invoice)} secondary={getCustomerUrdu(invoice)} />
          </div>
        </div>
        <div>
          <Label>{t('Status')}</Label>
          <div className='mt-1'>
            <Badge variant='outline' className={cn('font-normal', statusMeta.className)}>
              {t(statusMeta.label)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Invoice Items - Scrollable */}
      <div>
        <Label>{t('invoice_items')}</Label>
        <div className="overflow-x-auto max-h-64 border rounded-lg">
          <Table className="text-sm">
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead className="whitespace-nowrap">{t('product_name')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('qty')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('unit_price')}</TableHead>
                <TableHead className="whitespace-nowrap text-right">{t('total')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items?.map((item: any, index: number) => {
                const productUrdu =
                  item.nameUrdu ||
                  (typeof item.productId === 'object' && item.productId?.nameUrdu) ||
                  ''
                return (
                <TableRow key={index} className="hover:bg-muted/50">
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {item.image && (
                        <img
                          src={item.image.url}
                          alt={item.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div>
                        <BilingualName primary={item.name} secondary={productUrdu} primaryClassName='text-sm' secondaryClassName='text-xs' />
                        {item.imeis && item.imeis.length > 0 && (
                          <p className='text-xs text-muted-foreground'>IMEI/Serial: {formatImeiEntries(item.imeis)}</p>
                        )}
                        {item.batchAllocations && item.batchAllocations.length > 1 ? (
                          <p className='text-xs text-muted-foreground'>
                            Batch: {item.batchAllocations.map((a: any) => `${a.batchNumber}×${a.quantity}`).join(', ')}
                          </p>
                        ) : item.batchNumber ? (
                          <p className='text-xs text-muted-foreground'>Batch: {item.batchNumber}</p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {item.quantity} {item.unit || 'pcs'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatMoney(item.unitPrice || 0)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {(() => {
                      const gross = (item.quantity || 0) * (item.unitPrice || 0)
                      const discountAmount = Number(item.discountAmount || 0)
                      const net = item.subtotal ?? (gross - discountAmount)
                      return (
                        <>
                          {discountAmount > 0 && (
                            <div className="text-xs text-muted-foreground line-through">{formatMoney(gross)}</div>
                          )}
                          {formatMoney(Number(net))}
                          {discountAmount > 0 && (
                            <div className="text-xs text-green-600">-{formatMoney(discountAmount)}</div>
                          )}
                        </>
                      )
                    })()}
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Invoice Summary */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg text-sm">
        <div>
          <Label className="text-xs">{t('subtotal')}</Label>
          <p className="font-bold">{formatMoney(invoice.subtotal || 0)}</p>
        </div>
        <div>
          <Label className="text-xs">{t('tax')}</Label>
          <p className="font-bold">{formatMoney(invoice.tax || 0)}</p>
        </div>
        {(() => {
          // Only worth an extra breakdown row for a genuinely multi-component tax (e.g. US
          // state+county+city stacking) — a single flat VAT/GST rate is already fully
          // represented by the tile above, so don't repeat it.
          if (!invoice.taxSystem || invoice.taxSystem === 'NONE') return null
          const taxLines: TaxLine[] = invoice.taxLines || []
          const totalComponents = taxLines.reduce((sum, line) => sum + (line.components?.length || 0), 0)
          if (taxLines.length <= 1 && totalComponents <= 1) return null
          return (
            <div className="col-span-2">
              <Label className="text-xs">{t('Tax Breakdown')}</Label>
              <TaxBreakdownSummary taxLines={taxLines} totalTax={invoice.tax || 0} compact />
            </div>
          )
        })()}
        {(() => {
          const itemDiscountTotal = (invoice.items || []).reduce((sum: number, item: any) => sum + Number(item.discountAmount || 0), 0)
          return itemDiscountTotal > 0 ? (
            <div>
              <Label className="text-xs">{t('Item Discounts')}</Label>
              <p className="font-bold text-green-600">-{formatMoney(itemDiscountTotal)}</p>
            </div>
          ) : null
        })()}
        <div>
          <Label className="text-xs">{t('discount')}</Label>
          <p className="font-bold text-red-600">-{formatMoney(invoice.discount || 0)}</p>
        </div>
        <div>
          <Label className="text-xs">{t('total')} {t('amount')}</Label>
          <p className="font-bold text-green-600">{formatMoney(invoice.total || 0)}</p>
        </div>
        <div>
          <Label className="text-xs">{t('payment_method') || 'Payment Method'}</Label>
          <p className="font-medium capitalize">
            {invoice.paymentMethod === 'wallet' && invoice.walletType
              ? invoice.walletType
              : invoice.paymentMethod || 'Cash'}
          </p>
        </div>
        {settlement.settledAmount > 0 && (
          <div>
            <Label className="text-xs">{t('paid_amount')}</Label>
            <p className="font-bold text-blue-600">{formatMoney(settlement.settledAmount)}</p>
          </div>
        )}
        {settlement.remainingAmount > 0 && (
          <div>
            <Label className="text-xs">{t('balance')}</Label>
            <p className="font-bold text-red-600">{formatMoney(settlement.remainingAmount)}</p>
          </div>
        )}
      </div>

      {/* Terms & Conditions */}
      {invoice.notes && (
        <div>
          <Label className="text-sm">{t('terms_and_conditions')}</Label>
          <div
            className="text-sm bg-muted p-2 rounded [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline"
            dangerouslySetInnerHTML={{ __html: invoiceTermsToSafeHtml(invoice.notes) }}
          />
        </div>
      )}
    </div>
  )
}
