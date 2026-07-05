import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { Button } from '@/components/ui/button'
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
import { Plus, Trash2, Printer } from 'lucide-react'
import {
  useGetWalletsQuery,
  useGetUtilityCompaniesQuery,
  useCreateAgentBillsBatchMutation,
  useUpdateAgentBillMutation,
  type AgentBillRecord,
} from '@/stores/mobile-shop.api'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { openAgentBillsBatchPrint, openAgentBillPrintWindow } from './agent-bill-receipt-utils'
import { getBusinessToday } from '@/lib/business-timezone'

// ─── Types ────────────────────────────────────────────────────────────────────

type BillRow = {
  customerName: string
  referenceNumber: string
  mobileNo: string
  currentBillAmount: string
  overdueAmount: string
  previousBillAmount: string
  previousOverdueAmount: string
  profit: string
}

const emptyRow = (): BillRow => ({
  customerName: '',
  referenceNumber: '',
  mobileNo: '',
  currentBillAmount: '0',
  overdueAmount: '0',
  previousBillAmount: '0',
  previousOverdueAmount: '0',
  profit: '0',
})

const parseNum = (v: string) => Math.max(0, Number(v) || 0)
const rowTotal = (r: BillRow) =>
  parseNum(r.currentBillAmount) +
  parseNum(r.overdueAmount) +
  parseNum(r.previousBillAmount) +
  parseNum(r.previousOverdueAmount)

// ─── Component ───────────────────────────────────────────────────────────────

interface AgentBillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editBill?: AgentBillRecord | null
}

