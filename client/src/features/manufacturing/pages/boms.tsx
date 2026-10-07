import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { FileStack, Plus, X } from 'lucide-react'
import { useGetBomsQuery } from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BomDetailSheet, BomStateBadges } from '../components/bom-detail-sheet'
import { BomEditorDialog } from '../components/bom-editor-dialog'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import { Pager } from '../components/pager'
import { fmtDate, fmtQty } from '../lib/constants'

type View = 'all' | 'default' | 'inactive'

export default function BomsPage() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const navigate = useNavigate()
  const routeSearch = useSearch({ strict: false }) as {
    productId?: string
    bomId?: string
    new?: boolean
  }

  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)
  const [openBomId, setOpenBomId] = useState<string | null>(
    routeSearch.bomId || null
  )
  const [creating, setCreating] = useState(!!routeSearch.new)

  useEffect(() => {
    if (routeSearch.bomId) setOpenBomId(routeSearch.bomId)
  }, [routeSearch.bomId])

  const { data, isLoading, isFetching } = useGetBomsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    productId: routeSearch.productId,
    ...(view === 'default' ? { isDefault: true } : {}),
    ...(view === 'inactive' ? { isActive: false } : {}),
  })
  const rows = data?.results || []

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Bills of Materials')}
        description={t(
          'Recipes for everything you make. Each BOM keeps a full version history; nested sub-assemblies expand into multi-level structures.'
        )}
        actions={
          hasPermission('manageBoms') && (
            <Button onClick={() => setCreating(true)} className='max-sm:w-full'>
              <Plus className='mr-2 h-4 w-4' />
              {t('New BOM')}
            </Button>
          )
        }
      />

      <Card>
        <CardContent className='space-y-3 p-4 max-sm:p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='inline-flex rounded-lg border p-0.5'>
              {(
                [
                  ['all', t('All versions')],
                  ['default', t('Default only')],
                  ['inactive', t('Inactive')],
                ] as [View, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type='button'
                  onClick={() => {
                    setView(key)
                    setPage(1)
                  }}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs transition-colors',
                    view === key
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              placeholder={t('Search BOM number, name or product…')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className='h-9 w-72 max-sm:w-full'
            />
            {routeSearch.productId && (
              <Button
                variant='ghost'
                size='sm'
                onClick={() =>
                  navigate({
                    to: '/manufacturing/boms' as never,
                    search: {} as never,
                  })
                }
              >
                <X className='mr-1 h-3.5 w-3.5' />
                {t('Clear product filter')}
              </Button>
            )}
          </div>

          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('BOM')}</TableHead>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead className='text-right'>{t('Output')}</TableHead>
                  <TableHead className='text-right'>
                    {t('Components')}
                  </TableHead>
                  <TableHead>{t('State')}</TableHead>
                  <TableHead>{t('Updated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className='h-6 w-full' />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        icon={FileStack}
                        title={t('No BOMs here yet')}
                        description={t(
                          'A BOM lists the components, quantities and scrap allowance needed to build a product.'
                        )}
                        action={
                          hasPermission('manageBoms') && (
                            <Button size='sm' onClick={() => setCreating(true)}>
                              {t('Create a BOM')}
                            </Button>
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((bom) => (
                  <TableRow
                    key={bom.id}
                    className={cn('cursor-pointer', isFetching && 'opacity-70')}
                    onClick={() => setOpenBomId(bom.id)}
                  >
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <span className='font-mono text-xs'>
                          {bom.bomNumber}
                        </span>
                        <span className='text-muted-foreground rounded border px-1.5 text-[11px]'>
                          v{bom.version}
                        </span>
                      </div>
                      {bom.name && bom.name !== bom.productName && (
                        <div className='text-muted-foreground text-xs'>
                          {bom.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {bom.productName}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {fmtQty(bom.quantity)}{' '}
                      <span className='text-muted-foreground text-xs'>
                        {bom.unit}
                      </span>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {bom.components.length}
                    </TableCell>
                    <TableCell>
                      <BomStateBadges bom={bom} />
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {fmtDate(bom.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager data={data} page={page} onPageChange={setPage} />
        </CardContent>
      </Card>

      {openBomId && (
        <BomDetailSheet
          bomId={openBomId}
          onClose={() => setOpenBomId(null)}
          onSelect={setOpenBomId}
        />
      )}
      {creating && (
        <BomEditorDialog
          mode='create'
          onClose={() => setCreating(false)}
          onSaved={(bom) => setOpenBomId(bom.id)}
        />
      )}
    </div>
  )
}
