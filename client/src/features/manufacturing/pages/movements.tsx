import { useState } from 'react'
import type { StockBucket } from '@/stores/manufacturing.api'
import { useLanguage } from '@/context/language-context'
import { FilterChips } from '../components/list-controls'
import { MovementsTable } from '../components/movements-table'
import { PageHeader } from '../components/page'
import { BUCKET_META } from '../lib/constants'

/** The inventory ledger as manufacturing writes it — one row per movement, fully traceable. */
export default function MovementsPage() {
  const { t } = useLanguage()
  const [bucket, setBucket] = useState<StockBucket | 'all'>('all')
  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Stock movements')}
        description={t(
          'Every manufacturing movement in the inventory ledger: what moved, from which bucket, which batch or serials, why, where, by whom and when.'
        )}
      />
      <FilterChips
        label={t('Filter by stock bucket')}
        value={bucket}
        onChange={(v) => setBucket(v as StockBucket | 'all')}
        options={[
          { value: 'all', label: t('All buckets') },
          ...(['available', 'wip', 'qc', 'rework'] as const).map((key) => ({
            value: key,
            label: t(BUCKET_META[key].label),
          })),
        ]}
      />
      <MovementsTable
        key={bucket}
        bucket={bucket === 'all' ? undefined : bucket}
        showOrder
      />
    </div>
  )
}
