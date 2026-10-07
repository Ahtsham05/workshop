import { useState } from 'react'
import type { StockBucket } from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent } from '@/components/ui/card'
import { SectionHeader } from '../components/manufacturing-shell'
import { MovementsTable } from '../components/movements-table'
import { BUCKET_META } from '../lib/constants'

/** The inventory ledger as manufacturing writes it — one row per movement, fully traceable. */
export default function MovementsPage() {
  const { t } = useLanguage()
  const [bucket, setBucket] = useState<StockBucket | 'all'>('all')
  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Stock movements')}
        description={t(
          'Every manufacturing movement in the inventory ledger: what moved, from which bucket, which batch or serials, why, where, by whom and when.'
        )}
      />
      <div className='inline-flex rounded-lg border p-0.5'>
        {(['all', 'available', 'wip', 'qc', 'rework'] as const).map((key) => (
          <button
            key={key}
            type='button'
            onClick={() => setBucket(key)}
            className={cn(
              'rounded-md px-3 py-1 text-xs transition-colors',
              bucket === key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {key === 'all' ? t('All') : t(BUCKET_META[key].label)}
          </button>
        ))}
      </div>
      <Card>
        <CardContent className='p-0'>
          <MovementsTable
            bucket={bucket === 'all' ? undefined : bucket}
            showOrder
          />
        </CardContent>
      </Card>
    </div>
  )
}
