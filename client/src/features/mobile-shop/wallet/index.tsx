import { useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { MobilePageShell } from '../components/mobile-page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useDeleteWalletMutation, useGetWalletsQuery, useUpsertWalletMutation } from '@/stores/mobile-shop.api'
import {
  Edit2,
  Trash2,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { format, isValid } from 'date-fns'
import { cn } from '@/lib/utils'
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
      <div className='grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]'>
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
                <p className='text-sm font-medium text-muted-foreground'>Cash Withdrawal / Deposit Rates</p>
                <div className='space-y-2'>
                  <Label htmlFor='withdrawal-rate'>Withdrawal Commission (%)</Label>
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
                  <Label htmlFor='deposit-rate'>Deposit Commission (%)</Label>
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

        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-lg font-semibold'>Your Wallets ({wallets.length})</h2>
          </div>

          {isLoading ? (
            <div className='flex items-center justify-center h-40 rounded-xl border bg-muted/20'>
              <p className='text-muted-foreground'>Loading wallets...</p>
            </div>
          ) : wallets.length === 0 ? (
            <div className='flex flex-col items-center justify-center h-40 rounded-xl border bg-muted/20 gap-2'>
              <Wallet className='h-10 w-10 text-muted-foreground/40' />
              <p className='text-muted-foreground'>No wallets yet. Add one to get started!</p>
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2'>
              {wallets.map((wallet) => {
                const loadWallet = isLoadWalletName(wallet.type)
                return (
                  <Card
                    key={resolveWalletId(wallet) || wallet.type}
                    className={cn(
                      'relative overflow-hidden transition-shadow hover:shadow-md',
                      loadWallet ? 'border-blue-200/80' : 'border-orange-200/80',
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-0 left-0 right-0 h-1',
                        loadWallet ? 'bg-blue-500' : 'bg-orange-500',
                      )}
                    />
                    <CardHeader className='pb-2'>
                      <div className='flex items-start justify-between gap-2'>
                        <div className='min-w-0 flex-1'>
                          <div className='flex items-center gap-2 mb-1'>
                            <div
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                loadWallet ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700',
                              )}
                            >
                              <Wallet className='h-4 w-4' />
                            </div>
                            <Badge variant='secondary' className='text-xs shrink-0'>
                              {loadWallet ? 'Load Wallet' : 'Cash Wallet'}
                            </Badge>
                          </div>
                          <CardTitle className='text-base leading-tight break-words'>
                            {wallet.type}
                          </CardTitle>
                        </div>
                        <div className='flex shrink-0 gap-1'>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='h-8 w-8'
                            onClick={() => handleEdit(wallet)}
                            title='Edit wallet'
                          >
                            <Edit2 className='h-4 w-4' />
                          </Button>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='h-8 w-8 text-red-600 hover:text-red-700'
                            onClick={() => setWalletToDelete({ id: resolveWalletId(wallet), type: wallet.type })}
                            title='Delete wallet'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      <div>
                        <p className='text-xs text-muted-foreground mb-0.5'>Balance</p>
                        <p className='text-2xl font-bold text-green-600'>
                          Rs {formatWalletBalance(wallet.balance)}
                        </p>
                      </div>

                      <div className='flex flex-wrap gap-2 text-xs'>
                        {loadWallet && Number(wallet.commissionRate ?? 0) > 0 && (
                          <span className='rounded-md bg-blue-50 text-blue-700 px-2 py-1'>
                            Load sale {Number(wallet.commissionRate).toFixed(2)}%
                          </span>
                        )}
                        {!loadWallet && Number(wallet.withdrawalCommissionRate ?? 0) > 0 && (
                          <span className='rounded-md bg-orange-50 text-orange-700 px-2 py-1'>
                            Withdrawal {Number(wallet.withdrawalCommissionRate).toFixed(2)}%
                          </span>
                        )}
                        {!loadWallet && Number(wallet.depositCommissionRate ?? 0) > 0 && (
                          <span className='rounded-md bg-purple-50 text-purple-700 px-2 py-1'>
                            Deposit {Number(wallet.depositCommissionRate).toFixed(2)}%
                          </span>
                        )}
                      </div>

                      <p className='text-xs text-muted-foreground'>
                        Updated {formatWalletDate(wallet.updatedAt)}
                      </p>

                      <div className='grid grid-cols-2 gap-2 pt-1'>
                        {loadWallet ? (
                          <>
                            <Button
                              type='button'
                              className='bg-blue-600 hover:bg-blue-700'
                              onClick={() => navigateWithWallet(wallet, { tab: 'purchase' }, '/mobile-shop/load')}
                            >
                              <ArrowDownToLine className='h-4 w-4 mr-1.5 shrink-0' />
                              Purchase Load
                            </Button>
                            <Button
                              type='button'
                              variant='outline'
                              className='border-blue-300 text-blue-700 hover:bg-blue-50'
                              onClick={() => navigateWithWallet(wallet, { tab: 'sell' }, '/mobile-shop/load')}
                            >
                              <ArrowUpFromLine className='h-4 w-4 mr-1.5 shrink-0' />
                              Sale Load
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type='button'
                              className='bg-purple-600 hover:bg-purple-700'
                              onClick={() => navigateWithWallet(wallet, { action: 'deposit' }, '/mobile-shop/cash-management')}
                            >
                              <ArrowDownLeft className='h-4 w-4 mr-1.5 shrink-0' />
                              Deposit
                            </Button>
                            <Button
                              type='button'
                              variant='outline'
                              className='border-orange-300 text-orange-700 hover:bg-orange-50'
                              onClick={() => navigateWithWallet(wallet, { action: 'withdrawal' }, '/mobile-shop/cash-management')}
                            >
                              <ArrowUpRight className='h-4 w-4 mr-1.5 shrink-0' />
                              Withdrawal
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
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
