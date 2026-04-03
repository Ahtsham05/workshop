import { useState } from 'react'
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
import { useGetWalletsQuery, useUpsertWalletMutation } from '@/stores/mobile-shop.api'
import { Edit2 } from 'lucide-react'
import { format, isValid } from 'date-fns'

const formatWalletDate = (dateValue?: string) => {
  if (!dateValue) {
    return '-'
  }

  const parsedDate = new Date(dateValue)
  if (!isValid(parsedDate)) {
    return '-'
  }

  return format(parsedDate, 'MMM dd, yyyy')
}

const formatWalletBalance = (value?: number) => {
  const numericValue = Number(value)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0
  return safeValue.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function WalletPage() {
  const { data, isLoading } = useGetWalletsQuery()
  const [upsertWallet, { isLoading: isSaving }] = useUpsertWalletMutation()
  const [walletName, setWalletName] = useState('')
  const [balance, setBalance] = useState('0')
  const [commissionRate, setCommissionRate] = useState('0')
  const [withdrawalCommissionRate, setWithdrawalCommissionRate] = useState('0')
  const [depositCommissionRate, setDepositCommissionRate] = useState('0')
  const [editingId, setEditingId] = useState<string | null>(null)

  const wallets = data?.results ?? []

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
        ...(editingId && { id: editingId })
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

  const handleEdit = (wallet: any) => {
    setEditingId(wallet.id)
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

  return (
    <MobilePageShell
      title='Wallet Management'
      description='Create and manage your wallets (JazzCash, EasyPaisa, Bank Account, SIM Card, etc.)'
    >
      <div className='grid gap-6 lg:grid-cols-[1fr_2fr]'>
        {/* Add/Edit Wallet Form */}
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Wallet' : 'Add New Wallet'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className='space-y-4' onSubmit={handleSubmit}>
              <div className='space-y-2'>
                <Label htmlFor='wallet-name'>Wallet Name</Label>
                <Input
                  id='wallet-name'
                  placeholder='e.g., JazzCash, EasyPaisa, Bank Account, SIM Card'
                  value={walletName}
                  onChange={(event) => setWalletName(event.target.value)}
                />
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
                />
                <p className='text-xs text-muted-foreground'>Auto-filled when selling load</p>
              </div>
              <div className='border rounded-lg p-3 space-y-3 bg-muted/30'>
                <p className='text-sm font-medium text-muted-foreground'>Cash Withdrawal / Deposit Rates</p>
                <div className='space-y-2'>
                  <Label htmlFor='withdrawal-rate'>Withdrawal Commission (%) — Customer withdraws cash</Label>
                  <Input
                    id='withdrawal-rate'
                    min='0'
                    max='100'
                    step='0.01'
                    type='number'
                    placeholder='e.g., 2'
                    value={withdrawalCommissionRate}
                    onChange={(event) => setWithdrawalCommissionRate(event.target.value)}
                  />
                  <p className='text-xs text-muted-foreground'>Customer sends digital → you give cash. Wallet INCREASES.</p>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='deposit-rate'>Deposit Commission (%) — Customer deposits / sends via wallet</Label>
                  <Input
                    id='deposit-rate'
                    min='0'
                    max='100'
                    step='0.01'
                    type='number'
                    placeholder='e.g., 1'
                    value={depositCommissionRate}
                    onChange={(event) => setDepositCommissionRate(event.target.value)}
                  />
                  <p className='text-xs text-muted-foreground'>Customer gives cash → you send digital. Wallet DECREASES.</p>
                </div>
              </div>
              <div className='flex gap-2'>
                <Button className='flex-1' disabled={isSaving} type='submit'>
                  {isSaving ? 'Saving...' : editingId ? 'Update Wallet' : 'Create Wallet'}
                </Button>
                {editingId && (
                  <Button
                    variant='outline'
                    onClick={handleCancel}
                    type='button'
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Wallets List */}
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
              <div className='flex items-center justify-center h-40'>
                <p className='text-muted-foreground'>No wallets created yet. Add one to get started!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet Name</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Load Sale %</TableHead>
                    <TableHead>Withdrawal %</TableHead>
                    <TableHead>Deposit %</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((wallet) => (
                    <TableRow key={wallet.id}>
                      <TableCell className='font-medium'>{wallet.type}</TableCell>
                      <TableCell className='text-green-600 font-semibold'>Rs {formatWalletBalance(wallet.balance)}</TableCell>
                      <TableCell className='text-blue-600'>{Number(wallet.commissionRate ?? 0).toFixed(2)}%</TableCell>
                      <TableCell className='text-orange-600 font-medium'>{Number(wallet.withdrawalCommissionRate ?? 0).toFixed(2)}%</TableCell>
                      <TableCell className='text-purple-600 font-medium'>{Number(wallet.depositCommissionRate ?? 0).toFixed(2)}%</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{formatWalletDate(wallet.updatedAt)}</TableCell>
                      <TableCell className='flex gap-1'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => handleEdit(wallet)}
                        >
                          <Edit2 className='h-4 w-4' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MobilePageShell>
  )
}