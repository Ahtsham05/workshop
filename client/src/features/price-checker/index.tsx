import { useEffect, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'
import { CheckCircle2, DollarSign, Globe2, Search, Settings2, Sparkles, Tag } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useCheckPriceMutation, type CheckPriceResponse } from '@/stores/priceChecker.api'

import { OwnProductResults } from './components/own-product-results'
import { CompetitorResultCard } from './components/competitor-result-card'
import { PriceSummaryStats } from './components/price-summary-stats'
import { ManageSourcesDialog } from './components/manage-sources-dialog'

const HIGHLIGHT_MS = 2200

export default function PriceChecker() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()

  const [searchInput, setSearchInput] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [result, setResult] = useState<CheckPriceResponse | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null)
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null)

  const [checkPrice, { isLoading }] = useCheckPriceMutation()

  const catalogRef = useRef<HTMLDivElement>(null)

  const performSearch = async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSubmittedQuery(trimmed)
    try {
      const res = await checkPrice({ query: trimmed }).unwrap()
      setResult(res)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('Failed to check prices')))
    }
  }

  const runSearch = () => performSearch(searchInput)

  // Lets other pages (Products list/detail "Check Price" action) deep-link straight into
  // a pre-run search via /price-checker?q=<name> instead of landing on the empty state and
  // making the user retype/paste the product name themselves.
  //
  // autoSearchedRef guards against React 18 StrictMode's dev-only double-invoke of
  // useEffect on mount (render -> effect -> cleanup -> effect again, by design, to
  // surface non-idempotent effects) — without it, arriving here via the URL param fired
  // checkPrice() twice in dev, while the manual "Check Price" button (a plain click
  // handler, not an effect) never doubled. The ref persists across that double-invoke
  // since React doesn't remount the component for it, so this makes the effect body
  // idempotent per distinct `q` value instead of relying on StrictMode being absent.
  const search = useSearch({ strict: false }) as { q?: string }
  const autoSearchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!search?.q || autoSearchedRef.current === search.q) return
    autoSearchedRef.current = search.q
    setSearchInput(search.q)
    performSearch(search.q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.q])

  const onRefreshSource = async (sourceId: string) => {
    if (!submittedQuery) return
    setRefreshingSourceId(sourceId)
    try {
      const res = await checkPrice({ query: submittedQuery, forceRefresh: true, sourceId }).unwrap()
      setResult((prev) => {
        if (!prev) return prev
        const refreshed = res.competitorResults[0]
        if (!refreshed) return prev
        return {
          ...prev,
          competitorResults: prev.competitorResults.map((c) => (c.sourceId === sourceId ? refreshed : c)),
        }
      })
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('Failed to refresh this source')))
    } finally {
      setRefreshingSourceId(null)
    }
  }

  const jumpToSource = (sourceId?: string) => {
    if (!sourceId) return
    setHighlightedSourceId(sourceId)
    document.getElementById(`price-checker-source-${sourceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => setHighlightedSourceId((cur) => (cur === sourceId ? null : cur)), HIGHLIGHT_MS)
  }

  const cheapestOwnPrice =
    result && result.ownProducts.length > 0 ? Math.min(...result.ownProducts.map((p) => p.price)) : null

  const okCompetitorResults = result ? result.competitorResults.filter((r) => r.status === 'ok' && r.price !== null) : []
  const lowestCompetitor = okCompetitorResults.reduce<{ price: number; sourceName: string; sourceId: string } | null>((best, r) => {
    if (!best || (r.price as number) < best.price) return { price: r.price as number, sourceName: r.sourceName, sourceId: r.sourceId }
    return best
  }, null)
  const highestCompetitor = okCompetitorResults.reduce<{ price: number; sourceName: string; sourceId: string } | null>((best, r) => {
    if (!best || (r.price as number) > best.price) return { price: r.price as number, sourceName: r.sourceName, sourceId: r.sourceId }
    return best
  }, null)

  const hasSearched = result !== null

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-6'>
        <Tag className='pointer-events-none absolute -right-4 -top-4 h-32 w-32 rotate-12 text-primary/[0.06]' />
        <Search className='pointer-events-none absolute bottom-2 right-16 h-16 w-16 -rotate-12 text-primary/[0.08]' />
        <div className='relative flex flex-wrap items-center justify-between gap-4'>
          <div className='flex items-center gap-4'>
            <span className='inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm'>
              <DollarSign className='h-6 w-6' />
            </span>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>{t('Price Checker')}</h1>
              <p className='text-sm text-muted-foreground'>
                {t('Check a product\'s price in your catalog and across competitor websites, instantly.')}
              </p>
            </div>
          </div>
          <Can permission='managePriceCheckerSources'>
            <Button variant='outline' className='bg-background' onClick={() => setManageOpen(true)}>
              <Settings2 className='mr-2 h-4 w-4' />
              {t('Manage Competitor Sites')}
            </Button>
          </Can>
        </div>

        <div className='relative mt-5 flex flex-col gap-2 sm:flex-row'>
          <div className='relative flex-1'>
            <Tag className='absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder={t('Enter product name, SKU or barcode...')}
              className='h-12 rounded-full bg-background pl-10 text-base shadow-sm'
            />
          </div>
          <Button size='lg' className='h-12 w-full rounded-full px-6 sm:w-auto' onClick={runSearch} disabled={isLoading || !searchInput.trim()}>
            <Search className='mr-2 h-4 w-4' />
            {isLoading ? t('Checking...') : t('Check Price')}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className='h-20 w-full rounded-xl' />
            ))}
          </div>
          <Skeleton className='h-32 w-full rounded-xl' />
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className='h-32 w-full rounded-xl' />
            ))}
          </div>
        </div>
      )}

      {!isLoading && hasSearched && result && (
        <div className='space-y-5'>
          <PriceSummaryStats
            ownPrice={cheapestOwnPrice}
            lowest={lowestCompetitor}
            highest={highestCompetitor}
            sitesChecked={result.competitorResults.length}
            sitesWithPrice={okCompetitorResults.length}
            formatMoney={formatMoney}
            onGoToCatalog={() => catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            onGoToLowest={() => jumpToSource(lowestCompetitor?.sourceId)}
            onGoToHighest={() => jumpToSource(highestCompetitor?.sourceId)}
            onGoToSites={() => setManageOpen(true)}
          />

          <div>
            <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
              <h2 className='flex items-center gap-2 text-sm font-semibold text-muted-foreground'>
                <span className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400'>
                  <Globe2 className='h-4 w-4' />
                </span>
                {t('Competitor Prices')}
                {result.competitorResults.length > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      okCompetitorResults.length > 0
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <CheckCircle2 className='h-3 w-3' />
                    {okCompetitorResults.length} {t(okCompetitorResults.length === 1 ? 'site found' : 'sites found')}
                  </span>
                )}
              </h2>
              {result.competitorResults.length > 0 && (
                <button
                  className='text-xs font-medium text-primary hover:underline'
                  onClick={() => setManageOpen(true)}
                >
                  {t('View All Sites →')}
                </button>
              )}
            </div>
            {result.competitorResults.length === 0 ? (
              <Card className='border-dashed'>
                <CardContent className='py-8 text-center text-sm text-muted-foreground'>
                  {t('No competitor sites configured yet.')}{' '}
                  <Can permission='managePriceCheckerSources'>
                    <button className='font-medium text-primary hover:underline' onClick={() => setManageOpen(true)}>
                      {t('Add one to start comparing prices.')}
                    </button>
                  </Can>
                </CardContent>
              </Card>
            ) : (
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                {result.competitorResults.map((competitorResult) => (
                  <div
                    key={competitorResult.sourceId}
                    id={`price-checker-source-${competitorResult.sourceId}`}
                    className={cn(
                      'rounded-xl transition-shadow',
                      highlightedSourceId === competitorResult.sourceId && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    )}
                  >
                    <CompetitorResultCard
                      result={competitorResult}
                      cheapestOwnPrice={cheapestOwnPrice}
                      isBestDeal={
                        competitorResult.status === 'ok' &&
                        lowestCompetitor !== null &&
                        competitorResult.price === lowestCompetitor.price &&
                        okCompetitorResults.length > 1
                      }
                      formatMoney={formatMoney}
                      onRefresh={() => onRefreshSource(competitorResult.sourceId)}
                      isRefreshing={refreshingSourceId === competitorResult.sourceId}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div ref={catalogRef}>
            <OwnProductResults products={result.ownProducts} formatMoney={formatMoney} />
          </div>
        </div>
      )}

      {!isLoading && !hasSearched && (
        <Card className='border-dashed'>
          <CardContent className='flex flex-col items-center gap-3 py-16 text-center text-muted-foreground'>
            <span className='inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary'>
              <Sparkles className='h-6 w-6' />
            </span>
            <p className='max-w-sm'>{t('Search for a product above to compare its price against your configured competitor sites.')}</p>
          </CardContent>
        </Card>
      )}

      <ManageSourcesDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  )
}
