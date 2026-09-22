import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { format, isValid } from 'date-fns'
import { Eye, MoreHorizontal, Download, RotateCcw, Ban, Receipt } from 'lucide-react'
import { usePermissions } from '@/context/permission-context'
import {
  useGetCustomerPaymentsQuery,
  useLazyGetCustomerPaymentsQuery,
  useGetCustomerPaymentQuery,
  useVoidCustomerPaymentMutation,
  type CustomerPaymentRecord,
} from '@/stores/customerPayment.api'
import { useFormatMoney } from '@/lib/format-money'
import { exportPaymentsToExcel } from '../utils/payment-export'
import { DIRECTION_BADGE_CLASS, DIRECTION_LABELS, STATUS_BADGE_CLASS, STATUS_LABELS, toCustomerPaymentSheetData } from '../utils/payment-sheet-data'
import { PaymentDetailSheet } from './payment-detail-sheet'
import { DateRangeFilter } from '@/components/filters/date-range-filter'
import { AmountRangeFilter } from '@/components/filters/amount-range-filter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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

const partyName = (payment: CustomerPaymentRecord) =>
  (typeof payment.customer === 'object' ? payment.customer.name : undefined) || payment.customerName || 'Unknown customer'

const ALL = '__all__'

export interface CustomerPaymentListInitialFilters {
  startDate?: string
  endDate?: string
  direction?: string
  status?: string
}

interface Props {
  initialFilters?: CustomerPaymentListInitialFilters
}

