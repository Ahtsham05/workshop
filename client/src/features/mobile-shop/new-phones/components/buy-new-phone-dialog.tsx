import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Package, Truck, ScanLine, Banknote, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  EntityCreateShortcutButton, EntityQuickCreateDialogs, type QuickCreateState,
} from '@/components/entity-create-shortcut'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { toBusinessDateTimeLocal, parseBusinessDateTimeLocal } from '@/lib/business-timezone'
import { buildMergedPaymentOptions, getWalletTypeFromOptionValue, isWalletOptionValue } from '@/lib/wallet-payment-options'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useCreateNewPhonePurchaseMutation } from '@/stores/newPhones.api'
import { fetchAllProducts } from '@/stores/product.slice'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import { normalizeSuppliersList } from '@/features/purchase-invoice/utils/catalog-helpers'
import { isUsedPhonesBucketProduct } from '../../old-phones/constants'
import type { RootState, AppDispatch } from '@/stores/store'

const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString()}`
/** Real IMEIs are always 15 digits — strips anything a scanner/paste adds (spaces, dashes). */
const sanitizeImei = (raw: string) => raw.replace(/\D/g, '').slice(0, 15)

interface PhoneProductOption {
  id?: string
  _id?: string
  name: string
  price?: number
  trackImei?: boolean
  category?: string
}

interface SupplierOption {
  id?: string
  _id?: string
  name: string
  phone?: string
}

const SECTION_TONE_CLASSES = {
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
} as const

function FormSection({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: keyof typeof SECTION_TONE_CLASSES; children: ReactNode }) {
  return (
    <div className='rounded-xl border bg-muted/30 p-4 space-y-4'>
      <div className='flex items-center gap-2'>
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', SECTION_TONE_CLASSES[tone])}>{icon}</span>
        <h3 className='text-sm font-semibold'>{title}</h3>
      </div>
      {children}
    </div>
  )
}

const BASE_PAYMENT_METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Credit', label: 'Credit / Pay Later' },
]

type FormState = {
  imei: string
  imei2: string
  purchasePrice: string
  sellingPrice: string
  paymentMethod: string
  purchaseDate: string
  notes: string
}

const makeInitialForm = (): FormState => ({
  imei: '',
  imei2: '',
  purchasePrice: '',
  sellingPrice: '',
  paymentMethod: 'Cash',
  purchaseDate: toBusinessDateTimeLocal(),
  notes: '',
})

/**
 * Buy-a-new-phone form as its own dialog — mirrors BuyUsedPhoneDialog's shape so both
 * "Buy Phone" flows in Mobile Phones read as one consistent system. Self-contained: loads
 * its own product/supplier options and posts through the same /new-phones/purchases
 * endpoint the page used to call inline.
 */
export function BuyNewPhoneDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()

  const productsRedux = useSelector((s: RootState) => (s as unknown as { product?: { products?: PhoneProductOption[] } }).product?.products ?? [])
  const suppliersRedux = useSelector((s: RootState) => normalizeSuppliersList(s.supplier.data)) as SupplierOption[]

  useEffect(() => {
    dispatch(fetchAllProducts({}) as unknown as never)
    dispatch(fetchAllSuppliers({}) as unknown as never)
  }, [dispatch])

  // Exclude Old Phones' shared "Used Phones" bucket product — it's also trackImei-enabled
  // (every bought-back unit is a different phone), but it's not a real stockable model and
  // must never show up as something to "buy" here.
  const phoneProducts = useMemo(
    () => productsRedux.filter((p) => p.trackImei && !isUsedPhonesBucketProduct(p)),
    [productsRedux],
  )
  const productOptions = useMemo(
    () => phoneProducts.map((p) => ({ value: (p.id || p._id) as string, label: p.name, sublabel: fmtAmt(p.price) })),
    [phoneProducts],
  )
  const supplierOptions = useMemo(
    () => suppliersRedux.map((s) => ({ value: (s.id || s._id) as string, label: s.name, sublabel: s.phone })),
    [suppliersRedux],
  )

  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [quickCreate, setQuickCreate] = useState<QuickCreateState>(null)
  const [form, setForm] = useState<FormState>(makeInitialForm)

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  // Buying new stock is money-out — show wallet balances so staff can see what's available.
  const paymentMethodOptions = buildMergedPaymentOptions(BASE_PAYMENT_METHODS, wallets, true)

  const [createNewPhonePurchase, { isLoading: isSaving }] = useCreateNewPhonePurchaseMutation()

  const selectProduct = (id: string) => {
    setSelectedProductId(id)
    const product = phoneProducts.find((p) => (p.id || p._id) === id)
    if (product?.price && !form.sellingPrice) setField('sellingPrice', String(product.price))
  }

  const resetForm = () => {
    setForm(makeInitialForm())
    setSelectedProductId('')
    setSelectedSupplierId('')
  }

  const handleQuickCreated = (type: 'product' | 'supplier' | 'customer', entity: { id?: string; _id?: string }) => {
    if (type === 'product') {
      dispatch(fetchAllProducts({}) as unknown as never)
      selectProduct(entity.id || entity._id || '')
    } else if (type === 'supplier') {
      setSelectedSupplierId(entity.id || entity._id || '')
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedProductId) { toast.error('Select or add a phone model'); return }
    if (!selectedSupplierId) { toast.error('Select or add a supplier'); return }
    if (!form.imei.trim()) { toast.error('IMEI is required'); return }
    const purchasePrice = Number(form.purchasePrice)
    if (!(purchasePrice > 0)) { toast.error('Purchase price must be greater than 0'); return }

    const isWallet = isWalletOptionValue(form.paymentMethod)
    const isCredit = form.paymentMethod === 'Credit'
    if (isWallet && !getWalletTypeFromOptionValue(form.paymentMethod)) { toast.error('Select a wallet'); return }

    try {
      await createNewPhonePurchase({
        supplier: selectedSupplierId,
        items: [{
          product: selectedProductId,
          quantity: 1,
          priceAtPurchase: purchasePrice,
          sellingPriceAtPurchase: form.sellingPrice ? Number(form.sellingPrice) : undefined,
          total: purchasePrice,
          imeis: [form.imei2.trim() ? { imei: form.imei.trim(), imei2: form.imei2.trim() } : form.imei.trim()],
        }],
        totalAmount: purchasePrice,
        paidAmount: isCredit ? 0 : purchasePrice,
        paymentType: isWallet ? 'Wallet' : form.paymentMethod,
        walletType: isWallet ? getWalletTypeFromOptionValue(form.paymentMethod) : undefined,
        purchaseDate: form.purchaseDate ? parseBusinessDateTimeLocal(form.purchaseDate) : undefined,
        notes: form.notes.trim() || undefined,
      }).unwrap()
      toast.success('Phone stocked in — added to new-phone inventory')
      resetForm()
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to record purchase')
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ShoppingBag className='h-5 w-5 text-primary' /> Buy New Phone
          </DialogTitle>
        </DialogHeader>
        <form className='grid gap-4' onSubmit={handleSubmit}>
          <FormSection icon={<Package className='h-4 w-4' />} title='Phone Model' tone='blue'>
            <div className='space-y-1'>
              <Label>Product *</Label>
              <div className='flex gap-2'>
                <SearchableSelect
                  className='flex-1'
                  options={productOptions}
                  value={selectedProductId}
                  onValueChange={selectProduct}
                  placeholder='Select phone model...'
                  searchPlaceholder='Search phone models...'
                  emptyText='No phone models yet'
                />
                {hasPermission('createProducts') && (
                  <EntityCreateShortcutButton label='Add phone model' onClick={() => setQuickCreate({ type: 'product' })} />
                )}
              </div>
              <p className='text-xs text-muted-foreground'>
                Only products with IMEI tracking enabled show up here — check "Track IMEI" when adding a new model.
              </p>
            </div>
          </FormSection>

          <FormSection icon={<Truck className='h-4 w-4' />} title='Supplier' tone='indigo'>
            <div className='space-y-1'>
              <Label>Supplier *</Label>
              <div className='flex gap-2'>
                <SearchableSelect
                  className='flex-1'
                  options={supplierOptions}
                  value={selectedSupplierId}
                  onValueChange={setSelectedSupplierId}
                  placeholder='Select supplier...'
                  searchPlaceholder='Search suppliers...'
                  emptyText='No suppliers yet'
                />
                {hasPermission('createSuppliers') && (
                  <EntityCreateShortcutButton label='Add supplier' onClick={() => setQuickCreate({ type: 'supplier' })} />
                )}
              </div>
            </div>
          </FormSection>

          <FormSection icon={<ScanLine className='h-4 w-4' />} title='Device' tone='purple'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>IMEI *</Label>
                <Input
                  className='bg-background'
                  placeholder='15-digit IMEI'
                  inputMode='numeric'
                  value={form.imei}
                  onChange={(e) => setField('imei', sanitizeImei(e.target.value))}
                />
                {form.imei.length > 0 && <p className='text-[11px] text-muted-foreground'>{form.imei.length}/15 digits</p>}
              </div>
              <div className='space-y-1'>
                <Label>IMEI 2 (dual SIM)</Label>
                <Input
                  className='bg-background'
                  placeholder='Optional'
                  inputMode='numeric'
                  value={form.imei2}
                  onChange={(e) => setField('imei2', sanitizeImei(e.target.value))}
                />
              </div>
            </div>
          </FormSection>

          <FormSection icon={<Banknote className='h-4 w-4' />} title='Pricing & Payment' tone='emerald'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Purchase Price (Rs) *</Label>
                <Input className='bg-background' type='number' min='0' step='1' value={form.purchasePrice} onChange={(e) => setField('purchasePrice', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>Selling Price (Rs)</Label>
                <Input className='bg-background' type='number' min='0' step='1' placeholder='Optional' value={form.sellingPrice} onChange={(e) => setField('sellingPrice', e.target.value)} />
              </div>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setField('paymentMethod', v)}>
                  <SelectTrigger className='bg-background'><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethodOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>Date / Time</Label>
                <Input className='bg-background' type='datetime-local' value={form.purchaseDate} onChange={(e) => setField('purchaseDate', e.target.value)} />
              </div>
            </div>
            <div className='space-y-1'>
              <Label>Notes</Label>
              <Textarea className='bg-background' rows={2} placeholder='Optional notes' value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
            </div>
          </FormSection>

          <Button disabled={isSaving} type='submit' className='w-full h-11 text-base'>
            {isSaving ? 'Saving...' : 'Buy Phone'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    <EntityQuickCreateDialogs state={quickCreate} onClose={() => setQuickCreate(null)} onCreated={handleQuickCreated} />
    </>
  )
}
