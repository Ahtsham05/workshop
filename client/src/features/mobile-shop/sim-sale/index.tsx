import { useState, useEffect } from 'react'
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
} from '@/stores/mobile-shop.api'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { fetchAllProducts } from '@/stores/product.slice'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

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
  paymentMethod: 'cash' | 'bank' | 'jazzcash' | 'easypaisa'
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
})

export default function SimSalePage() {
  const dispatch = useDispatch()
  const [page, setPage] = useState(1)
  const limit = 10

  const [form, setForm] = useState<SimSaleFormState>(makeEmptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

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

  // Computed values
  const simAmount = Number(form.simAmount) || 0
  const loadAmount = Number(form.loadAmount) || 0
  const saleAmount = Number(form.saleAmount) || 0
  const purchaseAmount = simAmount + loadAmount
  const commission = saleAmount - purchaseAmount

  const selectedWallet = wallets.find(w => w.type === form.walletType)

  const handleChange = (field: keyof SimSaleFormState, value: string) => {
    if (field === 'productId') {
      const normalizedValue = value === '__none__' ? '' : value
      const selectedProduct = products.find(
        (p: any) => p.id === normalizedValue || p._id === normalizedValue || p.value === normalizedValue
      )
      setForm(prev => ({
        ...prev,
        productId: normalizedValue,
        productName: selectedProduct?.name || '',
        simAmount: selectedProduct ? String(selectedProduct.price ?? selectedProduct.cost ?? '') : prev.simAmount,
      }))
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
      toast.error('Please enter SIM amount')
      return
    }
    if (!form.saleAmount || Number(form.saleAmount) <= 0) {
      toast.error('Please enter sale amount')
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
    }

    try {
      if (editingId) {
        await updateSimSale({ id: editingId, body: payload }).unwrap()
        toast.success('Sim sale updated')
      } else {
        await createSimSale(payload).unwrap()
        toast.success('Sim sale saved')
      }
      resetForm()
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save sim sale')
    }
  }

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
    })
    setEditingId(sale.id)
    setShowForm(true)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteSimSale(deleteId).unwrap()
      toast.success('Sim sale deleted')
      setDeleteId(null)
    } catch {
      toast.error('Failed to delete sim sale')
    }
  }

  return (
    <MobilePageShell title='Sim Sale' description='Manage SIM card sales'>
      <div className='space-y-6'>
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
                  />
                </div>

                {/* Item / Product */}
                <div className='space-y-2'>
                  <Label>Item (SIM Product)</Label>
                  <SearchableSelect
                    options={products.map((p: any) => ({
                      value: p.id || p._id,
                      label: p.name,
                      sublabel: p.barcode || undefined,
                    }))}
                    value={form.productId}
                    onValueChange={v => handleChange('productId', v)}
                    placeholder='-- None --'
                    searchPlaceholder='Search products...'
                    clearLabel='-- None --'
                    emptyText='No products found.'
                  />
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
                    <SelectTrigger>
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
                  />
                </div>

                {/* Customer Mobile */}
                <div className='space-y-2'>
                  <Label>Customer Mobile</Label>
                  <Input
                    placeholder='03xxxxxxxxx'
                    value={form.customerMobile}
                    onChange={e => handleChange('customerMobile', e.target.value)}
                  />
                </div>

                {/* Customer CNIC */}
                <div className='space-y-2'>
                  <Label>Customer CNIC</Label>
                  <Input
                    placeholder='XXXXX-XXXXXXX-X'
                    value={form.customerCNIC}
                    onChange={e => handleChange('customerCNIC', e.target.value)}
                  />
                </div>

                {/* Customer Location */}
                <div className='space-y-2'>
                  <Label>Customer Location</Label>
                  <Input
                    placeholder='Enter location'
                    value={form.customerLocation}
                    onChange={e => handleChange('customerLocation', e.target.value)}
                  />
                </div>

                {/* Payment Method */}
                <div className='space-y-2'>
                  <Label>Payment Method</Label>
                  <Select
                    value={form.paymentMethod}
                    onValueChange={v => handleChange('paymentMethod', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='cash'>Cash</SelectItem>
                      <SelectItem value='bank'>Bank</SelectItem>
                      <SelectItem value='jazzcash'>JazzCash</SelectItem>
                      <SelectItem value='easypaisa'>EasyPaisa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right-side amounts */}
              <div className='mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                {/* Sim Amount */}
                <div className='space-y-2'>
                  <Label>Sim Amount</Label>
                  <Input
                    type='number'
                    min={0}
                    placeholder='0.00'
                    value={form.simAmount}
                    onChange={e => handleChange('simAmount', e.target.value)}
                  />
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

                {/* Sale Amount */}
                <div className='space-y-2'>
                  <Label>Sale Amount</Label>
                  <Input
                    type='number'
                    min={0.01}
                    placeholder='0.00'
                    value={form.saleAmount}
                    onChange={e => handleChange('saleAmount', e.target.value)}
                  />
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
                        <TableHead>SIM Amt</TableHead>
                        <TableHead>Load Amt</TableHead>
                        <TableHead>Purchase Amt</TableHead>
                        <TableHead>Sale Amt</TableHead>
                        <TableHead>Commission</TableHead>
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
                          <TableCell>
                            <div className='flex gap-1'>
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
