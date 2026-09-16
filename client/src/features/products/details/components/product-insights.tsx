import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Lightbulb, ThumbsUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { InsightSeverity, ProductInsight } from '@/stores/productAnalytics.api'
import { describeInsight } from '../../analytics/lib/insight-message'

// Status meaning always travels with an icon and a text label, never color alone.
const SEVERITY: Record<InsightSeverity, { icon: typeof Info; label: string; className: string }> = {
  critical: { icon: AlertOctagon, label: 'Critical', className: 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300' },
  warning: { icon: AlertTriangle, label: 'Warning', className: 'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300' },
  info: { icon: Info, label: 'Tip', className: 'border-sky-200 bg-sky-50/70 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300' },
  positive: { icon: ThumbsUp, label: 'Good', className: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300' },
}

export function ProductInsights({ insights, className }: { insights: ProductInsight[]; className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const items = insights
    .map((insight) => ({ insight, text: describeInsight(insight, t, formatMoney) }))
    .filter((entry): entry is { insight: ProductInsight; text: { title: string; detail: string } } => entry.text !== null)

  return (
    <Card className={cn('gap-0', className)}>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Lightbulb className='h-4 w-4 text-amber-500' aria-hidden />
          {t('Insights')}
        </CardTitle>
        <CardDescription className='text-xs'>{t('What stands out for this product in the selected period')}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className='flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground'>
            <CheckCircle2 className='h-6 w-6 text-emerald-500' aria-hidden />
            {t('Nothing needs attention — stock, pricing and sales look healthy.')}
          </div>
        ) : (
          <ul className='space-y-2'>
            {items.map(({ insight, text }) => {
              const meta = SEVERITY[insight.severity] || SEVERITY.info
              const Icon = meta.icon
              return (
                <li key={insight.code} className={cn('flex gap-2.5 rounded-lg border p-2.5', meta.className)}>
                  <Icon className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
                  <div className='min-w-0'>
                    <p className='text-sm font-medium'>
                      <span className='sr-only'>{t(meta.label)}: </span>
                      {text.title}
                    </p>
                    <p className='text-xs text-foreground/70'>{text.detail}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
