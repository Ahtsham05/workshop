import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { MobilePageShell } from '../components/mobile-page-shell'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
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
import { SimplePagination } from '@/components/ui/simple-pagination'
import {
  useCreateSimSaleMutation,
  useGetSimSalesQuery,
  useUpdateSimSaleMutation,
  useDeleteSimSaleMutation,
  useGetWalletsQuery,
  type SimSaleRecord,
} from '@/stores/mobile-shop.api'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { fetchAllProducts } from '@/stores/product.slice'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { ListPrintButton } from '@/features/mobile-shop/components/list-print-button'
import { MobileReceiptPreviewDialog } from '@/features/mobile-shop/components/mobile-receipt-preview-dialog'
import {
  MobileReceiptOffer,
  type MobileReceiptData,
} from '@/features/mobile-shop/components/mobile-shop-receipt'
import { printMobileShopReceipt } from '@/features/mobile-shop/utils/mobile-shop-print-utils'
import { buildSimSaleReceipt } from '@/features/mobile-shop/utils/mobile-shop-receipt-builders'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import {
  makeEnterChain,
  MOBILE_FORM_KEYBOARD_HINT,
  useCtrlEnterSubmit,
} from '@/lib/mobile-form-keyboard'

type SimSaleFormState = {
  date: string
  productId: string
  productName: string
  simAmount: string
  walletType: string
  loadAmount: string
  saleAmount: string
  customerId: string
  customerName: string
  customerMobile: string
  customerCNIC: string
  customerLocation: string
  paymentMethod: 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'wallet'
  paymentWalletType: string
}

const makeEmptyForm = (): SimSaleFormState => ({
  date: new Date().toISOString().split('T')[0],
  productId: '',
  productName: '',
  simAmount: '',
  walletType: '',
  loadAmount: '0',
  saleAmount: '',
  customerId: '',
  customerName: '',
  customerMobile: '',
  customerCNIC: '',
  customerLocation: '',
  paymentMethod: 'cash',
  paymentWalletType: '',
})

