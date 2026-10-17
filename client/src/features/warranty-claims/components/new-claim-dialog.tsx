import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, ScanLine, Store, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { useLanguage } from '@/context/language-context'
import { getBusinessToday, toBusinessCalendarDate } from '@/lib/business-timezone'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import type { AppDispatch, RootState } from '@/stores/store'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { CatalogProductPicker } from '@/components/catalog-product-picker'
import {
  useCreateWarrantyClaimMutation,
  useLazyLookupWarrantyUnitQuery,
  type UnitLookup,
  type WarrantyClaim,
} from '@/stores/warrantyClaim.api'
import { ACCESSORY_OPTIONS, COVER_META } from '../lib/claim-meta'

interface PickedProduct {
  id: string
  name: string
  serialized: boolean
  hasVariants: boolean
}

interface NewClaimDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (claim: WarrantyClaim) => void
  onOpenExisting: (claimId: string) => void
}

/**
 * Logging a unit in for warranty. Scan/type the serial first: the unit's product, buyer,
 * invoice, supplier and warranty fill themselves. Without a serial (plain products), pick
 * the product and fill the rest by hand.
 */
export function NewClaimDialog({ open, onOpenChange, onCreated, onOpenExisting }: NewClaimDialogProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const suppliersRaw = useSelector((s: RootState) => s.supplier.data)
  const suppliers: { id: string; name: string }[] = useMemo(() => (Array.isArray(suppliersRaw) ? suppliersRaw : []), [suppliersRaw])
  const [createClaim, { isLoading: saving }] = useCreateWarrantyClaimMutation()
  const [lookup, { isFetching: lookingUp }] = useLazyLookupWarrantyUnitQuery()

  const [type, setType] = useState<'customer' | 'stock'>('customer')
  const [serial, setSerial] = useState('')
  const [found, setFound] = useState<UnitLookup | null>(null)
  // The catalog row picked (one per product, one per real variant — so a variant product
  // is picked down to the exact variant, as on New Invoice).
  const [picked, setPicked] = useState<PurchaseCatalogItem | null>(null)
  const product: PickedProduct | null = picked
    ? { id: picked.productId, name: picked.name, serialized: !!(picked.trackImei || picked.trackSerial), hasVariants: picked.type === 'variant' }
    : null
  const variantId = picked?.variantId || ''
  const { data: catalog = [] } = useGetPurchasableCatalogQuery()
  const [quantity, setQuantity] = useState('1')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerId, setCustomerId] = useState<string | undefined>(undefined)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceId, setInvoiceId] = useState<string | undefined>(undefined)
  const [saleDate, setSaleDate] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [problem, setProblem] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
  const [accessories, setAccessories] = useState<string[]>([])
  const [receivedAt, setReceivedAt] = useState(getBusinessToday())

  useEffect(() => {
    if (!open) return
    setType('customer')
    setSerial('')
    setFound(null)
    setPicked(null)
    setQuantity('1')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerId(undefined)
    setInvoiceNumber('')
    setInvoiceId(undefined)
    setSaleDate('')
    setSupplierId('')
    setProblem('')
    setConditionNotes('')
    setAccessories([])
    setReceivedAt(getBusinessToday())
    if (!suppliers.length) dispatch(fetchAllSuppliers({}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])


  const supplierOptions: SearchableSelectOption[] = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name })), [suppliers])

  const runLookup = async () => {
    const value = serial.trim()
    if (!value) return
    try {
      const result = await lookup(value).unwrap()
      setFound(result)
      if (!result.found || !result.unit) return
      const u = result.unit
      if (u.productId) {
        // The unit's product, as its catalog row when it has one (inactive products don't).
        const row = catalog.find((c) => c.productId === u.productId && c.type === 'product') || catalog.find((c) => c.productId === u.productId)
        setPicked(row || ({ type: 'product', id: u.productId, productId: u.productId, name: u.productName, trackSerial: true, price: 0, stockQuantity: 0 } as PurchaseCatalogItem))
      }
      setType(u.status === 'in_stock' ? 'stock' : 'customer')
      if (u.customer) {
        setCustomerName(u.customer.name)
        setCustomerPhone(u.customer.phone)
        setCustomerId(u.customer.id || undefined)
      }
      if (u.invoice) {
        setInvoiceNumber(u.invoice.number)
        setInvoiceId(u.invoice.id)
      }
      if (u.saleDate) setSaleDate(toBusinessCalendarDate(new Date(u.saleDate)))
      if (u.supplier?.id) setSupplierId(u.supplier.id)
    } catch {
      toast.error(t('Could not look that up'))
    }
  }

  const needsSerial = !!product?.serialized
  const canSave =
    !!product &&
    problem.trim().length >= 2 &&
    (!needsSerial || serial.trim()) &&
    (type === 'stock' || customerName.trim() || customerPhone.trim()) &&
    !found?.openClaim &&
    !saving

  const handleSave = async () => {
    if (!canSave || !product) return
    try {
      const claim = await createClaim({
        type,
        productId: product.id,
        ...(variantId ? { variantId } : {}),
        ...(product.serialized ? { serial: serial.trim() } : { quantity: Math.max(1, parseInt(quantity, 10) || 1) }),
        ...(type === 'customer'
          ? {
              customerId,
              customerName: customerName.trim(),
              customerPhone: customerPhone.trim(),
              invoiceId,
              invoiceNumber: invoiceNumber.trim(),
              saleDate: saleDate || undefined,
            }
          : {}),
        ...(supplierId ? { supplierId } : {}),
        problem: problem.trim(),
        conditionNotes: conditionNotes.trim(),
        accessories,
        receivedAt,
      }).unwrap()
      toast.success(t('Claim {{n}} logged', { n: claim.claimNumber }), {
        description: type === 'stock' ? t('Taken out of sellable stock until it comes back.') : undefined,
      })
      onCreated(claim)
      onOpenChange(false)
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Could not log the claim'))
    }
  }

  const cover = found?.unit?.warranty

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl'>
        <DialogHeader className='shrink-0 border-b px-6 py-4'>
          <DialogTitle>{t('New warranty claim')}</DialogTitle>
          <DialogDescription>{t('Log a faulty unit going back under warranty — from a customer, or from your own stock.')}</DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            {([
              { value: 'customer', icon: UserRound, label: 'A customer brought it back', hint: 'Bought from you; goes back to them when fixed.' },
              { value: 'stock', icon: Store, label: 'Faulty item in our stock', hint: 'Unsold unit — leaves stock now, comes back into stock.' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type='button'
                onClick={() => setType(opt.value)}
                aria-pressed={type === opt.value}
                className={cn('flex items-start gap-2 rounded-lg border p-3 text-left hover:bg-accent', type === opt.value && 'border-primary bg-primary/5 ring-1 ring-primary')}
              >
                <opt.icon className='mt-0.5 h-4 w-4 shrink-0 text-primary' />
                <span>
                  <span className='block text-sm font-medium'>{t(opt.label)}</span>
                  <span className='block text-xs text-muted-foreground'>{t(opt.hint)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='claim-serial'>{t('Serial / IMEI')}</Label>
            <div className='flex gap-2'>
              <Input
                id='claim-serial'
                autoFocus
                value={serial}
                onChange={(e) => {
                  setSerial(e.target.value)
                  setFound(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void runLookup()
                  }
                }}
                placeholder={t('Scan or type, then Enter')}
                className='font-mono'
              />
              <Button type='button' variant='outline' onClick={runLookup} disabled={!serial.trim() || lookingUp} className='shrink-0 gap-1.5'>
                {lookingUp ? <Loader2 className='h-4 w-4 animate-spin' /> : <ScanLine className='h-4 w-4' />}
                {t('Look up')}
              </Button>
            </div>
            {found && !found.found && (
              <p className='text-xs text-muted-foreground'>{t('Not on record — pick the product below (a plain product needs no serial).')}</p>
            )}
            {found?.found && found.unit && (
              <div className='rounded-md border bg-muted/30 p-2.5 text-xs'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>{found.unit.productName}</span>
                  <Badge variant='outline' className='text-[10px]'>{found.unit.status.replace('_', ' ')}</Badge>
                  {cover && <Badge variant='outline' className={cn('text-[10px]', COVER_META[cover.status].className)}>{t(COVER_META[cover.status].label)}</Badge>}
                  {cover?.endDate && <span className='text-muted-foreground'>{t('until')} {formatAppDate(cover.endDate)}</span>}
                </div>
                <div className='mt-1 flex flex-wrap gap-x-3 text-muted-foreground'>
                  {found.unit.customer?.name && <span>{t('Sold to')} {found.unit.customer.name}</span>}
                  {found.unit.saleDate && <span>{formatAppDate(found.unit.saleDate)}</span>}
                  {found.unit.invoice && <span>{found.unit.invoice.number}</span>}
                  {found.unit.supplier && <span>{t('Supplier')}: {found.unit.supplier.name}</span>}
                </div>
                {found.openClaim && (
                  <div className='mt-2 flex items-center gap-2 text-amber-700 dark:text-amber-300'>
                    <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
                    <span>{t('Already has an open claim')}: {found.openClaim.claimNumber}</span>
                    <Button type='button' size='sm' variant='link' className='h-auto p-0 text-xs' onClick={() => onOpenExisting(found.openClaim!.id)}>
                      {t('Open it')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Product')}</Label>
            <CatalogProductPicker
              value={picked}
              onChange={setPicked}
              placeholder={t('Search products by name, barcode or brand')}
              // A looked-up serial already says which product it is.
              disabled={!!found?.unit}
            />
            {needsSerial && !serial.trim() && <p className='text-xs text-destructive'>{t('This product is serial tracked — enter its serial / IMEI above.')}</p>}
          </div>

          {product && !product.serialized && (
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <Label htmlFor='claim-qty'>{t('Quantity')}</Label>
                <Input id='claim-qty' type='number' min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
            </div>
          )}

          {type === 'customer' && (
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <Label htmlFor='claim-customer'>{t('Customer name')}</Label>
                <Input id='claim-customer' value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='claim-phone'>{t('Phone')}</Label>
                <Input id='claim-phone' value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='claim-invoice'>{t('Invoice no.')}</Label>
                <Input id='claim-invoice' value={invoiceNumber} onChange={(e) => { setInvoiceNumber(e.target.value); setInvoiceId(undefined) }} />
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Sold on')}</Label>
                <DatePicker value={saleDate} onChange={setSaleDate} max={getBusinessToday()} clearable />
              </div>
            </div>
          )}

          <div className='space-y-1.5'>
            <Label htmlFor='claim-problem'>{t('Fault / problem')} *</Label>
            <Textarea id='claim-problem' rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder={t('e.g. not charging, screen lines, no sound')} />
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Accessories received')}</Label>
            <div className='flex flex-wrap gap-1.5'>
              {ACCESSORY_OPTIONS.map((a) => {
                const on = accessories.includes(a)
                return (
                  <button
                    key={a}
                    type='button'
                    aria-pressed={on}
                    onClick={() => setAccessories((prev) => (on ? prev.filter((x) => x !== a) : [...prev, a]))}
                    className={cn('rounded-full border px-2.5 py-1 text-xs hover:bg-accent', on && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90')}
                  >
                    {t(a)}
                  </button>
                )
              })}
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>{t('Claim with (supplier / service centre)')}</Label>
              <SearchableSelect options={supplierOptions} value={supplierId} onValueChange={setSupplierId} placeholder={t('Optional — can be set when sending')} />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Received on')}</Label>
              <DatePicker value={receivedAt} onChange={setReceivedAt} max={getBusinessToday()} />
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='claim-condition'>
              {t('Condition notes')} <span className='text-muted-foreground'>({t('optional')})</span>
            </Label>
            <Textarea id='claim-condition' rows={2} value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} placeholder={t('Scratches, dents, missing screws…')} />
          </div>
        </div>

        <DialogFooter className='shrink-0 border-t px-6 py-3'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Log claim')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
