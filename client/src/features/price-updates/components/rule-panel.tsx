import { ChevronDown, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import type { ListType, PriceStrategy, PricingRule, RoundDirection, RoundStep } from '@/lib/price-update-rules'
import { cn } from '@/lib/utils'

import { formatNumber } from '../lib/format'
import type { DerivedRow } from '../lib/session'

const LIST_TYPES: Array<{ value: ListType; title: string; hint: string }> = [
  { value: 'cost', title: 'Cost prices', hint: 'What I pay the supplier' },
  { value: 'price', title: 'Selling prices', hint: 'What I charge customers' },
  { value: 'cost_price', title: 'Cost + Selling', hint: 'Two columns, cost first' },
  { value: 'price_cost', title: 'Selling + Cost', hint: 'Two columns, selling first' },
]

const STRATEGIES: Array<{ value: PriceStrategy; title: string; hint: string }> = [
  { value: 'keep_margin_percent', title: 'Keep my margin %', hint: 'Same % profit as each product has today' },
  { value: 'keep_margin_amount', title: 'Keep my profit amount', hint: 'Same rupee profit as today (price moves by the cost change)' },
  { value: 'fixed_margin_percent', title: 'Set a fixed margin %', hint: 'Cost plus the % below, on every product' },
  { value: 'from_list', title: 'Use the list’s selling price', hint: 'For lists that have a retail column' },
  { value: 'keep_price', title: 'Don’t change selling prices', hint: 'Update costs only' },
]

const ROUND_STEPS: Array<{ value: RoundStep; label: string }> = [
  { value: 0, label: 'No rounding' },
  { value: 1, label: 'To the whole rupee' },
  { value: 5, label: 'To 5' },
  { value: 10, label: 'To 10' },
  { value: 50, label: 'To 50' },
  { value: 100, label: 'To 100' },
]

const DIRECTIONS: Array<{ value: RoundDirection; label: string }> = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'up', label: 'Round up' },
  { value: 'down', label: 'Round down' },
]

interface RulePanelProps {
  rule: PricingRule
  onRule: (rule: PricingRule) => void
  listType: ListType
  onListType: (type: ListType) => void
  /** One changed row, to show the rule working. */
  example: DerivedRow | null
  /** True when the list itself seems to have two price columns but the user chose one. */
  twoColumnsHint: boolean
}

