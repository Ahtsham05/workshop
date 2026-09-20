import { useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { CheckCircle2, ExternalLink, ImageOff, RefreshCw, AlertTriangle, SearchX, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { CompetitorPriceResult } from '@/stores/priceChecker.api'

interface CompetitorResultCardProps {
  result: CompetitorPriceResult
  cheapestOwnPrice: number | null
  isBestDeal: boolean
  formatMoney: (amount: number) => string
  onRefresh: () => void
  isRefreshing: boolean
}

// Deterministic per-source avatar color, cycling a small fixed palette by name length —
// purely cosmetic (no favicon fetching), just enough to make cards feel distinguishable
// at a glance instead of every source sharing one plain gray icon.
const AVATAR_TONES = [
  'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
]
const avatarTone = (name: string) => AVATAR_TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_TONES.length]

/** Best-effort hostname for display under the site name — falls back to the product URL
 * itself if it's somehow not a valid absolute URL. */
function hostnameOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function CompetitorResultCard({
  result,
  cheapestOwnPrice,
  isBestDeal,
  formatMoney,
  onRefresh,
  isRefreshing,
}: CompetitorResultCardProps) {
  const { t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)

  const priceDiff = (() => {
    if (result.status !== 'ok' || result.price === null || cheapestOwnPrice === null || cheapestOwnPrice === 0) return null
    const percent = ((result.price - cheapestOwnPrice) / cheapestOwnPrice) * 100
    if (Math.abs(percent) < 0.5) return { label: t('Same price as yours'), tone: 'secondary' as const }
    // Worded from the competitor's side of the comparison, since this badge sits on THEIR
    // card: "cheaper here" read as "this competitor is cheaper" when it actually meant the
    // opposite (their price is higher than yours).
    if (percent > 0) return { label: `${Math.abs(percent).toFixed(0)}% ${t('above your price')}`, tone: 'default' as const }
    return { label: `${Math.abs(percent).toFixed(0)}% ${t('below your price')}`, tone: 'destructive' as const }
  })()

  const domain = hostnameOf(result.productUrl)

  return (
    <Card className={cn('gap-3 overflow-hidden py-4 transition-shadow hover:shadow-md sm:gap-6 sm:py-6', isBestDeal && 'ring-1 ring-emerald-500/40')}>
      <CardHeader className='flex flex-row items-start justify-between space-y-0 px-4 sm:px-6'>
        <div className='flex min-w-0 items-start gap-2.5'>
          <span
            className={cn(
              'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase',
              avatarTone(result.sourceName),
            )}
          >
            {result.sourceName.charAt(0)}
          </span>
          <div className='min-w-0'>
            <span className='block truncate text-sm font-semibold'>{result.sourceName}</span>
            {domain && result.productUrl && (
              <a
                href={result.productUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 truncate text-xs text-primary hover:underline'
              >
                {domain}
                <ExternalLink className='h-2.5 w-2.5 shrink-0' />
              </a>
            )}
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-1.5'>
          {result.status === 'ok' && (
            // The label only shows once the card header has room (container query on
            // CardHeader's own @container/card-header) — on a phone or a 2-column tablet
            // grid the full "Price found" pill left the site name ~57px wide and truncated
            // to "a4tech....", so it collapses to just the check icon there.
            <Badge
              variant='outline'
              title={t('Price found')}
              className='gap-1 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400 @[22rem]/card-header:px-2'
            >
              <CheckCircle2 className='h-3 w-3 @[22rem]/card-header:h-2.5 @[22rem]/card-header:w-2.5' />
              <span className='sr-only @[22rem]/card-header:not-sr-only'>{t('Price found')}</span>
            </Badge>
          )}
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7 shrink-0'
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={t('Refresh this source')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className='px-4 sm:px-6'>
        {isRefreshing ? (
          <div className='space-y-2'>
            <Skeleton className='h-6 w-24' />
            <Skeleton className='h-3 w-32' />
          </div>
        ) : result.status === 'ok' ? (
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0 flex-1 space-y-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-2xl font-bold tabular-nums'>{formatMoney(result.price ?? 0)}</span>
                {isBestDeal && (
                  <span className='inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white'>
                    <Trophy className='h-3 w-3' />
                    {t('Best Price')}
                  </span>
                )}
                {priceDiff && <Badge variant={priceDiff.tone}>{priceDiff.label}</Badge>}
              </div>
              {result.title && <p className='text-xs text-muted-foreground'>{result.title}</p>}
              <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1'>
                {result.productUrl ? (
                  <a
                    href={result.productUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline'
                  >
                    {t('View on site')}
                    <ExternalLink className='h-3 w-3' />
                  </a>
                ) : (
                  <span />
                )}
                <span className='whitespace-nowrap text-[11px] text-muted-foreground'>
                  {result.cached ? `${t('cached')} · ` : ''}
                  {formatDistanceToNowStrict(new Date(result.fetchedAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <div className='flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 sm:h-20 sm:w-20'>
              {result.imageUrl && !imageFailed ? (
                <img
                  src={result.imageUrl}
                  alt={result.title || result.sourceName}
                  className='h-full w-full object-contain'
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <ImageOff className='h-5 w-5 text-muted-foreground/50' />
              )}
            </div>
          </div>
        ) : result.status === 'not_found' ? (
          <div className='flex items-center gap-2 py-2 text-sm text-muted-foreground'>
            <SearchX className='h-4 w-4' />
            {t('No matching product found on this site')}
          </div>
        ) : (
          <div className='flex items-start gap-2 py-2 text-sm text-destructive'>
            <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
            <span>{result.errorMessage || t('Could not check this site')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
