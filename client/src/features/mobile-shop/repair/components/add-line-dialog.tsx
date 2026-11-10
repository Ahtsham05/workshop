import { useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  PackagePlus,
  Search,
  Settings2,
  ShoppingBag,
  Wrench,
} from 'lucide-react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import {
  useAddRepairItemMutation,
  useGetRepairSettingsQuery,
} from '@/stores/mobile-shop.api'
import {
  purchaseCatalogApi,
  useGetPurchasableCatalogQuery,
  type PurchaseCatalogItem,
} from '@/stores/purchaseCatalog.api'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { filterAndRankBySearch } from '@/utils/urdu-text-utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { categoriesOf } from '../lib/repair-meta'
import type { NewLine } from '../lib/use-bill-draft'
import { PartCategoriesSetup } from './part-categories-setup'
import { WarehouseField, useWarehousePicker } from '@/components/warehouse-field'
import {
  PaymentMethodSelect,
  type PaymentChoice,
} from './payment-method-select'

export type LineMode = 'stock' | 'service' | 'outside'

const MODES: {
  value: LineMode
  label: string
  icon: typeof Boxes
  hint: string
}[] = [
  {
    value: 'stock',
    label: 'Part from stock',
    icon: Boxes,
    hint: 'Takes it off the shelf — stock goes down',
  },
  {
    value: 'service',
    label: 'Service / labour',
    icon: Wrench,
    hint: 'Repair work, software, cleaning…',
  },
  {
    value: 'outside',
    label: 'Part bought outside',
    icon: ShoppingBag,
    hint: 'Bought from the market for this job',
  },
]

const SERVICE_PRESETS = [
  'Labour',
  'Diagnosis / checking',
  'Software / flashing',
  'Cleaning / service',
  'Data recovery',
  'OS installation',
]

