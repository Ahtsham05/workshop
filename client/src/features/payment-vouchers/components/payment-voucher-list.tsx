import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { format, isValid } from 'date-fns'
import {
  Eye,
  Pencil,
  Printer,
  Trash2,
  Receipt,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MoreHorizontal,
  Download,
  Zap,
  RotateCcw,
} from 'lucide-react'
import { usePermissions } from '@/context/permission-context'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  useGetPaymentVouchersQuery,
  useLazyGetPaymentVouchersQuery,
  useGetPaymentVoucherQuery,
  useDeletePaymentVoucherMutation,
  type PaymentVoucherRecord,
} from '@/stores/paymentVoucher.api'
import { useBranchPaperSize, useBranchPrintOrientation } from '@/features/invoice/utils/paper-format'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { printPaymentVoucher } from '../utils/print-payment-voucher'
import { exportVouchersToExcel } from '../utils/voucher-export'
import {
  PAYEE_TYPE_BADGE_CLASS, PAYEE_TYPE_LABELS,
  toPaymentSheetData,
} from '../utils/voucher-sheet-data'
import { VoucherDetailSheet } from './voucher-detail-sheet'
import { PaymentVoucherDialog } from './payment-voucher-dialog'
import { DateRangeFilter } from '@/components/filters/date-range-filter'
import { AmountRangeFilter } from '@/components/filters/amount-range-filter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { SimplePagination } from '@/components/ui/simple-pagination'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const formatDate = (value?: string) => {
  if (!value) return '-'
  const parsed = new Date(value)
  return isValid(parsed) ? format(parsed, 'MMM dd, yyyy') : '-'
}

const voucherTypeLabel = (voucher: PaymentVoucherRecord) => {
  const types = new Set(voucher.lines.map((l) => l.payeeType))
  if (types.size > 1) return 'mixed'
  return voucher.lines[0]?.payeeType ?? 'other'
}

const voucherPayeeSummary = (voucher: PaymentVoucherRecord) => voucher.lines.map((l) => l.payeeName).join(', ')

const ALL_ACCOUNTS = '__all__'
const ALL_TYPES = '__all__'

type SortField = 'voucherNumber' | 'date' | 'bankAccountName' | 'totalAmount'

interface Props {
  onCreateVoucher?: () => void
}

