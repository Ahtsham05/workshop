import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SimplePagination } from '@/components/ui/simple-pagination'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Copy,
  Edit,
  Eye,
  FileDown,
  HandCoins,
  MoreHorizontal,
  Paperclip,
  Plus,
  Printer,
  Receipt,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useGetPurchasesQuery, useGetPurchasesSummaryQuery, useLazyExportPurchasesQuery } from '@/stores/purchase.api'
import { useGetSupplierReconciliationQuery } from '@/stores/supplierPayment.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { BilingualName } from '@/components/bilingual-name'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { useCanViewCreatedBy } from '@/components/created-by-cell'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import {
  PAPER_FORMATS,
  resolveThermalSize,
  resolveSheetSize,
  withPrintOrientation,
  type PaperSize,
  type PrintOrientation,
} from '@/features/invoice/utils/paper-format'
import type { InvoiceTemplate } from '@/features/invoice/utils/invoice-template'
import { InvoiceDeleteDialog } from './invoice-delete-dialog'
import { PurchaseFiltersToolbar } from './purchase-filters-toolbar'
import { PurchaseViewDrawer } from './purchase-view-drawer'
import { SupplierPaymentDialog } from './supplier-payment-dialog'
import { usePurchaseFilters } from '../hooks/use-purchase-filters'
import { exportPurchasesToCsv, exportPurchasesToPdf } from '../utils/purchase-export'
import {
  DUE_STATUS_META,
  SETTLEMENT_STATUS_META,
  paymentTypeClassName,
  resolvePaymentTypeLabel,
  resolvePurchaseSettlement,
} from '../utils/purchase-settlement'

interface PurchaseListProps {
  onBack?: () => void
  onCreateNew?: () => void
  onEdit?: (purchase: any) => void
  /** Opens the create panel pre-filled from an existing purchase (a new invoice, not an edit). */
  onDuplicate?: (purchase: any) => void
}

/** One headline number above the table. */
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