/** Adds a part (from inventory or bought outside) or a service line to a job's bill. */
export function AddLineDialog({
  jobId,
  open,
  initialMode = 'stock',
  onOpenChange,
  onAddLine,
}: {
  /** When set, the line joins the caller's unsaved bill instead of saving right away. */
  onAddLine?: (line: NewLine) => void
  jobId: string
  open: boolean
  initialMode?: LineMode
  onOpenChange: (open: boolean) => void
}) {
  const dispatch = useDispatch()
  const currencyMeta = useCurrencyMeta()
  const fmt = (n: number) => formatMoneyWithMeta(n, currencyMeta)
  const [mode, setMode] = useState<LineMode>(initialMode)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<PurchaseCatalogItem | null>(null)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [paidNow, setPaidNow] = useState(true)
  const [paidFrom, setPaidFrom] = useState<PaymentChoice>({
    paymentMethod: 'cash',
    walletType: '',
  })
  const [addItem, { isLoading }] = useAddRepairItemMutation()
  const [showAll, setShowAll] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  // Multi-warehouse: which warehouse the part is taken from.
  const [partWarehouseId, setPartWarehouseId] = useState('')
  const partWarehousePicker = useWarehousePicker('any')
  const { data: settings, isLoading: settingsLoading } =
    useGetRepairSettingsQuery(undefined, { skip: !open })

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setSearch('')
    setPicked(null)
    setName('')
    setQty('1')
    setPrice('')
    setCost('')
    setPaidNow(true)
    setShowAll(false)
    setSetupOpen(false)
  }, [open, initialMode])

  const { data: catalog = [], isLoading: catalogLoading } =
    useGetPurchasableCatalogQuery(undefined, {
      skip: !open || mode !== 'stock',
    })
  const usable = useMemo(
    () => catalog.filter((c) => !c.trackImei && !c.trackSerial),
    [catalog]
  )
  // Category name → product count, for the setup chips.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>()
    usable.forEach((c) =>
      categoriesOf(c).forEach((n) => m.set(n, (m.get(n) ?? 0) + 1))
    )
    return m
  }, [usable])
  const partCategories = useMemo(
    () => settings?.partCategories ?? [],
    [settings]
  )
  const partSet = useMemo(
    () => new Set(partCategories.map((n) => n.toLowerCase())),
    [partCategories]
  )
  const configured = partSet.size > 0
  const repairOnly = configured && !showAll
  const pool = useMemo(
    () =>
      repairOnly
        ? usable.filter((c) =>
            categoriesOf(c).some((n) => partSet.has(n.toLowerCase()))
          )
        : usable,
    [usable, repairOnly, partSet]
  )
  const results = useMemo(
    () =>
      filterAndRankBySearch(pool, search, (c) => [
        c.name,
        c.nameUrdu,
        c.barcode,
        c.brand?.name,
        c.category,
      ]).slice(0, 40),
    [pool, search]
  )
  // A search that only matches outside the repair categories — offer the full list.
  const elsewhere = useMemo(
    () =>
      repairOnly && search.trim() && results.length === 0
        ? filterAndRankBySearch(usable, search, (c) => [c.name, c.barcode])
            .length
        : 0,
    [repairOnly, search, results.length, usable]
  )
  const showSetup =
    !settingsLoading &&
    !catalogLoading &&
    (setupOpen || (!configured && !showAll))

  const pick = (item: PurchaseCatalogItem) => {
    setPicked(item)
    setPrice(String(item.price ?? 0))
    setQty('1')
  }

  const quantity = Number(qty) || 0
  const unitPrice = Number(price) || 0
  const unitCost = Number(cost) || 0
  const batch = picked?.trackBatch
    ? picked.batches?.find((b) => b.quantity >= quantity)
    : undefined
  const available = picked
    ? picked.trackBatch
      ? (batch?.quantity ?? 0)
      : picked.stockQuantity
    : 0
  const short = mode === 'stock' && picked && quantity > available

  const submit = async () => {
    if (!(quantity > 0)) return toast.error('Enter a quantity')
    let line: NewLine
    if (mode === 'stock') {
      if (!picked) return toast.error('Pick a part')
      if (picked.trackBatch && !batch)
        return toast.error('No single batch has that many in stock')
      line = {
        kind: 'part',
        productId: picked.productId,
        variantId: picked.variantId ?? null,
        batchId: batch?.id ?? null,
        warehouseId: partWarehousePicker.visible && partWarehouseId ? partWarehouseId : null,
        name: picked.name,
        quantity,
        unitPrice,
        unitCost: picked.cost ?? 0,
      }
    } else {
      if (!name.trim()) return toast.error('Enter a name')
      line = {
        kind: mode === 'service' ? 'service' : 'part',
        name: name.trim(),
        quantity,
        unitPrice,
        unitCost: mode === 'outside' ? unitCost : 0,
        ...(mode === 'outside' && paidNow && unitCost > 0
          ? {
              paidOutMethod: paidFrom.paymentMethod,
              paidOutWallet: paidFrom.walletType || undefined,
            }
          : {}),
      }
    }
    if (onAddLine) {
      // Joins the unsaved bill — saved (and taken from stock) with the rest on Save.
      onAddLine(line)
      onOpenChange(false)
      return
    }
    try {
      await addItem({
        id: jobId,
        ...line,
        productId: line.productId || undefined,
        variantId: line.variantId || undefined,
        batchId: line.batchId || undefined,
        warehouseId: line.warehouseId || undefined,
        paidOutMethod: line.paidOutMethod || undefined,
      }).unwrap()
      if (line.productId)
        dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
      toast.success('Added to the bill')
      onOpenChange(false)
    } catch (error: unknown) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ||
          'Could not add this line'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <PackagePlus className='h-5 w-5' aria-hidden /> Add to bill
          </DialogTitle>
          <DialogDescription>
            {MODES.find((m) => m.value === mode)?.hint}
          </DialogDescription>
        </DialogHeader>

        <div
          className='grid grid-cols-3 gap-1.5'
          role='tablist'
          aria-label='Line type'
        >
          {MODES.map((m) => {
            const Icon = m.icon
            return (
              <button
                key={m.value}
                type='button'
                role='tab'
                aria-selected={mode === m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium',
                  mode === m.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className='h-4 w-4' aria-hidden />
                <span className='text-center leading-tight'>{m.label}</span>
              </button>
            )
          })}
        </div>

        {mode === 'stock' && !picked && showSetup && (
          <PartCategoriesSetup
            available={categoryCounts}
            current={partCategories}
            firstTime={!configured}
            onDone={() => {
              setSetupOpen(false)
              setShowAll(false)
            }}
            onSkip={() => (configured ? setSetupOpen(false) : setShowAll(true))}
          />
        )}

        {mode === 'stock' && !picked && !showSetup && (
          <div className='space-y-2'>
            <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
              <span className='text-muted-foreground min-w-0 truncate'>
                {repairOnly ? (
                  <>
                    Repair parts ·{' '}
                    <span className='text-foreground'>
                      {partCategories.slice(0, 3).join(', ')}
                    </span>
                    {partCategories.length > 3 &&
                      ` +${partCategories.length - 3}`}
                  </>
                ) : (
                  'All products'
                )}
              </span>
              <span className='flex shrink-0 items-center gap-2'>
                {configured && (
                  <button
                    type='button'
                    className='text-primary font-medium hover:underline'
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll ? 'Repair parts only' : 'Search all products'}
                  </button>
                )}
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1'
                  onClick={() => setSetupOpen(true)}
                >
                  <Settings2 className='h-3.5 w-3.5' aria-hidden />{' '}
                  {configured ? 'Change' : 'Set up'}
                </button>
              </span>
            </div>
            <div className='relative'>
              <Search
                className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4'
                aria-hidden
              />
              <Input
                autoFocus
                className='pl-8'
                placeholder='Search part name, barcode, brand…'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                showVoiceInput={false}
              />
            </div>
            <div className='max-h-72 overflow-y-auto rounded-md border'>
              {catalogLoading && (
                <p className='text-muted-foreground p-4 text-center text-sm'>
                  Loading stock…
                </p>
              )}
              {!catalogLoading && results.length === 0 && (
                <div className='text-muted-foreground space-y-2 p-4 text-center text-sm'>
                  <p>
                    {search
                      ? 'No matching repair part.'
                      : repairOnly
                        ? 'No products in your repair part categories yet.'
                        : 'No products yet.'}{' '}
                    Use “Part bought outside” for a one-off.
                  </p>
                  {elsewhere > 0 && (
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => setShowAll(true)}
                    >
                      {elsewhere} match{elsewhere === 1 ? '' : 'es'} in other
                      products — show
                    </Button>
                  )}
                </div>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  type='button'
                  onClick={() => pick(c)}
                  className='hover:bg-muted flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0'
                >
                  <span className='min-w-0'>
                    <span className='block truncate font-medium'>{c.name}</span>
                    <span className='text-muted-foreground block truncate text-xs'>
                      {[c.brand?.name, c.category, c.barcode]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className='shrink-0 text-right text-xs'>
                    <span className='block font-medium'>{fmt(c.price)}</span>
                    <span
                      className={cn(
                        'block',
                        c.stockQuantity > 0
                          ? 'text-emerald-600'
                          : 'text-destructive'
                      )}
                    >
                      {c.stockQuantity} in stock
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'stock' && picked && (
          <div className='space-y-3'>
            <div className='bg-muted/50 flex items-center justify-between gap-2 rounded-md border p-3 text-sm'>
              <span className='min-w-0'>
                <span className='block truncate font-medium'>
                  {picked.name}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {available} in stock
                  {batch ? ` · batch ${batch.batchNumber}` : ''}
                </span>
              </span>
              <Button size='sm' variant='ghost' onClick={() => setPicked(null)}>
                Change
              </Button>
            </div>
            <WarehouseField kind='any' id='al-warehouse' className='space-y-1' label='Take from warehouse' value={partWarehouseId} onValueChange={setPartWarehouseId} />
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label htmlFor='al-qty'>Quantity</Label>
                <Input
                  id='al-qty'
                  type='number'
                  min='1'
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='al-price'>Charge customer (each)</Label>
                <Input
                  id='al-price'
                  type='number'
                  min='0'
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            {short && (
              <p className='text-destructive text-sm'>
                Only {available} in stock.
              </p>
            )}
          </div>
        )}

        {mode !== 'stock' && (
          <div className='space-y-3'>
            {mode === 'service' && (
              <div className='flex flex-wrap gap-1.5'>
                {SERVICE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type='button'
                    onClick={() => setName(p)}
                    className='hover:border-foreground/30 rounded-full border px-2.5 py-1 text-xs'
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className='space-y-1'>
              <Label htmlFor='al-name'>
                {mode === 'service' ? 'Service' : 'Part'}
              </Label>
              <Input
                id='al-name'
                autoFocus
                placeholder={
                  mode === 'service'
                    ? 'e.g. Labour'
                    : 'e.g. Charging port (market)'
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div
              className={cn(
                'grid gap-3',
                mode === 'outside' ? 'grid-cols-3' : 'grid-cols-2'
              )}
            >
              <div className='space-y-1'>
                <Label htmlFor='al-qty2'>Qty</Label>
                <Input
                  id='al-qty2'
                  type='number'
                  min='1'
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              {mode === 'outside' && (
                <div className='space-y-1'>
                  <Label htmlFor='al-cost'>Cost (each)</Label>
                  <Input
                    id='al-cost'
                    type='number'
                    min='0'
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              )}
              <div className='space-y-1'>
                <Label htmlFor='al-price2'>Charge (each)</Label>
                <Input
                  id='al-price2'
                  type='number'
                  min='0'
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            {mode === 'outside' && unitCost > 0 && (
              <div className='space-y-2 rounded-md border p-3'>
                <label className='flex items-center justify-between gap-2 text-sm'>
                  <span>Paid {fmt(unitCost * quantity)} from the shop now</span>
                  <Switch checked={paidNow} onCheckedChange={setPaidNow} />
                </label>
                {paidNow && (
                  <PaymentMethodSelect
                    moneyOut
                    value={paidFrom}
                    onChange={setPaidFrom}
                  />
                )}
                <p className='text-muted-foreground text-xs'>
                  {paidNow
                    ? 'Recorded as money out in the cash book.'
                    : 'Only the cost is recorded (e.g. bought on credit).'}
                </p>
              </div>
            )}
          </div>
        )}

        {quantity > 0 && (mode !== 'stock' || picked) && (
          <div className='bg-muted flex justify-between rounded-md p-3 text-sm'>
            <span>Line total</span>
            <strong>{fmt(quantity * unitPrice)}</strong>
          </div>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={isLoading || !!short || (mode === 'stock' && !picked)}
            onClick={submit}
          >
            {isLoading ? 'Adding…' : 'Add to bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
