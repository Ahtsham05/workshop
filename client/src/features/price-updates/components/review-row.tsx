import { useRef } from 'react'
import { ArrowDown, ArrowUp, BookmarkCheck, Check, CheckCircle2, CircleHelp, Link2, Search, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useLanguage } from '@/context/language-context'
import { ProductThumb } from '@/features/products/analytics/components/product-thumb'
import { focusField } from '@/lib/invoice-form-keyboard'
import { cn } from '@/lib/utils'
import type { CatalogEntry } from '@/stores/priceUpdate.api'

import { ISSUE_INFO, MATCH_FLAG_INFO, type Tone } from '../lib/labels'
import type { DerivedRow, RowIssue } from '../lib/session'
import { MatchPicker } from './match-picker'
import { formatNumber } from '../lib/format'
import { NumberCell } from './number-cell'

export interface RowActions {
  toggle: (index: number) => void
  confirm: (index: number) => void
  link: (index: number, entry: CatalogEntry) => void
  unlink: (index: number) => void
  setCost: (index: number, value: number | null) => void
  setPrice: (index: number, value: number | null) => void
}

const TONE_CLASS: Record<Tone, string> = {
  danger: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
}

function IssueChip({ issue, extra }: { issue: RowIssue; extra?: string }) {
  const { t } = useLanguage()
  const info = ISSUE_INFO[issue]
  if (!info) return null
  return (
    <span
      title={t(info.hint) + (extra ? ` ${extra}` : '')}
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE_CLASS[info.tone])}
    >
      {info.tone === 'danger' && <TriangleAlert className='h-3 w-3' />}
      {t(info.label)}
    </span>
  )
}

/** ▲/▼ with the % — colour follows what it means for the shop, not just the direction. */
function Delta({ percent, kind }: { percent: number | null; kind: 'cost' | 'price' }) {
  if (percent === null || percent === 0) return null
  const up = percent > 0
  // A rising cost hurts; a rising selling price helps. Falling is the reverse.
  const good = kind === 'cost' ? !up : up
  return (
    <span className={cn('inline-flex items-center text-[11px] font-semibold tabular-nums', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {up ? <ArrowUp className='h-3 w-3' /> : <ArrowDown className='h-3 w-3' />}
      {Math.abs(percent).toFixed(1)}%
    </span>
  )
}

function MatchBadge({ d }: { d: DerivedRow }) {
  const { t } = useLanguage()
  const { row, state } = d
  if (state.confirmed) {
    return (
      <Badge variant='outline' className='gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'>
        <CheckCircle2 className='h-3 w-3' /> {t('Confirmed')}
      </Badge>
    )
  }
  if (row.match.status === 'high') {
    if (row.match.method === 'alias') {
      return (
        <Badge variant='outline' className='gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'>
          <BookmarkCheck className='h-3 w-3' /> {t('Remembered')}
        </Badge>
      )
    }
    return (
      <Badge variant='outline' className='gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'>
        <Check className='h-3 w-3' /> {row.match.method === 'code' ? t('Barcode match') : t('Matched')}
      </Badge>
    )
  }
  return (
    <Badge variant='outline' className='gap-1 border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-400'>
      <CircleHelp className='h-3 w-3' /> {t('Check this match')} · {Math.round(row.match.score * 100)}%
    </Badge>
  )
}

/** Old value (struck through) → new value, coloured by whether the margin is healthy. */
function MarginPill({ oldMargin, newMargin }: { oldMargin: number | null; newMargin: number | null }) {
  const negative = newMargin !== null && newMargin < 0
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        negative ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      )}
    >
      <span className='font-normal text-muted-foreground line-through decoration-muted-foreground/50'>
        {oldMargin === null ? '—' : `${oldMargin.toFixed(1)}%`}
      </span>
      <span aria-hidden className='text-muted-foreground'>→</span>
      {newMargin === null ? '—' : `${newMargin.toFixed(1)}%`}
    </span>
  )
}