export function CustomerPaymentList({ initialFilters }: Props) {
  const formatMoney = useFormatMoney()
  const { hasAnyPermission } = usePermissions()
  const canManage = hasAnyPermission('deletePayments', 'deleteInvoices', 'manageLedgers')

  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState<string | undefined>(initialFilters?.startDate)
  const [endDate, setEndDate] = useState<string | undefined>(initialFilters?.endDate)
  const [direction, setDirection] = useState(initialFilters?.direction || ALL)
  const [status, setStatus] = useState(initialFilters?.status || ALL)
  const [minAmount, setMinAmount] = useState<number | undefined>(undefined)
  const [maxAmount, setMaxAmount] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [paymentToVoid, setPaymentToVoid] = useState<CustomerPaymentRecord | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const hasActiveFilters = Boolean(search || startDate || endDate || direction !== ALL || status !== ALL || minAmount != null || maxAmount != null)
  const resetToFirstPage = () => setPage(1)

  const handleReset = () => {
    setSearch('')
    setStartDate(undefined)
    setEndDate(undefined)
    setDirection(ALL)
    setStatus(ALL)
    setMinAmount(undefined)
    setMaxAmount(undefined)
    setPage(1)
  }

  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  const queryArgs = {
    search: search || undefined,
    direction: direction === ALL ? undefined : direction,
    status: status === ALL ? undefined : status,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    sortBy: 'paymentDate:desc',
    page,
    limit,
  }
  const { data, isLoading } = useGetCustomerPaymentsQuery(queryArgs)
  const payments = data?.results ?? []

  useEffect(() => {
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, direction, status, startDate, endDate, minAmount, maxAmount])

  const allOnPageSelected = payments.length > 0 && payments.every((p) => selectedIds.has(p.id))
  const someOnPageSelected = payments.some((p) => selectedIds.has(p.id))
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) payments.forEach((p) => next.delete(p.id))
      else payments.forEach((p) => next.add(p.id))
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

  const { currentData: detail, isFetching: isFetchingDetail } = useGetCustomerPaymentQuery(viewingId as string, {
    skip: !viewingId || !viewOpen,
  })
  const viewingRecord: CustomerPaymentRecord | undefined = detail ?? payments.find((p) => p.id === viewingId)

  const [triggerExport, { isFetching: isExporting }] = useLazyGetCustomerPaymentsQuery()
  const [voidPayment, { isLoading: isVoiding }] = useVoidCustomerPaymentMutation()

  const openView = (payment: CustomerPaymentRecord) => {
    setViewingId(payment.id)
    setViewOpen(true)
  }

  const handleExport = async (fileFormat: 'xlsx' | 'csv') => {
    const selected = payments.filter((p) => selectedIds.has(p.id))
    if (selected.length > 0) {
      exportPaymentsToExcel(selected.map(toCustomerPaymentSheetData), { kind: 'customer', partyColumnLabel: 'Customer', format: fileFormat })
      return
    }
    try {
      const result = await triggerExport({ ...queryArgs, page: undefined, limit: 5000 }).unwrap()
      exportPaymentsToExcel(result.results.map(toCustomerPaymentSheetData), { kind: 'customer', partyColumnLabel: 'Customer', format: fileFormat })
    } catch {
      toast.error('Failed to export customer payments')
    }
  }

  const handleVoid = async () => {
    if (!paymentToVoid) return
    try {
      await voidPayment({ id: paymentToVoid.id, reason: voidReason || undefined }).unwrap()
      toast.success('Payment voided')
      setPaymentToVoid(null)
      setVoidReason('')
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to void payment')
    }
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              placeholder='Search payment #, customer, invoice...'
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
              value={direction}
              onValueChange={(v) => {
                setDirection(v)
                resetToFirstPage()
              }}
            >
              <SelectTrigger className='w-full sm:w-36'>
                <SelectValue placeholder='All types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                <SelectItem value='payment'>Payment</SelectItem>
                <SelectItem value='refund'>Refund</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v)
                resetToFirstPage()
              }}
            >
              <SelectTrigger className='w-full sm:w-36'>
                <SelectValue placeholder='All statuses' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value='posted'>Posted</SelectItem>
                <SelectItem value='void'>Void</SelectItem>
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
              <p className='text-muted-foreground'>Loading customer payments...</p>
            </div>
          ) : payments.length === 0 ? (
            <div className='flex h-40 flex-col items-center justify-center gap-2'>
              <Receipt className='h-10 w-10 text-muted-foreground/40' />
              <p className='text-muted-foreground'>No customer payments found for these filters.</p>
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
                          aria-label='Select all payments on this page'
                        />
                      </TableHead>
                      <TableHead>Payment #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className='text-right'>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id} className='cursor-pointer' onClick={() => openView(payment)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(payment.id)}
                            onCheckedChange={() => toggleSelectOne(payment.id)}
                            aria-label={`Select payment ${payment.paymentNumber}`}
                          />
                        </TableCell>
                        <TableCell className='font-medium whitespace-nowrap'>
                          <button
                            type='button'
                            className='rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                            onClick={(e) => {
                              e.stopPropagation()
                              openView(payment)
                            }}
                          >
                            {payment.paymentNumber}
                          </button>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>{formatDate(payment.paymentDate)}</TableCell>
                        <TableCell className='max-w-[200px]'>
                          <span className='line-clamp-1'>{partyName(payment)}</span>
                        </TableCell>
                        <TableCell className='capitalize'>{payment.paymentMethod}</TableCell>
                        <TableCell>
                          <Badge variant='secondary' className={DIRECTION_BADGE_CLASS[payment.direction]}>
                            {DIRECTION_LABELS[payment.direction] ?? payment.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right font-semibold text-emerald-600 whitespace-nowrap'>
                          {formatMoney(Number(payment.amount || 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary' className={STATUS_BADGE_CLASS[payment.status]}>
                            {STATUS_LABELS[payment.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center justify-end gap-1' onClick={(e) => e.stopPropagation()}>
                            <Button size='sm' variant='outline' className='h-8' onClick={() => openView(payment)} title='View payment'>
                              <Eye className='h-4 w-4' />
                            </Button>
                            {canManage && payment.status === 'posted' ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size='sm' variant='outline' className='h-8 w-8 p-0' title='More actions'>
                                    <MoreHorizontal className='h-4 w-4' />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end'>
                                  <DropdownMenuItem
                                    className='text-red-600 focus:text-red-700'
                                    onClick={() => setPaymentToVoid(payment)}
                                  >
                                    <Ban className='mr-2 h-4 w-4' />
                                    Void payment
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
                        Total ({data?.totalResults ?? payments.length} {(data?.totalResults ?? payments.length) === 1 ? 'payment' : 'payments'})
                      </TableCell>
                      <TableCell className='text-right font-bold text-emerald-600 whitespace-nowrap'>
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
            <Button variant='outline' className='gap-2' disabled={isExporting || payments.length === 0}>
              <Download className='h-4 w-4' />
              {selectedIds.size > 0 ? `Export (${selectedIds.size})` : 'Export'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export to Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>Export to CSV (.csv)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PaymentDetailSheet
        kind='customer'
        payment={viewingRecord ? toCustomerPaymentSheetData(viewingRecord) : null}
        open={viewOpen}
        onOpenChange={setViewOpen}
        isRefreshing={isFetchingDetail}
        onVoid={
          canManage && viewingRecord && viewingRecord.status === 'posted'
            ? () => {
                setViewOpen(false)
                setPaymentToVoid(viewingRecord)
              }
            : undefined
        }
      />

      <AlertDialog
        open={!!paymentToVoid}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentToVoid(null)
            setVoidReason('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void payment {paymentToVoid?.paymentNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This reverses every invoice this payment settled back to outstanding, and reverses its effect on the bank account
              balance and cash book. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder='Reason (optional)'
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            className='min-h-16'
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className='bg-red-600 hover:bg-red-700' onClick={handleVoid} disabled={isVoiding}>
              {isVoiding ? 'Voiding...' : 'Void Payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
