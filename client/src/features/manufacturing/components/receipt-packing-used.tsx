import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, PackagePlus, Plus, Warehouse, X } from 'lucide-react'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { fmtQty } from '../lib/constants'
import {
  newPackingUseRow,
  type useFinishedGoodsReceipt,
} from '../lib/use-finished-goods-receipt'

type Receipt = ReturnType<typeof useFinishedGoodsReceipt>

/**
 * "Packing material used" on a finished-goods receipt: the bottles, labels and cartons
 * actually used for this quantity, taken from production stock (where the store issued
 * them in bulk) and added to the cost of the goods. Starts from what the last receipt of
 * the product used per unit; untouched lines follow the quantity made.
 */
export function ReceiptPackingUsed({ r }: { r: Receipt }) {
  const { t } = useLanguage()
  const [openKey, setOpenKey] = useState<number | null>(null)
  const qtyRefs = useRef(new Map<number, HTMLInputElement>())
  const rows = r.packingUse
  const packMaterials = r.packing.materials.filter(
    (m) => m.inProduction != null && m.need > 0
  )
  const sectionRef = useRef<HTMLDivElement>(null)

  // "Add packing material" from the reminder before posting: a new row, opened and in view.
  useEffect(() => {
    if (!r.addPackingSignal) return
    const row = newPackingUseRow()
    r.setPackingUse((rs) => [...rs, row])
    sectionRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setTimeout(() => setOpenKey(row.key), 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.addPackingSignal])

  if (!r.floorChoices.length && !rows.length) {
    return (
      <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
        <Warehouse className='h-3.5 w-3.5 shrink-0' />
        {t(
          'Packing material used can be recorded here once materials are kept in'
        )}{' '}
        <Link
          to={'/manufacturing/production-stock' as never}
          className='underline'
        >
          {t('Production Stock')}
        </Link>
        .
      </p>
    )
  }

  const setRow = (key: number, patch: Partial<(typeof rows)[number]>) =>
    r.setPackingUse((rs) =>
      rs.map((x) => (x.key === key ? { ...x, ...patch } : x))
    )
  const focusQty = (key: number) =>
    requestAnimationFrame(() => {
      const el = qtyRefs.current.get(key)
      el?.focus()
      el?.select()
    })
  const addRow = () => {
    const row = newPackingUseRow()
    r.setPackingUse((rs) => [...rs, row])
    setOpenKey(row.key)
  }

  return (
    <div ref={sectionRef} className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <Label className='flex items-center gap-1.5'>
          <PackagePlus className='h-4 w-4' />
          {t('Packing material used')}
        </Label>
        <span className='text-muted-foreground text-xs'>
          {t('from production stock')}
        </span>
      </div>
      {r.packingMissing && (
        <p className='flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          {t(
            'No packing material entered for this receipt — add the bottles, labels or cartons it used.'
          )}
        </p>
      )}
      <div className='divide-y rounded-lg border'>
        {rows.length > 0 && (
          <div className='text-muted-foreground hidden grid-cols-[minmax(0,1fr)_6rem_6rem_7.5rem_2rem] gap-3 px-3 py-2 text-xs font-medium sm:grid'>
            <span>{t('Material')}</span>
            <span className='text-right'>{t('Used')}</span>
            <span className='text-right'>{t('On the floor')}</span>
            <span>{t('Status')}</span>
            <span />
          </div>
        )}
        {rows.map((row, index) => {
          const item = r.floorById.get(row.productId)
          const used = Number(row.quantity) || 0
          const onFloor = item?.inProduction ?? 0
          const short = used - onFloor
          const unit = item ? getUnitLabel(item.unit) : ''
          return (
            <div
              key={row.key}
              className='grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_7.5rem_2rem]'
            >
              <div className='col-span-2 min-w-0 sm:col-span-1'>
                <SearchableSelect
                  open={openKey === row.key}
                  onOpenChange={(o) => setOpenKey(o ? row.key : null)}
                  deselectable={false}
                  returnFocus={false}
                  onSelected={() => focusQty(row.key)}
                  options={r.floorChoices
                    .filter(
                      (c) =>
                        c.id === row.productId ||
                        !rows.some(
                          (x) => x.key !== row.key && x.productId === c.id
                        )
                    )
                    .map((c) => ({
                      value: c.id,
                      label: c.name,
                      sublabel: `${fmtQty(c.inProduction)} ${getUnitLabel(c.unit)} ${t('on floor')}`,
                    }))}
                  value={row.productId}
                  onValueChange={(v) =>
                    setRow(row.key, { productId: v, perUnit: null })
                  }
                  placeholder={t('Choose packing material')}
                  searchPlaceholder={t('Search material')}
                  popoverClassName='w-[min(30rem,calc(100vw-2rem))]'
                />
                {row.perUnit != null && !row.touched && (
                  <p className='text-muted-foreground mt-0.5 truncate text-[11px]'>
                    {fmtQty(row.perUnit)} {unit} {t('per unit, as last time')}
                  </p>
                )}
              </div>
              <Input
                ref={(el) => {
                  if (el) qtyRefs.current.set(row.key, el)
                  else qtyRefs.current.delete(row.key)
                }}
                inputMode='decimal'
                aria-label={`${t('Packing used')}, ${t('Row')} ${index + 1}`}
                showVoiceInput={false}
                value={row.quantity}
                placeholder='0'
                onChange={(e) =>
                  setRow(row.key, {
                    quantity: e.target.value.replace(/[^\d.]/g, ''),
                    touched: true,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return
                  e.preventDefault()
                  if (!row.productId) {
                    setOpenKey(row.key)
                    return
                  }
                  const next = rows[index + 1]
                  if (!next) addRow()
                  else if (!next.productId) setOpenKey(next.key)
                  else focusQty(next.key)
                }}
                className='h-9 text-right tabular-nums'
              />
              <div className='text-right text-sm tabular-nums max-sm:text-left'>
                {item ? `${fmtQty(onFloor)} ${unit}` : '—'}
              </div>
              <div
                className={cn(
                  'text-xs font-medium',
                  !item || used <= 0
                    ? 'text-muted-foreground'
                    : short > 1e-6
                      ? r.blockShort
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                )}
              >
                {!item || used <= 0
                  ? '—'
                  : short > 1e-6
                    ? r.blockShort
                      ? `${t('Short')} ${fmtQty(short)} · ${t('issue first')}`
                      : `${t('Short')} ${fmtQty(short)} · ${t('from store')}`
                    : t('Enough')}
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-8 w-8 justify-self-end'
                aria-label={t('Remove line')}
                onClick={() =>
                  r.setPackingUse((rs) => rs.filter((x) => x.key !== row.key))
                }
              >
                <X className='h-4 w-4' />
              </Button>
            </div>
          )
        })}
        {packMaterials.map((m) => (
          <div
            key={`pack:${m.id}`}
            className='text-muted-foreground grid grid-cols-2 items-center gap-x-3 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_6rem_7.5rem_2rem]'
          >
            <span className='col-span-2 truncate sm:col-span-1'>{m.name}</span>
            <span className='text-right tabular-nums'>
              {fmtQty(m.need)} {getUnitLabel(m.unit)}
            </span>
            <span className='text-right tabular-nums'>
              {fmtQty(m.inProduction ?? 0)}
            </span>
            <span className='text-xs'>{t('Used by the packing above')}</span>
            <span />
          </div>
        ))}
        <div className='px-3 py-2'>
          <Button type='button' variant='ghost' size='sm' onClick={addRow}>
            <Plus className='h-4 w-4' />
            {t('Add packing material')}
          </Button>
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Taken from production stock when you receive — its cost goes into these finished goods. Next time this product starts from the same amount per unit.'
        )}
      </p>
    </div>
  )
}

/**
 * Asked when a receipt is posted with no packing material recorded: add it, or receive
 * without (production stock then does not go down for packing).
 */
export function NoPackingConfirm({
  r,
  open,
  onClose,
  onConfirm,
  label,
}: {
  r: Receipt
  open: boolean
  onClose: () => void
  onConfirm: () => void
  /** What is being received, e.g. "10 Unit of CALCOPHOS 5 LTR". */
  label: string
}) {
  const { t } = useLanguage()
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-amber-500' />
            {t('No packing material entered')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('This receipt')} ({label}){' '}
            {t(
              'records no bottles, labels or cartons. Production stock will not go down for packing, and the cost of these goods will not include it.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onConfirm}>
            {t('Receive without packing')}
          </AlertDialogCancel>
          <Button
            autoFocus
            onClick={() => {
              onClose()
              r.requestAddPacking()
            }}
          >
            <Plus className='h-4 w-4' />
            {t('Add packing material')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
