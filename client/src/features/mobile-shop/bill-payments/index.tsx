import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  MOBILE_FORM_KEYBOARD_HINT,
  makeEnterChain,
  useCtrlEnterSubmit,
} from '@/lib/mobile-form-keyboard'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Printer,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
  TrendingUp,
  Banknote,
  FileText,
  Search,
  CheckCircle2,
  CalendarDays,
  Calendar,
} from 'lucide-react'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { MobilePageShell } from '../components/mobile-page-shell'
import {
  useGetBillPaymentsQuery,
  useLazyGetBillPaymentsQuery,
  // useCreateBillPaymentMutation,
  useCreateBillPaymentsBatchMutation,
  useSettleCombinedBillMutation,
  useDeleteBillPaymentMutation,
  useUpdateBillPaymentMutation,
  useGetUtilityCompaniesQuery,
  useGetBillPaymentReceiptQuery,
  useGetBillDueSummaryQuery,
  useGetWalletsQuery,
  useGetAgentBillsQuery,
  useDeleteAgentBillMutation,
  BILL_TYPES,
  type BillPaymentRecord,
  type AgentBillRecord,
  // type CreateBillPaymentInput,
  type CreateBillPaymentsBatchInput,
} from '@/stores/mobile-shop.api'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
  toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { openBillReceiptPrintWindow } from './bill-receipt-utils'
import { openAgentBillPrintWindow } from './agent-bill-receipt-utils'
import { UtilityCompanyManager } from './utility-company-manager'
import { formatBusinessDate, getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { AgentBillDialog } from './agent-bill-dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type BillRow = {
  // "Within due date" amount — every Pakistani utility bill prints two figures;
  // this is the lower one.
  billAmount: string
  // The bill's own "after due date" figure, printed right on the same physical
  // bill — captured now, at creation, instead of guessing it weeks later when the
  // bill is actually settled late. Saved as this bill's `expectedLateAmount`.
  afterDueAmount: string
  customerName: string
  referenceNumber: string
}

type BatchFormState = {
  companyId: string
  companyName: string
  billType: string
  serviceCharge: string
  dueDate: string
  paymentDate: string
  paymentMethod: string
  walletType: string
  bills: BillRow[]
}

type ActiveTab = 'bills' | 'companies'
type DatePreset = 'today' | 'tomorrow' | 'week' | 'all'
type BillDateFilterBy = 'recorded' | 'due'
type BillListFilter = 'due-today' | 'overdue'

const BILL_DATE_FILTER_STORAGE_KEY = 'mobile-shop.billPayments.dateFilterBy'

function loadSavedBillDateFilterBy(): BillDateFilterBy {
  try {
    const raw = localStorage.getItem(BILL_DATE_FILTER_STORAGE_KEY)
    if (raw === 'recorded' || raw === 'due') return raw
  } catch {
    // ignore storage errors (private mode, etc.)
  }
  return 'due'
}