export function AgentBillDialog({ open, onOpenChange, editBill }: AgentBillDialogProps) {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery()

  const { data: walletsData } = useGetWalletsQuery()
  const activeWallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  const paymentOptions = buildMergedPaymentOptions(
    [
      { value: 'cash', label: 'Cash' },
      { value: 'bank', label: 'Bank Transfer' },
    ],
    activeWallets,
    false,
  )

  const { data: companiesData } = useGetUtilityCompaniesQuery({ isActive: true } as any)
  const companies = (companiesData as any)?.results ?? companiesData ?? []

  const [createBatch, { isLoading: saving }] = useCreateAgentBillsBatchMutation()
  const [updateBill, { isLoading: updating }] = useUpdateAgentBillMutation()

  const isEditMode = !!editBill

  const [companyId, setCompanyId] = useState(() => editBill?.companyId ?? '')
  const [companyName, setCompanyName] = useState(() => editBill?.companyName ?? '')
  const [collectionDate, setCollectionDate] = useState(() => editBill?.collectionDate?.slice(0, 10) ?? getBusinessToday())
  const [dueDate, setDueDate] = useState(() => editBill?.dueDate?.slice(0, 10) ?? getBusinessToday())
  const [paymentMethodOption, setPaymentMethodOption] = useState<string>(() => editBill?.paymentMethod ?? 'cash')
  const [rows, setRows] = useState<BillRow[]>(() =>
    editBill
      ? [{
          customerName: editBill.customerName,
          referenceNumber: editBill.referenceNumber,
          mobileNo: editBill.mobileNo ?? '',
          currentBillAmount: String(editBill.currentBillAmount),
          overdueAmount: String(editBill.overdueAmount),
          previousBillAmount: String(editBill.previousBillAmount),
          previousOverdueAmount: String(editBill.previousOverdueAmount),
          profit: String(editBill.profit),
        }]
      : [emptyRow()]
  )

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const setRef = (i: number, f: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[`${i}-${f}`] = el
  }
  const focusNext = (rowIdx: number, currentField: string) => {
    const order = ['customerName', 'referenceNumber', 'mobileNo', 'currentBillAmount', 'overdueAmount', 'previousBillAmount', 'previousOverdueAmount', 'profit']
    const idx = order.indexOf(currentField)
    if (idx < order.length - 1) {
      inputRefs.current[`${rowIdx}-${order[idx + 1]}`]?.focus()
    } else {
      const nextRef = inputRefs.current[`${rowIdx + 1}-customerName`]
      if (nextRef) nextRef.focus()
      else {
        setRows((prev) => [...prev, emptyRow()])
        setTimeout(() => inputRefs.current[`${rowIdx + 1}-customerName`]?.focus(), 50)
      }
    }
  }

  const handleCompanyChange = (id: string) => {
    const c = companies.find((x: any) => (x.id || x._id) === id)
    setCompanyId(id)
    setCompanyName(c?.name || '')
  }

  const handleRowChange = (idx: number, field: keyof BillRow, value: string) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))

  const addRow = () => setRows((prev) => [...prev, emptyRow()])
  const removeRow = (idx: number) =>
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx)))

  const isWallet = isWalletOptionValue(paymentMethodOption)
  const resolvedWalletType = isWallet ? getWalletTypeFromOptionValue(paymentMethodOption) : undefined
  const resolvedPaymentMethod: 'cash' | 'bank' | 'wallet' = isWallet
    ? 'wallet'
    : paymentMethodOption === 'bank'
    ? 'bank'
    : 'cash'

  const printRowPreview = useCallback(
    (row: BillRow, idx: number) => {
      if (!row.customerName && !row.referenceNumber) {
        toast.error('Fill in Customer Name and Reference # before printing')
        return
      }
      const pseudo: AgentBillRecord = {
        id: `preview-${idx}`,
        companyName,
        collectionDate,
        dueDate,
        paymentMethod: resolvedPaymentMethod,
        walletType: resolvedWalletType,
        customerName: row.customerName || '—',
        referenceNumber: row.referenceNumber || '—',
        mobileNo: row.mobileNo,
        currentBillAmount: parseNum(row.currentBillAmount),
        overdueAmount: parseNum(row.overdueAmount),
        previousBillAmount: parseNum(row.previousBillAmount),
        previousOverdueAmount: parseNum(row.previousOverdueAmount),
        profit: parseNum(row.profit),
        totalAmount: rowTotal(row),
        isPaid: false,
        overdueCharged: false,
        createdAt: new Date().toISOString(),
      }
      openAgentBillPrintWindow(pseudo, {
        orgName: orgData?.name,
        branchDetails: {
          name: branchData?.name,
          address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', '),
          phone: branchData?.phone,
          email: branchData?.email,
        },
      })
    },
    [companyName, collectionDate, dueDate, resolvedPaymentMethod, resolvedWalletType, orgData, branchData],
  )

  const reset = () => {
    setRows([emptyRow()])
    setCompanyId('')
    setCompanyName('')
    setCollectionDate(getBusinessToday())
    setDueDate(getBusinessToday())
    setPaymentMethodOption('cash')
  }

  const handleSave = async () => {
    const validRows = rows.filter(
      (r) =>
        r.customerName.trim() &&
        r.referenceNumber.trim() &&
        (parseNum(r.currentBillAmount) > 0 ||
          parseNum(r.previousBillAmount) > 0 ||
          parseNum(r.overdueAmount) > 0 ||
          parseNum(r.previousOverdueAmount) > 0),
    )

    if (validRows.length === 0) {
      toast.error('Add at least one bill with Customer Name, Reference #, and an amount')
      return
    }

    if (!dueDate) {
      toast.error('Select a due date')
      return
    }

    try {
      if (isEditMode && editBill) {
        const r = validRows[0]
        const updated = await updateBill({
          id: editBill.id,
          customerName: r.customerName.trim(),
          referenceNumber: r.referenceNumber.trim(),
          mobileNo: r.mobileNo.trim() || undefined,
          currentBillAmount: parseNum(r.currentBillAmount),
          overdueAmount: parseNum(r.overdueAmount),
          previousBillAmount: parseNum(r.previousBillAmount),
          previousOverdueAmount: parseNum(r.previousOverdueAmount),
          profit: parseNum(r.profit),
          totalAmount: rowTotal(r),
          companyId: companyId || undefined,
          companyName: companyName || undefined,
          collectionDate: new Date(collectionDate).toISOString(),
          dueDate: new Date(dueDate).toISOString(),
          paymentMethod: resolvedPaymentMethod,
          walletType: resolvedWalletType,
        }).unwrap()
        toast.success('Bill updated')
        openAgentBillPrintWindow(updated, {
          orgName: orgData?.name,
          branchDetails: {
            name: branchData?.name,
            address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', '),
            phone: branchData?.phone,
            email: branchData?.email,
          },
        })
        onOpenChange(false)
      } else {
        const saved = await createBatch({
          bills: validRows.map((r) => ({
            customerName: r.customerName.trim(),
            referenceNumber: r.referenceNumber.trim(),
            mobileNo: r.mobileNo.trim() || undefined,
            currentBillAmount: parseNum(r.currentBillAmount),
            overdueAmount: parseNum(r.overdueAmount),
            previousBillAmount: parseNum(r.previousBillAmount),
            previousOverdueAmount: parseNum(r.previousOverdueAmount),
            profit: parseNum(r.profit),
          })),
          companyId: companyId || undefined,
          companyName: companyName || undefined,
          collectionDate: new Date(collectionDate).toISOString(),
          dueDate: new Date(dueDate).toISOString(),
          paymentMethod: resolvedPaymentMethod,
          walletType: resolvedWalletType,
        }).unwrap()

        toast.success(`${saved.length} bill(s) saved`)

        openAgentBillsBatchPrint(saved, {
          orgName: orgData?.name,
          branchDetails: {
            name: branchData?.name,
            address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', '),
            phone: branchData?.phone,
            email: branchData?.email,
          },
        })

        reset()
        onOpenChange(false)
      }
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save bills')
    }
  }

  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0)
  const grandProfit = rows.reduce((s, r) => s + parseNum(r.profit), 0)
  const validCount = rows.filter((r) => r.customerName.trim()).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[95vh] overflow-y-auto sm:max-w-[1350px]'>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Agent Bill' : 'Agent Bill Collection'}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4'>
          {/* ── Header ── */}
          <div className='grid gap-4 sm:grid-cols-4'>
            {/* Company */}
            <div>
              <Label>Company</Label>
              <Select value={companyId} onValueChange={handleCompanyChange}>
                <SelectTrigger>
                  <SelectValue placeholder='Select utility company' />
                </SelectTrigger>
                <SelectContent>
                  {companies.length === 0 ? (
                    <SelectItem value='__none__' disabled>No companies configured</SelectItem>
                  ) : (
                    companies.map((c: any) => (
                      <SelectItem key={c.id || c._id} value={c.id || c._id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Collection Date */}
            <div>
              <Label>Collection Date *</Label>
              <Input
                type='date'
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
              />
            </div>

            {/* Due Date */}
            <div>
              <Label>Due Date *</Label>
              <Input
                type='date'
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Payment Method */}
            <div>
              <Label>Payment Method (Current Bill) *</Label>
              <Select value={paymentMethodOption} onValueChange={setPaymentMethodOption}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Info hints ── */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground'>
            <div className='rounded border border-dashed px-3 py-2 bg-green-50 dark:bg-green-950/20'>
              <span className='font-semibold text-green-700'>Current Bill</span> → Cash in hand / {isWallet ? resolvedWalletType : paymentMethodOption}
            </div>
            <div className='rounded border border-dashed px-3 py-2 bg-orange-50 dark:bg-orange-950/20'>
              <span className='font-semibold text-orange-700'>Current Overdue</span> → Expense, charged once due date passes unpaid
            </div>
            <div className='rounded border border-dashed px-3 py-2 bg-blue-50 dark:bg-blue-950/20'>
              <span className='font-semibold text-blue-700'>Previous Bill</span> → My Wallet (Accounts)
            </div>
            <div className='rounded border border-dashed px-3 py-2 bg-red-50 dark:bg-red-950/20'>
              <span className='font-semibold text-red-700'>Previous Overdue</span> → Expense, charged instantly
            </div>
          </div>

          {/* ── Bill Rows Table ── */}
          <div className='rounded-md border overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/50'>
                  <TableHead className='w-8 text-center'>#</TableHead>
                  <TableHead className='min-w-[170px]'>Customer Name *</TableHead>
                  <TableHead className='min-w-[145px]'>Reference #</TableHead>
                  <TableHead className='min-w-[135px]'>Mobile No</TableHead>
                  <TableHead className='min-w-[110px] text-right'>Current Bill (Rs.)</TableHead>
                  <TableHead className='min-w-[110px] text-right'>Current Overdue (Rs.)</TableHead>
                  <TableHead className='min-w-[110px] text-right'>Previous Bill (Rs.)</TableHead>
                  <TableHead className='min-w-[110px] text-right'>Previous Overdue (Rs.)</TableHead>
                  <TableHead className='min-w-[90px] text-right'>Profit (Rs.)</TableHead>
                  <TableHead className='min-w-[105px] text-right bg-muted font-semibold'>Total (Rs.)</TableHead>
                  <TableHead className='w-20 text-center'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className='text-center text-muted-foreground text-sm'>{idx + 1}</TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'customerName')}
                        value={row.customerName}
                        onChange={(e) => handleRowChange(idx, 'customerName', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'customerName')}
                        placeholder='Name'
                        className='h-8 text-sm'
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'referenceNumber')}
                        value={row.referenceNumber}
                        onChange={(e) => handleRowChange(idx, 'referenceNumber', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'referenceNumber')}
                        placeholder='Ref #'
                        className='h-8 text-sm'
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'mobileNo')}
                        value={row.mobileNo}
                        onChange={(e) => handleRowChange(idx, 'mobileNo', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'mobileNo')}
                        placeholder='03XX...'
                        className='h-8 text-sm'
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'currentBillAmount')}
                        type='number' min='0' step='1'
                        value={row.currentBillAmount}
                        onChange={(e) => handleRowChange(idx, 'currentBillAmount', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'currentBillAmount')}
                        onFocus={(e) => e.target.select()}
                        className='h-8 text-sm text-right'
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'overdueAmount')}
                        type='number' min='0' step='1'
                        value={row.overdueAmount}
                        onChange={(e) => handleRowChange(idx, 'overdueAmount', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'overdueAmount')}
                        onFocus={(e) => e.target.select()}
                        className='h-8 text-sm text-right'
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'previousBillAmount')}
                        type='number' min='0' step='1'
                        value={row.previousBillAmount}
                        onChange={(e) => handleRowChange(idx, 'previousBillAmount', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'previousBillAmount')}
                        onFocus={(e) => e.target.select()}
                        className='h-8 text-sm text-right'
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'previousOverdueAmount')}
                        type='number' min='0' step='1'
                        value={row.previousOverdueAmount}
                        onChange={(e) => handleRowChange(idx, 'previousOverdueAmount', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'previousOverdueAmount')}
                        onFocus={(e) => e.target.select()}
                        className='h-8 text-sm text-right'
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        ref={setRef(idx, 'profit')}
                        type='number' min='0' step='1'
                        value={row.profit}
                        onChange={(e) => handleRowChange(idx, 'profit', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && focusNext(idx, 'profit')}
                        onFocus={(e) => e.target.select()}
                        className='h-8 text-sm text-right'
                      />
                    </TableCell>

                    {/* Total (disabled) */}
                    <TableCell className='bg-muted/30'>
                      <Input
                        readOnly tabIndex={-1}
                        value={rowTotal(row).toLocaleString()}
                        className='h-8 text-sm text-right font-semibold bg-transparent cursor-default select-none'
                      />
                    </TableCell>

                    <TableCell>
                      <div className='flex items-center gap-1 justify-center'>
                        <Button
                          variant='ghost' size='icon'
                          className='h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                          title='Print preview'
                          onClick={() => printRowPreview(row, idx)}
                        >
                          <Printer className='h-3.5 w-3.5' />
                        </Button>
                        <Button
                          variant='ghost' size='icon'
                          className='h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10'
                          title='Remove row'
                          onClick={() => removeRow(idx)}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!isEditMode && (
            <Button variant='outline' size='sm' onClick={addRow} className='gap-1'>
              <Plus className='h-3.5 w-3.5' />
              Add Bill
            </Button>
          )}

          {/* ── Summary ── */}
          <div className='rounded-md border bg-muted/30 p-4 space-y-1 text-sm'>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>Bills ({validCount})</span>
            </div>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>Cash in hand / {isWallet ? resolvedWalletType : paymentMethodOption} (current bill):</span>
              <span className='font-medium text-green-700'>
                Rs. {rows.reduce((s, r) => s + parseNum(r.currentBillAmount), 0).toLocaleString()}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>Current Overdue → Expense (on due date):</span>
              <span className='font-medium text-orange-600'>
                Rs. {rows.reduce((s, r) => s + parseNum(r.overdueAmount), 0).toLocaleString()}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>My Wallet / Accounts (previous bill):</span>
              <span className='font-medium text-blue-700'>
                Rs. {rows.reduce((s, r) => s + parseNum(r.previousBillAmount), 0).toLocaleString()}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>Previous Overdue → Expense (instant):</span>
              <span className='font-medium text-red-600'>
                Rs. {rows.reduce((s, r) => s + parseNum(r.previousOverdueAmount), 0).toLocaleString()}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>Total Profit:</span>
              <span className='font-medium text-purple-700'>Rs. {grandProfit.toLocaleString()}</span>
            </div>
            <div className='flex justify-between border-t pt-1 font-semibold text-base'>
              <span>Grand Total:</span>
              <span>Rs. {grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {(saving || updating) ? 'Saving...' : isEditMode ? 'Update Bill & Print' : `Save ${validCount || 0} Bill(s) & Print`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
