import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { MobilePageShell } from '../components/mobile-page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  useCreateLoadTransactionMutation,
  useGetLoadTransactionsQuery,
  useGetWalletsQuery,
  useCreateLoadPurchaseMutation,
  useGetLoadPurchasesQuery,
} from '@/stores/mobile-shop.api'
import { format } from 'date-fns'

type PurchaseFormState = {
  walletId: string
  walletType: string
  amount: string
  supplierName: string
  paymentMethod: 'cash' | 'bank'
  date: string
}

type LoadSaleFormState = {
  walletId: string
  walletType: string
  amount: string
  commissionRate: string
  extraCharge: string
  mobileNumber: string
  date: string
}

const initialPurchaseForm: PurchaseFormState = {
  walletId: '',
  walletType: '',
  amount: '0',
  supplierName: '',
  paymentMethod: 'cash',
  date: format(new Date(), 'yyyy-MM-dd'),
}

const initialSaleForm: LoadSaleFormState = {
  walletId: '',
  walletType: '',
  amount: '0',
  commissionRate: '0',
  extraCharge: '0',
  mobileNumber: '',
  date: format(new Date(), 'yyyy-MM-dd'),
}

export default function LoadManagementPage() {
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(initialPurchaseForm)
  const [saleForm, setSaleForm] = useState<LoadSaleFormState>(initialSaleForm)

  const [createLoadPurchase, { isLoading: isSavingPurchase }] = useCreateLoadPurchaseMutation()
  const [createLoadTransaction, { isLoading: isSavingSale }] = useCreateLoadTransactionMutation()

  const { data: walletsData } = useGetWalletsQuery()
  const { data: purchasesData } = useGetLoadPurchasesQuery()
  const { data: transactionsData } = useGetLoadTransactionsQuery()

  const wallets = walletsData?.results ?? []
  const purchases = purchasesData?.results ?? []
  const transactions = transactionsData?.results ?? []

  // Calculate profit in real-time for sales
  const saleProfit = useMemo(() => {
    const amount = Number(saleForm.amount) || 0
    const commissionRate = Number(saleForm.commissionRate) || 0
    const extraCharge = Number(saleForm.extraCharge) || 0

    const commissionProfit = (amount * commissionRate) / 100
    const totalProfit = commissionProfit + extraCharge

    return {
      amount,
      commissionRate,
      commissionProfit,
      extraCharge,
      totalProfit,
    }
  }, [saleForm.amount, saleForm.commissionRate, saleForm.extraCharge])

  const handlePurchaseChange = (field: keyof PurchaseFormState, value: string) => {
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => w.id === value)
      setPurchaseForm(prev => ({
        ...prev,
        walletId: value,
        walletType: selectedWallet?.type || '',
      }))
    } else {
      setPurchaseForm(prev => ({ ...prev, [field]: value }))
    }
  }

  const handleSaleChange = (field: keyof LoadSaleFormState, value: string) => {
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => w.id === value)
      setSaleForm(prev => ({
        ...prev,
        walletId: value,
        walletType: selectedWallet?.type || '',
      }))
      return
    }

    setSaleForm(prev => ({ ...prev, [field]: value }))
  }

  const handlePurchaseSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!purchaseForm.walletId) {
      toast.error('Please select a wallet')
      return
    }

    if (!purchaseForm.amount || Number(purchaseForm.amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    try {
      await createLoadPurchase({
        walletType: purchaseForm.walletType,
        amount: Number(purchaseForm.amount),
        supplierName: purchaseForm.supplierName.trim() || undefined,
        paymentMethod: purchaseForm.paymentMethod as 'cash' | 'bank',
        date: purchaseForm.date ? new Date(purchaseForm.date).toISOString() : new Date().toISOString(),
      }).unwrap()
      toast.success('Load purchase recorded!')
      setPurchaseForm(initialPurchaseForm)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save load purchase')
    }
  }

  const handleSaleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!saleForm.walletId) {
      toast.error('Please select a wallet')
      return
    }

    if (!saleForm.amount || Number(saleForm.amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (!saleForm.walletType) {
      toast.error('Selected wallet is invalid')
      return
    }

    try {
      await createLoadTransaction({
        walletId: saleForm.walletId,
        walletType: saleForm.walletType,
        amount: Number(saleForm.amount),
        commissionRate: Number(saleForm.commissionRate),
        extraCharge: Number(saleForm.extraCharge),
        mobileNumber: saleForm.mobileNumber || 'N/A',
        date: saleForm.date ? new Date(saleForm.date).toISOString() : new Date().toISOString(),
        type: 'normal',
        network: 'none',
        paymentMethod: 'cash',
      }).unwrap()
      toast.success('Load sold successfully!')
      setSaleForm(initialSaleForm)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save load transaction')
    }
  }

  return (
    <MobilePageShell
      title='Load Management'
      description='Purchase and sell mobile load with automatic profit tracking'
    >
      <div className='grid gap-6'>
        {/* Purchase Load Section */}
        <Card className='border-2 border-blue-200'>
          <CardHeader>
            <CardTitle className='text-blue-700'>📥 Purchase Load</CardTitle>
          </CardHeader>
          <CardContent>
            <form className='space-y-6' onSubmit={handlePurchaseSubmit}>
              {/* Row 1: Wallet & Supplier */}
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='purchase-wallet'>Select Wallet *</Label>
                  <Select
                    value={purchaseForm.walletId}
                    onValueChange={(value) => handlePurchaseChange('walletId', value)}
                  >
                    <SelectTrigger id='purchase-wallet'>
                      <SelectValue placeholder='Choose wallet...' />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.length === 0 ? (
                        <div className='p-2 text-sm text-muted-foreground'>
                          No wallets available. Create one in Wallet Management.
                        </div>
                      ) : (
                        wallets.map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='supplier'>Supplier Name - Optional</Label>
                  <Input
                    id='supplier'
                    placeholder='e.g., Jazz Supplier, Local Agent'
                    value={purchaseForm.supplierName}
                    onChange={(e) => handlePurchaseChange('supplierName', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 2: Amount & Payment Method */}
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='purchase-amount'>Amount (Rs) *</Label>
                  <Input
                    id='purchase-amount'
                    type='number'
                    min='0'
                    step='0.01'
                    placeholder='e.g., 10000, 50000'
                    value={purchaseForm.amount}
                    onChange={(e) => handlePurchaseChange('amount', e.target.value)}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='payment-method'>Payment Method</Label>
                  <Select value={purchaseForm.paymentMethod} onValueChange={(value) => handlePurchaseChange('paymentMethod', value as 'cash' | 'bank')}>
                    <SelectTrigger id='payment-method'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='cash'>Cash</SelectItem>
                      <SelectItem value='bank'>Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3: Date */}
              <div className='space-y-2 md:max-w-md'>
                <Label htmlFor='purchase-date'>Date</Label>
                <Input
                  id='purchase-date'
                  type='date'
                  value={purchaseForm.date}
                  onChange={(e) => handlePurchaseChange('date', e.target.value)}
                />
              </div>

              {/* Submit Button */}
              <Button
                size='lg'
                type='submit'
                disabled={isSavingPurchase || !purchaseForm.walletId}
                className='w-full md:w-auto bg-blue-600 hover:bg-blue-700'
              >
                {isSavingPurchase ? 'Processing...' : '✓ Save Load Purchase'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sell Load Section */}
        <Card className='border-2 border-green-200'>
          <CardHeader>
            <CardTitle className='text-green-700'>📤 Sell Mobile Load</CardTitle>
          </CardHeader>
          <CardContent>
            <form className='space-y-6' onSubmit={handleSaleSubmit}>
              {/* Row 1: Wallet & Amount */}
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='sale-wallet'>Select Wallet *</Label>
                  <Select
                    value={saleForm.walletId}
                    onValueChange={(value) => handleSaleChange('walletId', value)}
                  >
                    <SelectTrigger id='sale-wallet'>
                      <SelectValue placeholder='Choose wallet...' />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.length === 0 ? (
                        <div className='p-2 text-sm text-muted-foreground'>
                          No wallets available. Create one in Wallet Management.
                        </div>
                      ) : (
                        wallets.map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='sale-amount'>Load Amount (Rs) *</Label>
                  <Input
                    id='sale-amount'
                    type='number'
                    min='0'
                    step='0.01'
                    placeholder='e.g., 100, 500, 1000'
                    value={saleForm.amount}
                    onChange={(e) => handleSaleChange('amount', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 2: Commission & Extra Charges */}
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='commission'>Commission Rate (%) - Optional</Label>
                  <Input
                    id='commission'
                    type='number'
                    min='0'
                    max='100'
                    step='0.01'
                    placeholder='e.g., 2, 2.5, 5'
                    value={saleForm.commissionRate}
                    onChange={(e) => handleSaleChange('commissionRate', e.target.value)}
                  />
                  <p className='text-xs text-muted-foreground'>
                    Commission Profit: Rs {saleProfit.commissionProfit.toFixed(2)}
                  </p>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='extra'>Extra Charges (Rs) - Optional</Label>
                  <Input
                    id='extra'
                    type='number'
                    min='0'
                    step='0.01'
                    placeholder='e.g., 10, 20'
                    value={saleForm.extraCharge}
                    onChange={(e) => handleSaleChange('extraCharge', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 3: Phone & Date */}
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='phone'>Customer Phone Number - Optional</Label>
                  <Input
                    id='phone'
                    type='tel'
                    placeholder='e.g., 03001234567 (if known)'
                    value={saleForm.mobileNumber}
                    onChange={(e) => handleSaleChange('mobileNumber', e.target.value)}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='sale-date'>Date</Label>
                  <Input
                    id='sale-date'
                    type='date'
                    value={saleForm.date}
                    onChange={(e) => handleSaleChange('date', e.target.value)}
                  />
                </div>
              </div>

              {/* Profit Summary Box */}
              <Card className='bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'>
                <CardContent className='pt-6'>
                  <div className='space-y-3'>
                    <div className='flex justify-between items-center'>
                      <span className='text-muted-foreground'>Load Amount:</span>
                      <span className='font-semibold'>Rs {saleProfit.amount.toFixed(2)}</span>
                    </div>
                    {saleProfit.commissionProfit > 0 && (
                      <div className='flex justify-between items-center'>
                        <span className='text-muted-foreground'>Commission Profit ({saleForm.commissionRate}%):</span>
                        <span className='text-green-600 font-semibold'>+ Rs {saleProfit.commissionProfit.toFixed(2)}</span>
                      </div>
                    )}
                    {saleProfit.extraCharge > 0 && (
                      <div className='flex justify-between items-center'>
                        <span className='text-muted-foreground'>Extra Charges:</span>
                        <span className='text-green-600 font-semibold'>+ Rs {saleProfit.extraCharge.toFixed(2)}</span>
                      </div>
                    )}
                    <div className='border-t-2 border-green-200 pt-3 flex justify-between items-center'>
                      <span className='text-lg font-bold'>Total Profit:</span>
                      <span className='text-2xl font-bold text-green-700'>Rs {saleProfit.totalProfit.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Submit Button */}
              <Button
                size='lg'
                type='submit'
                disabled={isSavingSale || !saleForm.walletId || !saleForm.amount}
                className='w-full md:w-auto bg-green-600 hover:bg-green-700'
              >
                {isSavingSale ? 'Processing...' : '✓ Confirm & Save Load Sale'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent Purchases */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Load Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            {purchases.length === 0 ? (
              <div className='flex items-center justify-center h-32'>
                <p className='text-muted-foreground'>No purchases yet. Start with the form above!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className='text-sm'>{format(new Date(purchase.date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className='font-medium'>{purchase.supplierName || '-'}</TableCell>
                      <TableCell>{purchase.walletType}</TableCell>
                      <TableCell>Rs {Number(purchase.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className='text-sm capitalize'>{purchase.paymentMethod}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Load Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className='flex items-center justify-center h-32'>
                <p className='text-muted-foreground'>No sales yet. Start with the form above!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Phone (if recorded)</TableHead>
                    <TableHead className='text-green-600 font-bold'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className='text-sm'>{format(new Date(transaction.date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className='font-medium'>{transaction.walletType}</TableCell>
                      <TableCell>Rs {Number(transaction.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className='text-sm'>{transaction.mobileNumber === 'N/A' ? '-' : transaction.mobileNumber}</TableCell>
                      <TableCell className='text-green-600 font-bold'>Rs {Number(transaction.profit || 0).toFixed(2)}</TableCell>
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