import { Link } from '@tanstack/react-router'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage } from '@/context/language-context'
import {
  partHint,
  partLabel,
  partsFor,
  useTransactionLayout,
  type TransactionKind,
} from '@/lib/transaction-layout'

/**
 * Rough sketch of the desktop screen (catalog closed) for the current choices: details on
 * the left, items in the middle, Summary/Payment on the right — the right column drops out
 * once both of its cards are off, and the items take its width.
 */
function LayoutSketch({ kind }: { kind: TransactionKind }) {
  const { isShown } = useTransactionLayout(kind)
  const side = isShown('summary') || isShown('payment')
  const toolbar = partsFor(kind).filter((p) => p.group === 'toolbar' && isShown(p.id)).length
  return (
    <div className='bg-muted/40 space-y-1 rounded-md border p-1.5' aria-hidden>
      <div className='flex gap-0.5'>
        {Array.from({ length: toolbar }, (_, i) => (
          <span key={i} className='bg-muted-foreground/25 h-1.5 w-3 rounded-sm' />
        ))}
        <span className='bg-primary/60 ml-auto h-1.5 w-8 rounded-sm' />
      </div>
      <div className='flex h-14 gap-1'>
        <div className='bg-card w-1/5 rounded-sm border' />
        <div className='flex flex-1 flex-col gap-0.5'>
          {isShown('stats') && <div className='bg-card h-2 rounded-sm border' />}
          <div className='flex-1 rounded-sm border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' />
        </div>
        {side && (
          <div className='flex w-1/5 flex-col gap-0.5'>
            {isShown('summary') && <div className='bg-card flex-1 rounded-sm border' />}
            {isShown('payment') && <div className='bg-card flex-[1.4] rounded-sm border' />}
          </div>
        )}
      </div>
    </div>
  )
}

/** One switch per hideable toolbar button / card of the New Invoice or New Purchase screen. */
export function TransactionLayoutForm({ kind, dense = false }: { kind: TransactionKind; dense?: boolean }) {
  const { t } = useLanguage()
  const { isShown, setShown, reset, isCustomised } = useTransactionLayout(kind)
  const parts = partsFor(kind)

  const group = (title: string, ids: typeof parts) => (
    <div className='space-y-1'>
      <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>{t(title)}</p>
      {ids.map((part) => {
        const id = `tx-layout-${kind}-${part.id}`
        const hint = partHint(part, kind)
        return (
          <div key={part.id} className={cn('flex items-start justify-between gap-3', dense ? 'py-1' : 'py-1.5')}>
            <div className='min-w-0'>
              <Label htmlFor={id} className='cursor-pointer text-sm font-normal'>
                {t(partLabel(part, kind))}
              </Label>
              {hint && !dense && <p className='text-muted-foreground mt-0.5 text-xs'>{t(hint)}</p>}
            </div>
            <Switch id={id} checked={isShown(part.id)} onCheckedChange={(on) => setShown(part.id, on)} />
          </div>
        )
      })}
    </div>
  )

  return (
    <div className='space-y-4'>
      <LayoutSketch kind={kind} />
      {group('Toolbar buttons', parts.filter((p) => p.group === 'toolbar'))}
      {group('Cards', parts.filter((p) => p.group === 'cards'))}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-xs'>
          {t('Save and Save & Print always stay. Only you see these choices, on any device.')}
        </p>
        <Button type='button' variant='ghost' size='sm' className='gap-1.5' onClick={reset} disabled={!isCustomised}>
          <RotateCcw className='h-3.5 w-3.5' aria-hidden />
          {t('Show everything')}
        </Button>
      </div>
    </div>
  )
}

/** Toolbar button on the New Invoice / New Purchase screen — the same switches in a popover. */
export function TransactionLayoutButton({ kind }: { kind: TransactionKind }) {
  const { t } = useLanguage()
  const { isCustomised } = useTransactionLayout(kind)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='gap-2 shadow-sm'
          aria-label={t('Customize screen')}
          title={t('Customize screen')}
        >
          <SlidersHorizontal className='h-4 w-4 shrink-0' aria-hidden />
          <span className='max-xl:sr-only'>{t('Customize')}</span>
          {isCustomised && <span className='bg-primary h-1.5 w-1.5 rounded-full' aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='max-h-[min(80vh,640px)] w-80 overflow-y-auto'>
        <div className='mb-3 flex items-center justify-between gap-2'>
          <p className='text-sm font-semibold'>
            {kind === 'sale' ? t('Customize invoice screen') : t('Customize purchase screen')}
          </p>
          <Link to='/settings/transaction-layout' className='text-primary text-xs hover:underline'>
            {t('Settings')}
          </Link>
        </div>
        <TransactionLayoutForm kind={kind} dense />
      </PopoverContent>
    </Popover>
  )
}
