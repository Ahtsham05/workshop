import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, ArrowRight, Loader2, PackageSearch, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { useWarehouseSettings } from '@/hooks/use-warehouse-settings'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import {
  useCreateTransferMutation,
  useGetAvailabilityQuery,
  useGetLocationsQuery,
  useGetWarehouseStockQuery,
  useGetWarehousesQuery,
  useUpdateTransferMutation,
  type StockRow,
  type WarehouseTransfer,
} from '@/stores/warehouse.api'
import { fmtQty, refId } from '../lib/labels'

interface Line {
  /** `${productId}|${variantId}` — one line per product, or per variant. */
  key: string
  productId: string
  variantId: string | null
  name: string
  sku: string
  unit: string
  quantity: string
}

export interface TransferPreset {
  fromWarehouseId?: string
  toWarehouseId?: string
  fromLocationId?: string
  product?: { productId: string; variantId?: string | null; name: string; sku?: string; unit?: string }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A draft to edit. */
  transfer?: WarehouseTransfer | null
  preset?: TransferPreset
  onSaved?: (t: WarehouseTransfer) => void
}

const TOP = '__top__'
const lineKey = (productId: string, variantId?: string | null) => `${productId}|${variantId || ''}`
/** Key of a line in the availability response: productId, or `v:<variantId>` for a variant. */
const availKey = (l: { productId: string; variantId: string | null }) => (l.variantId ? `v:${l.variantId}` : l.productId)