export function RulePanel({ rule, onRule, listType, onListType, example, twoColumnsHint }: RulePanelProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(true)
  const set = <K extends keyof PricingRule>(key: K, value: PricingRule[K]) => onRule({ ...rule, [key]: value })
  const sellingOnly = listType === 'price'
  const strategy = STRATEGIES.find((s) => s.value === rule.strategy)

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type='button' className='flex w-full items-center justify-between gap-3 p-4 text-left'>
            <span className='flex items-center gap-2 text-sm font-semibold'>
              <SlidersHorizontal className='h-4 w-4 text-primary' />
              {t('Pricing rule')}
              <span className='hidden text-xs font-normal text-muted-foreground sm:inline'>
                — {t(LIST_TYPES.find((l) => l.value === listType)?.title || '')}
                {!sellingOnly && strategy ? ` · ${t(strategy.title)}` : ''}
              </span>
            </span>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className='space-y-5 border-t px-4 pt-4 sm:px-6'>
            <div className='space-y-2'>
              <Label className='text-xs uppercase tracking-wide text-muted-foreground'>{t('The numbers in this list are')}</Label>
              {/* Every grid here names its phone column (`grid-cols-1` = minmax(0,1fr)). A bare `grid` gets an `auto` track that grows to the widest unwrappable child and pushes the row past the card. */}
              <div role='radiogroup' aria-label={t('What the list contains')} className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'>
                {LIST_TYPES.map((item) => (
                  <button
                    key={item.value}
                    type='button'
                    role='radio'
                    aria-checked={listType === item.value}
                    onClick={() => onListType(item.value)}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition-colors',
                      listType === item.value ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className='block text-sm font-medium'>{t(item.title)}</span>
                    <span className='block text-xs text-muted-foreground'>{t(item.hint)}</span>
                  </button>
                ))}
              </div>
              {twoColumnsHint && (
                <p className='text-xs text-amber-700 dark:text-amber-400'>
                  {t('This list seems to have two price columns — choose “Cost + Selling” if the second number is the retail price.')}
                </p>
              )}
            </div>

            {!sellingOnly && (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <div className='space-y-1.5'>
                  <Label className='leading-snug'>{t('When the cost changes, set my selling price to')}</Label>
                  <Select value={rule.strategy} onValueChange={(v) => set('strategy', v as PriceStrategy)}>
                    <SelectTrigger aria-label={t('Selling price strategy')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STRATEGIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{t(s.title)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>{strategy ? t(strategy.hint) : ''}</p>
                </div>

                {(rule.strategy === 'fixed_margin_percent' || rule.strategy === 'keep_margin_percent' || rule.strategy === 'keep_margin_amount') && (
                  <div className='space-y-1.5'>
                    <Label htmlFor='rule-fixed-margin' className='leading-snug'>
                      {rule.strategy === 'fixed_margin_percent' ? t('Margin % on cost') : t('Margin % for products with no history')}
                    </Label>
                    <div className='relative max-w-40'>
                      <Input
                        id='rule-fixed-margin'
                        type='number'
                        min={0}
                        step={0.5}
                        showVoiceInput={false}
                        value={rule.fixedMarginPercent}
                        onChange={(e) => set('fixedMarginPercent', Math.max(0, Number(e.target.value) || 0))}
                        className='pr-7'
                      />
                      <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground'>%</span>
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      {rule.strategy === 'fixed_margin_percent'
                        ? t('Price = cost × (1 + margin%), the same way the product form works out margin.')
                        : t('Used only when a product has no cost or price to copy a margin from.')}
                    </p>
                  </div>
                )}

                <div className='space-y-1.5'>
                  <Label>{t('Round selling prices')}</Label>
                  {/* Wraps onto two lines when the column is too narrow for both, instead of squeezing/clipping the text. */}
                  <div className='flex flex-wrap gap-2'>
                    <Select value={String(rule.roundStep)} onValueChange={(v) => set('roundStep', Number(v) as RoundStep)}>
                      <SelectTrigger className='min-w-40 flex-1' aria-label={t('Rounding step')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROUND_STEPS.map((s) => (
                          <SelectItem key={s.value} value={String(s.value)}>{t(s.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={rule.roundDirection} onValueChange={(v) => set('roundDirection', v as RoundDirection)} disabled={rule.roundStep === 0}>
                      <SelectTrigger className='min-w-32 flex-1 sm:max-w-40' aria-label={t('Rounding direction')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DIRECTIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{t(d.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className='space-y-3'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='rule-min-margin' className='items-start gap-1.5 leading-snug'>
                      <ShieldCheck className='mt-px h-3.5 w-3.5 shrink-0 text-emerald-600' /> {t('Minimum margin (0 = off)')}
                    </Label>
                    <div className='relative max-w-40'>
                      <Input
                        id='rule-min-margin'
                        type='number'
                        min={0}
                        step={0.5}
                        showVoiceInput={false}
                        value={rule.minMarginPercent}
                        onChange={(e) => set('minMarginPercent', Math.max(0, Number(e.target.value) || 0))}
                        className='pr-7'
                      />
                      <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground'>%</span>
                    </div>
                    <p className='text-xs text-muted-foreground'>{t('Never sell for less than cost plus this. Rows below cost are always flagged.')}</p>
                  </div>
                  <label className='flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5'>
                    <span className='min-w-0'>
                      <span className='block text-sm font-medium'>{t('Don’t lower selling prices')}</span>
                      <span className='block text-xs text-muted-foreground'>{t('If a cost drops, keep today’s selling price.')}</span>
                    </span>
                    <Switch className='shrink-0' checked={rule.neverLowerPrice} onCheckedChange={(v) => set('neverLowerPrice', v)} aria-label={t('Don’t lower selling prices')} />
                  </label>
                </div>
              </div>
            )}

            {example && example.calc && example.entry && (
              <div className='rounded-lg bg-muted/50 p-3 text-xs leading-relaxed'>
                <span className='font-semibold'>{t('Example')}: </span>
                <span className='font-medium'>{example.entry.name}</span> —{' '}
                {example.calc.newCost !== undefined && (
                  <>{t('Cost')} {formatNumber(example.entry.cost)} → <b>{formatNumber(example.calc.newCost)}</b>{' '}</>
                )}
                {example.calc.newPrice !== undefined && (
                  <>· {t('selling price')} {formatNumber(example.entry.price)} → <b>{formatNumber(example.calc.newPrice)}</b></>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