interface ReviewRowProps {
  d: DerivedRow
  actions: RowActions
  /** Grid template shared with the column header so they always line up. */
  gridClass: string
}

export function ReviewRow({ d, actions, gridClass }: ReviewRowProps) {
  const { t } = useLanguage()
  const { row, entry, calc, status, state } = d
  const idx = row.index
  const priceInputRef = useRef<HTMLInputElement>(null)

  const tickable = status === 'ready' || status === 'excluded'
  const dim = status === 'unchanged' || status === 'superseded' || status === 'excluded'

  const matchFlags = row.match.flags.filter((f) => MATCH_FLAG_INFO[f] && f !== 'section_used' && f !== 'fuzzy_words').slice(0, 2)
  const issues = d.issues.filter((i, pos, all) => ISSUE_INFO[i] && all.indexOf(i) === pos)

  return (
    <div
      data-status={status}
      className={cn(
        'grid items-start gap-x-3 gap-y-2 border-b px-3 py-3.5 last:border-b-0 transition-colors',
        gridClass,
        status === 'review' && 'bg-amber-500/[0.06]',
        status === 'unmatched' && 'bg-muted/30',
        status === 'ready' && 'bg-background hover:bg-muted/40',
        dim && 'opacity-70',
      )}
    >
      {/* Tick */}
      <div className='row-span-1 pt-1.5'>
        <Checkbox
          checked={tickable && state.included}
          disabled={!tickable}
          onCheckedChange={() => actions.toggle(idx)}
          aria-label={`${t('Include')} ${row.name}`}
        />
      </div>

      {/* From the list */}
      <div className='col-start-2 min-w-0 lg:col-start-auto'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <span className='line-clamp-2 text-sm font-semibold leading-snug' title={row.raw}>{row.name}</span>
          {status === 'superseded' && (
            <span className='inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground'>
              {t('Replaced by line')} #{d.supersededByLine}
            </span>
          )}
          {issues.map((issue) => (
            <IssueChip key={issue} issue={issue} />
          ))}
        </div>
        <div className='mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground'>
          <span className='tabular-nums'>#{row.line}</span>
          {row.section && (
            <>
              <span aria-hidden>·</span>
              <span className='rounded bg-muted px-1.5 py-px font-medium' title={t('The heading above this line in the list')}>
                {row.section}
              </span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className='tabular-nums'>
            {t('List')}: {row.values.map((v) => formatNumber(v.value)).join(' / ')}
          </span>
        </div>
        {row.note && <p className='mt-0.5 truncate text-[11px] italic text-muted-foreground' title={row.note}>{row.note}</p>}
      </div>

      {/* Matched product */}
      <div className='col-start-2 min-w-0 lg:col-start-auto'>
        {entry ? (
          <div className='flex items-start gap-2.5'>
            <ProductThumb url={entry.imageUrl} name={entry.name} size='sm' />
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                <span className='text-sm font-semibold' title={entry.name}>{entry.name}</span>
                <MatchBadge d={d} />
                {status === 'review' && (
                  <Button size='sm' className='h-7 px-2.5 text-xs' onClick={() => actions.confirm(idx)}>
                    <Check className='mr-1 h-3.5 w-3.5' /> {t('Confirm')}
                  </Button>
                )}
                <MatchPicker row={d} onPick={(e) => actions.link(idx, e)} onUnlink={() => actions.unlink(idx)}>
                  <Button variant='ghost' size='sm' className='h-7 px-2 text-xs text-muted-foreground'>
                    <Link2 className='mr-1 h-3.5 w-3.5' /> {t('Change')}
                  </Button>
                </MatchPicker>
              </div>
              <div className='mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground'>
                {(entry.sku || entry.barcode) && <span className='font-mono'>{entry.sku || entry.barcode}</span>}
                {(entry.sku || entry.barcode) && <span aria-hidden>·</span>}
                <span>{t('Stock')}: {formatNumber(entry.stock)}</span>
                {!entry.isActive && (
                  <>
                    <span aria-hidden>·</span>
                    <span className='font-medium text-amber-600'>{t('Inactive')}</span>
                  </>
                )}
              </div>
              {status === 'review' && matchFlags.length > 0 && (
                <ul className='mt-1 space-y-0.5 text-[11px] text-amber-800 dark:text-amber-400'>
                  {matchFlags.map((f) => (
                    <li key={f}>• {t(MATCH_FLAG_INFO[f])}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className='flex items-start gap-2.5'>
            <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground'>
              <CircleHelp className='h-4 w-4' />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                <Badge variant='outline' className='gap-1 text-muted-foreground'>
                  {t('No match found')}
                </Badge>
                <MatchPicker row={d} onPick={(e) => actions.link(idx, e)} onUnlink={() => actions.unlink(idx)}>
                  <Button variant='outline' size='sm' className='h-7 px-2.5 text-xs'>
                    <Search className='mr-1 h-3.5 w-3.5' /> {t('Find product')}
                  </Button>
                </MatchPicker>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cost + price: side by side on a phone, separate grid columns on desktop (`lg:contents`). */}
      {entry && calc ? (
        <>
          <div className='col-start-2 grid grid-cols-2 gap-3 lg:contents'>
            <div className='rounded-md lg:border lg:border-border/60 lg:bg-muted/20 lg:p-1.5'>
              <p className='mb-0.5 text-[11px] font-medium text-muted-foreground lg:hidden'>{t('Cost')}</p>
              <div className='flex items-baseline justify-between gap-1 text-[11px] text-muted-foreground'>
                <span className={cn('tabular-nums', calc.costPercent !== null && calc.costPercent !== 0 && 'line-through decoration-muted-foreground/50')}>
                  {formatNumber(entry.cost)}
                </span>
                <Delta percent={calc.costPercent} kind='cost' />
              </div>
              <NumberCell
                value={calc.newCost}
                overridden={state.costOverride !== null}
                ariaLabel={`${t('New cost for')} ${row.name}`}
                onCommit={(v) => actions.setCost(idx, v)}
                onEnterNext={() => focusField(priceInputRef.current)}
                className='mt-1'
              />
            </div>
            <div className='rounded-md lg:border lg:border-border/60 lg:bg-muted/20 lg:p-1.5'>
              <p className='mb-0.5 text-[11px] font-medium text-muted-foreground lg:hidden'>{t('Selling price')}</p>
              <div className='flex items-baseline justify-between gap-1 text-[11px] text-muted-foreground'>
                <span className={cn('tabular-nums', calc.pricePercent !== null && calc.pricePercent !== 0 && 'line-through decoration-muted-foreground/50')}>
                  {formatNumber(entry.price)}
                </span>
                <Delta percent={calc.pricePercent} kind='price' />
              </div>
              <NumberCell
                ref={priceInputRef}
                value={calc.newPrice}
                overridden={state.priceOverride !== null}
                ariaLabel={`${t('New selling price for')} ${row.name}`}
                onCommit={(v) => actions.setPrice(idx, v)}
                className='mt-1'
              />
            </div>
          </div>
          <div className='col-start-2 flex items-center gap-1 text-[11px] text-muted-foreground lg:col-start-auto lg:justify-end lg:pt-6'>
            <span className='lg:hidden'>{t('Margin')}: </span>
            <MarginPill oldMargin={calc.oldMargin} newMargin={calc.newMargin} />
          </div>
        </>
      ) : (
        <div className='col-start-2 hidden text-xs text-muted-foreground lg:col-span-3 lg:col-start-auto lg:block lg:pt-1'>
          {t('Choose the matching product to see the new prices.')}
        </div>
      )}
    </div>
  )
}