export function PaymentVoucherList({ onCreateVoucher }: Props) {
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const { hasExplicitPermission } = usePermissions()
  const canManage = hasExplicitPermission('managePaymentVouchers')
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results ?? []
  const paperSize = useBranchPaperSize()
  const orientation = useBranchPrintOrientation()

  const [search, setSearch] = useState('')
  const [bankAccountId, setBankAccountId] = useState(ALL_ACCOUNTS)
  const [payeeType, setPayeeType] = useState(ALL_TYPES)
  const [startDate, setStartDate] = useState<string | undefined>(undefined)
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [minAmount, setMinAmount] = useState<number | undefined>(undefined)
  const [maxAmount, setMaxAmount] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [voucherToDelete, setVoucherToDelete] = useState<PaymentVoucherRecord | null>(null)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const hasActiveFilters = Boolean(
    search || bankAccountId !== ALL_ACCOUNTS || payeeType !== ALL_TYPES || startDate || endDate || minAmount != null || maxAmount != null
  )

  const resetToFirstPage = () => setPage(1)

  const handleReset = () => {
    setSearch('')
    setBankAccountId(ALL_ACCOUNTS)
    setPayeeType(ALL_TYPES)
    setStartDate(undefined)
    setEndDate(undefined)
    setMinAmount(undefined)
    setMaxAmount(undefined)
    setPage(1)
  }

  const toggleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }
  const SortIcon = ({ field }: { field: SortField }) => {
    if (field !== sortField) return <ArrowUpDown className='ml-1 h-3.5 w-3.5 text-muted-foreground/50' />
    return sortOrder === 'asc' ? <ArrowUp className='ml-1 h-3.5 w-3.5' /> : <ArrowDown className='ml-1 h-3.5 w-3.5' />
  }
  const sortButtonClass = 'flex items-center gap-0 hover:text-foreground focus-visible:outline-none focus-visible:underline'

  // What is open is tracked separately from what it shows, so a closing sheet/dialog keeps its
  // content for the exit animation instead of flashing empty.
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentVoucherRecord | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  // Editing from the sheet returns to it afterwards, so view → edit → save reads as one flow.
  const [returnToViewId, setReturnToViewId] = useState<string | null>(null)

  const queryArgs = {
    search: search || undefined,
    bankAccountId: bankAccountId === ALL_ACCOUNTS ? undefined : bankAccountId,
    payeeType: payeeType === ALL_TYPES ? undefined : (payeeType as 'expense' | 'supplier' | 'other'),
    startDate,
    endDate,
    minAmount,
    maxAmount,
    sortBy: `${sortField}:${sortOrder}`,
    page,
    limit,
  }
  const { data, isLoading } = useGetPaymentVouchersQuery(queryArgs)
  const vouchers = data?.results ?? []

  // Selection is scoped to the page on screen — switching pages or filters starts fresh rather
  // than tracking ids that have scrolled out of view.
  useEffect(() => {
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, bankAccountId, payeeType, startDate, endDate, minAmount, maxAmount, sortField, sortOrder])

  const allOnPageSelected = vouchers.length > 0 && vouchers.every((v) => selectedIds.has(v.id))
  const someOnPageSelected = vouchers.some((v) => selectedIds.has(v.id))
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        vouchers.forEach((v) => next.delete(v.id))
      } else {
        vouchers.forEach((v) => next.add(v.id))
      }
      return next
    })
  }
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // The row is enough to open the sheet instantly; the single-voucher endpoint adds who created
  // and last edited it. `currentData` (not `data`) so it never shows the previously opened one.
  const { currentData: detail, isFetching: isFetchingDetail } = useGetPaymentVoucherQuery(viewingId as string, {
    skip: !viewingId || !viewOpen,
  })
  const viewingRecord: PaymentVoucherRecord | undefined = detail ?? vouchers.find((v) => v.id === viewingId)

  const [deleteVoucher, { isLoading: isDeleting }] = useDeletePaymentVoucherMutation()
  const [triggerExport, { isFetching: isExporting }] = useLazyGetPaymentVouchersQuery()

  const handlePrint = (voucher: PaymentVoucherRecord) => {
    printPaymentVoucher(
      {
        voucherNumber: voucher.voucherNumber,
        date: voucher.date,
        bankAccountName: voucher.bankAccountName,
        lines: voucher.lines,
        totalAmount: voucher.totalAmount,
        reference: voucher.reference,
        notes: voucher.notes,
      },
      {
        name: org?.name || 'Logix Plus Solutions',
        address: org?.address,
        phone: org?.phone,
        currencyMeta,
      },
      paperSize,
      orientation,
    )
  }

  const handleExport = async (fileFormat: 'xlsx' | 'csv') => {
    const selected = vouchers.filter((v) => selectedIds.has(v.id))
    if (selected.length > 0) {
      exportVouchersToExcel(selected.map(toPaymentSheetData), { kind: 'payment', partyColumnLabel: 'Paid To', format: fileFormat })
      return
    }
    try {
      const result = await triggerExport({ ...queryArgs, page: undefined, limit: 5000 }).unwrap()
      exportVouchersToExcel(result.results.map(toPaymentSheetData), { kind: 'payment', partyColumnLabel: 'Paid To', format: fileFormat })
    } catch {
      toast.error('Failed to export payment vouchers')
    }
  }

  const openView = (voucher: PaymentVoucherRecord) => {
    setViewingId(voucher.id)
    setViewOpen(true)
  }

  const openEdit = (voucher: PaymentVoucherRecord, fromView = false) => {
    setEditing(voucher)
    setEditOpen(true)
    if (fromView) {
      // A Sheet is also a dialog, and the edit form's keyboard navigation binds to the first open
      // one — so the sheet has to be closed while the form is up.
      setReturnToViewId(voucher.id)
      setViewOpen(false)
    }
  }

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open)
    if (!open && returnToViewId) {
      setViewingId(returnToViewId)
      setViewOpen(true)
      setReturnToViewId(null)
    }
  }

  const handleDelete = async () => {
    if (!voucherToDelete) return
    try {
      await deleteVoucher(voucherToDelete.id).unwrap()
      toast.success('Payment voucher deleted')
      setVoucherToDelete(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete payment voucher')
    }
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              placeholder='Search voucher #, paid to, or amount...'
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetToFirstPage()
              }}
              className='w-full sm:w-56'
            />
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onChange={({ startDate: s, endDate: e }) => {
                setStartDate(s)
                setEndDate(e)
                resetToFirstPage()
              }}
            />
            <Select
              value={bankAccountId}
              onValueChange={(v) => {
                setBankAccountId(v)
                resetToFirstPage()
              }}
            >
              <SelectTrigger className='w-full sm:w-48'>
                <SelectValue placeholder='All bank accounts' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ACCOUNTS}>All bank accounts</SelectItem>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={payeeType}
              onValueChange={(v) => {
                setPayeeType(v)
                resetToFirstPage()
              }}
            >
              <SelectTrigger className='w-full sm:w-40'>
                <SelectValue placeholder='All types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All types</SelectItem>
                <SelectItem value='expense'>Expense</SelectItem>
                <SelectItem value='supplier'>Supplier</SelectItem>
                <SelectItem value='other'>Other</SelectItem>
              </SelectContent>
            </Select>
            <AmountRangeFilter
              minAmount={minAmount}
              maxAmount={maxAmount}
              onChange={({ minAmount: min, maxAmount: max }) => {
                setMinAmount(min)
                setMaxAmount(max)
                resetToFirstPage()
              }}
              className='ml-auto'
            />
            <Button variant='outline' className='gap-2' onClick={handleReset} disabled={!hasActiveFilters}>
              <RotateCcw className='h-4 w-4' />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='flex h-40 items-center justify-center'>
              <p className='text-muted-foreground'>Loading payment vouchers...</p>
            </div>
          ) : vouchers.length === 0 ? (
            <div className='flex h-40 flex-col items-center justify-center gap-2'>
              <Receipt className='h-10 w-10 text-muted-foreground/40' />
              <p className='text-muted-foreground'>No payment vouchers yet. Create one to get started!</p>
            </div>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-10'>
                        <Checkbox
                          checked={allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label='Select all vouchers on this page'
                        />
                      </TableHead>
                      <TableHead>
                        <button type='button' className={sortButtonClass} onClick={() => toggleSort('voucherNumber')}>
                          Voucher # <SortIcon field='voucherNumber' />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type='button' className={sortButtonClass} onClick={() => toggleSort('date')}>
                          Date <SortIcon field='date' />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type='button' className={sortButtonClass} onClick={() => toggleSort('bankAccountName')}>
                          Bank Account <SortIcon field='bankAccountName' />
                        </button>
                      </TableHead>
                      <TableHead>Paid To</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className='text-right'>
                        <button type='button' className={`${sortButtonClass} ml-auto`} onClick={() => toggleSort('totalAmount')}>
                          Amount <SortIcon field='totalAmount' />
                        </button>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.map((voucher) => (
                      <TableRow key={voucher.id} className='cursor-pointer' onClick={() => openView(voucher)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(voucher.id)}
                            onCheckedChange={() => toggleSelectOne(voucher.id)}
                            aria-label={`Select voucher ${voucher.voucherNumber}`}
                          />
                        </TableCell>
                        <TableCell className='font-medium whitespace-nowrap'>
                          <button
                            type='button'
                            className='rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                            onClick={(e) => {
                              e.stopPropagation()
                              openView(voucher)
                            }}
                          >
                            {voucher.voucherNumber}
                          </button>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>{formatDate(voucher.date)}</TableCell>
                        <TableCell>{voucher.bankAccountName || '-'}</TableCell>
                        <TableCell className='max-w-[220px]'>
                          <span className='line-clamp-1'>{voucherPayeeSummary(voucher)}</span>
                          {voucher.lines.length > 1 && (
                            <span className='block text-xs text-muted-foreground'>{voucher.lines.length} line items</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary' className={PAYEE_TYPE_BADGE_CLASS[voucherTypeLabel(voucher)]}>
                            {voucherTypeLabel(voucher) === 'mixed' ? 'Mixed' : PAYEE_TYPE_LABELS[voucherTypeLabel(voucher)]}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right font-semibold text-red-600 whitespace-nowrap'>
                          {formatMoney(Number(voucher.totalAmount || 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary' className='bg-emerald-100 text-emerald-700 hover:bg-emerald-100'>
                            Completed
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center justify-end gap-1' onClick={(e) => e.stopPropagation()}>
                            <Button size='sm' variant='outline' className='h-8' onClick={() => openView(voucher)} title='View voucher'>
                              <Eye className='h-4 w-4' />
                            </Button>
                            {canManage ? (
                              <Button size='sm' variant='outline' className='h-8' onClick={() => openEdit(voucher)} title='Edit voucher'>
                                <Pencil className='h-4 w-4' />
                              </Button>
                            ) : null}
                            <Button size='sm' variant='outline' className='h-8' onClick={() => handlePrint(voucher)} title='Print voucher'>
                              <Printer className='h-4 w-4' />
                            </Button>
                            {canManage ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size='sm' variant='outline' className='h-8 w-8 p-0' title='More actions'>
                                    <MoreHorizontal className='h-4 w-4' />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end'>
                                  <DropdownMenuItem
                                    className='text-red-600 focus:text-red-700'
                                    onClick={() => setVoucherToDelete(voucher)}
                                  >
                                    <Trash2 className='mr-2 h-4 w-4' />
                                    Delete voucher
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className='hover:bg-transparent'>
                      <TableCell colSpan={6} className='text-right font-semibold'>
                        Total ({data?.totalResults ?? vouchers.length} {(data?.totalResults ?? vouchers.length) === 1 ? 'voucher' : 'vouchers'})
                      </TableCell>
                      <TableCell className='text-right font-bold text-red-600 whitespace-nowrap'>
                        {formatMoney(Number(data?.totalAmountSum || 0))}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <SimplePagination
                currentPage={data?.page ?? page}
                totalPages={data?.totalPages ?? 1}
                totalResults={data?.totalResults}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            </>
          )}
        </CardContent>
      </Card>

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' className='gap-2' disabled={isExporting || vouchers.length === 0}>
              <Download className='h-4 w-4' />
              {selectedIds.size > 0 ? `Export (${selectedIds.size})` : 'Export'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export to Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>Export to CSV (.csv)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' className='gap-2'>
              <Zap className='h-4 w-4' />
              Quick actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {onCreateVoucher ? <DropdownMenuItem onClick={onCreateVoucher}>New Payment Voucher</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export to Excel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <VoucherDetailSheet
        kind='payment'
        voucher={viewingRecord ? toPaymentSheetData(viewingRecord) : null}
        open={viewOpen}
        onOpenChange={setViewOpen}
        isRefreshing={isFetchingDetail}
        onPrint={viewingRecord ? () => handlePrint(viewingRecord) : undefined}
        onEdit={canManage && viewingRecord ? () => openEdit(viewingRecord, true) : undefined}
        onDelete={
          canManage && viewingRecord
            ? () => {
                setViewOpen(false)
                setVoucherToDelete(viewingRecord)
              }
            : undefined
        }
      />

      <PaymentVoucherDialog voucher={editing} open={editOpen} onOpenChange={handleEditOpenChange} />

      <AlertDialog open={!!voucherToDelete} onOpenChange={(open) => !open && setVoucherToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete voucher &quot;{voucherToDelete?.voucherNumber}&quot; and reverse every line&apos;s effect
              on the bank account balance, cash book, and any linked expense or supplier ledger entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className='bg-red-600 hover:bg-red-700' onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Voucher'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
