import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Equal,
  FileText,
  Loader2,
  SkipForward,
  TriangleAlert,
  Undo2,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { ProductThumb } from '@/features/products/analytics/components/product-thumb'
import { formatBusinessDateTime } from '@/lib/business-timezone'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import {
  useGetPriceUpdateBatchQuery,
  useRollbackPriceUpdateMutation,
  type ChangeStatus,
  type PriceChangeRecord,
} from '@/stores/priceUpdate.api'

import { exportPriceChanges } from '../lib/export'
import { userName } from '../lib/format'
import { formatNumber } from '../lib/format'
import { StatusBadge } from './status-badge'

const CHANGE_STATUS: Record<ChangeStatus, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: 'Pending', icon: Clock, className: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
  applied: { label: 'Applied', icon: CheckCircle2, className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  unchanged: { label: 'Already correct', icon: Equal, className: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
  stale: { label: 'Skipped', icon: SkipForward, className: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400' },
  failed: { label: 'Failed', icon: XCircle, className: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400' },
  reverted: { label: 'Restored', icon: Undo2, className: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  revert_conflict: { label: 'Not restored', icon: TriangleAlert, className: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400' },
}

const STAT_TILES: Array<{ key: keyof BatchStatsSubset; label: string; icon: LucideIcon; tone: 'ok' | 'muted' | 'warn' | 'danger' }> = [
  { key: 'applied', label: 'Updated', icon: CheckCircle2, tone: 'ok' },
  { key: 'unchanged', label: 'Already correct', icon: Equal, tone: 'muted' },
  { key: 'stale', label: 'Skipped', icon: SkipForward, tone: 'warn' },
  { key: 'failed', label: 'Failed', icon: XCircle, tone: 'danger' },
]

const TILE_TONE: Record<'ok' | 'muted' | 'warn' | 'danger', string> = {
  ok: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  muted: 'bg-muted text-muted-foreground',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

type BatchStatsSubset = { applied: number; unchanged: number; stale: number; failed: number }

const ITEM_GRID = 'grid-cols-1 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(120px,auto)]'

/** Colour follows what the change means for the shop: a rising cost hurts, a rising selling price helps. */
function Change({ from, to, kind }: { from: number | null; to: number | null; kind: 'cost' | 'price' }) {
  if (to === null || to === undefined) return <span className='text-muted-foreground'>—</span>
  const pct = from && from > 0 ? ((to - from) / from) * 100 : null
  const good = pct !== null && (kind === 'cost' ? pct < 0 : pct > 0)
  return (
    <span className='tabular-nums'>
      <span className='text-muted-foreground'>{formatNumber(from)}</span>
      <span className='px-1 text-muted-foreground'>→</span>
      <span className='font-semibold'>{formatNumber(to)}</span>
      {pct !== null && pct !== 0 && (
        <span className={cn('ml-1 text-[11px] font-medium', good ? 'text-emerald-600' : 'text-red-600')}>
          {pct > 0 ? '+' : ''}
          {pct.toFixed(1)}%
        </span>
      )}
    </span>
  )
}

interface BatchSheetProps {
  batchId: string | null
  onClose: () => void
}

export function BatchSheet({ batchId, onClose }: BatchSheetProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [undoOpen, setUndoOpen] = useState(false)
  const [forceOpen, setForceOpen] = useState(false)
  const [conflicts, setConflicts] = useState(0)
  const { data, isFetching } = useGetPriceUpdateBatchQuery({ batchId: batchId || '', limit: 1000 }, { skip: !batchId })
  const [rollback, { isLoading: undoing }] = useRollbackPriceUpdateMutation()

  const batch = data?.batch
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = data?.items || []
    return q ? all.filter((i) => (i.productName || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q) || (i.barcode || '').toLowerCase().includes(q)) : all
  }, [data, query])

  const canUndo = batch && (batch.status === 'applied' || batch.status === 'partially_rolled_back')

  const doUndo = async (force: boolean) => {
    if (!batchId) return
    setUndoOpen(false)
    setForceOpen(false)
    try {
      const out = await rollback({ batchId, force }).unwrap()
      setConflicts(out.conflicts)
      toast.success(`${t('Restored')} ${out.reverted} ${t(out.reverted === 1 ? 'product' : 'products')}${out.conflicts ? ` · ${out.conflicts} ${t('left as they are')}` : ''}`)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not undo this update')))
    }
  }

  const doExport = () => {
    if (!batch) return
    exportPriceChanges(
      (data?.items || []).map((i: PriceChangeRecord) => ({
        product: `${i.productName || ''}${i.variantLabel ? ` — ${i.variantLabel}` : ''}`,
        code: i.sku || i.barcode,
        oldCost: i.oldCost,
        newCost: i.costChanged ? i.newCost : null,
        oldPrice: i.oldPrice,
        newPrice: i.priceChanged ? i.newPrice : null,
        status: i.status,
        fromList: i.sourceLine,
        note: i.message,
      })),
      `price-update-${batch.batchNumber}`,
    )
  }

  return (
    <Sheet open={Boolean(batchId)} onOpenChange={(open) => !open && onClose()}>
      {/* `sm:` variant is required: the base class ends in `sm:max-w-sm`, which a plain max-w-* loses to above 640px. */}
      <SheetContent className='flex w-full flex-col gap-0 p-0 sm:max-w-3xl'>
        <SheetHeader className='border-b p-4 text-left'>
          <SheetTitle className='flex flex-wrap items-center gap-2'>
            {batch ? `${t('Price update')} #${batch.batchNumber}` : t('Price update')}
            {batch && <StatusBadge status={batch.status} />}
          </SheetTitle>
          <SheetDescription>
            {batch
              ? [
                  formatBusinessDateTime(batch.appliedAt || batch.createdAt),
                  userName(batch.appliedBy),
                  batch.source.supplierName,
                  batch.source.fileName,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('Loading…')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className='min-h-0 flex-1'>
          <div className='space-y-4 p-4'>
            {!batch || isFetching && !data ? (
              <div className='space-y-3'>
                <Skeleton className='h-20 w-full' />
                <Skeleton className='h-64 w-full' />
              </div>
            ) : (
              <>
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  {STAT_TILES.map((s) => {
                    const Icon = s.icon
                    return (
                      <div key={s.key} className='flex items-center gap-2.5 rounded-lg border p-2.5'>
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', TILE_TONE[s.tone])}>
                          <Icon className='h-4 w-4' />
                        </span>
                        <div className='min-w-0'>
                          <p className='text-lg font-bold leading-tight tabular-nums'>{batch.stats[s.key]}</p>
                          <p className='truncate text-[11px] text-muted-foreground'>{t(s.label)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className='text-sm text-muted-foreground'>
                  {t('Average cost change')}: <b className='text-foreground'>{batch.stats.avgCostChangePercent > 0 ? '+' : ''}{batch.stats.avgCostChangePercent}%</b>
                  {batch.stats.avgPriceChangePercent !== 0 && (
                    <> · {t('selling price')}: <b className='text-foreground'>{batch.stats.avgPriceChangePercent > 0 ? '+' : ''}{batch.stats.avgPriceChangePercent}%</b></>
                  )}
                </p>
                {batch.note && <p className='rounded-lg bg-muted/50 p-2.5 text-sm'>{batch.note}</p>}

                {(conflicts > 0 || batch.status === 'partially_rolled_back') && (
                  <Alert className='border-amber-500/40 bg-amber-500/5'>
                    <AlertDescription className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                      <span>{t('Some products were changed again after this update, so the undo left them alone.')}</span>
                      <Can permission='managePriceUpdates'>
                        <Button size='sm' variant='outline' onClick={() => setForceOpen(true)}>{t('Restore them anyway')}</Button>
                      </Can>
                    </AlertDescription>
                  </Alert>
                )}

                {batch.sourceText && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <button type='button' className='flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium'>
                        <span className='flex items-center gap-2'>
                          <FileText className='h-4 w-4 text-muted-foreground' />
                          {t('Original message / text')}
                        </span>
                        <ChevronDown className='h-4 w-4 text-muted-foreground' />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className='mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-mono text-xs'>{batch.sourceText}</pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                <div className='space-y-2'>
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search products in this update…')} className='h-9' showVoiceInput={false} aria-label={t('Search products in this update')} />
                  <div className='overflow-hidden rounded-lg border'>
                    {/* A grid, not a <table> — it stacks into cards on a phone instead of scrolling sideways. */}
                    <div className={cn('hidden items-center gap-x-3 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid', ITEM_GRID)}>
                      <span>{t('Product')}</span>
                      <span>{t('Cost')}</span>
                      <span>{t('Selling price')}</span>
                      <span>{t('Status')}</span>
                    </div>
                    <div className='divide-y'>
                      {items.map((i) => {
                        const st = CHANGE_STATUS[i.status] || CHANGE_STATUS.pending
                        const StatusIcon = st.icon
                        return (
                          <div key={i.id} className={cn('grid items-start gap-x-3 gap-y-1.5 px-3 py-3', ITEM_GRID)}>
                            <div className='flex min-w-0 items-center gap-2.5'>
                              <ProductThumb url={null} name={i.productName || ''} size='sm' />
                              <div className='min-w-0'>
                                <p className='truncate text-sm font-medium leading-snug'>{i.productName}{i.variantLabel ? ` — ${i.variantLabel}` : ''}</p>
                                {i.sourceLine && <p className='truncate text-[11px] text-muted-foreground' title={i.sourceLine}>{i.sourceLine}</p>}
                              </div>
                            </div>
                            <div className='flex items-center justify-between gap-2 pl-[42px] text-sm sm:justify-start sm:pl-0'>
                              <span className='text-[11px] text-muted-foreground sm:hidden'>{t('Cost')}</span>
                              {i.costChanged ? <Change from={i.oldCost} to={i.newCost} kind='cost' /> : <span className='text-muted-foreground'>—</span>}
                            </div>
                            <div className='flex items-center justify-between gap-2 pl-[42px] text-sm sm:justify-start sm:pl-0'>
                              <span className='text-[11px] text-muted-foreground sm:hidden'>{t('Selling price')}</span>
                              {i.priceChanged ? <Change from={i.oldPrice} to={i.newPrice} kind='price' /> : <span className='text-muted-foreground'>—</span>}
                            </div>
                            <div className='pl-[42px] sm:pl-0'>
                              <Badge variant='outline' className={cn('gap-1', st.className)}>
                                <StatusIcon className='h-3 w-3' /> {t(st.label)}
                              </Badge>
                              {i.message && <p className='mt-1 text-[11px] text-muted-foreground'>{i.message}</p>}
                            </div>
                          </div>
                        )
                      })}
                      {items.length === 0 && (
                        <p className='px-3 py-8 text-center text-sm text-muted-foreground'>{t('No products match.')}</p>
                      )}
                    </div>
                  </div>
                  {data && data.total > (data.items || []).length && (
                    <p className='text-xs text-muted-foreground'>{t('Showing the first')} {data.items.length} {t('of')} {data.total}. {t('Export to see all of them.')}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className='flex flex-wrap items-center justify-between gap-2 border-t p-3'>
          <Button variant='outline' onClick={doExport} disabled={!batch}>
            <Download className='mr-1.5 h-4 w-4' /> {t('Export')}
          </Button>
          <Can permission='managePriceUpdates'>
            {canUndo && batch.status === 'applied' && (
              <Button variant='outline' className='text-amber-700 hover:text-amber-700' onClick={() => setUndoOpen(true)} disabled={undoing}>
                {undoing ? <Loader2 className='mr-1.5 h-4 w-4 animate-spin' /> : <Undo2 className='mr-1.5 h-4 w-4' />} {t('Undo this update')}
              </Button>
            )}
          </Can>
        </div>

        <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Undo this whole update?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('Every product goes back to the cost and price it had before. Anything that was changed again since (a new purchase, another edit) is left alone.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('Keep the update')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void doUndo(false)}>{t('Undo update')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={forceOpen} onOpenChange={setForceOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Restore them anyway?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('These products were changed after this update — by a purchase or another edit. Restoring will overwrite those newer values with the old ones from before this update.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('Leave them')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void doUndo(true)}>{t('Restore anyway')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}

