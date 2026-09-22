import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/context/language-context'
import { useUrduDisplay } from '@/context/urdu-display-context'
import type { LeaderboardRow } from '@/stores/productAnalytics.api'
import { ProductThumb } from './product-thumb'

export interface LeaderboardTab {
  key: string
  label: string
  rows: LeaderboardRow[]
  primary: (row: LeaderboardRow) => ReactNode
  secondary: (row: LeaderboardRow) => ReactNode
  emptyText: string
}

interface Props {
  title: string
  icon: ReactNode
  tabs: LeaderboardTab[]
  loading?: boolean
}

/** Short ranked list (top 5) with a segmented switch between related rankings. */
export function LeaderboardCard({ title, icon, tabs, loading }: Props) {
  const { t } = useLanguage()
  const { showUrdu } = useUrduDisplay()
  const [active, setActive] = useState(tabs[0]?.key)
  const tab = tabs.find((candidate) => candidate.key === active) || tabs[0]

  return (
    <Card className='gap-0'>
      {/* Phones: CardHeader is a bare `grid`, whose implicit column grew to the tab bar's minimum width and pushed the
          "Needs attention" card ~8px past the screen at 320px. grid-cols-1 lets it shrink to the card, and the tab
          labels drop a size so "Running out 5 | Dead stock 5 | Returns 5" fits. */}
      <CardHeader className='space-y-2 pb-3 max-sm:grid-cols-1'>
        <CardTitle className='flex items-center gap-2 text-base'>
          {icon}
          {title}
        </CardTitle>
        {tabs.length > 1 ? (
          <Tabs value={tab.key} onValueChange={setActive}>
            <TabsList className='h-8 w-full'>
              {tabs.map((candidate) => (
                <TabsTrigger key={candidate.key} value={candidate.key} className='flex-1 px-2 text-xs max-sm:min-w-0 max-sm:px-1 max-sm:text-[11px]'>
                  {candidate.label}
                  {candidate.rows.length > 0 ? (
                    <span className='ml-1 text-[10px] text-muted-foreground tabular-nums'>{candidate.rows.length}</span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
      </CardHeader>
      <CardContent className='px-3'>
        {loading ? (
          <div className='space-y-2'>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : tab.rows.length === 0 ? (
          <p className='px-2 py-8 text-center text-sm text-muted-foreground'>{tab.emptyText}</p>
        ) : (
          <ol className='space-y-0.5'>
            {tab.rows.map((row, index) => (
              <li key={row.productId}>
                <Link
                  to='/products/$productId'
                  params={{ productId: row.productId }}
                  className='flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                >
                  <span className='w-4 text-right text-xs font-medium text-muted-foreground tabular-nums'>{index + 1}</span>
                  <ProductThumb url={row.image?.url} name={row.name} />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium' title={row.name}>
                      {row.name}
                      {showUrdu && row.nameUrdu ? (
                        <span dir='rtl' className='ml-1.5 text-xs font-normal text-muted-foreground'>
                          {row.nameUrdu}
                        </span>
                      ) : null}
                    </p>
                    <div className='truncate text-xs text-muted-foreground'>{tab.secondary(row)}</div>
                  </div>
                  <div className='shrink-0 text-right text-sm font-semibold'>{tab.primary(row)}</div>
                </Link>
              </li>
            ))}
          </ol>
        )}
        <span className='sr-only'>{t('Select a product to open its details')}</span>
      </CardContent>
    </Card>
  )
}
