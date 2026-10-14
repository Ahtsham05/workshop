import { useState } from 'react'
import { Layers, Plus } from 'lucide-react'
import {
  useGetAssembliesQuery,
  type Assembly,
} from '@/stores/manufacturing.api'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductTypeBadge } from '../components/badges'
import { BomDetailSheet } from '../components/bom-detail-sheet'
import { BomEditorDialog } from '../components/bom-editor-dialog'
import { SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, PageHeader } from '../components/page'
import { fmtQty } from '../lib/constants'

/** Sub-assemblies: their own BOM and every parent BOM that consumes them. */
export default function AssembliesPage() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const { data, isLoading } = useGetAssembliesQuery()
  const [openBomId, setOpenBomId] = useState<string | null>(null)
  const [creatingFor, setCreatingFor] = useState<Assembly | null>(null)
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const items = (data || []).filter(
    (i) =>
      !needle ||
      i.name.toLowerCase().includes(needle) ||
      (i.sku || '').toLowerCase().includes(needle)
  )

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Structures')}
        description={t(
          'Sub-assemblies are built from their own BOM and consumed inside other BOMs, for example Finished product → Motor assembly → Motor → Bearing.'
        )}
      />
      {!!data?.length && (
        <Toolbar>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t('Search sub-assembly or SKU')}
          />
        </Toolbar>
      )}
      {isLoading && (
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-48 w-full rounded-xl' />
          ))}
        </div>
      )}
      {!isLoading && !items.length && (
        <EmptyState
          icon={Layers}
          title={
            data?.length
              ? t('No sub-assemblies match')
              : t('No sub-assemblies yet')
          }
          description={
            data?.length
              ? t('Try another search.')
              : t(
                  'Classify products as Sub-Assembly under Products, give them a BOM, and use them as components in other BOMs.'
                )
          }
        />
      )}
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {items.map((item) => (
          <Card key={item.id} className='gap-0 py-0 shadow-none'>
            <CardContent className='space-y-4 p-4'>
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='truncate font-semibold'>{item.name}</div>
                  <div className='text-muted-foreground text-xs'>
                    {item.sku || '—'} · {fmtQty(item.stockQuantity)} {item.unit}{' '}
                    {t('on hand')}
                  </div>
                </div>
                <ProductTypeBadge type={item.productType} />
              </div>

              <div className='rounded-lg border p-3'>
                <div className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
                  {t('Built from')}
                </div>
                {item.defaultBom ? (
                  <button
                    type='button'
                    onClick={() => setOpenBomId(item.defaultBom!.id)}
                    className='mt-1 text-left text-sm hover:underline'
                  >
                    <span className='font-mono text-xs'>
                      {item.defaultBom.bomNumber}
                    </span>{' '}
                    v{item.defaultBom.version} ·{' '}
                    {item.defaultBom.componentCount} {t('components')}
                  </button>
                ) : (
                  <div className='text-muted-foreground mt-1 flex items-center justify-between gap-2 text-sm'>
                    {t('No BOM yet')}
                    {hasPermission('manageBoms') && (
                      <Button
                        size='sm'
                        variant='outline'
                        className='h-7'
                        onClick={() => setCreatingFor(item)}
                      >
                        <Plus className='mr-1 h-3 w-3' />
                        {t('BOM')}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
                  {t('Used in')}
                </div>
                {item.usedIn.length === 0 ? (
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {t('Not used in any BOM yet')}
                  </p>
                ) : (
                  <div className='mt-1 flex flex-wrap gap-1.5'>
                    {item.usedIn.map((parent) => (
                      <button
                        key={parent.id}
                        type='button'
                        onClick={() => setOpenBomId(parent.id)}
                        className='hover:bg-muted focus-visible:ring-ring inline-flex h-7 items-center rounded-md border px-2 text-xs outline-none focus-visible:ring-2'
                      >
                        {parent.productName} · v{parent.version}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {openBomId && (
        <BomDetailSheet
          bomId={openBomId}
          onClose={() => setOpenBomId(null)}
          onSelect={setOpenBomId}
        />
      )}
      {creatingFor && (
        <BomEditorDialog
          mode='create'
          presetProduct={{
            id: creatingFor.id,
            name: creatingFor.name,
            unit: creatingFor.unit,
          }}
          onClose={() => setCreatingFor(null)}
          onSaved={(bom) => setOpenBomId(bom.id)}
        />
      )}
    </div>
  )
}
