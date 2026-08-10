import { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isMobileShopBusiness } from '@/lib/business-types'
import { MobilePageShell } from '../components/mobile-page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { useDeleteWalletMutation, useGetWalletsQuery, useUpsertWalletMutation, type BankAccountType } from '@/stores/mobile-shop.api'
import { Link } from '@tanstack/react-router'
import {
  Edit2,
  Trash2,
  Landmark,
  ScrollText,
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
  accountType?: BankAccountType
  bankName?: string
  accountNumber?: string
  branchName?: string
  updatedAt?: string
}

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  mobile_wallet: 'Mobile Wallet',
}

const ACCOUNT_TYPE_BADGE_CLASS: Record<BankAccountType, string> = {
  cash: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  bank: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  mobile_wallet: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
}

export default function WalletPage() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const isMobileShop = isMobileShopBusiness(org?.businessType ?? user?.businessType)
  const { data, isLoading } = useGetWalletsQuery()
  const [upsertWallet, { isLoading: isSaving }] = useUpsertWalletMutation()
  const [deleteWallet, { isLoading: isDeleting }] = useDeleteWalletMutation()
  const [walletName, setWalletName] = useState('')
  const [balance, setBalance] = useState('0')
  const [commissionRate, setCommissionRate] = useState('0')
  const [withdrawalCommissionRate, setWithdrawalCommissionRate] = useState('0')
  const [depositCommissionRate, setDepositCommissionRate] = useState('0')
  const [accountType, setAccountType] = useState<BankAccountType | ''>('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [branchName, setBranchName] = useState('')
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
      toast.error('Account name is required')
      return
    }

    try {
      await upsertWallet({
        type: walletName,
        balance: Number(balance),
        commissionRate: Number(commissionRate),
        withdrawalCommissionRate: Number(withdrawalCommissionRate),
        depositCommissionRate: Number(depositCommissionRate),
        accountType,
        bankName: accountType === 'bank' ? bankName : '',
        accountNumber: accountType === 'bank' ? accountNumber : '',
        branchName: accountType === 'bank' ? branchName : '',
        ...(editingId && { id: editingId }),
      }).unwrap()
      toast.success(editingId ? 'Bank account updated' : 'Bank account created')
      setWalletName('')
      setBalance('0')
      setCommissionRate('0')
      setWithdrawalCommissionRate('0')
      setDepositCommissionRate('0')
      setAccountType('')
      setBankName('')
      setAccountNumber('')
      setBranchName('')
      setEditingId(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save bank account')
    }
  }

  const handleEdit = (wallet: WalletRecord) => {
    setEditingId(resolveWalletId(wallet))
    setWalletName(wallet.type)
    setBalance(String(wallet.balance))
    setCommissionRate(String(wallet.commissionRate ?? 0))
    setWithdrawalCommissionRate(String(wallet.withdrawalCommissionRate ?? 0))
    setDepositCommissionRate(String(wallet.depositCommissionRate ?? 0))
    setAccountType(wallet.accountType ?? '')
    setBankName(wallet.bankName ?? '')
    setAccountNumber(wallet.accountNumber ?? '')
    setBranchName(wallet.branchName ?? '')
  }

  const handleCancel = () => {
    setEditingId(null)
    setWalletName('')
    setBalance('0')
    setCommissionRate('0')
    setWithdrawalCommissionRate('0')
    setDepositCommissionRate('0')
    setAccountType('')
    setBankName('')
    setAccountNumber('')
    setBranchName('')
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

  return (
    <MobilePageShell
      title='Bank Accounts'
      description={
        isMobileShop
          ? `Create and manage your bank accounts and payment wallets (JazzCash, EasyPaisa, Bank Account, SIM Card, etc.) · ${MOBILE_FORM_KEYBOARD_HINT}`
          : `Create and manage your bank accounts and cash-in-hand accounts · ${MOBILE_FORM_KEYBOARD_HINT}`
      }
    >
      <div className='grid gap-6 lg:grid-cols-[1fr_2fr]'>
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Bank Account' : 'Add Bank Account'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form data-mobile-form='wallet' className='space-y-4' onSubmit={handleSubmit}>
              <div className='space-y-2'>
                <Label htmlFor='wallet-name'>Account Name</Label>
                <Input
                  id='wallet-name'
                  placeholder={isMobileShop ? 'e.g., JazzCash, Zong Load, EasyPaisa, HBL Bank' : 'e.g., HBL Bank, Cash in Hand'}
                  value={walletName}
                  onChange={(event) => setWalletName(event.target.value)}
                  {...walletEnter.enterProps('wallet-name')}
                />
                {isMobileShop && (
                  <p className='text-xs text-muted-foreground'>
                    Include &quot;Load&quot; in the name for load purchase/sale wallets
                  </p>
                )}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='account-type'>Account Type</Label>
                <Select value={accountType || undefined} onValueChange={(value) => setAccountType(value as BankAccountType)}>
                  <SelectTrigger id='account-type'>
                    <SelectValue placeholder='Select account type (optional)' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='cash'>Cash</SelectItem>
                    <SelectItem value='bank'>Bank</SelectItem>
                    {isMobileShop && <SelectItem value='mobile_wallet'>Mobile Wallet</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {accountType === 'bank' && (
                <div className='border rounded-lg p-3 space-y-3 bg-muted/30'>
                  <div className='space-y-2'>
                    <Label htmlFor='bank-name'>Bank Name</Label>
                    <Input
                      id='bank-name'
                      placeholder='e.g., Habib Bank Limited'
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='account-number'>Account Number / IBAN</Label>
                    <Input
                      id='account-number'
                      placeholder='e.g., PK00HABB0000000000000000'
                      value={accountNumber}
                      onChange={(event) => setAccountNumber(event.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='branch-name'>Branch Name</Label>
                    <Input
                      id='branch-name'
                      placeholder='e.g., Main Branch, Lahore'
                      value={branchName}
                      onChange={(event) => setBranchName(event.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className='space-y-2'>
                <Label htmlFor='balance'>Opening Balance (Rs)</Label>
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
              {isMobileShop && (
                <>
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
                </>
              )}
              <div className='flex gap-2'>
                <Button className='flex-1' disabled={isSaving} type='submit'>
                  {isSaving ? 'Saving...' : editingId ? 'Update Bank Account' : 'Add Bank Account'}
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
            <CardTitle>Your Bank Accounts ({wallets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='flex items-center justify-center h-40'>
                <p className='text-muted-foreground'>Loading bank accounts...</p>
              </div>
            ) : wallets.length === 0 ? (
              <div className='flex flex-col items-center justify-center h-40 gap-2'>
                <Landmark className='h-10 w-10 text-muted-foreground/40' />
                <p className='text-muted-foreground'>No bank accounts yet. Add one to get started!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Account Type</TableHead>
                    {isMobileShop && <TableHead>Type</TableHead>}
                    <TableHead>Balance</TableHead>
                    {isMobileShop && (
                      <>
                        <TableHead>Load Sale %</TableHead>
                        <TableHead>Received %</TableHead>
                        <TableHead>Send %</TableHead>
                      </>
                    )}
                    <TableHead>Updated</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((wallet) => {
                    const loadWallet = isLoadWalletName(wallet.type)
                    return (
                      <TableRow key={resolveWalletId(wallet) || wallet.type}>
                        <TableCell className='font-medium max-w-[220px]'>
                          <span className='line-clamp-2'>{wallet.type}</span>
                          {(wallet.bankName || wallet.accountNumber) && (
                            <span className='block text-xs font-normal text-muted-foreground line-clamp-1'>
                              {[wallet.bankName, wallet.accountNumber].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {wallet.accountType ? (
                            <Badge variant='secondary' className={ACCOUNT_TYPE_BADGE_CLASS[wallet.accountType]}>
                              {ACCOUNT_TYPE_LABELS[wallet.accountType]}
                            </Badge>
                          ) : (
                            <span className='text-xs text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                        {isMobileShop && (
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
                        )}
                        <TableCell className='text-green-600 font-semibold whitespace-nowrap'>
                          Rs {formatWalletBalance(wallet.balance)}
                        </TableCell>
                        {isMobileShop && (
                          <>
                            <TableCell className='text-blue-600 whitespace-nowrap'>
                              {Number(wallet.commissionRate ?? 0).toFixed(2)}%
                            </TableCell>
                            <TableCell className='text-orange-600 whitespace-nowrap'>
                              {Number(wallet.withdrawalCommissionRate ?? 0).toFixed(2)}%
                            </TableCell>
                            <TableCell className='text-purple-600 whitespace-nowrap'>
                              {Number(wallet.depositCommissionRate ?? 0).toFixed(2)}%
                            </TableCell>
                          </>
                        )}
                        <TableCell className='text-sm text-muted-foreground whitespace-nowrap'>
                          {formatWalletDate(wallet.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <div className='flex flex-wrap items-center justify-end gap-1'>
                            <Button size='sm' variant='outline' className='h-8' asChild title='View statement'>
                              <Link to='/bank-account-statement' search={{ walletType: wallet.type }}>
                                <ScrollText className='h-4 w-4' />
                              </Link>
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-8'
                              onClick={() => handleEdit(wallet)}
                              title='Edit bank account'
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
                              title='Delete bank account'
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
            <AlertDialogTitle>Delete bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete bank account &quot;{walletToDelete?.type}&quot; only if it has zero balance and no linked records.
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
              {isDeleting ? 'Deleting...' : 'Delete Bank Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePageShell>
  )
}
