import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIsModuleHidden } from '@/hooks/use-hidden-modules'
import { WarehouseTag } from '@/components/warehouse-tag'
import { useFormatMoney } from '@/lib/format-money'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { usePermissions } from '@/context/permission-context'
import { permissionMessage } from '@/lib/permission-messages'
import { cn } from '@/lib/utils'
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
import { generateA4LandscapeTwoInvoicesHTML, openPrintWindowForFormat } from '../utils/print-utils'
import { prepareSheetPrintData } from '@/features/invoice/utils/distributor-print-details'
import type { PaperSize } from '../utils/paper-format'
import type { InvoiceTemplate } from '../utils/invoice-template'
import { PrintFormatButton } from '@/components/print-format-button'
import { useGetAllCustomersQuery } from '../../../stores/customer.api'
import { InvoiceDeleteDialog } from './invoice-delete-dialog'
import { QuotationConvertDialog } from './quotation-convert-dialog'
import { CustomerPaymentDialog } from './customer-payment-dialog'
import { InvoiceFiltersToolbar } from './invoice-filters-toolbar'
import { useInvoiceFilters } from '../hooks/use-invoice-filters'
import { exportInvoicesToCsv, exportInvoicesToPdf } from '../utils/invoice-export'
import { DUE_STATUS_META, SETTLEMENT_STATUS_META, resolveInvoiceSettlement } from '../utils/invoice-settlement'
import { useLedgerAlertSettings } from '@/features/ledger-alerts/hooks/use-ledger-alerts'
import { DueStateChip } from '@/features/ledger-alerts/components/aging-chip'
import { calendarOfDue, classifyDue, rowStyleForTone, toneForState } from '@/features/ledger-alerts/lib/ledger-colors'
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
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size'
import { formatAppDate } from '@/lib/date-format'
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog'
import { useInvoicePrinter } from '../hooks/use-invoice-printer'

