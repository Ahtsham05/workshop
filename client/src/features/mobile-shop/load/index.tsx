import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { MobilePageShell } from '../components/mobile-page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { SimplePagination } from '@/components/ui/simple-pagination'
import {
  useCreateLoadTransactionMutation,
  useGetLoadTransactionsQuery,
  useGetWalletsQuery,
  useCreateLoadPurchaseMutation,
  useGetLoadPurchasesQuery,
  useCreateCashWithdrawalMutation,
  useGetCashWithdrawalsQuery,
} from '@/stores/mobile-shop.api'
import { format } from 'date-fns'

type PurchaseFormState = {
  walletId: string
  walletType: string
  amount: string
  supplierName: string
  paymentMethod: 'cash' | 'bank'
  commissionRate: string
  extraCharge: string
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

type WithdrawalFormState = {
  walletId: string
  walletType: string
  amount: string
  transactionType: 'withdrawal' | 'deposit'
  customerName: string
  customerNumber: string
  commissionRate: string
  extraCharge: string
  notes: string
  date: string
}

const initialPurchaseForm: PurchaseFormState = {
  walletId: '',
  walletType: '',
  amount: '0',
  supplierName: '',
  paymentMethod: 'cash',
  commissionRate: '0',
  extraCharge: '0',
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

const initialWithdrawalForm: WithdrawalFormState = {
  walletId: '',
  walletType: '',
  amount: '0',
  transactionType: 'withdrawal',
  customerName: '',
  customerNumber: '',
  commissionRate: '0',
  extraCharge: '0',
  notes: '',
  date: format(new Date(), 'yyyy-MM-dd'),
}

export default function LoadManagementPage() {
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(initialPurchaseForm)
  const [saleForm, setSaleForm] = useState<LoadSaleFormState>(initialSaleForm)
  const [withdrawalForm, setWithdrawalForm] = useState<WithdrawalFormState>(initialWithdrawalForm)

  // Pagination state for each history table
  const [purchasePage, setPurchasePage] = useState(1)
  const [purchaseLimit, setPurchaseLimit] = useState(10)
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactionLimit, setTransactionLimit] = useState(10)
  const [withdrawalPage, setWithdrawalPage] = useState(1)
  const [withdrawalLimit, setWithdrawalLimit] = useState(10)

  const [createLoadPurchase, { isLoading: isSavingPurchase }] = useCreateLoadPurchaseMutation()
  const [createLoadTransaction, { isLoading: isSavingSale }] = useCreateLoadTransactionMutation()
  const [createCashWithdrawal, { isLoading: isSavingWithdrawal }] = useCreateCashWithdrawalMutation()

  const { data: walletsData } = useGetWalletsQuery()
  const { data: purchasesData } = useGetLoadPurchasesQuery({ page: purchasePage, limit: purchaseLimit })
  const { data: transactionsData } = useGetLoadTransactionsQuery({ page: transactionPage, limit: transactionLimit })
  const { data: withdrawalsData } = useGetCashWithdrawalsQuery({ page: withdrawalPage, limit: withdrawalLimit })

  const wallets = walletsData?.results ?? []
  const purchases = purchasesData?.results ?? []
  const transactions = transactionsData?.results ?? []
  const withdrawals = withdrawalsData?.results ?? []

  const saleProfit = useMemo(() => {
    const amount = Number(saleForm.amount) || 0
    const commissionRate = Number(saleForm.commissionRate) || 0
    const extraCharge = Number(saleForm.extraCharge) || 0
    const commissionProfit = (amount * commissionRate) / 100
    return { amount, commissionRate, commissionProfit, extraCharge, totalProfit: commissionProfit + extraCharge }
  }, [saleForm.amount, saleForm.commissionRate, saleForm.extraCharge])

  const purchaseProfit = useMemo(() => {
    const amount = Number(purchaseForm.amount) || 0
    const commissionRate = Number(purchaseForm.commissionRate) || 0
    const extraCharge = Number(purchaseForm.extraCharge) || 0
    const commissionProfit = (amount * commissionRate) / 100
    return { commissionProfit, total: commissionProfit + extraCharge }
  }, [purchaseForm.amount, purchaseForm.commissionRate, purchaseForm.extraCharge])

  const withdrawalProfit = useMemo(() => {
    const amount = Number(withdrawalForm.amount) || 0
    const commissionRate = Number(withdrawalForm.commissionRate) || 0
    const extraCharge = Number(withdrawalForm.extraCharge) || 0
    const commissionProfit = (amount * commissionRate) / 100
    return { commissionProfit, totalProfit: commissionProfit + extraCharge }
  }, [withdrawalForm.amount, withdrawalForm.commissionRate, withdrawalForm.extraCharge])

  const handlePurchaseChange = (field: keyof PurchaseFormState, value: string) => {
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => w.id === value)
      setPurchaseForm(prev => ({
        ...prev,
        walletId: value,
        walletType: selectedWallet?.type || '',
        commissionRate: selectedWallet ? String(selectedWallet.commissionRate ?? 0) : prev.commissionRate,
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
        commissionRate: selectedWallet ? String(selectedWallet.commissionRate ?? 0) : prev.commissionRate,
      }))
      return
    }
    setSaleForm(prev => ({ ...prev, [field]: value }))
  }

  const handleWithdrawalChange = (field: keyof WithdrawalFormState, value: string) => {
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => w.id === value)
      setWithdrawalForm(prev => {
        const rate = prev.transactionType === 'withdrawal'
          ? String(selectedWallet?.withdrawalCommissionRate ?? 0)
          : String(selectedWallet?.depositCommissionRate ?? 0)
        return {
          ...prev,
          walletId: value,
          walletType: selectedWallet?.type || '',
          commissionRate: selectedWallet ? rate : prev.commissionRate,
        }
      })
      return
    }
    if (field === 'transactionType') {
      const selectedWallet = wallets.find(w => w.id === withdrawalForm.walletId)
      const rate = value === 'withdrawal'
        ? String(selectedWallet?.withdrawalCommissionRate ?? 0)
        : String(selectedWallet?.depositCommissionRate ?? 0)
      setWithdrawalForm(prev => ({
        ...prev,
        transactionType: value as 'withdrawal' | 'deposit',
        commissionRate: selectedWallet ? rate : prev.commissionRate,
      }))
      return
    }
    setWithdrawalForm(prev => ({ ...prev, [field]: value }))
  }

  const handlePurchaseSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!purchaseForm.walletId) { toast.error('Please select a wallet'); return }
    if (!purchaseForm.amount || Number(purchaseForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    try {
      await createLoadPurchase({
        walletType: purchaseForm.walletType,
        amount: Number(purchaseForm.amount),
        supplierName: purchaseForm.supplierName.trim() || undefined,
        paymentMethod: purchaseForm.paymentMethod as 'cash' | 'bank',
        commissionRate: Number(purchaseForm.commissionRate),
        extraCharge: Number(purchaseForm.extraCharge),
        profit: 0,
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
    if (!saleForm.walletId) { toast.error('Please select a wallet'); return }
    if (!saleForm.amount || Number(saleForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    if (!saleForm.walletType) { toast.error('Selected wallet is invalid'); return }
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

  const handleWithdrawalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!withdrawalForm.walletId) { toast.error('Please select a wallet'); return }
    if (!withdrawalForm.amount || Number(withdrawalForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    if (!withdrawalForm.walletType) { toast.error('Selected wallet is invalid'); return }
    try {
      await createCashWithdrawal({
        walletId: withdrawalForm.walletId,
        walletType: withdrawalForm.walletType,
        amount: Number(withdrawalForm.amount),
        transactionType: withdrawalForm.transactionType,
        customerName: withdrawalForm.customerName.trim() || undefined,
        customerNumber: withdrawalForm.customerNumber.trim() || undefined,
        commissionRate: Number(withdrawalForm.commissionRate),
        extraCharge: Number(withdrawalForm.extraCharge),
        notes: withdrawalForm.notes.trim() || undefined,
        date: withdrawalForm.date ? new Date(withdrawalForm.date).toISOString() : new Date().toISOString(),
      }).unwrap()
      toast.success('Cash withdrawal recorded!')
      setWithdrawalForm(initialWithdrawalForm)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save cash withdrawal')
    }
  }

  return (
    <MobilePageShell
      title='Load Management'
      description='Purchase, sell mobile load and manage cash withdrawals'
    >
      <Tabs defaultValue='sell'>
        <TabsList className='mb-4'>
          <TabsTrigger value='purchase'>📥 Purchase Load</TabsTrigger>
          <TabsTrigger value='sell'>📤 Sell Load</TabsTrigger>
          <TabsTrigger value='withdrawal'>💸 Cash Withdrawal</TabsTrigger>
        </TabsList>

        {/* ── PURCHASE LOAD TAB ── */}
        <TabsContent value='purchase'>
          <div className='grid gap-6'>
            <Card className='border-2 border-blue-200'>
              <CardHeader>
                <CardTitle className='text-blue-700'>📥 Purchase Load</CardTitle>
              </CardHeader>
              <CardContent>
                <form className='space-y-6' onSubmit={handlePurchaseSubmit}>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-wallet'>Select Wallet *</Label>
                      <Select value={purchaseForm.walletId} onValueChange={(v) => handlePurchaseChange('walletId', v)}>
                        <SelectTrigger id='purchase-wallet'>
                          <SelectValue placeholder='Choose wallet...' />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No wallets available. Create one in Wallet Management.</div>
                          ) : wallets.map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='supplier'>Supplier Name - Optional</Label>
                      <Input id='supplier' placeholder='e.g., Jazz Supplier, Local Agent' value={purchaseForm.supplierName} onChange={(e) => handlePurchaseChange('supplierName', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-amount'>Amount (Rs) *</Label>
                      <Input id='purchase-amount' type='number' min='0' step='0.01' value={purchaseForm.amount} onChange={(e) => handlePurchaseChange('amount', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-payment-method'>Payment Method</Label>
                      <Select value={purchaseForm.paymentMethod} onValueChange={(v) => handlePurchaseChange('paymentMethod', v as 'cash' | 'bank')}>
                        <SelectTrigger id='purchase-payment-method'><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value='cash'>Cash</SelectItem>
                          <SelectItem value='bank'>Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-commission'>Supplier Commission (%) - Optional</Label>
                      <Input id='purchase-commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 1, 1.5' value={purchaseForm.commissionRate} onChange={(e) => handlePurchaseChange('commissionRate', e.target.value)} />
                      {purchaseProfit.commissionProfit > 0 && (
                        <p className='text-xs text-green-600'>Commission Savings: Rs {purchaseProfit.commissionProfit.toFixed(2)}</p>
                      )}
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-extra'>Extra Discount (Rs) - Optional</Label>
                      <Input id='purchase-extra' type='number' min='0' step='0.01' placeholder='e.g., 10, 20' value={purchaseForm.extraCharge} onChange={(e) => handlePurchaseChange('extraCharge', e.target.value)} />
                    </div>
                  </div>

                  {purchaseProfit.total > 0 && (
                    <Card className='bg-blue-50 border-blue-200'>
                      <CardContent className='pt-4 pb-3'>
                        <div className='flex justify-between items-center'>
                          <span className='font-semibold text-blue-700'>Total Purchase Savings / Bonus:</span>
                          <span className='text-xl font-bold text-blue-700'>Rs {purchaseProfit.total.toFixed(2)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className='space-y-2 md:max-w-md'>
                    <Label htmlFor='purchase-date'>Date</Label>
                    <Input id='purchase-date' type='date' value={purchaseForm.date} onChange={(e) => handlePurchaseChange('date', e.target.value)} />
                  </div>

                  <Button size='lg' type='submit' disabled={isSavingPurchase || !purchaseForm.walletId} className='w-full md:w-auto bg-blue-600 hover:bg-blue-700'>
                    {isSavingPurchase ? 'Processing...' : '✓ Save Load Purchase'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent Load Purchases</CardTitle></CardHeader>
              <CardContent>
                {purchases.length === 0 ? (
                  <div className='flex items-center justify-center h-32'><p className='text-muted-foreground'>No purchases yet.</p></div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Commission %</TableHead>
                        <TableHead className='text-green-600'>Savings</TableHead>
                        <TableHead>Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className='text-sm'>{format(new Date(p.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{p.walletType}</TableCell>
                          <TableCell className='font-medium'>{p.supplierName || '-'}</TableCell>
                          <TableCell>Rs {Number(p.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell>{Number(p.commissionRate || 0).toFixed(2)}%</TableCell>
                          <TableCell className='text-green-600 font-semibold'>Rs {Number(p.profit || 0).toFixed(2)}</TableCell>
                          <TableCell className='text-sm capitalize'>{p.paymentMethod}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <SimplePagination
                    currentPage={purchasePage}
                    totalPages={purchasesData?.totalPages ?? 1}
                    totalResults={purchasesData?.totalResults}
                    limit={purchaseLimit}
                    onPageChange={setPurchasePage}
                    onLimitChange={setPurchaseLimit}
                    className='mt-3'
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── SELL LOAD TAB ── */}
        <TabsContent value='sell'>
          <div className='grid gap-6'>
            <Card className='border-2 border-green-200'>
              <CardHeader>
                <CardTitle className='text-green-700'>📤 Sell Mobile Load</CardTitle>
              </CardHeader>
              <CardContent>
                <form className='space-y-6' onSubmit={handleSaleSubmit}>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-wallet'>Select Wallet *</Label>
                      <Select value={saleForm.walletId} onValueChange={(v) => handleSaleChange('walletId', v)}>
                        <SelectTrigger id='sale-wallet'><SelectValue placeholder='Choose wallet...' /></SelectTrigger>
                        <SelectContent>
                          {wallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No wallets available.</div>
                          ) : wallets.map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-amount'>Load Amount (Rs) *</Label>
                      <Input id='sale-amount' type='number' min='0' step='0.01' placeholder='e.g., 100, 500, 1000' value={saleForm.amount} onChange={(e) => handleSaleChange('amount', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='commission'>Commission Rate (%) - Optional</Label>
                      <Input id='commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 2, 2.5, 5' value={saleForm.commissionRate} onChange={(e) => handleSaleChange('commissionRate', e.target.value)} />
                      <p className='text-xs text-muted-foreground'>Commission Profit: Rs {saleProfit.commissionProfit.toFixed(2)}</p>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='extra'>Extra Charges (Rs) - Optional</Label>
                      <Input id='extra' type='number' min='0' step='0.01' placeholder='e.g., 10, 20' value={saleForm.extraCharge} onChange={(e) => handleSaleChange('extraCharge', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='phone'>Customer Phone Number - Optional</Label>
                      <Input id='phone' type='tel' placeholder='e.g., 03001234567 (if known)' value={saleForm.mobileNumber} onChange={(e) => handleSaleChange('mobileNumber', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-date'>Date</Label>
                      <Input id='sale-date' type='date' value={saleForm.date} onChange={(e) => handleSaleChange('date', e.target.value)} />
                    </div>
                  </div>

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

                  <Button size='lg' type='submit' disabled={isSavingSale || !saleForm.walletId || !saleForm.amount} className='w-full md:w-auto bg-green-600 hover:bg-green-700'>
                    {isSavingSale ? 'Processing...' : '✓ Confirm & Save Load Sale'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent Load Sales</CardTitle></CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <div className='flex items-center justify-center h-32'><p className='text-muted-foreground'>No sales yet.</p></div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className='text-green-600 font-bold'>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className='text-sm'>{format(new Date(t.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className='font-medium'>{t.walletType}</TableCell>
                          <TableCell>Rs {Number(t.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className='text-sm'>{t.mobileNumber === 'N/A' ? '-' : t.mobileNumber}</TableCell>
                          <TableCell className='text-green-600 font-bold'>Rs {Number(t.profit || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <SimplePagination
                    currentPage={transactionPage}
                    totalPages={transactionsData?.totalPages ?? 1}
                    totalResults={transactionsData?.totalResults}
                    limit={transactionLimit}
                    onPageChange={setTransactionPage}
                    onLimitChange={setTransactionLimit}
                    className='mt-3'
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── CASH WITHDRAWAL TAB ── */}
        <TabsContent value='withdrawal'>
          <div className='grid gap-6'>
            <Card className='border-2 border-orange-200'>
              <CardHeader>
                <CardTitle className='text-orange-700'>💸 Cash Withdrawal / Transfer</CardTitle>
                <p className='text-sm text-muted-foreground mt-1'>
                  Select type: <strong>Withdrawal</strong> = customer gets cash (wallet ↑, you earn 2%) | <strong>Deposit</strong> = customer sends via wallet (wallet ↓, you earn 1%)
                </p>
              </CardHeader>
              <CardContent>
                <form className='space-y-6' onSubmit={handleWithdrawalSubmit}>

                  {/* Transaction Type Toggle */}
                  <div className='grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg'>
                    <button
                      type='button'
                      onClick={() => handleWithdrawalChange('transactionType', 'withdrawal')}
                      className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${withdrawalForm.transactionType === 'withdrawal' ? 'bg-white shadow text-orange-700 border border-orange-200' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      💸 Withdrawal (Customer gets cash)
                    </button>
                    <button
                      type='button'
                      onClick={() => handleWithdrawalChange('transactionType', 'deposit')}
                      className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${withdrawalForm.transactionType === 'deposit' ? 'bg-white shadow text-purple-700 border border-purple-200' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      📲 Deposit (Customer sends via wallet)
                    </button>
                  </div>

                  {withdrawalForm.transactionType === 'withdrawal' ? (
                    <div className='rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800'>
                      <strong>Withdrawal:</strong> Customer sends digital money → your wallet <strong>INCREASES</strong> → you give cash to customer. Commission collected from customer.
                    </div>
                  ) : (
                    <div className='rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800'>
                      <strong>Deposit/Send:</strong> Customer gives you cash → you send digital from wallet → your wallet <strong>DECREASES</strong>. Commission collected from customer.
                    </div>
                  )}

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-wallet'>Select Wallet *</Label>
                      <Select value={withdrawalForm.walletId} onValueChange={(v) => handleWithdrawalChange('walletId', v)}>
                        <SelectTrigger id='withdrawal-wallet'><SelectValue placeholder='Choose wallet...' /></SelectTrigger>
                        <SelectContent>
                          {wallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No wallets available.</div>
                          ) : wallets.map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-amount'>Amount (Rs) *</Label>
                      <Input id='withdrawal-amount' type='number' min='0' step='0.01' placeholder='e.g., 1000, 5000' value={withdrawalForm.amount} onChange={(e) => handleWithdrawalChange('amount', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='customer-name'>Customer Name - Optional</Label>
                      <Input id='customer-name' placeholder='e.g., Ahmed Khan' value={withdrawalForm.customerName} onChange={(e) => handleWithdrawalChange('customerName', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='customer-number'>Customer Account / Phone</Label>
                      <Input id='customer-number' type='tel' placeholder='e.g., 03001234567' value={withdrawalForm.customerNumber} onChange={(e) => handleWithdrawalChange('customerNumber', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-commission'>Commission Rate (%) - Optional</Label>
                      <Input id='withdrawal-commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 1, 1.5, 2' value={withdrawalForm.commissionRate} onChange={(e) => handleWithdrawalChange('commissionRate', e.target.value)} />
                      <p className='text-xs text-muted-foreground'>Commission Profit: Rs {withdrawalProfit.commissionProfit.toFixed(2)}</p>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-extra'>Extra Charges (Rs) - Optional</Label>
                      <Input id='withdrawal-extra' type='number' min='0' step='0.01' placeholder='e.g., 5, 10' value={withdrawalForm.extraCharge} onChange={(e) => handleWithdrawalChange('extraCharge', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-notes'>Notes - Optional</Label>
                      <Input id='withdrawal-notes' placeholder='Any additional notes' value={withdrawalForm.notes} onChange={(e) => handleWithdrawalChange('notes', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-date'>Date</Label>
                      <Input id='withdrawal-date' type='date' value={withdrawalForm.date} onChange={(e) => handleWithdrawalChange('date', e.target.value)} />
                    </div>
                  </div>

                  <Card className='bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200'>
                    <CardContent className='pt-6'>
                      <div className='space-y-3'>
                        <div className='flex justify-between items-center'>
                          <span className='text-muted-foreground'>
                            {withdrawalForm.transactionType === 'withdrawal' ? 'Amount Received into Wallet:' : 'Amount Sent from Wallet:'}
                          </span>
                          <span className={`font-semibold ${withdrawalForm.transactionType === 'withdrawal' ? 'text-green-600' : 'text-red-600'}`}>
                            {withdrawalForm.transactionType === 'withdrawal' ? '+' : '-'} Rs {Number(withdrawalForm.amount || 0).toFixed(2)}
                          </span>
                        </div>
                        {withdrawalProfit.commissionProfit > 0 && (
                          <div className='flex justify-between items-center'>
                            <span className='text-muted-foreground'>Commission ({withdrawalForm.commissionRate}%):</span>
                            <span className='text-green-600 font-semibold'>+ Rs {withdrawalProfit.commissionProfit.toFixed(2)}</span>
                          </div>
                        )}
                        {Number(withdrawalForm.extraCharge || 0) > 0 && (
                          <div className='flex justify-between items-center'>
                            <span className='text-muted-foreground'>Extra Charges:</span>
                            <span className='text-green-600 font-semibold'>+ Rs {Number(withdrawalForm.extraCharge).toFixed(2)}</span>
                          </div>
                        )}
                        <div className='border-t-2 border-orange-200 pt-3 flex justify-between items-center'>
                          <span className='text-lg font-bold'>Your Profit:</span>
                          <span className='text-2xl font-bold text-orange-700'>Rs {withdrawalProfit.totalProfit.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Button size='lg' type='submit' disabled={isSavingWithdrawal || !withdrawalForm.walletId || !withdrawalForm.amount} className='w-full md:w-auto bg-orange-500 hover:bg-orange-600'>
                    {isSavingWithdrawal ? 'Processing...' : '✓ Confirm Cash Withdrawal'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent Cash Withdrawals</CardTitle></CardHeader>
              <CardContent>
                {withdrawals.length === 0 ? (
                  <div className='flex items-center justify-center h-32'><p className='text-muted-foreground'>No withdrawals yet.</p></div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Account / Phone</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Commission %</TableHead>
                        <TableHead className='text-orange-600 font-bold'>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawals.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className='text-sm'>{format(new Date(w.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${w.transactionType === 'withdrawal' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                              {w.transactionType === 'withdrawal' ? '💸 Withdrawal' : '📲 Deposit'}
                            </span>
                          </TableCell>
                          <TableCell className='font-medium'>{w.walletType}</TableCell>
                          <TableCell>{w.customerName || '-'}</TableCell>
                          <TableCell>{w.customerNumber || '-'}</TableCell>
                          <TableCell className={w.transactionType === 'withdrawal' ? 'text-green-600' : 'text-red-600'}>
                            {w.transactionType === 'withdrawal' ? '+' : '-'} Rs {Number(w.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell>{Number(w.commissionRate || 0).toFixed(2)}%</TableCell>
                          <TableCell className='text-orange-600 font-bold'>Rs {Number(w.profit || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <SimplePagination
                    currentPage={withdrawalPage}
                    totalPages={withdrawalsData?.totalPages ?? 1}
                    totalResults={withdrawalsData?.totalResults}
                    limit={withdrawalLimit}
                    onPageChange={setWithdrawalPage}
                    onLimitChange={setWithdrawalLimit}
                    className='mt-3'
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </MobilePageShell>
  )
}
