import { useEffect, useState } from 'react'
import {
  Boxes,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Trash2,
  Wrench,
} from 'lucide-react'
import {
  useGetRepairStockSummaryQuery,
  type RepairJobRecord,
} from '@/stores/mobile-shop.api'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BillDraft, DraftLine } from '../lib/use-bill-draft'
import { usePartCatalog } from '../lib/use-part-catalog'
import type { LineMode } from './add-line-dialog'
import { BillEntryRow } from './bill-entry-row'

/**
 * Number cell that updates the bill as you type (the bill is a local draft, so this is
 * free — nothing is sent until Save). Follows outside changes (discard / save).
 */
function NumCell({
  value,
  onCommit,
  label,
  className,
  min = 0,
}: {
  value: number
  onCommit: (v: number) => void
  label: string
  className?: string
  /** Values below this aren't applied (e.g. quantity must stay above 0). */
  min?: number
}) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    // Only overwrite what's typed when the value really changed from outside.
    setText((t) =>
      (Number(t) || 0) === value ? t : value ? String(value) : ''
    )
  }, [value])
  return (
    <Input
      type='number'
      min={min}
      inputMode='decimal'
      aria-label={label}
      value={text}
      placeholder='0'
      showVoiceInput={false}
      className={cn('h-8 px-2 text-right tabular-nums', className)}
      onKeyDown={(e) =>
        e.key === 'Enter' && (e.target as HTMLInputElement).blur()
      }
      onChange={(e) => {
        setText(e.target.value)
        const v = Number(e.target.value) || 0
        if (v >= min && v !== value) onCommit(v)
      }}
      onBlur={() => {
        // A quantity left empty / zero snaps back to the last good value.
        if ((Number(text) || 0) < min) setText(value ? String(value) : '')
      }}
    />
  )
}

const lineKind = (l: DraftLine) =>
  l.kind === 'service'
    ? 'Service'
    : l.productId
      ? 'From stock'
      : l.paidOutMethod
        ? 'Bought outside · paid'
        : 'Bought outside'
const KindIcon = ({ l }: { l: DraftLine }) => {
  const Icon = l.kind === 'service' ? Wrench : l.productId ? Boxes : ShoppingBag
  return (
    <Icon
      className={cn(
        'h-3.5 w-3.5 shrink-0',
        l.kind === 'service'
          ? 'text-violet-600'
          : l.productId
            ? 'text-sky-600'
            : 'text-amber-600'
      )}
      aria-hidden
    />
  )
}

/**
 * The job's bill, invoice style: numbered lines, the last row is where you type. Every
 * change stays on screen until "Save bill" — one request, and only then does stock move.
 */
