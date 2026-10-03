import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useLanguage } from '@/context/language-context'
import { usePostStockCountMutation, type StockCount, type StockCountTotals } from '@/stores/stockCount.api'
import { apiError, fmtQty } from '../lib/labels'

interface PostCountDialogProps {
  count: StockCount
  totals: StockCountTotals
  unexplained: number
  open: boolean
  onOpenChange: (open: boolean) => void
  formatMoney: (value: number) => string
}

/** Final sign-off: every difference becomes a stock adjustment. */
export function PostCountDialog({ count, totals, unexplained, open, onOpenChange, formatMoney }: PostCountDialogProps) {
  const { t } = useLanguage()
  const [post, { isLoading }] = usePostStockCountMutation()
  const [uncountedPolicy, setUncountedPolicy] = useState<'skip' | 'zero'>('skip')
  const uncounted = totals.itemCount - totals.countedCount
  const showValue = totals.gainValue !== undefined

  const confirm = async () => {
    try {
      const result = await post({ id: count.id, uncountedPolicy: count.type === 'initial' ? uncountedPolicy : undefined }).unwrap()
      if (result.failed > 0) {
        toast.warning(t('{{n}} item(s) could not be posted — see the notes on the sheet, then post again').replace('{{n}}', String(result.failed)))
      } else if (result.count.postWarnings?.length) {
        toast.success(t('Count posted — check the notes on a few items'))
      } else {
        toast.success(t('Count posted — stock updated'))
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(apiError(err, t('Could not post the count')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='text-left'>
          <DialogTitle>{t('Post {{number}}?').replace('{{number}}', count.number)}</DialogTitle>
          <DialogDescription>
            {t('Each difference is applied to stock as a “Stock Count” adjustment. Sales made since an item was counted are kept.')}
          </DialogDescription>
        </DialogHeader>

        <div className='grid grid-cols-2 gap-2 text-sm'>
          <Stat label={t('Counted')} value={`${totals.countedCount} / ${totals.itemCount}`} />
          <Stat label={t('Exactly right')} value={String(totals.matchedCount)} />
          <Stat
            label={t('Found extra')}
            value={`+${fmtQty(totals.gainQty)}`}
            sub={showValue ? formatMoney(totals.gainValue ?? 0) : undefined}
            tone='text-emerald-600 dark:text-emerald-400'
          />
          <Stat
            label={t('Missing')}
            value={`−${fmtQty(totals.lossQty)}`}
            sub={showValue ? formatMoney(totals.lossValue ?? 0) : undefined}
            tone='text-rose-600 dark:text-rose-400'
          />
        </div>

        {unexplained > 0 && (
          <p className='text-xs text-muted-foreground'>
            {t('{{n}} difference(s) have no reason yet — you can still post.').replace('{{n}}', String(unexplained))}
          </p>
        )}

        {uncounted > 0 &&
          (count.type === 'initial' ? (
            <div className='space-y-2 rounded-md border p-3'>
              <Label>{t('{{n}} item(s) were not counted').replace('{{n}}', String(uncounted))}</Label>
              <RadioGroup value={uncountedPolicy} onValueChange={(v) => setUncountedPolicy(v as 'skip' | 'zero')}>
                <label className='flex items-start gap-2 text-sm'>
                  <RadioGroupItem value='skip' className='mt-0.5' />
                  <span>
                    {t('Leave their stock as it is')}
                    <span className='block text-xs text-muted-foreground'>{t('They stay due for counting.')}</span>
                  </span>
                </label>
                <label className='flex items-start gap-2 text-sm'>
                  <RadioGroupItem value='zero' className='mt-0.5' />
                  <span>
                    {t('Set their stock to zero')}
                    <span className='block text-xs text-muted-foreground'>{t('Only if everything that exists was counted.')}</span>
                  </span>
                </label>
              </RadioGroup>
            </div>
          ) : (
            <p className='text-xs text-muted-foreground'>
              {t('{{n}} item(s) were not counted — their stock is left unchanged and they stay due.').replace('{{n}}', String(uncounted))}
            </p>
          ))}

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={confirm} disabled={isLoading}>
            {isLoading && <Loader2 className='mr-1 size-4 animate-spin' />}
            {t('Post adjustments')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className='rounded-md border p-2'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={`font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      {sub && <div className='text-xs text-muted-foreground tabular-nums'>{sub}</div>}
    </div>
  )
}