export function TransferDialog({ open, onOpenChange, transfer, preset, onSaved }: Props) {
  const { t } = useLanguage()
  const settings = useWarehouseSettings()
  const { data: allWarehouses = [] } = useGetWarehousesQuery(undefined, { skip: !open })
  const warehouses = useMemo(() => allWarehouses.filter((w) => w.isActive), [allWarehouses])
  const [create, { isLoading: creating }] = useCreateTransferMutation()
  const [update, { isLoading: updating }] = useUpdateTransferMutation()
  const busy = creating || updating

  const [from, setFrom] = useState('')
  const [fromLoc, setFromLoc] = useState(TOP)
  const [to, setTo] = useState('')
  const [toLoc, setToLoc] = useState(TOP)
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showAll, setShowAll] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Initialise on open.
  useEffect(() => {
    if (!open) return
    const today = new Date().toISOString().slice(0, 10)
    if (transfer) {
      setFrom(refId(transfer.fromWarehouseId))
      setTo(refId(transfer.toWarehouseId))
      setFromLoc(refId(transfer.fromLocationId) || TOP)
      setToLoc(refId(transfer.toLocationId) || TOP)
      setDate((transfer.date || '').slice(0, 10) || today)
      setReference(transfer.reference || '')
      setNotes(transfer.notes || '')
      setLines(
        transfer.lines.map((l) => ({ key: lineKey(refId(l.productId), refId(l.variantId) || null), productId: refId(l.productId), variantId: refId(l.variantId) || null, name: l.productName, sku: l.sku || '', unit: l.unit || '', quantity: String(l.quantity) }))
      )
    } else {
      setFrom(preset?.fromWarehouseId || '')
      setTo(preset?.toWarehouseId || '')
      setFromLoc(preset?.fromLocationId || TOP)
      setToLoc(TOP)
      setDate(today)
      setReference('')
      setNotes('')
      setLines(
        preset?.product
          ? [{ key: lineKey(preset.product.productId, preset.product.variantId || null), productId: preset.product.productId, variantId: preset.product.variantId || null, name: preset.product.name, sku: preset.product.sku || '', unit: preset.product.unit || '', quantity: '' }]
          : []
      )
    }
    setSearch('')
    setDebounced('')
    setShowAll(false)
  }, [open, transfer, preset])

  // Sensible defaults once warehouses load: from = default, to = first other.
  useEffect(() => {
    if (!open || transfer || !warehouses.length) return
    setFrom((cur) => cur || warehouses.find((w) => w.isDefault)?.id || warehouses[0].id)
  }, [open, transfer, warehouses])
  useEffect(() => {
    if (!open || transfer || !warehouses.length || !from) return
    setTo((cur) => cur || warehouses.find((w) => w.id !== from)?.id || from)
  }, [open, transfer, warehouses, from])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 200)
    return () => clearTimeout(id)
  }, [search])

  const { data: fromLocations = [] } = useGetLocationsQuery(from, { skip: !open || !from || !settings.useLocations })
  const { data: toLocations = [] } = useGetLocationsQuery(to, { skip: !open || !to || !settings.useLocations })
  const activeFromLocs = fromLocations.filter((l) => l.isActive)
  const activeToLocs = toLocations.filter((l) => l.isActive)

  const fromLocId = fromLoc === TOP ? null : fromLoc
  const toLocId = toLoc === TOP ? null : toLoc

  const { data: found, isFetching: searching } = useGetWarehouseStockQuery(
    { warehouseId: from, locationId: fromLocId || undefined, search: debounced, filter: showAll ? 'all' : 'in_stock', limit: 12 },
    { skip: !open || !from || !debounced }
  )

  // Stock at the source, per line. A product picked from the search already arrives with
  // its quantity at this exact source (the search ran against it), so only lines that came
  // from elsewhere — a draft being edited, a preset product, a changed source — are looked
  // up, and only those. Keyed by source so switching back and forth costs nothing.
  type Avail = { position: number; warehouse: number }
  const sourceKey = `${from}|${fromLocId || ''}`
  const [known, setKnown] = useState<Record<string, Record<string, Avail>>>({})
  // Stock moves while the dialog is closed — start each opening fresh.
  useEffect(() => {
    if (open) setKnown({})
  }, [open])
  const knownHere = known[sourceKey] || {}
  const missingIds = useMemo(
    () => [...new Set(lines.filter((l) => !knownHere[availKey(l)]).map((l) => l.productId))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, sourceKey, known]
  )
  const { data: fetched } = useGetAvailabilityQuery(
    { warehouseId: from, locationId: fromLocId, productIds: missingIds },
    { skip: !open || !from || missingIds.length === 0 }
  )
  useEffect(() => {
    if (!fetched) return
    setKnown((prev) => {
      const here = { ...(prev[sourceKey] || {}) }
      Object.entries(fetched).forEach(([k, v]) => {
        here[k] = { position: v.position, warehouse: v.warehouse }
      })
      return { ...prev, [sourceKey]: here }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched])
  const availability = knownHere

  const addProduct = (row: Pick<StockRow, 'productId' | 'variantId' | 'name' | 'sku' | 'unit' | 'positionQty' | 'byWarehouse'>) => {
    const key = lineKey(row.productId, row.variantId)
    if (row.positionQty !== undefined) {
      const k = availKey({ productId: row.productId, variantId: row.variantId })
      setKnown((prev) => ({ ...prev, [sourceKey]: { ...(prev[sourceKey] || {}), [k]: { position: row.positionQty as number, warehouse: row.byWarehouse?.[from] ?? (row.positionQty as number) } } }))
    }
    setLines((prev) =>
      prev.some((l) => l.key === key)
        ? prev
        : [...prev, { key, productId: row.productId, variantId: row.variantId, name: row.name, sku: row.sku, unit: row.unit, quantity: '' }]
    )
    setSearch('')
    setDebounced('')
    setTimeout(() => qtyRefs.current[key]?.focus(), 50)
  }

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const rows = found?.results || []
    const q = search.trim().toLowerCase()
    const exact = rows.find((r) => r.barcode?.toLowerCase() === q || r.sku?.toLowerCase() === q)
    if (exact) addProduct(exact)
    else if (rows.length === 1) addProduct(rows[0])
  }

  const fromWh = warehouses.find((w) => w.id === from)
  const toWh = warehouses.find((w) => w.id === to)
  const samePlace = Boolean(from && from === to && (fromLocId || '') === (toLocId || ''))

  const problems = lines.filter((l) => {
    const q = Number(l.quantity)
    const have = availability?.[availKey(l)]?.position
    return settings.blockNegativeTransfers && have !== undefined && q > have + 1e-9
  })
  const filled = lines.filter((l) => Number(l.quantity) > 0)
  const totalQty = filled.reduce((s, l) => s + Number(l.quantity), 0)

  const swap = () => {
    setFrom(to)
    setTo(from)
    setFromLoc(toLoc)
    setToLoc(fromLoc)
  }

  const save = async (post: boolean) => {
    if (!from || !to) return toast.error(t('Choose both warehouses'))
    if (samePlace) return toast.error(t('Source and destination are the same place'))
    if (!filled.length) return toast.error(t('Add at least one product with a quantity'))
    if (post && problems.length) return toast.error(t('Some quantities are more than what is available at the source'))
    const body = {
      fromWarehouseId: from,
      toWarehouseId: to,
      fromLocationId: fromLocId,
      toLocationId: toLocId,
      date: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
      reference: reference.trim(),
      notes: notes.trim(),
      lines: filled.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: Number(l.quantity) })),
      validate: post,
    }
    try {
      const saved = transfer ? await update({ id: transfer.id, body }).unwrap() : await create(body).unwrap()
      toast.success(post ? t('Stock moved — {{n}}').replace('{{n}}', saved.number) : t('Draft saved — {{n}}').replace('{{n}}', saved.number))
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save the transfer')))
    }
  }

  const whOptions = warehouses.map((w) => (
    <SelectItem key={w.id} value={w.id}>
      <span className='font-mono text-xs text-muted-foreground'>{w.code}</span> {w.name}
      {w.isDefault ? ` · ${t('Default')}` : ''}
    </SelectItem>
  ))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[94vh] flex-col max-w-4xl sm:max-w-4xl'>
        <DialogHeader className='shrink-0'>
          <DialogTitle className='flex items-center gap-2'>
            <ArrowLeftRight className='h-5 w-5 text-primary' />
            {transfer ? `${t('Edit transfer')} ${transfer.number}` : t('Move stock between warehouses')}
          </DialogTitle>
          <DialogDescription>{t('Moves stock inside this branch. The branch total does not change — only where the stock is kept.')}</DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-1'>
          {/* From → To */}
          <div className='grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto_1fr]'>
            <PlaceBox
              title={t('From')}
              warehouse={from}
              onWarehouse={(v) => {
                setFrom(v)
                setFromLoc(TOP)
                // Picking the warehouse that is already the destination: move the destination
                // elsewhere instead of leaving source = destination (bins aside).
                if (v === to && toLoc === TOP) setTo(warehouses.find((w) => w.id !== v)?.id || to)
              }}
              location={fromLoc}
              onLocation={setFromLoc}
              options={whOptions}
              locations={activeFromLocs}
              showLocations={settings.useLocations}
            />
            <Button type='button' variant='outline' size='icon' className='mx-auto mb-1 rounded-full' onClick={swap} title={t('Swap')}>
              <ArrowLeftRight className='h-4 w-4' />
            </Button>
            <PlaceBox
              title={t('To')}
              warehouse={to}
              onWarehouse={(v) => {
                setTo(v)
                setToLoc(TOP)
              }}
              location={toLoc}
              onLocation={setToLoc}
              options={whOptions}
              locations={activeToLocs}
              showLocations={settings.useLocations}
            />
          </div>
          {samePlace && <p className='text-sm text-destructive'>{t('Source and destination are the same place — pick another warehouse or bin.')}</p>}

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='tr-date'>{t('Date')}</Label>
              <Input id='tr-date' type='date' value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='tr-ref'>{t('Reference')}</Label>
              <Input id='tr-ref' value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('Optional')} />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='tr-notes'>{t('Notes')}</Label>
              <Input id='tr-notes' value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Optional')} />
            </div>
          </div>

          {/* Product search */}
          <div className='space-y-2 rounded-lg border bg-muted/30 p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Label htmlFor='tr-search' className='flex items-center gap-1.5'>
                <PackageSearch className='h-4 w-4 text-muted-foreground' />
                {t('Add products')}
                {fromWh ? <span className='font-normal text-muted-foreground'>— {t('stock in')} {fromWh.name}</span> : null}
              </Label>
              <label className='flex items-center gap-2 text-xs text-muted-foreground'>
                <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(Boolean(v))} />
                {t('Include products with no stock here')}
              </label>
            </div>
            <div className='relative'>
              <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                id='tr-search'
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder={t('Scan a barcode or type a name / SKU…')}
                className='pl-8'
                autoComplete='off'
              />
              {searching && <Loader2 className='absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground' />}
            </div>
            {debounced && found && (
              <div className='max-h-56 overflow-y-auto rounded-md border bg-background'>
                {found.results.length === 0 ? (
                  <p className='p-3 text-sm text-muted-foreground'>
                    {showAll ? t('No product matches') : t('Nothing matching is in stock here — tick “Include products with no stock here” to see all.')}
                  </p>
                ) : (
                  found.results.map((row) => {
                    const added = lines.some((l) => l.key === lineKey(row.productId, row.variantId))
                    return (
                      <button
                        key={lineKey(row.productId, row.variantId)}
                        type='button'
                        disabled={added}
                        onClick={() => addProduct(row)}
                        className='flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-muted disabled:opacity-50'
                      >
                        <span className='min-w-0'>
                          <span className='block truncate text-sm font-medium'>{row.name}</span>
                          <span className='block truncate text-xs text-muted-foreground'>{[row.sku, row.barcode].filter(Boolean).join(' · ') || '—'}</span>
                        </span>
                        <span className={cn('shrink-0 text-sm tabular-nums', row.quantity < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {added ? t('Added') : `${fmtQty(row.quantity)} ${row.unit || ''}`}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Lines */}
          {lines.length === 0 ? (
            <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>{t('No products yet — search or scan above.')}</div>
          ) : (
            <div className='overflow-x-auto rounded-lg border'>
              <table className='w-full text-sm'>
                <thead className='bg-muted/50 text-xs text-muted-foreground'>
                  <tr>
                    <th className='px-3 py-2 text-left font-medium'>{t('Product')}</th>
                    <th className='hidden px-3 py-2 text-right font-medium sm:table-cell'>{t('Available at source')}</th>
                    <th className='px-3 py-2 text-right font-medium sm:w-40'>{t('Move qty')}</th>
                    <th className='w-10 px-2 py-2' />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const a = availability?.[availKey(line)]
                    const have = a?.position
                    const over = settings.blockNegativeTransfers && have !== undefined && Number(line.quantity) > have + 1e-9
                    const inBins = a && a.warehouse !== a.position && !fromLocId
                    return (
                      <tr key={line.key} className='border-t'>
                        <td className='px-3 py-2'>
                          <p className='font-medium'>{line.name}</p>
                          {line.sku ? <p className='text-xs text-muted-foreground'>{line.sku}</p> : null}
                          {have !== undefined ? (
                            <p className={cn('text-xs sm:hidden', have <= 0 ? 'text-destructive' : 'text-muted-foreground')}>
                              {t('Available')}: {fmtQty(have)} {line.unit}
                            </p>
                          ) : null}
                        </td>
                        <td className='hidden px-3 py-2 text-right tabular-nums sm:table-cell'>
                          {have === undefined ? (
                            <span className='text-muted-foreground'>…</span>
                          ) : (
                            <>
                              <span className={cn(have <= 0 && 'text-destructive')}>
                                {fmtQty(have)} {line.unit}
                              </span>
                              {inBins ? (
                                <p className='text-[11px] text-muted-foreground'>
                                  {fmtQty(a.warehouse)} {t('incl. bins')}
                                </p>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className='px-3 py-2'>
                          <div className='flex items-center justify-end gap-1'>
                            <Input
                              ref={(el) => {
                                qtyRefs.current[line.key] = el
                              }}
                              type='number'
                              inputMode='decimal'
                              min={0}
                              step='any'
                              value={line.quantity}
                              onChange={(e) => setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  searchRef.current?.focus()
                                }
                              }}
                              className={cn('h-8 w-20 text-right tabular-nums sm:w-24', over && 'border-destructive text-destructive')}
                            />
                            {have !== undefined && have > 0 ? (
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='h-8 px-2 text-xs'
                                onClick={() => setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, quantity: String(have) } : l)))}
                              >
                                {t('All')}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                        <td className='px-2 py-2'>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-muted-foreground hover:text-destructive'
                            onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className='shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
            {fromWh && toWh ? (
              <span className='flex items-center gap-1.5'>
                <Badge variant='outline' className='font-mono'>
                  {fromWh.code}
                </Badge>
                <ArrowRight className='h-3.5 w-3.5' />
                <Badge variant='outline' className='font-mono'>
                  {toWh.code}
                </Badge>
              </span>
            ) : null}
            <span>
              {filled.length} {t('products')} · {fmtQty(totalQty)} {t('units')}
            </span>
            {problems.length ? <span className='text-destructive'>· {problems.length} {t('over available')}</span> : null}
          </div>
          <div className='flex gap-2'>
            <Button type='button' variant='outline' disabled={busy} onClick={() => save(false)}>
              {t('Save draft')}
            </Button>
            <Button type='button' disabled={busy || samePlace} onClick={() => save(true)}>
              {busy && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('Move now')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlaceBox({
  title,
  warehouse,
  onWarehouse,
  location,
  onLocation,
  options,
  locations,
  showLocations,
}: {
  title: string
  warehouse: string
  onWarehouse: (v: string) => void
  location: string
  onLocation: (v: string) => void
  options: React.ReactNode
  locations: { id: string; path: string }[]
  showLocations: boolean
}) {
  const { t } = useLanguage()
  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <p className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>{title}</p>
      <Select value={warehouse} onValueChange={onWarehouse}>
        <SelectTrigger className='w-full'>
          <SelectValue placeholder={t('Choose warehouse')} />
        </SelectTrigger>
        <SelectContent>{options}</SelectContent>
      </Select>
      {showLocations && locations.length > 0 ? (
        <Select value={location} onValueChange={onLocation}>
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOP}>{t('No bin (warehouse level)')}</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}
