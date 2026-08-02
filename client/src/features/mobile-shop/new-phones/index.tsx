import { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  PackageCheck, Smartphone, Wallet as WalletIcon, TrendingUp,
  ScanLine, ShoppingBag, Search, ListFilter, ShoppingCart, Trash2, Package, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { MobilePageShell } from '@/features/mobile-shop/components/mobile-page-shell'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { MobileReceiptOffer, type MobileReceiptData } from '@/features/mobile-shop/components/mobile-shop-receipt'
import { printMobileShopReceipt } from '@/features/mobile-shop/utils/mobile-shop-print-utils'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { toBusinessDateTimeLocal, parseBusinessDateTimeLocal, formatBusinessDate } from '@/lib/business-timezone'
import {
  buildMergedPaymentOptions, getWalletTypeFromOptionValue, isWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useGetImeisQuery, type ImeiRecord } from '@/stores/imei.api'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import {
  useGetNewPhoneStatsQuery, useCreateNewPhoneSaleMutation, useDeleteNewPhonePurchaseMutation,
} from '@/stores/newPhones.api'
import { isUsedPhonesBucketProduct } from '../old-phones/constants'
import { BuyNewPhoneDialog } from './components/buy-new-phone-dialog'
import type { RootState } from '@/stores/store'

const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString()}`

interface PhoneProductOption {
  id?: string
  _id?: string
  name: string
  price?: number
  trackImei?: boolean
  category?: string
}

interface CustomerOption {
  id?: string
  _id?: string
  name: string
  phone?: string
}

// Stable reference — an inline `[]` fallback would be a new array every render, retriggering
// any effect/memo keyed on it even though the data hasn't changed.
const EMPTY_CUSTOMERS: CustomerOption[] = []

const statusBadgeConfig: Record<string, { label: string; color: string }> = {
  in_stock: { label: 'In Stock', color: 'bg-sky-100 text-sky-700' },
  sold: { label: 'Sold', color: 'bg-green-100 text-green-700' },
  returned: { label: 'Returned', color: 'bg-amber-100 text-amber-700' },
  scrapped: { label: 'Scrapped', color: 'bg-gray-100 text-gray-600' },
  lost: { label: 'Lost', color: 'bg-orange-100 text-orange-700' },
  stolen: { label: 'Stolen', color: 'bg-red-100 text-red-700' },
}

const SELL_BASE_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit / Pay Later' },
]

type SellFormState = {
  customerId: string
  walkInName: string
  salePrice: string
  paymentMethod: string
  saleDate: string
  notes: string
}

const makeInitialSellForm = (): SellFormState => ({
  customerId: '',
  walkInName: '',
  salePrice: '',
  paymentMethod: 'cash',
  saleDate: toBusinessDateTimeLocal(),
  notes: '',
})

export default function NewPhonesPage() {
  const [buyDialogOpen, setBuyDialogOpen] = useState(false)

  const productsRedux = useSelector((s: RootState) => (s as unknown as { product?: { products?: PhoneProductOption[] } }).product?.products ?? [])
  // Exclude Old Phones' shared "Used Phones" bucket product — it's also trackImei-enabled
  // (every bought-back unit is a different phone), so without this filter it showed up
  // (and its used-phone units leaked into) the New Phone Inventory list below.
  const phoneProducts = useMemo(
    () => productsRedux.filter((p) => p.trackImei && !isUsedPhonesBucketProduct(p)),
    [productsRedux],
  )

  // Date range narrows the "Sold" / "Realized Profit" stat cards (and the Sold tab of the
  // list below) to a period — "in stock" / "capital in stock" stay a live snapshot
  // regardless, since what's on the shelf right now has no date range of its own.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const hasDateRange = Boolean(dateFrom || dateTo)

  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useGetNewPhoneStatsQuery({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []

  const { data: org } = useGetMyOrganizationQuery()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const [savedReceipt, setSavedReceipt] = useState<MobileReceiptData | null>(null)

  // ── Inventory ──
  const phoneProductIds = useMemo(
    () => phoneProducts.map((p) => (p.id || p._id) as string).filter(Boolean).join(','),
    [phoneProducts],
  )
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 400)
  const [statusTab, setStatusTab] = useState<'all' | 'in_stock' | 'sold'>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const { data: inventoryData, isLoading: isInventoryLoading } = useGetImeisQuery(
    {
      productId: phoneProductIds,
      search: debouncedSearch || undefined,
      status: statusTab === 'all' ? undefined : statusTab,
      // Only the Sold tab has a meaningful saleDate to filter by — applying the range on
      // All/In Stock would hide every in-stock unit (they have no saleDate at all).
      dateFrom: statusTab === 'sold' ? (dateFrom || undefined) : undefined,
      dateTo: statusTab === 'sold' ? (dateTo || undefined) : undefined,
      page,
      limit,
      sortBy: 'createdAt:-1',
    },
    { skip: !phoneProductIds },
  )

  // ── Sell ──
  const [sellUnit, setSellUnit] = useState<ImeiRecord | null>(null)
  const [sellForm, setSellForm] = useState<SellFormState>(makeInitialSellForm)
  const setSellField = <K extends keyof SellFormState>(key: K, value: SellFormState[K]) =>
    setSellForm((prev) => ({ ...prev, [key]: value }))

  const customersData = useGetAllCustomersQuery({ includeEmployees: true }).data as CustomerOption[] | undefined
  const customers = Array.isArray(customersData) ? customersData : EMPTY_CUSTOMERS
  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: (c.id || c._id) as string, label: c.name, sublabel: c.phone })),
    [customers],
  )
  // Selling is money-in — don't show wallet balances (see buildMergedPaymentOptions docs).
  const sellPaymentMethodOptions = buildMergedPaymentOptions(SELL_BASE_PAYMENT_METHODS, wallets, false)

  const [createNewPhoneSale, { isLoading: isSelling }] = useCreateNewPhoneSaleMutation()

  // ── Delete ──
  const [deleteUnit, setDeleteUnit] = useState<ImeiRecord | null>(null)
  const [deleteNewPhonePurchase, { isLoading: isDeleting }] = useDeleteNewPhonePurchaseMutation()

  const openSell = (unit: ImeiRecord) => {
    setSellUnit(unit)
    const product = phoneProducts.find((p) => (p.id || p._id) === unit.productId)
    setSellForm({ ...makeInitialSellForm(), salePrice: String(product?.price || unit.purchasePrice || '') })
  }

  const handleSell = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!sellUnit) return
    const salePrice = Number(sellForm.salePrice)
    if (!(salePrice > 0)) { toast.error('Sale price must be greater than 0'); return }

    const isWallet = isWalletOptionValue(sellForm.paymentMethod)
    const isCredit = sellForm.paymentMethod === 'credit'
    if (isWallet && !getWalletTypeFromOptionValue(sellForm.paymentMethod)) { toast.error('Select a wallet'); return }

    const customer = customers.find((c) => (c.id || c._id) === sellForm.customerId)
    const customerName = customer?.name || sellForm.walkInName.trim() || 'Walk-in Customer'
    const deviceLabel = [sellUnit.productName, sellUnit.imei].filter(Boolean).join(' — ')

    try {
      await createNewPhoneSale({
        items: [{
          productId: sellUnit.productId,
          name: sellUnit.productName || 'Phone',
          quantity: 1,
          unitPrice: salePrice,
          subtotal: salePrice,
          imeis: [sellUnit.imei],
        }],
        customerId: customer ? (customer.id || customer._id) : 'walk-in',
        customerName: customer?.name,
        walkInCustomerName: customer ? undefined : (sellForm.walkInName.trim() || 'Walk-in Customer'),
        type: isCredit ? 'credit' : 'cash',
        subtotal: salePrice,
        tax: 0,
        discount: 0,
        total: salePrice,
        paidAmount: isCredit ? 0 : salePrice,
        paymentMethod: isWallet ? 'wallet' : sellForm.paymentMethod,
        walletType: isWallet ? getWalletTypeFromOptionValue(sellForm.paymentMethod) : undefined,
        invoiceDate: sellForm.saleDate ? parseBusinessDateTimeLocal(sellForm.saleDate) : undefined,
        notes: sellForm.notes.trim() || undefined,
      }).unwrap()
      toast.success('Phone sold')
      setSavedReceipt({
        title: 'Phone sale',
        subtitle: deviceLabel,
        issuedAt: formatBusinessDate(sellForm.saleDate || new Date().toISOString()),
        lines: [
          { label: 'Customer', value: customerName },
          { label: 'Device', value: deviceLabel },
          { label: 'Sale price', value: fmtAmt(salePrice) },
          { label: 'Payment', value: isWallet ? `Wallet (${getWalletTypeFromOptionValue(sellForm.paymentMethod)})` : sellForm.paymentMethod },
          ...(isCredit ? [{ label: 'Status', value: 'Credit — pay later' }] : []),
        ],
      })
      setSellUnit(null)
      refetchStats()
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to record sale')
    }
  }

  const handleDelete = async () => {
    if (!deleteUnit?.purchaseId) return
    try {
      await deleteNewPhonePurchase(deleteUnit.purchaseId).unwrap()
      toast.success('Purchase deleted')
      setDeleteUnit(null)
      refetchStats()
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to delete purchase')
    }
  }

  return (
    <MobilePageShell
      title='New Phones'
      description='Stock and sell brand-new mobile phones — supplier purchases, customer sales, and inventory tracking.'
      backTo={{ to: '/mobile-shop/used-phones', label: 'Mobile Phones' }}
    >
      {savedReceipt && (
        <MobileReceiptOffer
          onPrint={() => printMobileShopReceipt(savedReceipt, org, branchData?.invoiceNote)}
          onDismiss={() => setSavedReceipt(null)}
        />
      )}

      {/* ── Date range + Buy New Phone ── */}
      <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Label className='text-sm text-muted-foreground shrink-0'>Profit period:</Label>
          <Input type='date' value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className='w-[150px] h-9' />
          <span className='text-sm text-muted-foreground'>to</span>
          <Input type='date' value={dateTo} onChange={(e) => setDateTo(e.target.value)} className='w-[150px] h-9' />
          {hasDateRange && (
            <Button variant='ghost' size='sm' onClick={() => { setDateFrom(''); setDateTo('') }}>
              <X className='h-3.5 w-3.5 mr-1' /> Clear
            </Button>
          )}
        </div>
        <Button onClick={() => setBuyDialogOpen(true)}>
          <ShoppingBag className='h-4 w-4 mr-1.5' /> Buy New Phone
        </Button>
      </div>

      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6'>
        <StatCard title='In Stock' value={stats?.in_stock ?? 0} description='Bought, not yet sold' icon={<PackageCheck />} tone='sky' isLoading={isStatsLoading} />
        <StatCard title='Sold' value={stats?.sold ?? 0} description={hasDateRange ? 'Sold in period' : 'Sold to customers'} icon={<Smartphone />} tone='emerald' isLoading={isStatsLoading} />
        <StatCard title='Capital in Stock' value={fmtAmt(stats?.capitalInStock)} description='Tied up in unsold units' icon={<WalletIcon />} tone='amber' isLoading={isStatsLoading} />
        <StatCard title='Realized Profit' value={fmtAmt(stats?.soldProfit)} description={hasDateRange ? 'On units sold in period' : 'On units sold so far'} icon={<TrendingUp />} tone='emerald' isLoading={isStatsLoading} />
      </div>

      {/* ── Inventory (full width) ── */}
      <Card className='flex flex-col'>
        <CardHeader className='flex flex-row items-center justify-between gap-4 flex-wrap'>
          <CardTitle className='flex items-center gap-2'>
            <ListFilter className='h-5 w-5 text-primary' /> New Phone Inventory
          </CardTitle>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none' />
            <Input
              placeholder='Search IMEI, model...'
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className='pl-8 h-9'
            />
          </div>
        </CardHeader>
        <CardContent className='flex-1 overflow-auto'>
          <Tabs value={statusTab} onValueChange={(v) => { setStatusTab(v as typeof statusTab); setPage(1) }} className='mb-4'>
            <TabsList>
              <TabsTrigger value='all'>All</TabsTrigger>
              <TabsTrigger value='in_stock'>In Stock</TabsTrigger>
              <TabsTrigger value='sold'>Sold</TabsTrigger>
            </TabsList>
          </Tabs>

          {!phoneProductIds ? (
            <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
              <Package className='h-12 w-12 mb-3 opacity-30' />
              <p className='text-base font-medium'>No phone models yet</p>
              <p className='text-sm'>Buy your first phone using the "Buy New Phone" button above</p>
            </div>
          ) : isInventoryLoading ? (
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className='h-14 rounded-lg bg-muted animate-pulse' />)}
            </div>
          ) : (inventoryData?.results.length ?? 0) === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
              <Smartphone className='h-12 w-12 mb-3 opacity-30' />
              <p className='text-base font-medium'>No phones found</p>
              <p className='text-sm'>Buy your first phone using the "Buy New Phone" button above</p>
            </div>
          ) : (
            <>
              {/* Card list — phones/small tablets, avoids horizontal table scrolling */}
              <div className='md:hidden space-y-2'>
                {inventoryData!.results.map((unit) => (
                  <div key={unit.id} className='w-full rounded-lg border bg-background p-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <div className='font-medium truncate'>{unit.productName || '—'}</div>
                        <div className='text-xs text-muted-foreground font-mono flex items-center gap-1'>
                          <ScanLine className='h-3 w-3 shrink-0' />{unit.imei2 ? `${unit.imei} · ${unit.imei2}` : unit.imei}
                        </div>
                      </div>
                      <Badge className={cn('text-xs shrink-0', statusBadgeConfig[unit.status]?.color)}>
                        {statusBadgeConfig[unit.status]?.label ?? unit.status}
                      </Badge>
                    </div>
                    <div className='mt-2 flex items-center justify-between'>
                      <div className='text-sm'>
                        <span className='text-muted-foreground'>Cost </span>
                        <span className='font-semibold'>{fmtAmt(unit.purchasePrice)}</span>
                        {unit.status === 'sold' && (
                          <span className='text-muted-foreground'> · Sold {fmtAmt(unit.salePrice)}</span>
                        )}
                      </div>
                      {unit.status === 'in_stock' && (
                        <div className='flex items-center gap-1.5'>
                          <Button size='sm' onClick={() => openSell(unit)}>
                            <ShoppingCart className='h-3.5 w-3.5 mr-1' /> Sell
                          </Button>
                          {unit.purchaseId && (
                            <Button
                              size='icon'
                              variant='outline'
                              className='h-8 w-8 text-destructive border-destructive/30 hover:bg-destructive/10'
                              onClick={() => setDeleteUnit(unit)}
                            >
                              <Trash2 className='h-3.5 w-3.5' />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Table — tablets and up */}
              <div className='hidden md:block overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryData!.results.map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell>
                          <div className='font-medium whitespace-nowrap'>{unit.productName || '—'}</div>
                          <div className='text-xs text-muted-foreground font-mono flex items-center gap-1'>
                            <ScanLine className='h-3 w-3' />{unit.imei2 ? `${unit.imei} · ${unit.imei2}` : unit.imei}
                          </div>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>
                          <div className='font-medium'>{fmtAmt(unit.purchasePrice)}</div>
                          {unit.status === 'sold' && (
                            <div className='text-xs text-muted-foreground'>Sold {fmtAmt(unit.salePrice)}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs', statusBadgeConfig[unit.status]?.color)}>
                            {statusBadgeConfig[unit.status]?.label ?? unit.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {unit.status === 'in_stock' && (
                            <div className='flex items-center gap-1.5'>
                              <Button size='sm' onClick={() => openSell(unit)}>
                                <ShoppingCart className='h-3.5 w-3.5 mr-1' /> Sell
                              </Button>
                              {unit.purchaseId && (
                                <Button
                                  size='icon'
                                  variant='outline'
                                  className='h-8 w-8 text-destructive border-destructive/30 hover:bg-destructive/10'
                                  onClick={() => setDeleteUnit(unit)}
                                >
                                  <Trash2 className='h-3.5 w-3.5' />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          <SimplePagination
            currentPage={page}
            totalPages={inventoryData?.totalPages ?? 1}
            totalResults={inventoryData?.totalResults}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1) }}
            className='mt-3'
          />
        </CardContent>
      </Card>

      {/* ── Buy New Phone Dialog ── */}
      <BuyNewPhoneDialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen} onSuccess={refetchStats} />

      {/* ── Sell Dialog ── */}
      <Dialog open={!!sellUnit} onOpenChange={(open) => !open && setSellUnit(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <ShoppingCart className='h-5 w-5 text-primary' /> Sell Phone
            </DialogTitle>
          </DialogHeader>
          {sellUnit && (
            <form className='grid gap-4' onSubmit={handleSell}>
              <div className='rounded-lg border bg-muted/30 p-3'>
                <div className='font-medium'>{sellUnit.productName || 'Phone'}</div>
                <div className='text-xs text-muted-foreground font-mono flex items-center gap-1'>
                  <ScanLine className='h-3 w-3' />{sellUnit.imei2 ? `${sellUnit.imei} · ${sellUnit.imei2}` : sellUnit.imei}
                </div>
              </div>

              <div className='space-y-1'>
                <Label>Customer</Label>
                <SearchableSelect
                  options={customerOptions}
                  value={sellForm.customerId}
                  onValueChange={(v) => setSellField('customerId', v)}
                  placeholder='Walk-in customer'
                  searchPlaceholder='Search customers...'
                  clearLabel='Walk-in customer'
                  emptyText='No customers found'
                />
              </div>
              {!sellForm.customerId && (
                <div className='space-y-1'>
                  <Label>Walk-in Customer Name</Label>
                  <Input placeholder='e.g. Ahmad Khan' value={sellForm.walkInName} onChange={(e) => setSellField('walkInName', e.target.value)} />
                </div>
              )}

              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>Sale Price (Rs) *</Label>
                  <Input type='number' min='0' step='1' value={sellForm.salePrice} onChange={(e) => setSellField('salePrice', e.target.value)} />
                </div>
                <div className='space-y-1'>
                  <Label>Payment Method</Label>
                  <Select value={sellForm.paymentMethod} onValueChange={(v) => setSellField('paymentMethod', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sellPaymentMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='space-y-1'>
                <Label>Date / Time</Label>
                <Input type='datetime-local' value={sellForm.saleDate} onChange={(e) => setSellField('saleDate', e.target.value)} />
              </div>

              <div className='space-y-1'>
                <Label>Notes</Label>
                <Textarea rows={2} placeholder='Optional notes' value={sellForm.notes} onChange={(e) => setSellField('notes', e.target.value)} />
              </div>

              <DialogFooter>
                <Button type='button' variant='outline' onClick={() => setSellUnit(null)}>Cancel</Button>
                <Button type='submit' disabled={isSelling}>{isSelling ? 'Selling...' : 'Confirm Sale'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteUnit} onOpenChange={(open) => !open && setDeleteUnit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteUnit?.productName || 'this phone'} ({deleteUnit?.imei}) from inventory, reverse
              the {fmtAmt(deleteUnit?.purchasePrice)} payment from Cash Book/Wallet/Supplier ledger, and delete its
              IMEI record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className='bg-destructive hover:bg-destructive/90'>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePageShell>
  )
}