export default function PurchaseList({ onBack, onCreateNew, onEdit, onDuplicate }: PurchaseListProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const canViewCreatedBy = useCanViewCreatedBy()
  const { hasExplicitPermission } = usePermissions()
  const canCreate = hasExplicitPermission('createPurchases')
  const canEdit = hasExplicitPermission('editPurchases')
  const canDelete = hasExplicitPermission('deletePurchases')

  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'

  const {
    filters,
    draft,
    queryParams,
    activeFilterCount,
    patchDraft,
    patchImmediate,
    applyDraft,
    resetAll,
    toggleQuickFilter,
    savedViews,
    saveView,
    applyView,
    deleteView,
  } = usePurchaseFilters()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  /** id → invoice number, so a selection survives paging and can be matched to export rows. */
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [viewingPurchase, setViewingPurchase] = useState<any>(null)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentSupplierId, setPaymentSupplierId] = useState<string | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [purchaseToDelete, setPurchaseToDelete] = useState<any>(null)

  const selectedIds = useMemo(() => Object.keys(selected), [selected])

  // Any filter change re-anchors the list at page 1 — staying on page 7 of a result set
  // that now has two pages just shows an empty table.
  useEffect(() => {
    setPage(1)
    setSelected({})
  }, [queryParams, limit])

  const listParams = useMemo(() => ({ ...queryParams, page, limit }), [queryParams, page, limit])
  const { data: purchasesResponse, isLoading, isFetching, error } = useGetPurchasesQuery(listParams)
  const { data: summary } = useGetPurchasesSummaryQuery(queryParams)

  // Filtered to exactly one supplier? Then this page's outstanding total can be compared
  // directly against that supplier's ledger balance — and they legitimately differ once
  // credits/debit notes are in play, so say so here rather than letting the two screens
  // look like they disagree. See supplierPayment.service.js's getSupplierReconciliation.
  const singleSupplierId = filters.supplier.length === 1 ? filters.supplier[0] : ''
  const { data: reconciliation } = useGetSupplierReconciliationQuery(singleSupplierId, { skip: !singleSupplierId })
  const reconciliationGap = reconciliation
    ? Math.round((reconciliation.invoiceOutstanding - reconciliation.ledgerBalance) * 100) / 100
    : 0
  const [triggerExport, { isFetching: isExporting }] = useLazyExportPurchasesQuery()

  const purchases: any[] = purchasesResponse?.results || []
  const totalItems = purchasesResponse?.totalResults || 0
  const totalPages = purchasesResponse?.totalPages || 1

  const allOnPageSelected = purchases.length > 0 && purchases.every((purchase) => selected[purchase.id || purchase._id])

  const toggleSelectAll = () => {
    setSelected((previous) => {
      const next = { ...previous }
      for (const purchase of purchases) {
        const id = purchase.id || purchase._id
        if (allOnPageSelected) delete next[id]
        else next[id] = purchase.invoiceNumber
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
        }
      } catch (printError) {
        console.error('Failed to print purchase:', printError)
        toast.error(t('Failed to print purchase'))
      }
    },
    [branchData, t, preferredLanguage, orgData, defaultPaperSize, invoiceTemplate, printOrientation, currencyMeta]
  )

  /** CSV/PDF run off the server's export endpoint so they cover the whole filtered set,
   *  not just the page on screen — and honour a selection when one is active. */
  const runExport = async (kind: 'csv' | 'pdf') => {
    try {
      const response = await triggerExport(queryParams).unwrap()
      // A selection narrows the export to those invoices; with nothing selected it covers
      // the whole filtered set, not just the page on screen.
      const selectedInvoiceNumbers = new Set(Object.values(selected))
      const exportRows = selectedInvoiceNumbers.size
        ? response.results.filter((row) => selectedInvoiceNumbers.has(row.invoiceNumber))
        : response.results

      if (exportRows.length === 0) {
        toast.error(t('Nothing to export'))
        return
      }

      if (kind === 'csv') {
        exportPurchasesToCsv(exportRows)
        toast.success(`${exportRows.length} ${t('rows exported')}`)
      } else {
        const opened = exportPurchasesToPdf(exportRows, {
          title: t('Purchase Report'),
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

  const openPaymentFor = (purchase?: any) => {
    setPaymentSupplierId(purchase ? String(purchase.supplier?.id || purchase.supplier?._id || '') : undefined)
    setPaymentDialogOpen(true)
  }

  if (error) {
    return (
      <div className='flex h-64 items-center justify-center'>
        <div className='text-center'>
          <p className='text-destructive'>{t('Error loading purchases')}</p>
          <Button onClick={() => window.location.reload()} className='mt-4'>
            {t('Retry')}
          </Button>
        </div>
      </div>
    )
  }

  const columnCount = 12 + (canViewCreatedBy ? 1 : 0)

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-center gap-3'>
          {onBack && (
            <Button variant='ghost' size='icon' onClick={onBack}>
              <ArrowLeft className='h-4 w-4' />
            </Button>
          )}
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>{t('Purchase Management')}</h1>
            <p className='text-sm text-muted-foreground'>{t('Track supplier purchases, invoices and payments.')}</p>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {canCreate && (
            <Button variant='outline' onClick={() => openPaymentFor()}>
              <HandCoins className='mr-2 h-4 w-4' />
              {t('Record Supplier Payment')}
            </Button>
          )}
          {canCreate && (
            <Button onClick={onCreateNew}>
              <Plus className='mr-2 h-4 w-4' />
              {t('Create Purchase')}
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          label={t('Total Purchases')}
          value={String(summary?.purchaseCount ?? 0)}
          hint={`${formatMoney(summary?.totalValue ?? 0)} ${t('in value')}`}
          icon={Receipt}
        />
        <StatCard
          label={t('Suppliers')}
          value={String(summary?.supplierCount ?? 0)}
          hint={t('in the current view')}
          icon={Users}
          tone='success'
        />
        <StatCard
          label={t('Outstanding Amount')}
          value={formatMoney(summary?.totalOutstanding ?? 0)}
          hint={
            <>
              <p className='truncate'>
                {summary?.unpaidCount ?? 0} {t('unpaid')} · {summary?.partialCount ?? 0} {t('partial')}
              </p>
              {reconciliation && Math.abs(reconciliationGap) > 0.01 && (
                // Kept terse so it survives the card's width — the full sentence is the
                // tooltip, and the itemised bridge lives on the supplier ledger page.
                <p
                  className='truncate'
                  title={`${t('Open purchase invoices')} ${formatMoney(reconciliation.invoiceOutstanding)} − ${formatMoney(
                    reconciliationGap
                  )} ${t('of credits, advances and debit notes')} = ${t('supplier account balance')} ${formatMoney(
                    reconciliation.ledgerBalance
                  )}`}
                >
                  {t('Ledger')} {formatMoney(reconciliation.ledgerBalance)} · −{formatMoney(reconciliationGap)}{' '}
                  {t('credits')}
                </p>
              )}
            </>
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
              : `${t('purchased since the 1st')}`
          }
          icon={summary?.overdueAmount ? AlertTriangle : TrendingUp}
          tone={summary?.overdueAmount ? 'danger' : 'default'}
        />
      </div>

      {/* Filters */}
      <PurchaseFiltersToolbar
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

      {/* Table */}
      <Card>
        <CardContent className='p-0'>
          {/* Selection bar */}
          {selectedIds.length > 0 && (
            <div className='flex flex-wrap items-center justify-between gap-2 border-b bg-primary/5 px-4 py-2.5'>
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

          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='hover:bg-transparent'>
                  <TableHead className='w-10'>
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label={t('Select all')}
                      disabled={purchases.length === 0}
                    />
                  </TableHead>
                  <TableHead>{t('Invoice')}</TableHead>
                  <TableHead>{t('Vendor Bill')}</TableHead>
                  <TableHead>{t('Supplier')}</TableHead>
                  <TableHead className='text-center'>{t('Items')}</TableHead>
                  <TableHead>{t('Purchase Date')}</TableHead>
                  <TableHead>{t('Payment Type')}</TableHead>
                  <TableHead className='text-right'>{t('Invoice Total')}</TableHead>
                  <TableHead className='text-right'>{t('Paid Amount')}</TableHead>
                  <TableHead className='text-right'>{t('Remaining')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  {canViewCreatedBy && <TableHead>{t('created_by') || 'Created By'}</TableHead>}
                  <TableHead>{t('Last Updated')}</TableHead>
                  <TableHead className='w-12 text-right'>{t('Actions')}</TableHead>
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

                {!isLoading &&
                  purchases.map((purchase) => {
                    const id = purchase.id || purchase._id
                    const settlement = resolvePurchaseSettlement(purchase)
                    const statusMeta = SETTLEMENT_STATUS_META[settlement.settlementStatus]
                    const dueMeta = DUE_STATUS_META[settlement.dueStatus]
                    const paymentTypeLabel = resolvePaymentTypeLabel(purchase)
                    const isOverdue = settlement.dueStatus === 'overdue'

                    return (
                      <TableRow
                        key={id}
                        data-state={selected[id] ? 'selected' : undefined}
                        className='cursor-pointer'
                        onClick={() => setViewingPurchase(purchase)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={Boolean(selected[id])}
                            onCheckedChange={() => toggleSelect(id, purchase.invoiceNumber)}
                            aria-label={t('Select row')}
                          />
                        </TableCell>

                        <TableCell>
                          <div className='flex items-center gap-1.5'>
                            <span className='font-medium'>{purchase.invoiceNumber}</span>
                            {purchase.attachments?.length > 0 && (
                              <Paperclip className='h-3 w-3 text-muted-foreground' aria-label={t('Has attachments')} />
                            )}
                          </div>
                          {purchase.dueDate && (
                            <p className={cn('text-[11px]', isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                              {t('Due')} {format(new Date(purchase.dueDate), 'dd MMM yyyy')}
                            </p>
                          )}
                        </TableCell>

                        <TableCell className='text-muted-foreground'>{purchase.vendorBillNumber || '—'}</TableCell>

                        <TableCell className='max-w-[15rem]'>
                          <div className='flex min-w-0 items-center gap-2'>
                            <ContactPhotoCell
                              picture={purchase.supplier?.picture}
                              name={purchase.supplier?.name || 'N/A'}
                              className='h-8 w-8 shrink-0'
                            />
                            <div className='min-w-0 flex-1'>
                              <BilingualName primary={purchase.supplier?.name || 'N/A'} secondary={purchase.supplier?.nameUrdu} />
                              {purchase.supplier?.phone && (
                                <p className='truncate text-[11px] text-muted-foreground'>{purchase.supplier.phone}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className='text-center'>
                          <Badge variant='outline' className='font-normal'>
                            {purchase.itemsCount ?? purchase.items?.length ?? 0}
                          </Badge>
                        </TableCell>

                        <TableCell className='whitespace-nowrap'>
                          {format(new Date(purchase.purchaseDate || purchase.createdAt), 'dd MMM yyyy')}
                        </TableCell>

                        <TableCell>
                          <Badge variant='outline' className={cn('font-normal', paymentTypeClassName(paymentTypeLabel))}>
                            {paymentTypeLabel}
                          </Badge>
                        </TableCell>

                        <TableCell className='text-right font-semibold tabular-nums'>
                          {formatMoney(Number(purchase.totalAmount || 0))}
                        </TableCell>

                        <TableCell className='text-right tabular-nums'>
                          {formatMoney(settlement.settledAmount)}
                        </TableCell>

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
                          <TableCell className='text-sm text-muted-foreground'>
                            {typeof purchase.createdBy === 'object' ? purchase.createdBy?.name || '—' : '—'}
                          </TableCell>
                        )}

                        <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>
                          {purchase.updatedAt ? format(new Date(purchase.updatedAt), 'dd MMM yyyy HH:mm') : '—'}
                        </TableCell>

                        <TableCell className='text-right' onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant='ghost' size='icon' aria-label={t('Actions')}>
                                <MoreHorizontal className='h-4 w-4' />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end' className='w-52'>
                              <DropdownMenuItem onSelect={() => setViewingPurchase(purchase)}>
                                <Eye className='mr-2 h-4 w-4' />
                                {t('View')}
                              </DropdownMenuItem>
                              {canEdit && onEdit && (
                                <DropdownMenuItem onSelect={() => onEdit(purchase)}>
                                  <Edit className='mr-2 h-4 w-4' />
                                  {t('Edit')}
                                </DropdownMenuItem>
                              )}
                              {canCreate && onDuplicate && (
                                <DropdownMenuItem onSelect={() => onDuplicate(purchase)}>
                                  <Copy className='mr-2 h-4 w-4' />
                                  {t('Duplicate')}
                                </DropdownMenuItem>
                              )}
                              {canCreate && settlement.remainingAmount > 0.001 && (
                                <DropdownMenuItem onSelect={() => openPaymentFor(purchase)}>
                                  <Banknote className='mr-2 h-4 w-4' />
                                  {t('Record Payment')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => printPurchase(purchase)}>
                                <Printer className='mr-2 h-4 w-4' />
                                {t('Print')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => printPurchase(purchase, 'a4')}>
                                <FileDown className='mr-2 h-4 w-4' />
                                {t('Download PDF')}
                              </DropdownMenuItem>
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className='text-destructive focus:text-destructive'
                                    onSelect={() => {
                                      setPurchaseToDelete(purchase)
                                      setDeleteDialogOpen(true)
                                    }}
                                  >
                                    <Trash2 className='mr-2 h-4 w-4' />
                                    {t('Delete')}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}

                {!isLoading && purchases.length === 0 && (
                  <TableRow className='hover:bg-transparent'>
                    <TableCell colSpan={columnCount + 1} className='h-48'>
                      <div className='flex flex-col items-center justify-center gap-2 text-center'>
                        <Receipt className='h-10 w-10 text-muted-foreground/50' />
                        <p className='font-medium'>{t('No purchases found')}</p>
                        <p className='text-sm text-muted-foreground'>
                          {activeFilterCount > 0 || filters.search
                            ? t('Try widening or clearing the filters.')
                            : t('Record your first purchase to see it here.')}
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

          <div className={cn('px-4 pb-4', isFetching && !isLoading && 'opacity-60')}>
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

      <PurchaseViewDrawer
        purchaseId={viewingPurchase ? String(viewingPurchase.id || viewingPurchase._id) : null}
        fallbackPurchase={viewingPurchase}
        open={Boolean(viewingPurchase)}
        onOpenChange={(open) => !open && setViewingPurchase(null)}
        onEdit={(purchase) => {
          setViewingPurchase(null)
          onEdit?.(purchase)
        }}
        onPrint={(purchase) => printPurchase(purchase)}
        onRecordPayment={(purchase) => {
          setViewingPurchase(null)
          openPaymentFor(purchase)
        }}
      />

      <SupplierPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        defaultSupplierId={paymentSupplierId}
      />

      {purchaseToDelete && (
        <InvoiceDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          currentRow={{ ...purchaseToDelete, invoiceNumber: purchaseToDelete.invoiceNumber }}
        />
      )}
    </div>
  )
}
