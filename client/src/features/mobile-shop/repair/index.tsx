import { useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Printer, Trash2, CheckCircle, PackageCheck, Eye } from 'lucide-react'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { MobilePageShell } from '../components/mobile-page-shell'
import {
  useCreateRepairJobMutation,
  useDeleteRepairJobMutation,
  useGetRepairJobsQuery,
  useUpdateRepairJobMutation,
  type RepairJobRecord,
} from '@/stores/mobile-shop.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import { type RootState } from '@/stores/store'
import { generateRepairReceiptHTML, openRepairPrintWindow } from './repair-print-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type RepairFormState = {
  customerName: string
  phone: string
  deviceModel: string
  serialNumber: string
  color: string
  accessories: string
  issue: string
  technician: string
  charges: string
  advanceAmount: string
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank'
  date: string
}

type CompleteDialogState = {
  open: boolean
  repair: RepairJobRecord | null
  charges: string
  advanceAmount: string
  cost: string
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank'
}

type DeliverDialogState = {
  open: boolean
  repair: RepairJobRecord | null
  receivedNow: string
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDateTimeLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const makeInitialForm = (): RepairFormState => ({
  customerName: '',
  phone: '',
  deviceModel: '',
  serialNumber: '',
  color: '',
  accessories: '',
  issue: '',
  technician: '',
  charges: '0',
  advanceAmount: '0',
  paymentMethod: 'cash',
  date: toDateTimeLocal(new Date()),
})

const statusConfig: Record<string, { label: string; color: string }> = {
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  delivered: { label: 'Delivered', color: 'bg-purple-100 text-purple-800' },
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString()}`

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RepairPage() {
  const [form, setForm] = useState<RepairFormState>(makeInitialForm)
  const [activeTab, setActiveTab] = useState('all')
  const [repairPage, setRepairPage] = useState(1)
  const [repairLimit, setRepairLimit] = useState(10)
  const [printRepair, setPrintRepair] = useState<RepairJobRecord | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<RepairJobRecord | null>(null)
  const [completeDialog, setCompleteDialog] = useState<CompleteDialogState>({
    open: false,
    repair: null,
    charges: '0',
    advanceAmount: '0',
    cost: '0',
    paymentMethod: 'cash',
  })
  const [deliverDialog, setDeliverDialog] = useState<DeliverDialogState>({
    open: false,
    repair: null,
    receivedNow: '0',
    paymentMethod: 'cash',
  })
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })

  const { data } = useGetRepairJobsQuery({
    page: repairPage,
    limit: repairLimit,
    ...(activeTab !== 'all' ? { status: activeTab } : {}),
  })
  const [createRepairJob, { isLoading: isSaving }] = useCreateRepairJobMutation()
  const [updateRepairJob, { isLoading: isUpdating }] = useUpdateRepairJobMutation()
  const [deleteRepairJob] = useDeleteRepairJobMutation()

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setRepairPage(1)
  }

  const setField = <K extends keyof RepairFormState>(key: K, value: RepairFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // ── Submit create ──
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.customerName.trim() || !form.deviceModel.trim() || !form.issue.trim()) {
      toast.error('Customer name, device model and issue are required')
      return
    }
    try {
      const created = await createRepairJob({
        ...form,
        status: 'in_progress',
        charges: Number(form.charges),
        advanceAmount: Number(form.advanceAmount),
        date: form.date || new Date().toISOString(),
      } as any).unwrap()
      toast.success('Repair job created')
      setForm(makeInitialForm())
      // Auto-open print dialog
      setPrintRepair(created as unknown as RepairJobRecord)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to create repair job')
    }
  }


  // ── Open complete dialog ──
  const openCompleteDialog = (repair: RepairJobRecord) => {
    setCompleteDialog({
      open: true,
      repair,
      charges: String(repair.charges ?? 0),
      advanceAmount: String(repair.advanceAmount ?? 0),
      cost: String(repair.cost ?? 0),
      paymentMethod: repair.paymentMethod ?? 'cash',
    })
  }

  // ── Save complete ──
  const handleCompleteSubmit = async () => {
    if (!completeDialog.repair) return
    const charges = Number(completeDialog.charges)
    const advanceAmount = Number(completeDialog.advanceAmount)
    const cost = Number(completeDialog.cost)
    if (charges < 0 || advanceAmount < 0 || cost < 0) {
      toast.error('Amounts cannot be negative')
      return
    }
    try {
      const updated = await updateRepairJob({
        id: completeDialog.repair.id,
        body: {
          charges,
          advanceAmount,
          cost,
          paymentMethod: completeDialog.paymentMethod,
          status: 'completed',
        },
      }).unwrap()
      toast.success('Job marked as completed')
      setCompleteDialog({ open: false, repair: null, charges: '0', advanceAmount: '0', cost: '0', paymentMethod: 'cash' })
      setPrintRepair(updated as unknown as RepairJobRecord)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update charges')
    }
  }

  // ── Open deliver dialog ──
  const openDeliverDialog = (repair: RepairJobRecord) => {
    const remaining = (repair.charges ?? 0) - (repair.advanceAmount ?? 0)
    setDeliverDialog({
      open: true,
      repair,
      receivedNow: String(Math.max(0, remaining)),
      paymentMethod: repair.paymentMethod ?? 'cash',
    })
  }

  // ── Save deliver ──
  const handleDeliverSubmit = async () => {
    if (!deliverDialog.repair) return
    const received = Number(deliverDialog.receivedNow)
    if (received < 0) {
      toast.error('Amount cannot be negative')
      return
    }
    try {
      const newAdvance = (deliverDialog.repair.advanceAmount ?? 0) + received
      const updated = await updateRepairJob({
        id: deliverDialog.repair.id,
        body: {
          advanceAmount: newAdvance,
          paymentMethod: deliverDialog.paymentMethod,
          status: 'delivered',
        },
      }).unwrap()
      toast.success('Device delivered & payment recorded')
      setDeliverDialog({ open: false, repair: null, receivedNow: '0', paymentMethod: 'cash' })
      setPrintRepair(updated as unknown as RepairJobRecord)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update delivery')
    }
  }

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deleteRepairJob(deleteConfirm.id).unwrap()
      toast.success('Repair job deleted')
      setDeleteConfirm(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete')
    }
  }

  // ── Print ──
  const handlePrint = () => {
    if (!printRepair) return
    const html = generateRepairReceiptHTML({
      customerName: printRepair.customerName,
      phone: printRepair.phone,
      deviceModel: printRepair.deviceModel,
      serialNumber: printRepair.serialNumber,
      color: printRepair.color,
      accessories: printRepair.accessories,
      issue: printRepair.issue,
      technician: printRepair.technician,
      status: printRepair.status,
      charges: printRepair.charges ?? 0,
      advanceAmount: printRepair.advanceAmount ?? 0,
      paymentMethod: printRepair.paymentMethod ?? 'cash',
      date: printRepair.date,
      companyName: branchData?.name,
      companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
        .filter(Boolean)
        .join(', ') || undefined,
      companyPhone: branchData?.phone,
      companyEmail: branchData?.email,
    })
    openRepairPrintWindow(html)
  }

  // ── Filter (server-side via status param; results are already filtered) ──
  const allRepairs = data?.results ?? []
  // For the "all" tab the server returns all statuses, we display as-is
  const filtered = allRepairs

  const tabCounts = {
    all: activeTab === 'all' ? (data?.totalResults ?? 0) : '…',
    in_progress: activeTab === 'in_progress' ? (data?.totalResults ?? 0) : '…',
    completed: activeTab === 'completed' ? (data?.totalResults ?? 0) : '…',
    delivered: activeTab === 'delivered' ? (data?.totalResults ?? 0) : '…',
  }

  return (
    <MobilePageShell
      title='Repair Management'
      description='Track repair jobs, technicians, advances, and delivery status.'
    >
      <div className='grid gap-6 xl:grid-cols-[440px_1fr]'>
        {/* ── Create Form ── */}
        <Card>
          <CardHeader>
            <CardTitle>New Repair Job</CardTitle>
          </CardHeader>
          <CardContent>
            <form className='grid gap-3' onSubmit={handleSubmit}>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>Customer Name *</Label>
                  <Input
                    placeholder='e.g. Ahmad Khan'
                    value={form.customerName}
                    onChange={(e) => setField('customerName', e.target.value)}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Phone Number</Label>
                  <Input
                    placeholder='03xx-xxxxxxx'
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                </div>
              </div>

              <div className='grid gap-3 sm:grid-cols-3'>
                <div className='space-y-1'>
                  <Label>Device Model *</Label>
                  <Input
                    placeholder='e.g. Samsung A54'
                    value={form.deviceModel}
                    onChange={(e) => setField('deviceModel', e.target.value)}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Color</Label>
                  <Input
                    placeholder='e.g. Black'
                    value={form.color}
                    onChange={(e) => setField('color', e.target.value)}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Serial / IMEI</Label>
                  <Input
                    placeholder='IMEI or serial'
                    value={form.serialNumber}
                    onChange={(e) => setField('serialNumber', e.target.value)}
                  />
                </div>
              </div>

              <div className='space-y-1'>
                <Label>Accessories Received</Label>
                <Input
                  placeholder='e.g. Charger, Back cover, SIM tray'
                  value={form.accessories}
                  onChange={(e) => setField('accessories', e.target.value)}
                />
              </div>

              <div className='space-y-1'>
                <Label>Issue / Fault Details *</Label>
                <Textarea
                  placeholder='Describe the problem...'
                  rows={3}
                  value={form.issue}
                  onChange={(e) => setField('issue', e.target.value)}
                />
              </div>

              <div className='space-y-1'>
                <Label>Technician</Label>
                <Input
                  placeholder='Assigned technician'
                  value={form.technician}
                  onChange={(e) => setField('technician', e.target.value)}
                />
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>Estimated Charges (Rs)</Label>
                  <Input
                    type='number'
                    min='0'
                    step='1'
                    value={form.charges}
                    onChange={(e) => setField('charges', e.target.value)}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Advance Received (Rs)</Label>
                  <Input
                    type='number'
                    min='0'
                    step='1'
                    value={form.advanceAmount}
                    onChange={(e) => setField('advanceAmount', e.target.value)}
                  />
                </div>
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>Payment Method</Label>
                  <Select
                    value={form.paymentMethod}
                    onValueChange={(v) => setField('paymentMethod', v as RepairFormState['paymentMethod'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='cash'>Cash</SelectItem>
                      <SelectItem value='jazzcash'>JazzCash</SelectItem>
                      <SelectItem value='easypaisa'>EasyPaisa</SelectItem>
                      <SelectItem value='bank'>Bank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1'>
                  <Label>Date / Time</Label>
                  <Input
                    type='datetime-local'
                    value={form.date}
                    onChange={(e) => setField('date', e.target.value)}
                  />
                </div>
              </div>

              {/* Balance preview */}
              {(Number(form.charges) > 0 || Number(form.advanceAmount) > 0) && (
                <div className='rounded-md bg-muted p-3 text-sm flex justify-between'>
                  <span>Balance due after advance:</span>
                  <strong className={Number(form.charges) - Number(form.advanceAmount) > 0 ? 'text-destructive' : 'text-green-600'}>
                    {fmtAmt(Number(form.charges) - Number(form.advanceAmount))}
                  </strong>
                </div>
              )}

              <Button disabled={isSaving} type='submit' className='w-full'>
                {isSaving ? 'Saving...' : 'Create Repair Job & Print'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Repair Queue ── */}
        <Card className='flex flex-col'>
          <CardHeader>
            <CardTitle>Repair Queue</CardTitle>
          </CardHeader>
          <CardContent className='flex-1 overflow-auto'>
            <Tabs value={activeTab} onValueChange={handleTabChange} className='mb-4'>
              <TabsList className='flex-wrap h-auto gap-1'>
                <TabsTrigger value='all'>All ({tabCounts.all})</TabsTrigger>
                <TabsTrigger value='in_progress'>In Progress ({tabCounts.in_progress})</TabsTrigger>
                <TabsTrigger value='completed'>Completed ({tabCounts.completed})</TabsTrigger>
                <TabsTrigger value='delivered'>Delivered ({tabCounts.delivered})</TabsTrigger>
              </TabsList>
            </Tabs>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Charges</TableHead>
                  <TableHead>Advance</TableHead>
                  <TableHead className='text-destructive'>Balance</TableHead>
                  <TableHead className='text-green-600'>Profit</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className='text-center text-muted-foreground py-8'>
                      No repair jobs found
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((repair) => {
                  const balance = (repair.charges ?? 0) - (repair.advanceAmount ?? 0)
                  const cfg = statusConfig[repair.status]
                  return (
                    <TableRow key={repair.id}>
                      <TableCell>
                        <div className='font-medium whitespace-nowrap'>{repair.customerName}</div>
                        <div className='text-xs text-muted-foreground'>{repair.phone || '-'}</div>
                        <div className='text-xs text-muted-foreground'>{fmtDate(repair.date)}</div>
                      </TableCell>
                      <TableCell>
                        <div className='whitespace-nowrap'>{repair.deviceModel}</div>
                        {repair.color && <div className='text-xs text-muted-foreground'>{repair.color}</div>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg?.color}`}>
                          {cfg?.label}
                        </span>
                      </TableCell>
                      <TableCell className='whitespace-nowrap'>{fmtAmt(repair.charges)}</TableCell>
                      <TableCell className='text-green-600 whitespace-nowrap'>{fmtAmt(repair.advanceAmount)}</TableCell>
                      <TableCell className={`whitespace-nowrap font-medium ${balance > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {balance > 0 ? fmtAmt(balance) : 'Paid ✓'}
                      </TableCell>
                      <TableCell className='whitespace-nowrap'>
                        {repair.cost != null ? (
                          <span className={(repair.charges ?? 0) - (repair.cost ?? 0) >= 0 ? 'text-green-600 font-medium' : 'text-destructive font-medium'}>
                            {(repair.charges ?? 0) - (repair.cost ?? 0) >= 0 ? '+' : ''}{fmtAmt((repair.charges ?? 0) - (repair.cost ?? 0))}
                          </span>
                        ) : (
                          <span className='text-muted-foreground text-xs'>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap items-center gap-1'>
                          {repair.status === 'in_progress' && (
                            <Button
                              size='icon'
                              variant='outline'
                              title='Complete & set final charges'
                              onClick={() => openCompleteDialog(repair)}
                            >
                              <CheckCircle className='h-4 w-4 text-green-600' />
                            </Button>
                          )}
                          {repair.status === 'completed' && (
                            <Button
                              size='icon'
                              variant='outline'
                              title='Deliver & collect payment'
                              onClick={() => openDeliverDialog(repair)}
                            >
                              <PackageCheck className='h-4 w-4 text-purple-600' />
                            </Button>
                          )}
                          <Button
                            size='icon'
                            variant='outline'
                            title='View / Print job card'
                            onClick={() => setPrintRepair(repair)}
                          >
                            <Eye className='h-4 w-4' />
                          </Button>
                          <Button
                            size='icon'
                            variant='ghost'
                            title='Delete'
                            onClick={() => setDeleteConfirm(repair)}
                          >
                            <Trash2 className='h-4 w-4 text-destructive' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <SimplePagination
              currentPage={repairPage}
              totalPages={data?.totalPages ?? 1}
              totalResults={data?.totalResults}
              limit={repairLimit}
              onPageChange={setRepairPage}
              onLimitChange={(l) => { setRepairLimit(l); setRepairPage(1) }}
              className='mt-3'
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Print / View Dialog ── */}
      <Dialog open={!!printRepair} onOpenChange={(open) => !open && setPrintRepair(null)}>
        <DialogContent className='max-w-xl'>
          <DialogHeader>
            <DialogTitle>Repair Job Card</DialogTitle>
          </DialogHeader>
          {printRepair && (
            <div className='space-y-2 rounded-md border p-4 text-sm'>
              <div className='flex justify-between'><span className='font-semibold'>Customer</span><span>{printRepair.customerName}</span></div>
              <div className='flex justify-between'><span className='font-semibold'>Phone</span><span>{printRepair.phone || '-'}</span></div>
              <div className='flex justify-between'><span className='font-semibold'>Device</span><span>{printRepair.deviceModel}</span></div>
              {printRepair.color && <div className='flex justify-between'><span className='font-semibold'>Color</span><span>{printRepair.color}</span></div>}
              {printRepair.serialNumber && <div className='flex justify-between'><span className='font-semibold'>IMEI / Serial</span><span>{printRepair.serialNumber}</span></div>}
              {printRepair.technician && <div className='flex justify-between'><span className='font-semibold'>Technician</span><span>{printRepair.technician}</span></div>}
              <div className='flex justify-between'><span className='font-semibold'>Issue</span><span className='max-w-[60%] text-right'>{printRepair.issue}</span></div>
              <hr />
              <div className='flex justify-between'><span className='font-semibold'>Total Charges</span><span>{fmtAmt(printRepair.charges)}</span></div>
              <div className='flex justify-between'><span className='font-semibold'>Advance Paid</span><span className='text-green-600'>{fmtAmt(printRepair.advanceAmount)}</span></div>
              <div className='flex justify-between font-bold'><span>Balance Due</span><span className={(printRepair.charges ?? 0) - (printRepair.advanceAmount ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}>{(printRepair.charges ?? 0) - (printRepair.advanceAmount ?? 0) > 0 ? fmtAmt((printRepair.charges ?? 0) - (printRepair.advanceAmount ?? 0)) : 'Paid ✓'}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setPrintRepair(null)}>Close</Button>
            <Button onClick={handlePrint}>
              <Printer className='mr-2 h-4 w-4' /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deliver & Collect Payment Dialog ── */}
      <Dialog
        open={deliverDialog.open}
        onOpenChange={(open) =>
          !open && setDeliverDialog({ open: false, repair: null, receivedNow: '0', paymentMethod: 'cash' })
        }
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Deliver Device — Collect Remaining Payment</DialogTitle>
          </DialogHeader>
          {deliverDialog.repair && (() => {
            const balance = (deliverDialog.repair.charges ?? 0) - (deliverDialog.repair.advanceAmount ?? 0)
            const stillOwed = balance - Number(deliverDialog.receivedNow)
            return (
              <div className='space-y-4'>
                <div className='rounded-md bg-muted p-3 text-sm'>
                  <div className='font-medium'>{deliverDialog.repair.deviceModel}</div>
                  <div className='text-muted-foreground'>{deliverDialog.repair.customerName}</div>
                </div>

                <div className='rounded-md border p-3 text-sm space-y-1'>
                  <div className='flex justify-between'>
                    <span>Total Charges</span>
                    <span>{fmtAmt(deliverDialog.repair.charges)}</span>
                  </div>
                  <div className='flex justify-between text-green-600'>
                    <span>Advance Already Paid</span>
                    <span>- {fmtAmt(deliverDialog.repair.advanceAmount)}</span>
                  </div>
                  <div className='flex justify-between font-bold border-t pt-1'>
                    <span>Remaining Balance</span>
                    <span className={balance > 0 ? 'text-destructive' : 'text-green-600'}>
                      {balance > 0 ? fmtAmt(balance) : 'Fully Paid ✓'}
                    </span>
                  </div>
                </div>

                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-1'>
                    <Label>Amount Received Now (Rs)</Label>
                    <Input
                      type='number'
                      min='0'
                      step='1'
                      value={deliverDialog.receivedNow}
                      onChange={(e) => setDeliverDialog((prev) => ({ ...prev, receivedNow: e.target.value }))}
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label>Payment Method</Label>
                    <Select
                      value={deliverDialog.paymentMethod}
                      onValueChange={(v) =>
                        setDeliverDialog((prev) => ({ ...prev, paymentMethod: v as RepairFormState['paymentMethod'] }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='cash'>Cash</SelectItem>
                        <SelectItem value='jazzcash'>JazzCash</SelectItem>
                        <SelectItem value='easypaisa'>EasyPaisa</SelectItem>
                        <SelectItem value='bank'>Bank</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {stillOwed > 0 && (
                  <div className='rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm flex justify-between'>
                    <span className='text-yellow-800'>Still outstanding after delivery:</span>
                    <strong className='text-destructive'>{fmtAmt(stillOwed)}</strong>
                  </div>
                )}
                {stillOwed <= 0 && Number(deliverDialog.receivedNow) > 0 && (
                  <div className='rounded-md bg-green-50 border border-green-200 p-3 text-sm text-center text-green-700 font-medium'>
                    ✓ Fully settled
                  </div>
                )}
              </div>
            )
          })()}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeliverDialog({ open: false, repair: null, receivedNow: '0', paymentMethod: 'cash' })}
            >
              Cancel
            </Button>
            <Button disabled={isUpdating} onClick={handleDeliverSubmit}>
              {isUpdating ? 'Saving...' : 'Mark Delivered & Print'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Complete / Update Charges Dialog ── */}
      <Dialog
        open={completeDialog.open}
        onOpenChange={(open) =>
          !open && setCompleteDialog({ open: false, repair: null, charges: '0', advanceAmount: '0', cost: '0', paymentMethod: 'cash' })
        }
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Complete Repair — Set Final Charges</DialogTitle>
          </DialogHeader>
          {completeDialog.repair && (() => {
            const charges = Number(completeDialog.charges)
            const advance = Number(completeDialog.advanceAmount)
            const cost = Number(completeDialog.cost)
            const balance = charges - advance
            const profit = charges - cost
            return (
              <div className='space-y-4'>
                <div className='rounded-md bg-muted p-3 text-sm'>
                  <div className='font-medium'>{completeDialog.repair.deviceModel}</div>
                  <div className='text-muted-foreground'>{completeDialog.repair.customerName}</div>
                </div>

                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-1'>
                    <Label>Total Charges (Rs)</Label>
                    <Input
                      type='number'
                      min='0'
                      step='1'
                      value={completeDialog.charges}
                      onChange={(e) => setCompleteDialog((prev) => ({ ...prev, charges: e.target.value }))}
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label>Advance Received (Rs)</Label>
                    <Input
                      type='number'
                      min='0'
                      step='1'
                      value={completeDialog.advanceAmount}
                      onChange={(e) => setCompleteDialog((prev) => ({ ...prev, advanceAmount: e.target.value }))}
                    />
                  </div>
                </div>

                <div className='space-y-1'>
                  <Label>Parts / Repair Cost (Rs) <span className='text-muted-foreground font-normal'>— used for profit</span></Label>
                  <Input
                    type='number'
                    min='0'
                    step='1'
                    value={completeDialog.cost}
                    onChange={(e) => setCompleteDialog((prev) => ({ ...prev, cost: e.target.value }))}
                  />
                </div>

                <div className='space-y-1'>
                  <Label>Payment Method</Label>
                  <Select
                    value={completeDialog.paymentMethod}
                    onValueChange={(v) =>
                      setCompleteDialog((prev) => ({ ...prev, paymentMethod: v as RepairFormState['paymentMethod'] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='cash'>Cash</SelectItem>
                      <SelectItem value='jazzcash'>JazzCash</SelectItem>
                      <SelectItem value='easypaisa'>EasyPaisa</SelectItem>
                      <SelectItem value='bank'>Bank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='rounded-md border p-3 text-sm space-y-1'>
                  <div className='flex justify-between'>
                    <span>Total Charges</span>
                    <span>{fmtAmt(charges)}</span>
                  </div>
                  <div className='flex justify-between text-green-600'>
                    <span>Advance Received</span>
                    <span>- {fmtAmt(advance)}</span>
                  </div>
                  <div className='flex justify-between font-bold border-t pt-1'>
                    <span>Balance Due</span>
                    <span className={balance > 0 ? 'text-destructive' : 'text-green-600'}>
                      {fmtAmt(balance)}
                    </span>
                  </div>
                  <div className='flex justify-between border-t pt-1'>
                    <span>Parts / Cost</span>
                    <span className='text-muted-foreground'>- {fmtAmt(cost)}</span>
                  </div>
                  <div className={`flex justify-between font-bold text-base pt-1 border-t ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    <span>Net Profit</span>
                    <span>{profit >= 0 ? '+' : ''}{fmtAmt(profit)}</span>
                  </div>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() =>
                setCompleteDialog({ open: false, repair: null, charges: '0', advanceAmount: '0', cost: '0', paymentMethod: 'cash' })
              }
            >
              Cancel
            </Button>
            <Button disabled={isUpdating} onClick={handleCompleteSubmit}>
              {isUpdating ? 'Saving...' : 'Mark Completed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className='max-w-sm'>
          <DialogHeader>
            <DialogTitle>Delete Repair Job?</DialogTitle>
          </DialogHeader>
          <p className='text-sm text-muted-foreground'>
            This will permanently delete the job for{' '}
            <strong>{deleteConfirm?.customerName}</strong> — {deleteConfirm?.deviceModel}. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant='destructive' onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobilePageShell>
  )
}