export default function SimSalePage({ initialCustomerId }: { initialCustomerId?: string }) {
  const dispatch = useDispatch()
  const [page, setPage] = useState(1)
  const limit = 10

  const [form, setForm] = useState<SimSaleFormState>(makeEmptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [savedReceipt, setSavedReceipt] = useState<MobileReceiptData | null>(null)
  const [previewReceipt, setPreviewReceipt] = useState<MobileReceiptData | null>(null)
  const { data: org } = useGetMyOrganizationQuery()
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })

  const { data: walletsData } = useGetWalletsQuery()
  const { data: customersData } = useGetAllCustomersQuery(undefined)
  const { data: salesData, isLoading } = useGetSimSalesQuery({ page, limit })
  const productsRedux = useSelector((s: RootState) => (s as any).product?.products ?? [])

  const [createSimSale, { isLoading: creating }] = useCreateSimSaleMutation()
  const [updateSimSale, { isLoading: updating }] = useUpdateSimSaleMutation()
  const [deleteSimSale] = useDeleteSimSaleMutation()

  const wallets = walletsData?.results ?? []
  const customers = Array.isArray(customersData) ? customersData : []
  const products = Array.isArray(productsRedux) ? productsRedux : []
  const sales = salesData?.results ?? []
  const totalPages = salesData?.totalPages ?? 1

  useEffect(() => {
    if (!products.length) {
      dispatch(fetchAllProducts({}) as any)
    }
  }, [dispatch, products.length])

  useEffect(() => {
    const customerId = initialCustomerId?.trim()
    if (!customerId) return
    const selected = customers.find((c: any) => c._id === customerId || c.id === customerId)
    setShowForm(true)
    setForm((prev) => ({
      ...prev,
      customerId,
      customerName: selected?.name || prev.customerName,
      customerMobile: selected?.phone || prev.customerMobile,
    }))
  }, [initialCustomerId, customers])

  // Computed values
  const simAmount = Number(form.simAmount) || 0
  const loadAmount = Number(form.loadAmount) || 0
  const saleAmount = Number(form.saleAmount) || 0
  const purchaseAmount = simAmount + loadAmount
  const commission = saleAmount - purchaseAmount

  const selectedWallet = wallets.find(w => w.type === form.walletType)
  const selectedPaymentWallet = wallets.find(w => w.type === form.paymentWalletType)
  const selectedProductRow = form.productId
    ? products.find(
        (p: any) => p.id === form.productId || p._id === form.productId
      )
    : undefined

  const handleChange = (field: keyof SimSaleFormState, value: string) => {
    if (field === 'productId') {
      const normalizedValue = value === '__none__' ? '' : value
      const selectedProduct = products.find(
        (p: any) => p.id === normalizedValue || p._id === normalizedValue || p.value === normalizedValue
      )
      const cost = selectedProduct?.cost ?? selectedProduct?.price
      const price = selectedProduct?.price ?? selectedProduct?.cost
      setForm(prev => ({
        ...prev,
        productId: normalizedValue,
        productName: selectedProduct?.name || '',
        simAmount: selectedProduct ? String(Number(cost ?? 0)) : '',
        saleAmount: selectedProduct ? String(Number(price ?? 0)) : prev.saleAmount,
      }))
      return
    }
    if (field === 'paymentMethod') {
      setForm(prev => ({
        ...prev,
        paymentMethod: value as SimSaleFormState['paymentMethod'],
        paymentWalletType: value === 'wallet' ? prev.paymentWalletType : '',
      }))
      return
    }
    if (field === 'paymentWalletType') {
      const normalizedValue = value === '__none__' ? '' : value
      setForm(prev => ({ ...prev, paymentWalletType: normalizedValue }))
      return
    }
    if (field === 'walletType') {
      const normalizedValue = value === '__none__' ? '' : value
      setForm(prev => ({ ...prev, walletType: normalizedValue }))
      return
    }
    if (field === 'customerId') {
      const normalizedValue = value === '__none__' ? '' : value
      const selectedCustomer = customers.find(
        (c: any) => c.id === normalizedValue || c._id === normalizedValue
      )
      setForm(prev => ({
        ...prev,
        customerId: normalizedValue,
        customerName: selectedCustomer?.name || '',
      }))
      return
    }
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setForm(makeEmptyForm())
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async () => {
    if (!form.simAmount || Number(form.simAmount) < 0) {
      toast.error('Please enter SIM purchase price')
      return
    }
    if (!form.saleAmount || Number(form.saleAmount) <= 0) {
      toast.error('Please enter sale price')
      return
    }
    if (form.paymentMethod === 'wallet' && !form.paymentWalletType) {
      toast.error('Please select payment wallet')
      return
    }

    const payload = {
      date: form.date,
      productId: form.productId || undefined,
      productName: form.productName || undefined,
      simAmount: Number(form.simAmount),
      walletType: form.walletType || undefined,
      loadAmount: Number(form.loadAmount) || 0,
      saleAmount: Number(form.saleAmount),
      customerId: form.customerId || undefined,
      customerName: form.customerName || undefined,
      customerMobile: form.customerMobile || undefined,
      customerCNIC: form.customerCNIC || undefined,
      customerLocation: form.customerLocation || undefined,
      paymentMethod: form.paymentMethod,
      paymentWalletType: form.paymentMethod === 'wallet' ? (form.paymentWalletType || undefined) : undefined,
    }

    try {
      let record: SimSaleRecord
      if (editingId) {
        record = await updateSimSale({ id: editingId, body: payload }).unwrap()
        toast.success('Sim sale updated')
      } else {
        record = await createSimSale(payload).unwrap()
        toast.success('Sim sale saved')
      }
      dispatch(fetchAllProducts({}) as any)
      setSavedReceipt(buildSimSaleReceipt(record))
      resetForm()
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save sim sale')
    }
  }

  const simEnter = useMemo(
    () =>
      makeEnterChain(
        [
          'sim-date',
          'sim-product',
          'sim-wallet',
          'sim-customer',
          'customer-mobile',
          'customer-cnic',
          'customer-location',
          'sim-payment-method',
          'sim-amount',
          'load-amount',
          'sale-amount',
        ],
        { onSubmit: () => handleSubmit() },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable submit handler for keyboard chain
    [],
  )

  useCtrlEnterSubmit(() => handleSubmit(), creating || updating)

  useEffect(() => {
    if (showForm) {
      window.setTimeout(() => simEnter.focusFirst(), 80)
    }
  }, [showForm, simEnter])

  const handleEdit = (sale: any) => {
    setForm({
      date: sale.date ? new Date(sale.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      productId: sale.productId?.id || sale.productId?._id || sale.productId || '',
      productName: sale.productName || '',
      simAmount: String(sale.simAmount ?? ''),
      walletType: sale.walletType || '',
      loadAmount: String(sale.loadAmount ?? 0),
      saleAmount: String(sale.saleAmount ?? ''),
      customerId: sale.customerId?.id || sale.customerId?._id || sale.customerId || '',
      customerName: sale.customerName || '',
      customerMobile: sale.customerMobile || '',
      customerCNIC: sale.customerCNIC || '',
      customerLocation: sale.customerLocation || '',
      paymentMethod: sale.paymentMethod || 'cash',
      paymentWalletType: sale.paymentWalletType || '',
    })
    setEditingId(sale.id)
    setShowForm(true)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteSimSale(deleteId).unwrap()
      toast.success('Sim sale deleted')
      dispatch(fetchAllProducts({}) as any)
      setDeleteId(null)
    } catch {
      toast.error('Failed to delete sim sale')
    }
  }

  return (
    <MobilePageShell title='Sim Sale' description={`Manage SIM card sales · ${MOBILE_FORM_KEYBOARD_HINT}`}>
      <div className='space-y-6'>
        {savedReceipt ? (
          <MobileReceiptOffer
            onPrint={() => {
              if (savedReceipt) printMobileShopReceipt(savedReceipt, org, branchData?.invoiceNote)
            }}
            onDismiss={() => setSavedReceipt(null)}
          />
        ) : null}

        <MobileReceiptPreviewDialog
          receipt={previewReceipt}
          open={!!previewReceipt}
          onOpenChange={(open) => !open && setPreviewReceipt(null)}
          organization={org}
          invoiceNote={branchData?.invoiceNote}
        />

        {/* Toolbar */}
        <div className='flex justify-end'>
          <Button onClick={() => { resetForm(); setShowForm(true) }}>
            <Plus className='mr-2 h-4 w-4' /> New Sim Sale
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? 'Edit Sim Sale' : 'New Sim Sale'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                {/* Date */}
                <div className='space-y-2'>
                  <Label>Date</Label>
                  <Input
                    type='date'
                    value={form.date}
                    onChange={e => handleChange('date', e.target.value)}
                    {...simEnter.enterProps('sim-date')}
                  />
                </div>

                {/* Item / Product */}
                <div className='space-y-2'>
                  <Label>Item (SIM Product)</Label>
                  <SearchableSelect
                    options={products.map((p: any) => ({
                      value: p.id || p._id,
                      label: p.name,
                      sublabel:
                        [typeof p.stockQuantity === 'number' ? `Stock: ${p.stockQuantity}` : null, p.barcode || null]
                          .filter(Boolean)
                          .join(' · ') || undefined,
                    }))}
                    value={form.productId}
                    onValueChange={v => handleChange('productId', v)}
                    placeholder='-- None --'
                    searchPlaceholder='Search products...'
                    clearLabel='-- None --'
                    emptyText='No products found.'
                    {...simEnter.enterProps('sim-product')}
                  />
                  {selectedProductRow && typeof selectedProductRow.stockQuantity === 'number' && selectedProductRow.stockQuantity < 1 && (
                    <p className='text-sm text-destructive'>No stock left for this product. Add inventory or choose another SIM.</p>
                  )}
                </div>

                {/* Load A/C */}
                <div className='space-y-2'>
                  <Label>
                    Load A/C
                    {selectedWallet && (
                      <span className='ml-2 text-xs text-muted-foreground'>
                        Balance: {selectedWallet.balance?.toFixed(2)}
                      </span>
                    )}
                  </Label>
                  <Select
                    value={form.walletType || '__none__'}
                    onValueChange={v => handleChange('walletType', v)}
                  >
                    <SelectTrigger {...simEnter.enterProps('sim-wallet')}>
                      <SelectValue placeholder='Select load account' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>-- None --</SelectItem>
                      {wallets.filter(w => w.isActive).map(w => (
                        <SelectItem key={w.id} value={w.type}>
                          {w.type} — {w.balance?.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Customer A/C */}
                <div className='space-y-2'>
                  <Label>Customer A/C</Label>
                  <SearchableSelect
                    options={customers.map((c: any) => ({
                      value: c.id || c._id,
                      label: c.name,
                      sublabel: c.phone || c.mobile || undefined,
                    }))}
                    value={form.customerId}
                    onValueChange={v => handleChange('customerId', v)}
                    placeholder='Nothing selected'
                    searchPlaceholder='Search customers...'
                    clearLabel='Nothing selected'
                    emptyText='No customers found.'
                    {...simEnter.enterProps('sim-customer')}
                  />
                </div>

                {/* Customer Mobile */}
                <div className='space-y-2'>
                  <Label>Customer Mobile</Label>
                  <Input
                    placeholder='03xxxxxxxxx'
                    value={form.customerMobile}
                    onChange={e => handleChange('customerMobile', e.target.value)}
                    {...simEnter.enterProps('customer-mobile')}
                  />
                </div>

                {/* Customer CNIC */}
                <div className='space-y-2'>
                  <Label>Customer CNIC</Label>
                  <Input
                    placeholder='XXXXX-XXXXXXX-X'
                    value={form.customerCNIC}
                    onChange={e => handleChange('customerCNIC', e.target.value)}
                    {...simEnter.enterProps('customer-cnic')}
                  />
                </div>

                {/* Customer Location */}
                <div className='space-y-2'>
                  <Label>Customer Location</Label>
                  <Input
                    placeholder='Enter location'
                    value={form.customerLocation}
                    onChange={e => handleChange('customerLocation', e.target.value)}
                    {...simEnter.enterProps('customer-location')}
                  />
                </div>

                {/* Payment Method */}
                <div className='space-y-2'>
                  <Label>Payment Method</Label>
                  <Select
                    value={form.paymentMethod}
                    onValueChange={v => handleChange('paymentMethod', v)}
                  >
                    <SelectTrigger {...simEnter.enterProps('sim-payment-method')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='cash'>Cash</SelectItem>
                      <SelectItem value='bank'>Bank</SelectItem>
                      <SelectItem value='jazzcash'>JazzCash</SelectItem>
                      <SelectItem value='easypaisa'>EasyPaisa</SelectItem>
                      <SelectItem value='wallet'>Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.paymentMethod === 'wallet' && (
                  <div className='space-y-2'>
                    <Label>
                      Payment Wallet
                      {selectedPaymentWallet && (
                        <span className='ml-2 text-xs text-muted-foreground'>
                          Balance: {selectedPaymentWallet.balance?.toFixed(2)}
                        </span>
                      )}
                    </Label>
                    <Select
                      value={form.paymentWalletType || '__none__'}
                      onValueChange={v => handleChange('paymentWalletType', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Select payment wallet' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='__none__'>-- None --</SelectItem>
                        {wallets.filter(w => w.isActive).map(w => (
                          <SelectItem key={w.id} value={w.type}>
                            {w.type} — {w.balance?.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Right-side amounts */}
              <div className='mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                {/* SIM purchase price (inventory cost) */}
                <div className='space-y-2'>
                  <Label>Purchase Price (SIM)</Label>
                  <Input
                    type='number'
                    min={0}
                    placeholder='0.00'
                    value={form.simAmount}
                    onChange={e => handleChange('simAmount', e.target.value)}
                    {...simEnter.enterProps('sim-amount')}
                  />
                  <p className='text-xs text-muted-foreground'>Your purchase price per unit (defaults from product purchase price).</p>
                </div>

                {/* Load Amount */}
                <div className='space-y-2'>
                  <Label>Load Amount</Label>
                  <Input
                    type='number'
                    min={0}
                    placeholder='0'
                    value={form.loadAmount}
                    onChange={e => handleChange('loadAmount', e.target.value)}
                    {...simEnter.enterProps('load-amount')}
                  />
                </div>

                {/* Purchase Amount (read-only) */}
                <div className='space-y-2'>
                  <Label>Purchase Amount</Label>
                  <Input
                    type='number'
                    readOnly
                    className='bg-muted'
                    value={purchaseAmount.toFixed(2)}
                  />
                </div>

                {/* Sale price to customer */}
                <div className='space-y-2'>
                  <Label>Sale Price</Label>
                  <Input
                    type='number'
                    min={0.01}
                    placeholder='0.00'
                    value={form.saleAmount}
                    onChange={e => handleChange('saleAmount', e.target.value)}
                    {...simEnter.enterProps('sale-amount')}
                  />
                  <p className='text-xs text-muted-foreground'>Sale price (defaults from product retail price).</p>
                </div>

                {/* Commission (read-only) */}
                <div className='space-y-2'>
                  <Label>Commission / Profit</Label>
                  <Input
                    type='number'
                    readOnly
                    className={`bg-muted ${commission < 0 ? 'text-red-500' : ''}`}
                    value={commission.toFixed(2)}
                  />
                </div>
              </div>

              <div className='mt-6 flex gap-2'>
                <Button onClick={handleSubmit} disabled={creating || updating}>
                  {editingId ? 'Update' : 'Save'}
                </Button>
                <Button variant='outline' onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Sim Sale History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className='text-center text-muted-foreground'>Loading...</p>
            ) : sales.length === 0 ? (
              <p className='text-center text-muted-foreground'>No sim sales found</p>
            ) : (
              <>
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Load A/C</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Load</TableHead>
                        <TableHead>Cost + load</TableHead>
                        <TableHead>Sale Price</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Payment Wallet</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map(sale => (
                        <TableRow key={sale.id}>
                          <TableCell className='font-medium'>#{sale.jobNumber}</TableCell>
                          <TableCell>{format(new Date(sale.date), 'dd-MM-yyyy')}</TableCell>
                          <TableCell>{sale.productName || '—'}</TableCell>
                          <TableCell>{sale.walletType || '—'}</TableCell>
                          <TableCell>{sale.customerName || '—'}</TableCell>
                          <TableCell>{Number(sale.simAmount).toFixed(2)}</TableCell>
                          <TableCell>{Number(sale.loadAmount).toFixed(2)}</TableCell>
                          <TableCell>{Number(sale.purchaseAmount).toFixed(2)}</TableCell>
                          <TableCell>{Number(sale.saleAmount).toFixed(2)}</TableCell>
                          <TableCell className={sale.commission < 0 ? 'text-red-500' : 'text-green-600'}>
                            {Number(sale.commission).toFixed(2)}
                          </TableCell>
                          <TableCell className='capitalize'>{sale.paymentMethod || 'cash'}</TableCell>
                          <TableCell>{sale.paymentWalletType || '—'}</TableCell>
                          <TableCell>
                            <div className='flex gap-1'>
                              <ListPrintButton onClick={() => setPreviewReceipt(buildSimSaleReceipt(sale))} />
                              <Button size='icon' variant='ghost' onClick={() => handleEdit(sale)}>
                                <Pencil className='h-4 w-4' />
                              </Button>
                              <Button size='icon' variant='ghost' onClick={() => setDeleteId(sale.id)}>
                                <Trash2 className='h-4 w-4 text-red-500' />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className='mt-4'>
                    <SimplePagination currentPage={page} totalPages={totalPages} limit={limit} onPageChange={setPage} />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sim Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the sim sale and reverse the wallet balance. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePageShell>
  )
}
