import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  useCreateBillPaymentMutation,
  useDeleteBillPaymentMutation,
  useUpdateBillPaymentMutation,
  useGetBillPaymentReportQuery,
  useGetUtilityCompaniesQuery,
  useGetBillPaymentReceiptQuery,
  useGetBillDueSummaryQuery,
  BILL_TYPES,
  type BillPaymentRecord,
  type CreateBillPaymentInput,
} from '@/stores/mobile-shop.api'
import { openBillReceiptPrintWindow } from './bill-receipt-utils'
import { UtilityCompanyManager } from './utility-company-manager'

// ─── Types ────────────────────────────────────────────────────────────────────

type BillFormState = {
  customerName: string
  billType: string
  companyId: string
  companyName: string
  referenceNumber: string
  billAmount: string
  serviceCharge: string
  dueDate: string
  paymentDate: string
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa'
  notes: string
}

type ActiveTab = 'bills' | 'companies'
type DatePreset = 'today' | 'tomorrow' | 'week' | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDateLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const addDays = (d: Date, n: number) => {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

const makeInitialForm = (): BillFormState => ({
  customerName: '',
  billType: 'electricity',
  companyId: '',
  companyName: '',
  referenceNumber: '',
  billAmount: '',
  serviceCharge: '0',
  dueDate: toDateLocal(new Date()),
  paymentDate: toDateLocal(new Date()),
  paymentMethod: 'cash',
  notes: '',
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

function OverallReportCards() {
  const { data: report, isLoading } = useGetBillPaymentReportQuery()

  const cards = [
    { label: 'Total Bills', value: report?.totalBills ?? 0, icon: FileText, cls: '', fmt: (v: number) => String(v) },
    { label: 'Total Collection', value: report?.totalCollection ?? 0, icon: Banknote, cls: '', fmt: (v: number) => `Rs. ${v.toLocaleString()}` },
    { label: 'Service Profit', value: report?.totalServiceCharges ?? 0, icon: TrendingUp, cls: 'text-green-600', fmt: (v: number) => `Rs. ${v.toLocaleString()}` },
    { label: 'Due Today', value: report?.totalDueToday ?? 0, icon: Clock, cls: 'text-yellow-600', fmt: (v: number) => String(v) },
    { label: 'Overdue', value: report?.totalOverdue ?? 0, icon: AlertCircle, cls: 'text-red-500', fmt: (v: number) => String(v) },
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
  preset: DatePreset
  onPresetChange: (preset: DatePreset, start: string, end: string) => void
  onCustomChange: (start: string, end: string) => void
}

function DueDateFilterPanel({ dueStartDate, dueEndDate, preset, onPresetChange, onCustomChange }: DueDateFilterProps) {
  const today = new Date()

  const applyPreset = (p: DatePreset) => {
    if (p === 'today') {
      const d = toDateLocal(today)
      onPresetChange(p, d, d)
    } else if (p === 'tomorrow') {
      const d = toDateLocal(addDays(today, 1))
      onPresetChange(p, d, d)
    } else if (p === 'week') {
      onPresetChange(p, toDateLocal(today), toDateLocal(addDays(today, 6)))
    } else {
      onPresetChange('all', '', '')
    }
  }

  const skip = !dueStartDate && !dueEndDate
  const summaryParams = skip ? undefined : { dueStartDate: dueStartDate || undefined, dueEndDate: dueEndDate || undefined }
  const { data: summary, isFetching } = useGetBillDueSummaryQuery(summaryParams, { skip })

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
        <div className='flex items-center gap-2'>
          <CalendarDays className='h-4 w-4 text-muted-foreground' />
          <span className='text-sm font-medium'>Filter by Due Date</span>
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

        {/* Dynamic summary (only when a date filter is active) */}
        {!skip && (
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
        )}
      </CardContent>
    </Card>
  )
}

// ─── Mark as Paid Dialog ──────────────────────────────────────────────────────

interface MarkPaidDialogProps {
  bill: BillPaymentRecord | null
  onClose: () => void
}

function MarkPaidDialog({ bill, onClose }: MarkPaidDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'jazzcash' | 'easypaisa'>('cash')
  const [paymentDate, setPaymentDate] = useState(toDateLocal(new Date()))
  const [updateBill, { isLoading }] = useUpdateBillPaymentMutation()

  useEffect(() => {
    if (bill) {
      setPaymentMethod(bill.paymentMethod)
      setPaymentDate(toDateLocal(new Date()))
    }
  }, [bill])

  const handleConfirm = async () => {
    if (!bill) return
    try {
      await updateBill({
        id: bill.id,
        body: { status: 'paid', paymentMethod, paymentDate },
      }).unwrap()
      toast.success('Bill marked as paid')
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
              <p><span className='text-muted-foreground'>Bill Amount: </span><strong>Rs. {bill.billAmount.toLocaleString()}</strong></p>
              <p><span className='text-muted-foreground'>Service Charge: </span><strong className='text-green-600'>Rs. {bill.serviceCharge.toLocaleString()}</strong></p>
              <p><span className='text-muted-foreground'>Total to Collect: </span><strong>Rs. {bill.totalReceived.toLocaleString()}</strong></p>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='cash'>Cash</SelectItem>
                  <SelectItem value='jazzcash'>JazzCash</SelectItem>
                  <SelectItem value='easypaisa'>Easypaisa</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

  const handleClick = () => {
    if (receipt) {
      openBillReceiptPrintWindow(receipt)
    } else {
      setTrigger(true)
    }
  }

  useEffect(() => {
    if (receipt && trigger) {
      setTrigger(false)
      openBillReceiptPrintWindow(receipt)
    }
  }, [receipt, trigger])

  return (
    <Button size='icon' variant='ghost' onClick={handleClick} disabled={isLoading} title='Print Receipt'>
      <Printer className='h-4 w-4' />
    </Button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillPaymentsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('bills')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BillPaymentRecord | null>(null)
  const [markPaidTarget, setMarkPaidTarget] = useState<BillPaymentRecord | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterBillType, setFilterBillType] = useState<string>('all')
  const [form, setForm] = useState<BillFormState>(makeInitialForm())

  // Due date filter state
  const [dueDatePreset, setDueDatePreset] = useState<DatePreset>('all')
  const [dueStartDate, setDueStartDate] = useState('')
  const [dueEndDate, setDueEndDate] = useState('')

  const limit = 10

  const { data: companiesData } = useGetUtilityCompaniesQuery({ isActive: true })
  const activeCompanies = companiesData?.results ?? []

  const billQuery: Record<string, unknown> = { page, limit }
  if (search) billQuery.search = search
  if (filterStatus !== 'all') billQuery.status = filterStatus
  if (filterBillType !== 'all') billQuery.billType = filterBillType
  if (dueStartDate) billQuery.dueStartDate = dueStartDate
  if (dueEndDate) billQuery.dueEndDate = dueEndDate

  const { data, isLoading } = useGetBillPaymentsQuery(billQuery as any)
  const [createBill, { isLoading: isCreating }] = useCreateBillPaymentMutation()
  const [deleteBill, { isLoading: isDeleting }] = useDeleteBillPaymentMutation()

  const bills = data?.results ?? []
  const totalPages = data?.totalPages ?? 1

  const totalReceived =
    parseFloat(form.billAmount || '0') + parseFloat(form.serviceCharge || '0')

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

  const handleSubmit = async () => {
    if (!form.customerName.trim()) return toast.error('Customer name is required')
    if (!form.companyId) return toast.error('Please select a company')
    if (!form.referenceNumber.trim()) return toast.error('Reference number is required')
    const billAmt = parseFloat(form.billAmount)
    if (isNaN(billAmt) || billAmt <= 0) return toast.error('Bill amount must be > 0')
    const svcCharge = parseFloat(form.serviceCharge)
    if (isNaN(svcCharge) || svcCharge < 0) return toast.error('Service charge must be ≥ 0')
    if (!form.dueDate) return toast.error('Due date is required')

    const payload: CreateBillPaymentInput = {
      customerName: form.customerName.trim(),
      billType: form.billType as CreateBillPaymentInput['billType'],
      companyId: form.companyId,
      companyName: form.companyName,
      referenceNumber: form.referenceNumber.trim(),
      billAmount: billAmt,
      serviceCharge: svcCharge,
      dueDate: form.dueDate,
      paymentDate: form.paymentDate || undefined,
      status: 'pending',
      paymentMethod: form.paymentMethod,
      notes: form.notes || undefined,
    }

    try {
      await createBill(payload).unwrap()
      toast.success('Bill recorded as pending')
      setForm(makeInitialForm())
      setDialogOpen(false)
    } catch {
      toast.error('Failed to record bill')
    }
  }

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
      description='Collect utility bills (electricity, gas, water, internet) and earn service charges.'
    >
      {/* Summary Cards */}
      <OverallReportCards />

      <div className='mt-6'>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
          <div className='mb-4 flex items-center justify-between'>
            <TabsList>
              <TabsTrigger value='bills'>Bills</TabsTrigger>
              <TabsTrigger value='companies'>Companies</TabsTrigger>
            </TabsList>
            {activeTab === 'bills' && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className='mr-1 h-4 w-4' />
                New Bill
              </Button>
            )}
          </div>

          {/* ── Bills Tab ── */}
          {activeTab === 'bills' && (
            <div className='space-y-4'>
              {/* Due Date Filter Panel */}
              <DueDateFilterPanel
                dueStartDate={dueStartDate}
                dueEndDate={dueEndDate}
                preset={dueDatePreset}
                onPresetChange={handlePresetChange}
                onCustomChange={handleCustomDueDateChange}
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
                            {new Date(bill.dueDate).toLocaleDateString('en-PK')}
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
                            {/* Print receipt — only for paid */}
                            {bill.status === 'paid' && (
                              <PrintReceiptButton billId={bill.id} />
                            )}
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
            </div>
          )}

          {/* ── Companies Tab ── */}
          {activeTab === 'companies' && <UtilityCompanyManager />}
        </Tabs>
      </div>

      {/* ── Mark as Paid Dialog ── */}
      <MarkPaidDialog bill={markPaidTarget} onClose={() => setMarkPaidTarget(null)} />

      {/* ── New Bill Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>New Bill Payment</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            {/* Company */}
            <div>
              <Label>Company *</Label>
              <Select value={form.companyId} onValueChange={handleCompanyChange}>
                <SelectTrigger>
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

            {/* Customer Name */}
            <div>
              <Label>Customer Name *</Label>
              <Input
                placeholder='Customer name'
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
              />
            </div>

            {/* Reference Number */}
            <div>
              <Label>Reference Number *</Label>
              <Input
                placeholder='Bill reference / consumer number'
                value={form.referenceNumber}
                onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
              />
            </div>

            {/* Bill Amount */}
            <div>
              <Label>Bill Amount (Rs.) *</Label>
              <Input
                type='number'
                min='0.01'
                step='1'
                placeholder='0'
                value={form.billAmount}
                onChange={(e) => setForm((f) => ({ ...f, billAmount: e.target.value }))}
              />
            </div>

            {/* Service Charge */}
            <div>
              <Label>Service Charge (Rs.) *</Label>
              <Input
                type='number'
                min='0'
                step='1'
                value={form.serviceCharge}
                onChange={(e) => setForm((f) => ({ ...f, serviceCharge: e.target.value }))}
              />
            </div>

            {/* Total (read-only) */}
            <div className='rounded-md bg-muted px-4 py-2 text-sm'>
              <span className='text-muted-foreground'>Total to Collect: </span>
              <strong>Rs. {isNaN(totalReceived) ? '0' : totalReceived.toLocaleString()}</strong>
              <span className='text-green-600 ml-3 text-xs'>
                (Profit: Rs. {isNaN(parseFloat(form.serviceCharge)) ? '0' : parseFloat(form.serviceCharge).toLocaleString()})
              </span>
            </div>

            {/* Due Date */}
            <div>
              <Label>Due Date *</Label>
              <Input
                type='date'
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>

            {/* Payment Date */}
            <div>
              <Label>Payment Date</Label>
              <Input
                type='date'
                value={form.paymentDate}
                onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              />
            </div>

            {/* Payment Method */}
            <div>
              <Label>Payment Method *</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, paymentMethod: v as BillFormState['paymentMethod'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='cash'>Cash</SelectItem>
                  <SelectItem value='jazzcash'>JazzCash</SelectItem>
                  <SelectItem value='easypaisa'>Easypaisa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes (optional)</Label>
              <Input
                placeholder='Optional notes'
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isCreating}>
              Save as Pending
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
