import { useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { format, isValid } from 'date-fns'
import { Eye, Pencil, Printer, Trash2, Receipt } from 'lucide-react'
import { usePermissions } from '@/context/permission-context'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  useGetPaymentVouchersQuery,
  useGetPaymentVoucherQuery,
  useDeletePaymentVoucherMutation,
  type PaymentVoucherRecord,
} from '@/stores/paymentVoucher.api'
import { useBranchPaperSize, useBranchPrintOrientation } from '@/features/invoice/utils/paper-format'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { printPaymentVoucher } from '../utils/print-payment-voucher'
import {
  PAYEE_TYPE_BADGE_CLASS, PAYEE_TYPE_LABELS,
  toPaymentSheetData,
} from '../utils/voucher-sheet-data'
import { VoucherDetailSheet } from './voucher-detail-sheet'
import { PaymentVoucherDialog } from './payment-voucher-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { Badge } from '@/components/ui/badge'
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

export function PaymentVoucherList() {
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
  const [voucherToDelete, setVoucherToDelete] = useState<PaymentVoucherRecord | null>(null)

  // What is open is tracked separately from what it shows, so a closing sheet/dialog keeps its
  // content for the exit animation instead of flashing empty.
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentVoucherRecord | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  // Editing from the sheet returns to it afterwards, so view → edit → save reads as one flow.
  const [returnToViewId, setReturnToViewId] = useState<string | null>(null)

  const { data, isLoading } = useGetPaymentVouchersQuery({
    search: search || undefined,
    bankAccountId: bankAccountId === ALL_ACCOUNTS ? undefined : bankAccountId,
    payeeType: payeeType === ALL_TYPES ? undefined : (payeeType as 'expense' | 'supplier' | 'other'),
    limit: 50,
  })
  const vouchers = data?.results ?? []

  // The row is enough to open the sheet instantly; the single-voucher endpoint adds who created
  // and last edited it. `currentData` (not `data`) so it never shows the previously opened one.
  const { currentData: detail, isFetching: isFetchingDetail } = useGetPaymentVoucherQuery(viewingId as string, {
    skip: !viewingId || !viewOpen,
  })
  const viewingRecord: PaymentVoucherRecord | undefined = detail ?? vouchers.find((v) => v.id === viewingId)

  const [deleteVoucher, { isLoading: isDeleting }] = useDeletePaymentVoucherMutation()

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
    <>
      <Card>
        <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <CardTitle>Payment Vouchers ({data?.totalResults ?? vouchers.length})</CardTitle>
          <div className='flex flex-wrap gap-2'>
            <Input
              placeholder='Search voucher #, payee...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='w-full sm:w-56'
            />
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
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
            <Select value={payeeType} onValueChange={setPayeeType}>
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
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Bank Account</TableHead>
                    <TableHead>Paid To</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className='text-right'>Amount</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((voucher) => (
                    <TableRow key={voucher.id} className='cursor-pointer' onClick={() => openView(voucher)}>
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
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-8 text-red-600 hover:text-red-700'
                              onClick={() => setVoucherToDelete(voucher)}
                              title='Delete voucher'
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
    </>
  )
}
