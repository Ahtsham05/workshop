import { useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { MobilePageShell } from '../components/mobile-page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { useDeleteWalletMutation, useGetWalletsQuery, useUpsertWalletMutation } from '@/stores/mobile-shop.api'
import {
  Edit2,
  Trash2,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { format, isValid } from 'date-fns'
import {
  CASH_RECEIVED_COMMISSION_LABEL,
  CASH_SEND_COMMISSION_LABEL,
  CASH_WALLET_RATES_SECTION,
} from '@/features/mobile-shop/utils/cash-transaction-labels'
import { isLoadWalletName, resolveWalletId } from '@/features/mobile-shop/utils/wallet-utils'
import {
  makeEnterChain,
  MOBILE_FORM_KEYBOARD_HINT,
  useCtrlEnterSubmit,
} from '@/lib/mobile-form-keyboard'

const formatWalletDate = (dateValue?: string) => {
  if (!dateValue) return '-'
  const parsedDate = new Date(dateValue)
  if (!isValid(parsedDate)) return '-'
  return format(parsedDate, 'MMM dd, yyyy')
}

const formatWalletBalance = (value?: number) => {
  const numericValue = Number(value)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0
  return safeValue.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type WalletRecord = {
  id: string
  type: string
  balance?: number
  commissionRate?: number
  withdrawalCommissionRate?: number
  depositCommissionRate?: number
  updatedAt?: string
}

export default function WalletPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useGetWalletsQuery()
  const [upsertWallet, { isLoading: isSaving }] = useUpsertWalletMutation()
  const [deleteWallet, { isLoading: isDeleting }] = useDeleteWalletMutation()
  const [walletName, setWalletName] = useState('')
  const [balance, setBalance] = useState('0')
  const [commissionRate, setCommissionRate] = useState('0')
  const [withdrawalCommissionRate, setWithdrawalCommissionRate] = useState('0')
  const [depositCommissionRate, setDepositCommissionRate] = useState('0')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [walletToDelete, setWalletToDelete] = useState<{ id: string; type: string } | null>(null)

  const wallets = data?.results ?? []

  const walletEnter = useMemo(
    () =>
      makeEnterChain(
        ['wallet-name', 'balance', 'commission-rate', 'withdrawal-rate', 'deposit-rate'],
        { onSubmit: () => document.querySelector<HTMLFormElement>('[data-mobile-form="wallet"]')?.requestSubmit() },
      ),
    [],
  )

  useCtrlEnterSubmit(
    () => document.querySelector<HTMLFormElement>('[data-mobile-form="wallet"]')?.requestSubmit(),
    isSaving,
  )

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!walletName.trim()) {
      toast.error('Wallet name is required')
      return
    }

    try {
      await upsertWallet({
        type: walletName,
        balance: Number(balance),
        commissionRate: Number(commissionRate),
        withdrawalCommissionRate: Number(withdrawalCommissionRate),
        depositCommissionRate: Number(depositCommissionRate),
        ...(editingId && { id: editingId }),
      }).unwrap()
      toast.success(editingId ? 'Wallet updated' : 'Wallet created')
      setWalletName('')
      setBalance('0')
      setCommissionRate('0')
      setWithdrawalCommissionRate('0')
      setDepositCommissionRate('0')
      setEditingId(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save wallet')
    }
  }

  const handleEdit = (wallet: WalletRecord) => {
    setEditingId(resolveWalletId(wallet))
    setWalletName(wallet.type)
    setBalance(String(wallet.balance))
    setCommissionRate(String(wallet.commissionRate ?? 0))
    setWithdrawalCommissionRate(String(wallet.withdrawalCommissionRate ?? 0))
    setDepositCommissionRate(String(wallet.depositCommissionRate ?? 0))
  }

  const handleCancel = () => {
    setEditingId(null)
    setWalletName('')
    setBalance('0')
    setCommissionRate('0')
    setWithdrawalCommissionRate('0')
    setDepositCommissionRate('0')
  }

  const handleDeleteWallet = async () => {
    if (!walletToDelete) return
    try {
      await deleteWallet(walletToDelete.id).unwrap()
      toast.success('Wallet deleted')
      if (editingId === walletToDelete.id) {
        handleCancel()
      }
      setWalletToDelete(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete wallet')
    }
  }

  const navigateWithWallet = (
    wallet: WalletRecord,
    search: { tab?: 'purchase' | 'sell'; action?: 'withdrawal' | 'deposit' },
    to: '/mobile-shop/load' | '/mobile-shop/cash-management',
  ) => {
    const walletId = resolveWalletId(wallet)
    const walletType = wallet.type?.trim()
    if (!walletId && !walletType) {
      toast.error('Wallet id is missing')
      return
    }
    navigate({
      to,
      search: {
        walletId: walletId || undefined,
        walletType: walletType || undefined,
        ...search,
      },
    })
  }

  return (
    <MobilePageShell
      title='Wallet Management'
      description={`Create and manage your wallets (JazzCash, EasyPaisa, Bank Account, SIM Card, etc.) · ${MOBILE_FORM_KEYBOARD_HINT}`}
    >
      <div className='grid gap-6 lg:grid-cols-[1fr_2fr]'>
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Wallet' : 'Add New Wallet'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form data-mobile-form='wallet' className='space-y-4' onSubmit={handleSubmit}>
              <div className='space-y-2'>
                <Label htmlFor='wallet-name'>Wallet Name</Label>
                <Input
                  id='wallet-name'
                  placeholder='e.g., JazzCash, Zong Load, EasyPaisa'
                  value={walletName}
                  onChange={(event) => setWalletName(event.target.value)}
                  {...walletEnter.enterProps('wallet-name')}
                />
                <p className='text-xs text-muted-foreground'>
                  Include &quot;Load&quot; in the name for load purchase/sale wallets
                </p>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='balance'>Balance (Rs)</Label>
                <Input
                  id='balance'
                  min='0'
                  step='0.01'
                  type='number'
                  placeholder='0'
                  value={balance}
                  onChange={(event) => setBalance(event.target.value)}
                  {...walletEnter.enterProps('balance')}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='commission-rate'>Load Sale Commission (%) - Optional</Label>
                <Input
                  id='commission-rate'
                  min='0'
                  max='100'
                  step='0.01'
                  type='number'
                  placeholder='e.g., 2.4'
                  value={commissionRate}
                  onChange={(event) => setCommissionRate(event.target.value)}
                  {...walletEnter.enterProps('commission-rate')}
                />
                <p className='text-xs text-muted-foreground'>Auto-filled when selling load</p>
              </div>
              <div className='border rounded-lg p-3 space-y-3 bg-muted/30'>
                <p className='text-sm font-medium text-muted-foreground'>{CASH_WALLET_RATES_SECTION}</p>
                <div className='space-y-2'>
                  <Label htmlFor='withdrawal-rate'>{CASH_RECEIVED_COMMISSION_LABEL}</Label>
                  <Input
                    id='withdrawal-rate'
                    min='0'
                    max='100'
                    step='0.01'
                    type='number'
                    placeholder='e.g., 2'
                    value={withdrawalCommissionRate}
                    onChange={(event) => setWithdrawalCommissionRate(event.target.value)}
                    {...walletEnter.enterProps('withdrawal-rate')}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='deposit-rate'>{CASH_SEND_COMMISSION_LABEL}</Label>
                  <Input
                    id='deposit-rate'
                    min='0'
                    max='100'
                    step='0.01'
                    type='number'
                    placeholder='e.g., 1'
                    value={depositCommissionRate}
                    onChange={(event) => setDepositCommissionRate(event.target.value)}
                    {...walletEnter.enterProps('deposit-rate')}
                  />
                </div>
              </div>
              <div className='flex gap-2'>
                <Button className='flex-1' disabled={isSaving} type='submit'>
                  {isSaving ? 'Saving...' : editingId ? 'Update Wallet' : 'Create Wallet'}
                </Button>
                {editingId && (
                  <Button variant='outline' onClick={handleCancel} type='button'>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Wallets ({wallets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='flex items-center justify-center h-40'>
                <p className='text-muted-foreground'>Loading wallets...</p>
              </div>
            ) : wallets.length === 0 ? (
              <div className='flex flex-col items-center justify-center h-40 gap-2'>
                <Wallet className='h-10 w-10 text-muted-foreground/40' />
                <p className='text-muted-foreground'>No wallets yet. Add one to get started!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Load Sale %</TableHead>
                    <TableHead>Received %</TableHead>
                    <TableHead>Send %</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((wallet) => {
                    const loadWallet = isLoadWalletName(wallet.type)
                    return (
                      <TableRow key={resolveWalletId(wallet) || wallet.type}>
                        <TableCell className='font-medium max-w-[200px]'>
                          <span className='line-clamp-2'>{wallet.type}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              loadWallet
                                ? 'text-xs font-medium text-blue-700'
                                : 'text-xs font-medium text-orange-700'
                            }
                          >
                            {loadWallet ? 'Load' : 'Cash'}
                          </span>
                        </TableCell>
                        <TableCell className='text-green-600 font-semibold whitespace-nowrap'>
                          Rs {formatWalletBalance(wallet.balance)}
                        </TableCell>
                        <TableCell className='text-blue-600 whitespace-nowrap'>
                          {Number(wallet.commissionRate ?? 0).toFixed(2)}%
                        </TableCell>
                        <TableCell className='text-orange-600 whitespace-nowrap'>
                          {Number(wallet.withdrawalCommissionRate ?? 0).toFixed(2)}%
                        </TableCell>
                        <TableCell className='text-purple-600 whitespace-nowrap'>
                          {Number(wallet.depositCommissionRate ?? 0).toFixed(2)}%
                        </TableCell>
                        <TableCell className='text-sm text-muted-foreground whitespace-nowrap'>
                          {formatWalletDate(wallet.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <div className='flex flex-wrap items-center justify-end gap-1'>
                            {!loadWallet && (
                              <>
                                <Button
                                  size='sm'
                                  type='button'
                                  className='h-8 bg-purple-600 hover:bg-purple-700'
                                  onClick={() =>
                                    navigateWithWallet(wallet, { action: 'deposit' }, '/mobile-shop/cash-management')
                                  }
                                >
                                  <ArrowDownLeft className='h-3.5 w-3.5 mr-1' />
                                  Send
                                </Button>
                                <Button
                                  size='sm'
                                  type='button'
                                  variant='outline'
                                  className='h-8 border-orange-300 text-orange-700 hover:bg-orange-50'
                                  onClick={() =>
                                    navigateWithWallet(wallet, { action: 'withdrawal' }, '/mobile-shop/cash-management')
                                  }
                                >
                                  <ArrowUpRight className='h-3.5 w-3.5 mr-1' />
                                  Received
                                </Button>
                              </>
                            )}
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-8'
                              onClick={() => handleEdit(wallet)}
                              title='Edit wallet'
                            >
                              <Edit2 className='h-4 w-4' />
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-8 text-red-600 hover:text-red-700'
                              onClick={() =>
                                setWalletToDelete({ id: resolveWalletId(wallet), type: wallet.type })
                              }
                              title='Delete wallet'
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!walletToDelete} onOpenChange={(open) => !open && setWalletToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete wallet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete wallet &quot;{walletToDelete?.type}&quot; only if it has zero balance and no linked records.
              If transactions exist, deletion will be blocked to keep history safe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-red-600 hover:bg-red-700'
              onClick={handleDeleteWallet}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Wallet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePageShell>
  )
}