function saveBillDateFilterBy(mode: BillDateFilterBy): void {
  try {
    localStorage.setItem(BILL_DATE_FILTER_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

function getInitialBillListFilters(filter?: BillListFilter) {
  if (filter === 'due-today') {
    const today = getBusinessToday()
    return {
      dueDatePreset: 'today' as DatePreset,
      dueStartDate: today,
      dueEndDate: today,
      dateFilterBy: 'due' as BillDateFilterBy,
      filterStatus: 'pending',
    }
  }

  if (filter === 'overdue') {
    return {
      dueDatePreset: 'all' as DatePreset,
      dueStartDate: '',
      dueEndDate: '',
      dateFilterBy: 'due' as BillDateFilterBy,
      filterStatus: 'overdue',
    }
  }

  return {
    dueDatePreset: 'all' as DatePreset,
    dueStartDate: '',
    dueEndDate: '',
    dateFilterBy: loadSavedBillDateFilterBy(),
    filterStatus: 'all',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeEmptyBillRow = (): BillRow => ({
  billAmount: '',
  afterDueAmount: '',
  customerName: '',
  referenceNumber: '',
})

const makeInitialBatchForm = (): BatchFormState => ({
  companyId: '',
  companyName: '',
  billType: 'electricity',
  serviceCharge: '0',
  dueDate: getBusinessToday(),
  paymentDate: '',
  paymentMethod: 'cash',
  walletType: '',
  bills: [makeEmptyBillRow()],
})

const BILL_TYPE_LABELS: Record<string, string> = {
  electricity: 'Electricity',
  gas: 'Gas',
  water: 'Water',
  internet: 'Internet',
  other: 'Other',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  pending: 'secondary',
  overdue: 'destructive',
}

// ─── Overall Summary Cards ────────────────────────────────────────────────────

interface OverallReportCardsProps {
  dueStartDate: string
  dueEndDate: string
  dateFilterBy: BillDateFilterBy
}

function OverallReportCards({ dueStartDate, dueEndDate, dateFilterBy }: OverallReportCardsProps) {
  const { data: summary, isLoading } = useGetBillDueSummaryQuery({
    dueStartDate: dueStartDate || undefined,
    dueEndDate: dueEndDate || undefined,
    dateFilterBy,
  })

  const cards = [
    { label: 'Total Bills', value: summary?.totalBills ?? 0, icon: FileText, cls: '', fmt: (v: number) => String(v) },
    { label: 'Total Collection', value: summary?.totalReceived ?? 0, icon: Banknote, cls: '', fmt: (v: number) => `Rs. ${v.toLocaleString()}` },
    { label: 'Service Profit', value: summary?.totalServiceCharges ?? 0, icon: TrendingUp, cls: 'text-green-600', fmt: (v: number) => `Rs. ${v.toLocaleString()}` },
    { label: 'Due Today', value: summary?.dueTodayCount ?? 0, icon: Clock, cls: 'text-yellow-600', fmt: (v: number) => String(v) },
    { label: 'Overdue', value: summary?.overdueCount ?? 0, icon: AlertCircle, cls: 'text-red-500', fmt: (v: number) => String(v) },
  ]

  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
      {cards.map(({ label, value, icon: Icon, cls, fmt }) => (
        <Card key={label}>
          <CardContent className='p-4'>
            <div className='flex items-center justify-between'>
              <p className='text-muted-foreground text-xs'>{label}</p>
              <Icon className={`h-4 w-4 ${cls || 'text-muted-foreground'}`} />
            </div>
            <p className={`mt-1 text-lg font-bold ${isLoading ? 'opacity-40' : ''} ${cls}`}>
              {isLoading ? '—' : fmt(value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Due Date Filter Panel ────────────────────────────────────────────────────

interface DueDateFilterProps {
  dueStartDate: string
  dueEndDate: string
  dateFilterBy: BillDateFilterBy
  preset: DatePreset
  onPresetChange: (preset: DatePreset, start: string, end: string) => void
  onCustomChange: (start: string, end: string) => void
  onDateFilterByChange: (mode: BillDateFilterBy) => void
}

function DueDateFilterPanel({
  dueStartDate,
  dueEndDate,
  dateFilterBy,
  preset,
  onPresetChange,
  onCustomChange,
  onDateFilterByChange,
}: DueDateFilterProps) {
  const applyPreset = (p: DatePreset) => {
    const today = getBusinessToday()
    if (p === 'today') {
      onPresetChange(p, today, today)
    } else if (p === 'tomorrow') {
      const d = shiftBusinessCalendarDate(today, 1)
      onPresetChange(p, d, d)
    } else if (p === 'week') {
      onPresetChange(p, today, shiftBusinessCalendarDate(today, 6))
    } else {
      onPresetChange('all', '', '')
    }
  }

  const { data: summary, isFetching } = useGetBillDueSummaryQuery({
    dueStartDate: dueStartDate || undefined,
    dueEndDate: dueEndDate || undefined,
    dateFilterBy,
  })

  const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'week', label: 'This Week' },
    { key: 'all', label: 'All Dates' },
  ]

  return (
    <Card className='border-dashed'>
      <CardContent className='p-4 space-y-3'>
        {/* Header */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <CalendarDays className='h-4 w-4 text-muted-foreground' />
            <span className='text-sm font-medium'>Filter by Date</span>
          </div>
          <div className='flex items-center gap-2 rounded-md border bg-background px-2 py-1'>
            <span
              className={cn(
                'text-xs',
                dateFilterBy === 'recorded' ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              Collection date
            </span>
            <Switch
              checked={dateFilterBy === 'due'}
              onCheckedChange={(checked) => onDateFilterByChange(checked ? 'due' : 'recorded')}
              aria-label='Toggle between recorded date and due date filter'
            />
            <span
              className={cn(
                'text-xs',
                dateFilterBy === 'due' ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              Due date
            </span>
          </div>
        </div>

        {/* Preset quick buttons */}
        <div className='flex flex-wrap gap-2'>
          {PRESETS.map(({ key, label }) => (
            <Button
              key={key}
              size='sm'
              variant={preset === key ? 'default' : 'outline'}
              className='h-8 gap-1.5'
              onClick={() => applyPreset(key)}
            >
              {key !== 'all' && <Calendar className='h-3.5 w-3.5' />}
              {label}
            </Button>
          ))}
        </div>

        {/* Custom date range inputs */}
        <div className='flex flex-wrap gap-2 items-center'>
          <div className='flex items-center gap-2'>
            <Label className='text-xs whitespace-nowrap'>From</Label>
            <Input
              type='date'
              className='h-8 w-[150px] text-xs'
              value={dueStartDate}
              onChange={(e) => onCustomChange(e.target.value, dueEndDate)}
            />
          </div>
          <div className='flex items-center gap-2'>
            <Label className='text-xs whitespace-nowrap'>To</Label>
            <Input
              type='date'
              className='h-8 w-[150px] text-xs'
              value={dueEndDate}
              onChange={(e) => onCustomChange(dueStartDate, e.target.value)}
            />
          </div>
        </div>

        {/* Dynamic summary for the active due-date range */}
        <div className={`flex flex-wrap gap-4 rounded-md bg-muted px-4 py-3 text-sm transition-opacity ${isFetching ? 'opacity-40' : ''}`}>
            <div>
              <span className='text-muted-foreground'>Bills: </span>
              <strong>{summary?.totalBills ?? 0}</strong>
            </div>
            <div>
              <span className='text-muted-foreground'>Total Due: </span>
              <strong>Rs. {(summary?.totalBillAmount ?? 0).toLocaleString()}</strong>
            </div>
            <div>
              <span className='text-muted-foreground'>Your Profit: </span>
              <strong className='text-green-600'>Rs. {(summary?.totalServiceCharges ?? 0).toLocaleString()}</strong>
            </div>
            <div>
              <span className='text-muted-foreground'>Total to Collect: </span>
              <strong>Rs. {(summary?.totalReceived ?? 0).toLocaleString()}</strong>
            </div>
          </div>
      </CardContent>
    </Card>
  )
}

// ─── Mark as Paid Dialog ──────────────────────────────────────────────────────

const isBillPaymentLate = (dueDate: string, paymentDate: string) => {
  const dueKey = dueDate.slice(0, 10)
  const payKey = paymentDate.slice(0, 10)
  return payKey > dueKey
}

interface MarkPaidDialogProps {
  bill: BillPaymentRecord | null
  onClose: () => void
}

function MarkPaidDialog({ bill, onClose }: MarkPaidDialogProps) {
  const [paymentDate, setPaymentDate] = useState(getBusinessToday())
  const [actualBillAmount, setActualBillAmount] = useState('')
  const [updateBill, { isLoading }] = useUpdateBillPaymentMutation()
  const [lookupOlderBills] = useLazyGetBillPaymentsQuery()
  const [olderUnpaid, setOlderUnpaid] = useState<BillPaymentRecord[]>([])

  useEffect(() => {
    if (bill) {
      setPaymentDate(getBusinessToday())
      // Default to the cashier's own earlier estimate (entered while this bill was
      // still pending/overdue) instead of the original bill amount, if one exists.
      setActualBillAmount(String(bill.expectedLateAmount ?? bill.billAmount))
      // Paying this bill auto-settles any older unpaid bill on the same Ref # too —
      // surface that here so the cashier isn't surprised by it.
      lookupOlderBills({ search: bill.referenceNumber, limit: 10 }).unwrap()
        .then((result) => {
          const older = (result?.results ?? []).filter(
            (b) =>
              b.id !== bill.id &&
              b.referenceNumber === bill.referenceNumber &&
              b.companyId === bill.companyId &&
              b.status !== 'paid' &&
              new Date(b.dueDate) < new Date(bill.dueDate),
          )
          setOlderUnpaid(older)
        })
        .catch(() => setOlderUnpaid([]))
    } else {
      setOlderUnpaid([])
    }
  }, [bill, lookupOlderBills])

  const isLate = bill
    ? bill.status === 'overdue' || isBillPaymentLate(bill.dueDate, paymentDate)
    : false

  const parsedActualBillAmount = Number(actualBillAmount || 0)
  const lateLoss = bill && isLate
    ? Math.max(0, parsedActualBillAmount - bill.billAmount)
    : 0
  const netProfit = bill ? bill.serviceCharge - lateLoss : 0

  const handleConfirm = async () => {
    if (!bill) return
    if (isLate && parsedActualBillAmount < bill.billAmount) {
      toast.error('Amount to pay utility cannot be less than the original bill amount')
      return
    }
    try {
      await updateBill({
        id: bill.id,
        body: {
          status: 'paid',
          paymentMethod: bill.paymentMethod,
          paymentDate,
          ...(isLate ? { actualBillAmount: parsedActualBillAmount } : {}),
        },
      }).unwrap()
      const cascadeNote = olderUnpaid.length > 0 ? ` — ${olderUnpaid.length} older bill(s) settled too` : ''
      toast.success(
        (isLate && lateLoss > 0 ? 'Bill paid — late payment loss recorded' : 'Bill marked as paid') + cascadeNote,
      )
      onClose()
    } catch {
      toast.error('Failed to update bill')
    }
  }

  return (
    <Dialog open={!!bill} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
        </DialogHeader>
        {bill && (
          <div className='space-y-4 text-sm'>
            <div className='rounded-md bg-muted p-3 space-y-1'>
              <p><span className='text-muted-foreground'>Customer: </span><strong>{bill.customerName}</strong></p>
              <p><span className='text-muted-foreground'>Company: </span>{bill.companyName}</p>
              <p><span className='text-muted-foreground'>Ref #: </span><span className='font-mono'>{bill.referenceNumber}</span></p>
              <p><span className='text-muted-foreground'>Due Date: </span><strong>{formatBusinessDate(bill.dueDate)}</strong></p>
              <p><span className='text-muted-foreground'>Original Bill Amount: </span><strong>Rs. {bill.billAmount.toLocaleString()}</strong></p>
              <p><span className='text-muted-foreground'>Service Charge: </span><strong className='text-green-600'>Rs. {bill.serviceCharge.toLocaleString()}</strong></p>
              <p><span className='text-muted-foreground'>Collected from Customer: </span><strong>Rs. {bill.totalReceived.toLocaleString()}</strong></p>
            </div>

            {olderUnpaid.length > 0 && (
              <div className='rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800'>
                <p className='flex items-center gap-2 font-medium'>
                  <AlertCircle className='h-4 w-4' />
                  This will also settle {olderUnpaid.length} older unpaid bill(s) on this Ref #
                </p>
                <ul className='mt-1.5 space-y-0.5 text-xs'>
                  {olderUnpaid.map((b) => (
                    <li key={b.id}>
                      Due {formatBusinessDate(b.dueDate)} — Rs. {(b.expectedLateAmount ?? b.billAmount).toLocaleString()} to the company
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isLate && (
              <div className='rounded-md border border-red-200 bg-red-50 p-3 space-y-3'>
                <p className='font-medium text-red-800 flex items-center gap-2'>
                  <AlertCircle className='h-4 w-4' />
                  Payment after due date — utility may charge a higher amount
                </p>
                <div>
                  <Label>Amount to Pay Utility (After Due Date)</Label>
                  <Input
                    type='number'
                    min={bill.billAmount}
                    step='0.01'
                    value={actualBillAmount}
                    onChange={(e) => setActualBillAmount(e.target.value)}
                  />
                  <p className='text-xs text-muted-foreground mt-1'>
                    Customer already paid Rs. {bill.totalReceived.toLocaleString()}. Enter the actual amount the utility company charges now.
                  </p>
                </div>
                {lateLoss > 0 && (
                  <div className='grid grid-cols-2 gap-2 text-sm'>
                    <div className='rounded bg-white/80 p-2'>
                      <p className='text-muted-foreground'>Late Payment Loss</p>
                      <p className='font-semibold text-red-600'>Rs. {lateLoss.toLocaleString()}</p>
                    </div>
                    <div className='rounded bg-white/80 p-2'>
                      <p className='text-muted-foreground'>Net Bill Profit</p>
                      <p className={`font-semibold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Rs. {netProfit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Payment Date</Label>
              <Input type='date' value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            <CheckCircle2 className='mr-1.5 h-4 w-4' />
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Receipt Print Button ─────────────────────────────────────────────────────

function PrintReceiptButton({ billId }: { billId: string }) {
  const [trigger, setTrigger] = useState(false)
  const { data: receipt, isLoading } = useGetBillPaymentReceiptQuery(billId, { skip: !trigger })
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })

  const receiptOptions = {
    branchDetails: {
      name: branchData?.name,
      address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', '),
      phone: branchData?.phone,
      email: branchData?.email,
      invoiceNote: branchData?.invoiceNote,
    },
    userPreferredLanguage: preferredLanguage as 'en' | 'ur',
    isTrial: orgData?.subscription?.isTrial,
    logo: orgData?.logo?.url,
  }

  const handleClick = () => {
    if (receipt) {
      openBillReceiptPrintWindow(receipt, receiptOptions)
    } else {
      setTrigger(true)
    }
  }

  useEffect(() => {
    if (receipt && trigger) {
      setTrigger(false)
      openBillReceiptPrintWindow(receipt, receiptOptions)
    }
  }, [receipt, trigger])

  return (
    <Button size='icon' variant='ghost' onClick={handleClick} disabled={isLoading} title='Print Receipt'>
      <Printer className='h-4 w-4' />
    </Button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const AGENT_BILL_EMAIL = 'bilalmulazim7086@gmail.com'

export default function BillPaymentsPage() {
  const routeSearch = useSearch({ from: '/_authenticated/mobile-shop/bill-payments' })
  const initialFilters = getInitialBillListFilters(routeSearch.filter)

  const currentUser = useSelector((state: RootState) => state.auth.data?.user)
  const isAgentUser = currentUser?.email === AGENT_BILL_EMAIL
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !currentUser?.organizationId })
  const agentBillReceiptOptions = {
    orgName: branchData?.name || orgData?.name,
    branchDetails: {
      name: branchData?.name,
      address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', '),
      phone: branchData?.phone,
      email: branchData?.email,
      invoiceNote: branchData?.invoiceNote,
    },
    logo: orgData?.logo?.url,
  }

  const [activeTab, setActiveTab] = useState<ActiveTab>('bills')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [agentBillOpen, setAgentBillOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BillPaymentRecord | null>(null)
  const [markPaidTarget, setMarkPaidTarget] = useState<BillPaymentRecord | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>(initialFilters.filterStatus)
  const [filterBillType, setFilterBillType] = useState<string>('all')
  const [form, setForm] = useState<BatchFormState>(makeInitialBatchForm())
  // Outstanding (unpaid) bills found for a Ref # typed into the New Bill rows below —
  // surfaces arrears from a previous period so the customer isn't re-billed for
  // charges already collected, and the old bill gets settled (with its true
  // late-payment cost) instead of silently forgotten.
  const [outstandingByRow, setOutstandingByRow] = useState<Record<number, BillPaymentRecord[]>>({})
  const [lookupOutstanding] = useLazyGetBillPaymentsQuery()
  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  // Collecting a bill payment at the counter is money-in — hide wallet balances.
  const billPaymentMethodOptions = buildMergedPaymentOptions(
    [
      { value: 'cash', label: 'Cash' },
      { value: 'bank', label: 'Bank Transfer' },
    ],
    wallets,
    false,
  )

  // Due date filter state
  const [dueDatePreset, setDueDatePreset] = useState<DatePreset>(initialFilters.dueDatePreset)
  const [dueStartDate, setDueStartDate] = useState(initialFilters.dueStartDate)
  const [dueEndDate, setDueEndDate] = useState(initialFilters.dueEndDate)
  const [dateFilterBy, setDateFilterBy] = useState<BillDateFilterBy>(initialFilters.dateFilterBy)

  useEffect(() => {
    const next = getInitialBillListFilters(routeSearch.filter)
    setDueDatePreset(next.dueDatePreset)
    setDueStartDate(next.dueStartDate)
    setDueEndDate(next.dueEndDate)
    setDateFilterBy(next.dateFilterBy)
    setFilterStatus(next.filterStatus)
    setPage(1)
  }, [routeSearch.filter])

  const limit = 10

  const { data: companiesData } = useGetUtilityCompaniesQuery({ isActive: true })
  const activeCompanies = companiesData?.results ?? []

  const billQuery: Record<string, unknown> = { page, limit }
  if (search) billQuery.search = search
  if (filterStatus !== 'all') billQuery.status = filterStatus
  if (filterBillType !== 'all') billQuery.billType = filterBillType
  if (dueStartDate) billQuery.dueStartDate = dueStartDate
  if (dueEndDate) billQuery.dueEndDate = dueEndDate
  billQuery.dateFilterBy = dateFilterBy

  const { data, isLoading } = useGetBillPaymentsQuery(billQuery as any)
  const [createBatchBills, { isLoading: isCreating }] = useCreateBillPaymentsBatchMutation()
  const [settleCombined, { isLoading: isSettlingCombined }] = useSettleCombinedBillMutation()
  const [deleteBill, { isLoading: isDeleting }] = useDeleteBillPaymentMutation()

  const bills = data?.results ?? []
  const totalPages = data?.totalPages ?? 1

  // Agent Bill Records (bilalmulazim7086@gmail.com only)
  const [agentBillPage, setAgentBillPage] = useState(1)
  const agentBillLimit = 10
  const { data: agentBillData, isLoading: agentBillsLoading } = useGetAgentBillsQuery(
    isAgentUser ? { page: agentBillPage, limit: agentBillLimit } : undefined,
    { skip: !isAgentUser },
  )
  const [deleteAgentBill, { isLoading: isDeletingAgentBill }] = useDeleteAgentBillMutation()
  const agentBills = agentBillData?.results ?? []
  const agentBillTotalPages = agentBillData?.totalPages ?? 1

  const svcCharge = parseFloat(form.serviceCharge || '0') || 0
  const billsTotal = form.bills.reduce((sum, b) => sum + (parseFloat(b.billAmount) || 0), 0)
  const totalServiceCharge = svcCharge * form.bills.filter((b) => parseFloat(b.billAmount) > 0).length
  const grandTotal = billsTotal + totalServiceCharge

  const handlePresetChange = (preset: DatePreset, start: string, end: string) => {
    setDueDatePreset(preset)
    setDueStartDate(start)
    setDueEndDate(end)
    setPage(1)
  }

  const handleCustomDueDateChange = (start: string, end: string) => {
    setDueDatePreset('all')
    setDueStartDate(start)
    setDueEndDate(end)
    setPage(1)
  }

  const handleCompanyChange = (companyId: string) => {
    const company = activeCompanies.find((c) => c.id === companyId)
    if (!company) return
    setForm((f) => ({
      ...f,
      companyId,
      companyName: company.name,
      billType: company.billType,
      serviceCharge: String(company.defaultServiceCharge),
    }))
  }

  const updateBillRow = useCallback((index: number, field: keyof BillRow, value: string) => {
    setForm((f) => {
      const bills = [...f.bills]
      bills[index] = { ...bills[index], [field]: value }
      return { ...f, bills }
    })
  }, [])

  const addBillRow = useCallback(() => {
    setForm((f) => ({ ...f, bills: [...f.bills, makeEmptyBillRow()] }))
  }, [])

  // Fires when a Ref # field loses focus — looks for any not-yet-paid bill that
  // already used this reference (last month's arrears) so the cashier sees it
  // before re-billing the customer for charges already collected.
  const checkOutstandingForRow = useCallback(async (index: number, referenceNumber: string) => {
    const ref = referenceNumber.trim()
    if (!ref) {
      setOutstandingByRow((prev) => {
        if (!prev[index]) return prev
        const next = { ...prev }
        delete next[index]
        return next
      })
      return
    }
    const result = await lookupOutstanding({ search: ref, limit: 5 }).unwrap().catch(() => null)
    const matches = (result?.results ?? []).filter(
      (b) => b.referenceNumber === ref && b.status !== 'paid',
    )
    setOutstandingByRow((prev) => ({ ...prev, [index]: matches }))
  }, [lookupOutstanding])

  const removeBillRow = useCallback((index: number) => {
    setOutstandingByRow((prev) => {
      if (!prev[index]) return prev
      const next = { ...prev }
      delete next[index]
      return next
    })
    setForm((f) => {
      if (f.bills.length <= 1) return f
      return { ...f, bills: f.bills.filter((_, i) => i !== index) }
    })
  }, [])

  const billAmountRefs = useRef<(HTMLInputElement | null)[]>([])
  const billCustomerRefs = useRef<(HTMLInputElement | null)[]>([])
  const billRefRefs = useRef<(HTMLInputElement | null)[]>([])
  const submitBillRef = useRef<() => void>(() => {})

  const handleBillRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, field: 'amount' | 'customer' | 'ref', index: number) => {
      if (e.key !== 'Enter') return
      if (e.ctrlKey || e.metaKey) {
        if (!e.shiftKey && !e.altKey) {
          e.preventDefault()
          submitBillRef.current()
        }
        return
      }
      if (e.shiftKey) return
      e.preventDefault()
      if (field === 'amount') {
        billCustomerRefs.current[index]?.focus()
        return
      }
      if (field === 'customer') {
        billRefRefs.current[index]?.focus()
        return
      }
      const isLast = index === form.bills.length - 1
      if (isLast) {
        addBillRow()
        setTimeout(() => billAmountRefs.current[index + 1]?.focus(), 0)
      } else {
        billAmountRefs.current[index + 1]?.focus()
      }
    },
    [form.bills.length, addBillRow],
  )

  const handleBillAmountKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      handleBillRowKeyDown(e, 'amount', index)
    },
    [handleBillRowKeyDown],
  )

  const handleSubmit = async () => {
    if (!form.companyId) return toast.error('Please select a company')
    if (!form.dueDate) return toast.error('Due date is required')

    const validBills = form.bills.filter((row) => (parseFloat(row.billAmount) || 0) > 0)

    if (validBills.length === 0) return toast.error('At least one bill with amount > 0 is required')

    try {
      const payload: CreateBillPaymentsBatchInput = {
        companyId: form.companyId,
        companyName: form.companyName,
        billType: form.billType as CreateBillPaymentsBatchInput['billType'],
        serviceCharge: svcCharge,
        dueDate: form.dueDate,
        paymentMethod: form.paymentMethod as CreateBillPaymentsBatchInput['paymentMethod'],
        walletType: form.paymentMethod === 'wallet' ? form.walletType : undefined,
        bills: validBills.map((row) => ({
          billAmount: parseFloat(row.billAmount),
          // Captured now, straight off the physical bill, so Mark-as-Paid already
          // knows the after-due figure instead of the cashier guessing it later.
          expectedLateAmount: parseFloat(row.afterDueAmount) || undefined,
          customerName: row.customerName || undefined,
          referenceNumber: row.referenceNumber || undefined,
        })),
      }
      await createBatchBills(payload).unwrap()

      toast.success(`${validBills.length} bill(s) recorded as pending`)
      setForm(makeInitialBatchForm())
      setOutstandingByRow({})
      setDialogOpen(false)
    } catch {
      toast.error('Failed to record bills')
    }
  }

  submitBillRef.current = handleSubmit

  // Collects only the net difference from the customer right now: creates this
  // row's new bill and settles the matched old one in one combined action, with a
  // single net Cash Book/wallet entry instead of two larger ones that net out.
  const handleSettleCombined = async (row: BillRow, oldBill: BillPaymentRecord) => {
    if (!form.companyId) return toast.error('Please select a company')
    if (!form.dueDate) return toast.error('Due date is required')
    const billAmount = parseFloat(row.billAmount) || 0
    if (billAmount <= 0) return toast.error('Enter this bill\'s amount first')
    const oldOwed = oldBill.expectedLateAmount ?? oldBill.billAmount

    try {
      await settleCombined({
        newBill: {
          companyId: form.companyId,
          companyName: form.companyName,
          billType: form.billType as CreateBillPaymentsBatchInput['billType'],
          serviceCharge: svcCharge,
          dueDate: form.dueDate,
          paymentMethod: form.paymentMethod as CreateBillPaymentsBatchInput['paymentMethod'],
          walletType: form.paymentMethod === 'wallet' ? form.walletType : undefined,
          billAmount,
          expectedLateAmount: parseFloat(row.afterDueAmount) || undefined,
          customerName: row.customerName || 'Walk-in',
          referenceNumber: row.referenceNumber || oldBill.referenceNumber,
        },
        oldBillId: oldBill.id,
        actualOldBillAmount: oldOwed,
      }).unwrap()

      toast.success('Settled — net amount recorded in Cash Book')
      setForm(makeInitialBatchForm())
      setOutstandingByRow({})
      setDialogOpen(false)
    } catch {
      toast.error('Failed to settle combined bill')
    }
  }

  const billHeaderEnter = useMemo(
    () =>
      makeEnterChain(
        [
          'bill-company',
          'bill-service-charge',
          'bill-due-date',
          'bill-payment-date',
          'bill-payment-method',
        ],
        {
          onSubmit: () => handleSubmit(),
          onLast: () => {
            window.setTimeout(() => billAmountRefs.current[0]?.focus(), 50)
          },
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useCtrlEnterSubmit(() => {
    if (dialogOpen) handleSubmit()
  }, isCreating)

  useEffect(() => {
    if (dialogOpen) {
      window.setTimeout(() => billHeaderEnter.focusFirst(), 100)
    }
  }, [dialogOpen, billHeaderEnter])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteBill(deleteTarget.id).unwrap()
      toast.success('Bill deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete bill')
    }
  }

  return (
    <MobilePageShell
      title='Bill Payments'
      description={`Collect utility bills (electricity, gas, water, internet) and earn service charges. · ${MOBILE_FORM_KEYBOARD_HINT}`}
    >
      {/* Summary Cards */}
      <OverallReportCards dueStartDate={dueStartDate} dueEndDate={dueEndDate} dateFilterBy={dateFilterBy} />

      <div className='mt-6'>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
          <div className='mb-4 flex items-center justify-between'>
            <TabsList>
              <TabsTrigger value='bills'>Bills</TabsTrigger>
              <TabsTrigger value='companies'>Companies</TabsTrigger>
            </TabsList>
            {activeTab === 'bills' && (
              <div className='flex items-center gap-2'>
                {isAgentUser && (
                  <Button variant='outline' onClick={() => setAgentBillOpen(true)}>
                    <Plus className='mr-1 h-4 w-4' />
                    Agent Bill
                  </Button>
                )}
                <Button onClick={() => { setOutstandingByRow({}); setDialogOpen(true) }}>
                  <Plus className='mr-1 h-4 w-4' />
                  New Bill
                </Button>
              </div>
            )}
          </div>

          {/* ── Bills Tab ── */}
          {activeTab === 'bills' && (
            <div className='space-y-4'>
              {/* Due Date Filter Panel */}
              <DueDateFilterPanel
                dueStartDate={dueStartDate}
                dueEndDate={dueEndDate}
                dateFilterBy={dateFilterBy}
                preset={dueDatePreset}
                onPresetChange={handlePresetChange}
                onCustomChange={handleCustomDueDateChange}
                onDateFilterByChange={(mode) => {
                  saveBillDateFilterBy(mode)
                  setDateFilterBy(mode)
                  setPage(1)
                }}
              />
              <Card>
              <CardHeader>
                <CardTitle className='text-base'>Bill Records</CardTitle>
                <div className='flex flex-wrap gap-2 pt-2'>
                  {/* Search */}
                  <div className='relative flex-1 min-w-[180px]'>
                    <Search className='text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4' />
                    <Input
                      placeholder='Search by name or ref #'
                      className='pl-8'
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                  </div>
                  {/* Status filter */}
                  <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1) }}>
                    <SelectTrigger className='w-[140px]'>
                      <SelectValue placeholder='Status' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Statuses</SelectItem>
                      <SelectItem value='paid'>Paid</SelectItem>
                      <SelectItem value='pending'>Pending</SelectItem>
                      <SelectItem value='overdue'>Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Bill type filter */}
                  <Select value={filterBillType} onValueChange={(v) => { setFilterBillType(v); setPage(1) }}>
                    <SelectTrigger className='w-[140px]'>
                      <SelectValue placeholder='Bill Type' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Types</SelectItem>
                      {BILL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {BILL_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className='text-muted-foreground text-sm'>Loading…</p>
                ) : bills.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>No bills found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Ref #</TableHead>
                        <TableHead>Bill Amt</TableHead>
                        <TableHead>Svc Charge</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Paid Amt</TableHead>
                        <TableHead>Loss</TableHead>
                        <TableHead>Collection Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills.map((bill) => (
                        <TableRow key={bill.id}>
                          <TableCell className='font-medium'>{bill.customerName}</TableCell>
                          <TableCell>{bill.companyName}</TableCell>
                          <TableCell className='font-mono text-xs'>{bill.referenceNumber}</TableCell>
                          <TableCell>Rs. {bill.billAmount.toLocaleString()}</TableCell>
                          <TableCell className='text-green-600 font-medium'>Rs. {bill.serviceCharge.toLocaleString()}</TableCell>
                          <TableCell className='font-semibold'>
                            Rs. {bill.totalReceived.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {bill.status === 'paid' ? (
                              `Rs. ${(bill.actualBillAmount ?? bill.billAmount).toLocaleString()}`
                            ) : bill.status === 'overdue' ? (
                              <span className='text-xs text-red-600'>
                                {bill.expectedLateAmount
                                  ? <>You will pay Rs. {bill.expectedLateAmount.toLocaleString()}</>
                                  : 'Pay after due'}
                              </span>
                            ) : bill.expectedLateAmount ? (
                              <span className='text-xs text-amber-700'>
                                Est. Rs. {bill.expectedLateAmount.toLocaleString()} if late
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className={bill.latePaymentLoss ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                            {bill.latePaymentLoss ? `Rs. ${bill.latePaymentLoss.toLocaleString()}` : '—'}
                          </TableCell>
                          <TableCell>
                            {bill.createdAt
                              ? formatBusinessDate(bill.createdAt)
                              : bill.paymentDate
                                ? formatBusinessDate(bill.paymentDate)
                                : '—'}
                          </TableCell>
                          <TableCell>
                            {formatBusinessDate(bill.dueDate)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[bill.status] ?? 'secondary'}>
                              {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-right space-x-1'>
                            {/* Mark as Paid — only for pending/overdue */}
                            {bill.status !== 'paid' && (
                              <Button
                                size='icon'
                                variant='ghost'
                                onClick={() => setMarkPaidTarget(bill)}
                                title='Mark as Paid'
                              >
                                <CheckCircle2 className='h-4 w-4 text-green-600' />
                              </Button>
                            )}
                            {/* Print receipt — cash is collected from the customer at
                                creation, so a receipt is valid immediately, not just
                                once the shop has settled with the utility company. */}
                            <PrintReceiptButton billId={bill.id} />
                            <Button
                              size='icon'
                              variant='ghost'
                              onClick={() => setDeleteTarget(bill)}
                              title='Delete'
                            >
                              <Trash2 className='h-4 w-4 text-destructive' />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className='mt-4'>
                  <SimplePagination currentPage={page} totalPages={totalPages} limit={limit} onPageChange={setPage} />
                </div>
              </CardContent>
            </Card>

            {/* ── Agent Bill Records (bilalmulazim7086@gmail.com only) ── */}
            {isAgentUser && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Agent Bill Records</CardTitle>
                </CardHeader>
                <CardContent className='p-0'>
                  {agentBillsLoading ? (
                    <div className='flex justify-center py-8'>
                      <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
                    </div>
                  ) : agentBills.length === 0 ? (
                    <div className='py-10 text-center text-sm text-muted-foreground'>No agent bills found.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Ref #</TableHead>
                          <TableHead>Mobile</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className='text-right'>Current Bill</TableHead>
                          <TableHead className='text-right'>Previous Bill</TableHead>
                          <TableHead className='text-right'>Overdue</TableHead>
                          <TableHead className='text-right'>Profit</TableHead>
                          <TableHead className='text-right'>Total</TableHead>
                          <TableHead className='text-right'>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agentBills.map((bill: AgentBillRecord, idx: number) => (
                          <TableRow key={bill.id}>
                            <TableCell className='text-muted-foreground text-xs'>
                              {(agentBillPage - 1) * agentBillLimit + idx + 1}
                            </TableCell>
                            <TableCell className='font-medium'>{bill.customerName}</TableCell>
                            <TableCell className='font-mono text-xs'>{bill.referenceNumber}</TableCell>
                            <TableCell className='text-sm'>{bill.mobileNo || '—'}</TableCell>
                            <TableCell className='text-sm'>{bill.companyName || '—'}</TableCell>
                            <TableCell className='text-sm'>
                              {bill.dueDate
                                ? new Date(bill.dueDate).toLocaleDateString('en-PK', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell className='text-right text-sm'>
                              {bill.currentBillAmount > 0 ? `Rs. ${bill.currentBillAmount.toLocaleString('en-PK')}` : '—'}
                            </TableCell>
                            <TableCell className='text-right text-sm'>
                              {bill.previousBillAmount > 0 ? `Rs. ${bill.previousBillAmount.toLocaleString('en-PK')}` : '—'}
                            </TableCell>
                            <TableCell className='text-right text-sm'>
                              {bill.overdueAmount > 0 ? `Rs. ${bill.overdueAmount.toLocaleString('en-PK')}` : '—'}
                            </TableCell>
                            <TableCell className='text-right text-sm'>
                              {bill.profit > 0 ? `Rs. ${bill.profit.toLocaleString('en-PK')}` : '—'}
                            </TableCell>
                            <TableCell className='text-right font-semibold text-sm'>
                              Rs. {bill.totalAmount.toLocaleString('en-PK')}
                            </TableCell>
                            <TableCell className='text-right'>
                              <Button
                                size='icon'
                                variant='ghost'
                                title='Print receipt'
                                onClick={() => openAgentBillPrintWindow(bill, agentBillReceiptOptions)}
                              >
                                <Printer className='h-4 w-4' />
                              </Button>
                              <Button
                                size='icon'
                                variant='ghost'
                                title='Delete'
                                disabled={isDeletingAgentBill}
                                onClick={async () => {
                                  if (!confirm(`Delete bill for ${bill.customerName}?`)) return
                                  await deleteAgentBill(bill.id)
                                }}
                              >
                                <Trash2 className='h-4 w-4 text-destructive' />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <div className='mt-4 px-4 pb-4'>
                    <SimplePagination
                      currentPage={agentBillPage}
                      totalPages={agentBillTotalPages}
                      limit={agentBillLimit}
                      onPageChange={setAgentBillPage}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
            </div>
          )}

          {/* ── Companies Tab ── */}
          {activeTab === 'companies' && <UtilityCompanyManager />}
        </Tabs>
      </div>

      {/* ── Agent Bill Dialog (bilalmulazim7086@gmail.com only) ── */}
      {isAgentUser && (
        <AgentBillDialog open={agentBillOpen} onOpenChange={setAgentBillOpen} />
      )}

      {/* ── Mark as Paid Dialog ── */}
      <MarkPaidDialog bill={markPaidTarget} onClose={() => setMarkPaidTarget(null)} />

      {/* ── New Bill Dialog (Multi-bill) ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>New Bill Payment</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            {/* Company */}
            <div className='grid gap-4 sm:grid-cols-2'>
              <div>
                <Label>Company *</Label>
                <Select value={form.companyId} onValueChange={handleCompanyChange}>
                  <SelectTrigger {...billHeaderEnter.enterProps('bill-company')}>
                    <SelectValue placeholder='Select utility company' />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCompanies.length === 0 ? (
                      <SelectItem value='__none__' disabled>
                        No companies. Add from Companies tab.
                      </SelectItem>
                    ) : (
                      activeCompanies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({BILL_TYPE_LABELS[c.billType]})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Service Charge per Bill (Rs.)</Label>
                <Input
                  type='number'
                  min='0'
                  step='1'
                  value={form.serviceCharge}
                  onChange={(e) => setForm((f) => ({ ...f, serviceCharge: e.target.value }))}
                  {...billHeaderEnter.enterProps('bill-service-charge')}
                />
              </div>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div>
                <Label>Due Date *</Label>
                <Input
                  type='date'
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  {...billHeaderEnter.enterProps('bill-due-date')}
                />
              </div>
              <div>
                <Label>Payment Method *</Label>
                <Select
                  value={form.paymentMethod === 'wallet' && form.walletType ? toWalletOptionValue(form.walletType) : form.paymentMethod}
                  onValueChange={(v) => {
                    if (isWalletOptionValue(v)) {
                      setForm((f) => ({ ...f, paymentMethod: 'wallet', walletType: getWalletTypeFromOptionValue(v) }))
                    } else {
                      setForm((f) => ({ ...f, paymentMethod: v, walletType: '' }))
                    }
                  }}
                >
                  <SelectTrigger {...billHeaderEnter.enterProps('bill-payment-method')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {billPaymentMethodOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bills rows */}
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label className='text-sm font-semibold'>Bills ({form.bills.length})</Label>
                <Button type='button' variant='outline' size='sm' onClick={addBillRow}>
                  <Plus className='mr-1 h-3 w-3' />
                  Add Bill
                </Button>
              </div>

              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-[40px]'>#</TableHead>
                      <TableHead>Bill Amount (Rs.) *</TableHead>
                      <TableHead title="The higher figure printed on the same bill for paying after the due date — captured now so Mark-as-Paid already knows it">
                        After Due Date (Rs.)
                      </TableHead>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Ref #</TableHead>
                      <TableHead className='w-[50px]'></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.bills.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className='text-muted-foreground text-xs'>{i + 1}</TableCell>
                        <TableCell>
                          <Input
                            ref={(el) => { billAmountRefs.current[i] = el }}
                            type='number'
                            min='0.01'
                            step='1'
                            placeholder='0'
                            className='h-8'
                            value={row.billAmount}
                            onChange={(e) => updateBillRow(i, 'billAmount', e.target.value)}
                            onKeyDown={(e) => handleBillAmountKeyDown(e, i)}
                            autoFocus={i === 0}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type='number'
                            min={row.billAmount || '0'}
                            step='1'
                            placeholder='Optional'
                            className='h-8'
                            value={row.afterDueAmount}
                            onChange={(e) => updateBillRow(i, 'afterDueAmount', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            ref={(el) => { billCustomerRefs.current[i] = el }}
                            placeholder='Optional'
                            className='h-8'
                            value={row.customerName}
                            onChange={(e) => updateBillRow(i, 'customerName', e.target.value)}
                            onKeyDown={(e) => handleBillRowKeyDown(e, 'customer', i)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            ref={(el) => { billRefRefs.current[i] = el }}
                            placeholder='Optional'
                            className='h-8'
                            value={row.referenceNumber}
                            onChange={(e) => updateBillRow(i, 'referenceNumber', e.target.value)}
                            onKeyDown={(e) => handleBillRowKeyDown(e, 'ref', i)}
                            onBlur={(e) => checkOutstandingForRow(i, e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          {form.bills.length > 1 && (
                            <Button
                              type='button'
                              size='icon'
                              variant='ghost'
                              className='h-7 w-7'
                              onClick={() => removeBillRow(i)}
                            >
                              <Trash2 className='h-3.5 w-3.5 text-destructive' />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {form.bills.map((row, i) => {
                      const outstanding = outstandingByRow[i] ?? []
                      if (outstanding.length === 0) return null
                      const newBillAmount = parseFloat(row.billAmount) || 0
                      const nowCollecting = newBillAmount > 0 ? newBillAmount + svcCharge : 0
                      return (
                        <TableRow key={`warn-${i}`} className='bg-amber-50'>
                          <TableCell colSpan={6} className='max-w-0 py-2 whitespace-normal break-words'>
                            <div className='flex items-start gap-2 text-xs text-amber-800'>
                              <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                              <div className='min-w-0 flex-1 space-y-2.5'>
                                {outstanding.map((b) => {
                                  const oldOwed = b.expectedLateAmount ?? b.billAmount
                                  return (
                                    <div key={b.id} className='min-w-0 space-y-1'>
                                      <p className='break-words'>
                                        <strong>Row {i + 1}:</strong> Ref # {b.referenceNumber} — previously you
                                        received <strong>Rs. {b.totalReceived.toLocaleString()}</strong> from the
                                        customer but haven't paid the company yet ({b.status === 'overdue' ? 'overdue since' : 'due'}{' '}
                                        <strong>{formatBusinessDate(b.dueDate)}</strong>; you'll owe{' '}
                                        <strong>Rs. {oldOwed.toLocaleString()}</strong> for it).
                                      </p>
                                      {nowCollecting > 0 ? (
                                        <>
                                          <p className='break-words'>
                                            Now you will collect <strong>Rs. {nowCollecting.toLocaleString()}</strong>{' '}
                                            for this new bill (Rs. {newBillAmount.toLocaleString()} + Rs. {svcCharge.toLocaleString()}{' '}
                                            service charge) — your profit on it is{' '}
                                            <strong className='text-green-700'>Rs. {svcCharge.toLocaleString()}</strong>.
                                          </p>
                                          <p className='break-words'>
                                            If you settle the old bill at the same time: Rs. {nowCollecting.toLocaleString()} −{' '}
                                            Rs. {oldOwed.toLocaleString()} ={' '}
                                            <strong className={nowCollecting - oldOwed >= 0 ? 'text-green-700' : 'text-red-700'}>
                                              Rs. {(nowCollecting - oldOwed).toLocaleString()}
                                            </strong>{' '}
                                            net in hand.
                                          </p>
                                        </>
                                      ) : null}
                                      <div className='flex flex-wrap items-center gap-1.5'>
                                        {newBillAmount > 0 && (
                                          <Button
                                            type='button'
                                            size='sm'
                                            className='h-6 bg-green-700 px-2 text-[11px] hover:bg-green-800'
                                            disabled={isSettlingCombined}
                                            onClick={() => handleSettleCombined(row, b)}
                                          >
                                            Settle Now — Collect Rs. {(nowCollecting - oldOwed).toLocaleString()} Only
                                          </Button>
                                        )}
                                        <Button
                                          type='button'
                                          size='sm'
                                          variant='outline'
                                          className='h-6 border-amber-300 bg-white px-2 text-[11px]'
                                          onClick={() => {
                                            setDialogOpen(false)
                                            setMarkPaidTarget(b)
                                          }}
                                        >
                                          Settle old bill separately
                                        </Button>
                                      </div>
                                      <p className='text-[11px] text-amber-700'>
                                        "Settle Now" books only the net amount in the Cash Book. Or skip both —
                                        marking this new bill paid later will automatically settle the old one too.
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totals summary */}
            <div className='rounded-md bg-muted px-4 py-3 text-sm space-y-1'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Bills Total:</span>
                <strong>Rs. {billsTotal.toLocaleString()}</strong>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>
                  Service Charges ({form.bills.filter((b) => parseFloat(b.billAmount) > 0).length} × Rs. {svcCharge}):
                </span>
                <strong className='text-green-600'>Rs. {totalServiceCharge.toLocaleString()}</strong>
              </div>
              <div className='flex justify-between border-t pt-1.5'>
                <span className='font-semibold'>Total You Will Receive From Customer Now:</span>
                <strong className='text-base'>Rs. {grandTotal.toLocaleString()}</strong>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isCreating}>
              Save {form.bills.filter((b) => parseFloat(b.billAmount) > 0).length} Bill(s) as Pending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Bill Payment</DialogTitle>
          </DialogHeader>
          <p>
            Delete bill for <strong>{deleteTarget?.customerName}</strong> (Ref:{' '}
            <strong>{deleteTarget?.referenceNumber}</strong>)? This will also remove its cash book
            entry.
          </p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={handleDelete} disabled={isDeleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobilePageShell>
  )
}