import { useNativeLanguageName } from '@/hooks/use-native-language-name'
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
  const nativeLanguageName = useNativeLanguageName()
  const formatMoney = useFormatMoney()
  const { settings: ledgerSettings } = useLedgerAlertSettings()
  const { hasExplicitPermission } = usePermissions()
  const canCreate = hasExplicitPermission('createInvoices')
  const canEdit = hasExplicitPermission('editInvoices')
  const canDelete = hasExplicitPermission('deleteInvoices')
  const canPrint = hasExplicitPermission('printInvoices')
  const canViewCreatedBy = useCanViewCreatedBy()
  // Distributors (and any type hiding the salesman module) don't get a Salesman column.
  const showSalesman = !useIsModuleHidden('salesmen')
  const [updateInvoiceFlag] = useUpdateInvoiceFlagMutation()

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

  const [viewingInvoice, setViewingInvoice] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = usePersistedPageSize('invoices', 10)
  /** id → invoice number, so a selection survives paging and can be matched to export rows. */
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null)
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

  const lookupCustomer = useCallback(
    (customerId: string) => {
      const customer = customerMap.get(customerId)
      return customer ? { name: customer.name, nameUrdu: customer.nameUrdu, linkedSupplierId: customer.linkedSupplierId } : undefined
    },
    // customerMap is rebuilt each render from customersData — key the callback on the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customersData]
  )
  const {
    printInvoice: handlePrintInvoice,
    buildInvoicePrintData,
    printingId: printingInvoiceId,
  } = useInvoicePrinter({ lookupCustomer })

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
      const [leftData, rightData] = await Promise.all([
        buildInvoicePrintData(left).then(({ printData }) => prepareSheetPrintData(printData, left, invoiceTemplate)),
        buildInvoicePrintData(right).then(({ printData }) => prepareSheetPrintData(printData, right, invoiceTemplate)),
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
    const invoiceId = invoice.id || invoice._id
    setTwoUpSelection((prev) => {
      const exists = prev.some((inv) => (inv.id || inv._id) === invoiceId)
      if (exists) return prev.filter((inv) => (inv.id || inv._id) !== invoiceId)
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

  const columnCount = 12 + (showSalesman ? 1 : 0) + (twoUpMode ? 1 : 0) + (canViewCreatedBy ? 1 : 0)

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

      {nativeLanguageName && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-8 items-center gap-1.5">
            <Label htmlFor="invoice-print-urdu" className="text-sm text-muted-foreground">{t('urdu_print', { lang: nativeLanguageName })}</Label>
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
                  aria-label={t('urdu_print_hint', { lang: nativeLanguageName })}
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t('urdu_print_hint', { lang: nativeLanguageName })}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

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
                  {showSalesman && <TableHead>{t('salesman') || 'Salesman'}</TableHead>}
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
                  const id = invoice.id || invoice._id
                  const isSelectedForTwoUp = twoUpSelection.some((inv) => (inv.id || inv._id) === id)
                  const settlement = resolveInvoiceSettlement(invoice)
                  const statusMeta = SETTLEMENT_STATUS_META[settlement.settlementStatus]
                  const dueMeta = DUE_STATUS_META[settlement.dueStatus]
                  const isOverdue = settlement.dueStatus === 'overdue'
                  // Overdue colour band for this invoice (Settings → Due Dates & Ledger Colours).
                  const due = invoice.type === 'quotation' ? null : classifyDue(invoice.dueDate, settlement.remainingAmount, ledgerSettings)
                  const dueTone = due && ledgerSettings.colorsEnabled ? toneForState(due.state as never, due.bandIndex, ledgerSettings) : null
                  return (
                  <TableRow
                    key={id}
                    className={isSelectedForTwoUp ? 'bg-primary/5' : undefined}
                    style={isSelectedForTwoUp ? undefined : rowStyleForTone(dueTone, ledgerSettings)}
                  >
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
                        <WarehouseTag warehouseId={invoice.warehouseId} showDefault={invoice.type !== 'quotation'} />
                        {invoice.offlinePending && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                            {t('Pending sync') || 'Pending sync'}
                          </Badge>
                        )}
                      </div>
                      {invoice.dueDate && due && due.state !== 'settled' ? (
                        <div className='mt-0.5'>
                          <DueStateChip
                            state={due.state}
                            daysOverdue={due.daysOverdue}
                            daysUntilDue={due.daysUntilDue}
                            bandIndex={due.bandIndex}
                            settings={ledgerSettings}
                            dueDate={invoice.dueDate}
                          />
                        </div>
                      ) : invoice.dueDate ? (
                        <p className={cn('text-[11px]', isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                          {t('Due')} {formatAppDate(calendarOfDue(invoice.dueDate))}
                        </p>
                      ) : null}
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
                      {formatAppDate(new Date(invoice.invoiceDate || invoice.createdAt))}
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
                    {showSalesman && (
                      <TableCell className="text-sm text-muted-foreground">
                        {salesmanName(invoice.salesmanId)}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingInvoice(invoice)}
                          title={t('View') || 'View'}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

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
                                await updateInvoiceFlag({ id, ...data }).unwrap()
                                toast.success(invoice.flag ? 'Flag updated' : 'Invoice flagged for review')
                              } catch {
                                toast.error('Failed to update flag')
                              }
                            }}
                            onClear={async () => {
                              try {
                                await updateInvoiceFlag({ id, clear: true }).unwrap()
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
                            disabled={printingInvoiceId === id}
                            onPrint={(paperSize) => handlePrintInvoice(invoice, paperSize)}
                            invoiceHeaderStyles
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
            />
          </div>
        </CardContent>
      </Card>

      <InvoiceDetailDialog
        invoiceId={viewingInvoice ? String(viewingInvoice.id || viewingInvoice._id) : undefined}
        fallbackInvoice={viewingInvoice}
        open={Boolean(viewingInvoice)}
        onOpenChange={(open) => {
          if (!open) setViewingInvoice(null)
        }}
        onEdit={() => {
          const row = viewingInvoice
          setViewingInvoice(null)
          if (row) onEdit?.(row)
        }}
      />

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

