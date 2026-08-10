import { useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { format, isValid } from 'date-fns'
import { Printer, Trash2, Receipt } from 'lucide-react'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  useGetReceiptVouchersQuery,
  useDeleteReceiptVoucherMutation,
  type ReceiptVoucherRecord,
} from '@/stores/receiptVoucher.api'
import { useBranchPaperSize, useBranchPrintOrientation } from '@/features/invoice/utils/paper-format'
import { printReceiptVoucher } from '../utils/print-receipt-voucher'
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

const SOURCE_TYPE_BADGE_CLASS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  income: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  mixed: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  customer: 'Customer',
  income: 'Income',
}

const voucherTypeLabel = (voucher: ReceiptVoucherRecord) => {
  const types = new Set(voucher.lines.map((l) => l.sourceType))
  if (types.size > 1) return 'mixed'
  return voucher.lines[0]?.sourceType ?? 'income'
}

const voucherSourceSummary = (voucher: ReceiptVoucherRecord) => voucher.lines.map((l) => l.payerName).join(', ')

const ALL_ACCOUNTS = '__all__'
const ALL_TYPES = '__all__'

export function ReceiptVoucherList() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results ?? []
  const paperSize = useBranchPaperSize()
  const orientation = useBranchPrintOrientation()

  const [search, setSearch] = useState('')
  const [bankAccountId, setBankAccountId] = useState(ALL_ACCOUNTS)
  const [sourceType, setSourceType] = useState(ALL_TYPES)
  const [voucherToDelete, setVoucherToDelete] = useState<ReceiptVoucherRecord | null>(null)

  const { data, isLoading } = useGetReceiptVouchersQuery({
    search: search || undefined,
    bankAccountId: bankAccountId === ALL_ACCOUNTS ? undefined : bankAccountId,
    sourceType: sourceType === ALL_TYPES ? undefined : (sourceType as 'customer' | 'income'),
    limit: 50,
  })
  const vouchers = data?.results ?? []

  const [deleteVoucher, { isLoading: isDeleting }] = useDeleteReceiptVoucherMutation()

  const handlePrint = (voucher: ReceiptVoucherRecord) => {
    printReceiptVoucher(
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
      },
      paperSize,
      orientation,
    )
  }

  const handleDelete = async () => {
    if (!voucherToDelete) return
    try {
      await deleteVoucher(voucherToDelete.id).unwrap()
      toast.success('Receipt voucher deleted')
      setVoucherToDelete(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete receipt voucher')
    }
  }

  return (
    <>
      <Card>
        <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <CardTitle>Receipt Vouchers ({data?.totalResults ?? vouchers.length})</CardTitle>
          <div className='flex flex-wrap gap-2'>
            <Input
              placeholder='Search voucher #, payer...'
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
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className='w-full sm:w-40'>
                <SelectValue placeholder='All types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All types</SelectItem>
                <SelectItem value='customer'>Customer</SelectItem>
                <SelectItem value='income'>Income</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='flex h-40 items-center justify-center'>
              <p className='text-muted-foreground'>Loading receipt vouchers...</p>
            </div>
          ) : vouchers.length === 0 ? (
            <div className='flex h-40 flex-col items-center justify-center gap-2'>
              <Receipt className='h-10 w-10 text-muted-foreground/40' />
              <p className='text-muted-foreground'>No receipt vouchers yet. Create one to get started!</p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Bank Account</TableHead>
                    <TableHead>Received From</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className='text-right'>Amount</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((voucher) => (
                    <TableRow key={voucher.id}>
                      <TableCell className='font-medium whitespace-nowrap'>{voucher.voucherNumber}</TableCell>
                      <TableCell className='whitespace-nowrap'>{formatDate(voucher.date)}</TableCell>
                      <TableCell>{voucher.bankAccountName || '-'}</TableCell>
                      <TableCell className='max-w-[220px]'>
                        <span className='line-clamp-1'>{voucherSourceSummary(voucher)}</span>
                        {voucher.lines.length > 1 && (
                          <span className='block text-xs text-muted-foreground'>{voucher.lines.length} line items</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant='secondary' className={SOURCE_TYPE_BADGE_CLASS[voucherTypeLabel(voucher)]}>
                          {voucherTypeLabel(voucher) === 'mixed' ? 'Mixed' : SOURCE_TYPE_LABELS[voucherTypeLabel(voucher)]}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right font-semibold text-emerald-600 whitespace-nowrap'>
                        Rs {Number(voucher.totalAmount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center justify-end gap-1'>
                          <Button size='sm' variant='outline' className='h-8' onClick={() => handlePrint(voucher)} title='Print voucher'>
                            <Printer className='h-4 w-4' />
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-8 text-red-600 hover:text-red-700'
                            onClick={() => setVoucherToDelete(voucher)}
                            title='Delete voucher'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
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

      <AlertDialog open={!!voucherToDelete} onOpenChange={(open) => !open && setVoucherToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete receipt voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete voucher &quot;{voucherToDelete?.voucherNumber}&quot; and reverse every line&apos;s effect
              on the bank account balance, cash book, and any linked customer ledger entry.
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