export function BillLines({
  job,
  draft,
  editable,
  showCost,
  onAdd,
}: {
  job: RepairJobRecord
  draft: BillDraft
  editable: boolean
  showCost: boolean
  /** Opens the full Add-to-bill dialog (categories, outside part paid from an account). */
  onAdd?: (mode: LineMode) => void
}) {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n?: number) => formatMoneyWithMeta(n ?? 0, currencyMeta)
  const [all, setAll] = useState(false)
  const entry = editable && !!onAdd
  const partCatalog = usePartCatalog({ skip: !entry })
  const { data: stockSummary } = useGetRepairStockSummaryQuery(undefined, {
    skip: !showCost,
  })
  const { lines, totals } = draft
  const cols = 5 + (showCost ? 1 : 0) + (editable ? 1 : 0)
  // The saved repair cost is already out of the balance — show what's left after the draft value.
  const stockLeft = stockSummary
    ? stockSummary.balance + (job.directCost ?? 0) - draft.directCost
    : null

  return (
    <div className='space-y-3'>
      <div className='rounded-lg border'>
        <div className='bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3 py-2'>
          <h3 className='text-sm font-semibold'>
            Items{' '}
            <span className='text-muted-foreground font-normal'>
              ({lines.length})
            </span>
          </h3>
          {entry && (
            <div className='ml-auto flex flex-wrap items-center gap-1.5'>
              {partCatalog.configured && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  className='h-8 gap-1'
                  onClick={() => setAll((v) => !v)}
                >
                  <Search className='h-3.5 w-3.5' />{' '}
                  {all ? 'Repair parts only' : 'Search all products'}
                </Button>
              )}
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='h-8 gap-1'
                onClick={() => onAdd!('stock')}
              >
                <Settings2 className='h-3.5 w-3.5' />{' '}
                {partCatalog.configured
                  ? 'Part categories'
                  : 'Set repair part categories'}
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='h-8 gap-1'
                onClick={() => onAdd!('outside')}
              >
                <Plus className='h-3.5 w-3.5' /> More options
              </Button>
            </div>
          )}
        </div>

        <div
          className={cn(
            entry ? 'overflow-x-auto sm:overflow-visible' : 'overflow-x-auto'
          )}
        >
          <table className='w-full table-fixed text-sm'>
            <colgroup>
              <col className='w-9' />
              <col />
              <col className='w-[4.5rem]' />
              {showCost && <col className='w-[6.5rem]' />}
              <col className='w-[6.5rem]' />
              <col className='w-[6.5rem]' />
              {editable && <col className='w-11' />}
            </colgroup>
            <thead className='bg-muted/60 text-muted-foreground text-xs'>
              <tr>
                <th className='px-2 py-2 text-center font-medium'>#</th>
                <th className='px-2 py-2 text-left font-medium'>
                  Part / service
                </th>
                <th className='px-2 py-2 text-right font-medium'>Qty</th>
                {showCost && (
                  <th className='px-2 py-2 text-right font-medium'>Cost</th>
                )}
                <th className='px-2 py-2 text-right font-medium'>Unit price</th>
                <th className='px-3 py-2 text-right font-medium'>Total</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const fromStock = !!l.productId
                const lockedQty = fromStock && !l.isNew
                return (
                  <tr
                    key={l.key}
                    className={cn(
                      'border-t align-middle',
                      l.isNew && 'bg-amber-500/[0.06]',
                      l.changed && 'bg-sky-500/[0.05]'
                    )}
                  >
                    <td className='text-muted-foreground px-2 py-2 text-center text-xs tabular-nums'>
                      {idx + 1}
                    </td>
                    <td className='px-2 py-2'>
                      <div className='flex items-start gap-1.5 font-medium'>
                        <span className='mt-0.5'>
                          <KindIcon l={l} />
                        </span>
                        <span className='min-w-0 break-words'>{l.name}</span>
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {lineKind(l)}
                        {l.isNew && (
                          <span className='ml-1.5 font-medium text-amber-700 dark:text-amber-400'>
                            · not saved
                          </span>
                        )}
                        {l.changed && (
                          <span className='ml-1.5 font-medium text-sky-700 dark:text-sky-400'>
                            · edited
                          </span>
                        )}
                      </div>
                    </td>
                    <td className='px-1 py-1.5 text-right tabular-nums'>
                      {editable && !lockedQty ? (
                        <NumCell
                          label={`Quantity of ${l.name}`}
                          value={l.quantity}
                          onCommit={(v) =>
                            v > 0 && draft.update(l.key, { quantity: v })
                          }
                        />
                      ) : (
                        <span className='pr-2'>{l.quantity}</span>
                      )}
                    </td>
                    {showCost && (
                      <td className='px-1 py-1.5 text-right tabular-nums'>
                        {editable && !fromStock ? (
                          <NumCell
                            label={`Cost of ${l.name}`}
                            value={l.unitCost}
                            onCommit={(v) =>
                              draft.update(l.key, { unitCost: v })
                            }
                            className={
                              l.kind === 'part' && !l.unitCost
                                ? 'border-amber-500'
                                : undefined
                            }
                          />
                        ) : (
                          <span
                            className='pr-2'
                            title={
                              fromStock ? 'Cost from inventory' : undefined
                            }
                          >
                            {fmt(l.unitCost)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className='px-1 py-1.5 text-right tabular-nums'>
                      {editable ? (
                        <NumCell
                          label={`Price of ${l.name}`}
                          value={l.unitPrice}
                          onCommit={(v) =>
                            draft.update(l.key, { unitPrice: v })
                          }
                        />
                      ) : (
                        fmt(l.unitPrice)
                      )}
                    </td>
                    <td className='px-3 py-1.5 text-right font-medium whitespace-nowrap tabular-nums'>
                      {fmt(l.quantity * l.unitPrice)}
                    </td>
                    {editable && (
                      <td className='px-1 text-right'>
                        <Button
                          type='button'
                          size='icon'
                          variant='ghost'
                          aria-label={`Remove ${l.name}`}
                          title={
                            fromStock && !l.isNew
                              ? 'Remove — goes back to stock when you save'
                              : 'Remove'
                          }
                          onClick={() => draft.remove(l.key)}
                        >
                          <Trash2 className='text-destructive h-4 w-4' />
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {lines.length === 0 && !entry && (
                <tr>
                  <td
                    colSpan={cols}
                    className='text-muted-foreground px-3 py-6 text-center text-sm'
                  >
                    No parts or services — the bill is the estimate (
                    {fmt(job.estimatedCharges)}).
                  </td>
                </tr>
              )}
              {entry && (
                <BillEntryRow
                  layout='row'
                  jobId={job.id}
                  onAddLine={draft.add}
                  pendingQty={draft.pendingQty}
                  onMoreOptions={onAdd!}
                  showCost={showCost}
                  all={all}
                  onAllChange={setAll}
                  rowNumber={lines.length + 1}
                  className='hidden sm:table-row'
                />
              )}
            </tbody>
          </table>
        </div>
        {entry && (
          // Phones: the table scrolls sideways, which would clip the suggestions — type here instead.
          <div className='border-t p-2 sm:hidden'>
            <BillEntryRow
              jobId={job.id}
              onAddLine={draft.add}
              pendingQty={draft.pendingQty}
              onMoreOptions={onAdd!}
              hideLinks
              all={all}
              onAllChange={setAll}
            />
          </div>
        )}
        {entry && (
          <div className='text-muted-foreground hidden flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px] sm:flex'>
            <span>
              Type a part or service · Enter ↵ pick · Enter → Qty → Price ·
              Enter adds the line · Ctrl+S saves
            </span>
            {lines.length === 0 && (
              <span>
                Bill is the estimate ({fmt(job.estimatedCharges)}) until you add
                lines
              </span>
            )}
          </div>
        )}
      </div>

      <div className='ml-auto max-w-xs space-y-1 text-sm'>
        {lines.length > 0 && (
          <div className='flex justify-between'>
            <span className='text-muted-foreground'>Subtotal</span>
            <span className='tabular-nums'>{fmt(totals.subtotal)}</span>
          </div>
        )}
        <div className='flex items-center justify-between gap-2'>
          <span className='text-muted-foreground'>Discount</span>
          {editable ? (
            <NumCell
              label='Discount'
              value={draft.discount}
              className='w-28'
              onCommit={draft.setDiscount}
            />
          ) : (
            <span className='tabular-nums'>{fmt(draft.discount)}</span>
          )}
        </div>
        <div className='flex justify-between border-t pt-1 text-base font-semibold'>
          <span>Total</span>
          <span className='tabular-nums'>{fmt(totals.charges)}</span>
        </div>
        {showCost && (
          <div className='mt-2 space-y-1 border-t pt-2'>
            <div className='flex items-center justify-between gap-2'>
              <span className='text-muted-foreground min-w-0'>
                Repair cost
                <span className='block text-[11px] leading-tight'>
                  from repair stock
                  {stockLeft != null ? ` · ${fmt(stockLeft)} left` : ''}
                </span>
              </span>
              {editable ? (
                <NumCell
                  label='Repair cost from repair stock'
                  value={draft.directCost}
                  className='w-28'
                  onCommit={draft.setDirectCost}
                />
              ) : (
                <span className='tabular-nums'>{fmt(draft.directCost)}</span>
              )}
            </div>
            {totals.cost > 0 && (
              <>
                <div className='text-muted-foreground flex justify-between text-xs'>
                  <span>
                    Total cost
                    {totals.partsCost > 0 && draft.directCost > 0
                      ? ' (parts + repair cost)'
                      : ''}
                  </span>
                  <span className='tabular-nums'>{fmt(totals.cost)}</span>
                </div>
                <div className='flex justify-between text-xs font-medium'>
                  <span>Profit</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      totals.profit >= 0
                        ? 'text-emerald-600'
                        : 'text-destructive'
                    )}
                  >
                    {fmt(totals.profit)}
                    {totals.charges > 0 &&
                      ` (${Math.round((totals.profit / totals.charges) * 100)}%)`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
