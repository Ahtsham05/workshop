import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Eye,
  FileStack,
  GitBranch,
  MoreHorizontal,
  Plus,
  Power,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetBomsQuery,
  useRestoreBomMutation,
  useSetBomActiveMutation,
  type Bom,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BomDetailSheet, BomStateBadges } from '../components/bom-detail-sheet'
import { BomEditorDialog } from '../components/bom-editor-dialog'
import { DataTable, type Column } from '../components/data-table'
import { DeleteBomDialog } from '../components/delete-bom-dialog'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import { fmtDate, fmtQty } from '../lib/constants'

type View = 'all' | 'default' | 'inactive' | 'deleted'

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
  const [versioning, setVersioning] = useState<Bom | null>(null)
  const [deleting, setDeleting] = useState<Bom | null>(null)
  const [setActive] = useSetBomActiveMutation()
  const [restoreBom] = useRestoreBomMutation()

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn()
      toast.success(success)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Action failed')))
    }
  }

  useEffect(() => {
    if (routeSearch.bomId) setOpenBomId(routeSearch.bomId)
  }, [routeSearch.bomId])
  useEffect(() => {
    if (routeSearch.new) setCreating(true)
  }, [routeSearch.new])

  const { data, isLoading, isFetching } = useGetBomsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    productId: routeSearch.productId,
    ...(view === 'default' ? { isDefault: true } : {}),
    ...(view === 'inactive' ? { isActive: false } : {}),
    ...(view === 'deleted' ? { deleted: true } : {}),
  })
  const rows = data?.results || []
  const canManage = hasPermission('manageBoms')
  const filtered = !!debounced || view !== 'all' || !!routeSearch.productId

  const columns: Column<Bom>[] = [
    {
      id: 'bom',
      header: t('BOM'),
      className: 'w-44',
      cell: (bom) => (
        <div className='min-w-0'>
          <div className='flex items-center gap-1.5'>
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                setOpenBomId(bom.id)
              }}
              className='font-mono text-xs font-medium hover:underline'
            >
              {bom.bomNumber}
            </button>
            <span className='text-muted-foreground rounded border px-1 text-[10px] leading-4'>
              v{bom.version}
            </span>
          </div>
          {bom.name && bom.name !== bom.productName && (
            <div className='text-muted-foreground truncate text-xs'>
              {bom.name}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'product',
      header: t('Product'),
      cell: (bom) => <span className='font-medium'>{bom.productName}</span>,
    },
    {
      id: 'output',
      header: t('Output'),
      align: 'right',
      hideBelow: 'md',
      cell: (bom) => (
        <span className='tabular-nums'>
          {fmtQty(bom.quantity)}{' '}
          <span className='text-muted-foreground text-xs'>{bom.unit}</span>
        </span>
      ),
    },
    {
      id: 'components',
      header: t('Components'),
      align: 'right',
      hideBelow: 'md',
      cell: (bom) => (
        <span className='tabular-nums'>{bom.components.length}</span>
      ),
    },
    {
      id: 'state',
      header: t('State'),
      cell: (bom) => <BomStateBadges bom={bom} />,
    },
    {
      id: 'updated',
      header: t('Updated'),
      hideBelow: 'lg',
      cell: (bom) => (
        <span className='text-muted-foreground tabular-nums'>
          {fmtDate(bom.deletedAt || bom.updatedAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className='sr-only'>{t('Actions')}</span>,
      className: 'w-12',
      align: 'right',
      cell: (bom) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={(e) => e.stopPropagation()}
              aria-label={`${t('Actions for')} ${bom.bomNumber} v${bom.version}`}
            >
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => setOpenBomId(bom.id)}>
              <Eye className='mr-2 h-4 w-4' />
              {t('Open')}
            </DropdownMenuItem>
            {canManage && bom.deletedAt && (
              <DropdownMenuItem
                onClick={() =>
                  run(
                    () => restoreBom(bom.id).unwrap(),
                    `${bom.bomNumber} v${bom.version} ${t('restored — activate it to use it again')}`
                  )
                }
              >
                <RotateCcw className='mr-2 h-4 w-4' />
                {t('Restore')}
              </DropdownMenuItem>
            )}
            {canManage && !bom.deletedAt && (
              <>
                <DropdownMenuItem onClick={() => setVersioning(bom)}>
                  <GitBranch className='mr-2 h-4 w-4' />
                  {t('New version')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    run(
                      () =>
                        setActive({
                          bomId: bom.id,
                          isActive: !bom.isActive,
                        }).unwrap(),
                      bom.isActive ? t('Deactivated') : t('Activated')
                    )
                  }
                >
                  <Power className='mr-2 h-4 w-4' />
                  {bom.isActive ? t('Deactivate') : t('Activate')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className='text-rose-600 focus:text-rose-700 dark:text-rose-400'
                  onClick={() => setDeleting(bom)}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Bills of Materials')}
        description={t(
          'Recipes for everything you make. Each BOM keeps a full version history, and nested sub-assemblies expand into multi-level structures.'
        )}
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className='mr-1.5 h-4 w-4' />
              {t('New BOM')}
            </Button>
          )
        }
      />

      <Toolbar>
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder={t('Search BOM number, name or product')}
        />
        <FilterChips
          label={t('Filter BOM versions')}
          value={view}
          onChange={(v) => {
            setView(v as View)
            setPage(1)
          }}
          options={[
            { value: 'all', label: t('All versions') },
            { value: 'default', label: t('Default only') },
            { value: 'inactive', label: t('Inactive') },
            { value: 'deleted', label: t('Deleted') },
          ]}
        />
        {routeSearch.productId && (
          <Button
            variant='secondary'
            size='sm'
            className='h-8 rounded-full'
            onClick={() =>
              navigate({
                to: '/manufacturing/boms' as never,
                search: {} as never,
              })
            }
          >
            {rows[0]?.productName || t('One product')}
            <X
              className='ml-1.5 h-3.5 w-3.5'
              aria-label={t('Clear product filter')}
            />
          </Button>
        )}
      </Toolbar>

      <DataTable
        caption={t('Bills of Materials')}
        columns={columns}
        rows={rows}
        rowKey={(bom) => bom.id}
        loading={isLoading}
        fetching={isFetching}
        onRowClick={(bom) => setOpenBomId(bom.id)}
        empty={
          <EmptyState
            bordered={false}
            icon={FileStack}
            title={
              view === 'deleted' && !debounced
                ? t('No deleted BOMs')
                : filtered
                  ? t('No BOMs match these filters')
                  : t('No BOMs yet')
            }
            description={
              view === 'deleted' && !debounced
                ? t(
                    'BOMs deleted after production used them are kept here, so you can restore them.'
                  )
                : filtered
                  ? t('Try another filter or clear the search.')
                  : t(
                      'A BOM lists the components, quantities and scrap allowance needed to build a product.'
                    )
            }
            action={
              canManage &&
              !filtered && (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setCreating(true)}
                >
                  <Plus className='mr-1.5 h-3.5 w-3.5' />
                  {t('Create a BOM')}
                </Button>
              )
            }
          />
        }
        mobileCard={(bom) => (
          <div className='space-y-1.5'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='truncate font-medium'>{bom.productName}</div>
                <div className='text-muted-foreground font-mono text-xs'>
                  {bom.bomNumber} v{bom.version}
                </div>
              </div>
              <BomStateBadges bom={bom} />
            </div>
            <div className='text-muted-foreground text-xs'>
              {t('{{n}} components').replace(
                '{{n}}',
                String(bom.components.length)
              )}{' '}
              · {t('makes')} {fmtQty(bom.quantity)} {bom.unit}
            </div>
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />

      {openBomId && (
        <BomDetailSheet
          bomId={openBomId}
          onClose={() => setOpenBomId(null)}
          onSelect={setOpenBomId}
        />
      )}
      {deleting && (
        <DeleteBomDialog
          bom={deleting}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      )}
      {versioning && (
        <BomEditorDialog
          mode='version'
          bom={versioning}
          onClose={() => setVersioning(null)}
          onSaved={(bom) => setOpenBomId(bom.id)}
        />
      )}
      {creating && (
        <BomEditorDialog
          mode='create'
          onClose={() => {
            setCreating(false)
            if (routeSearch.new) {
              navigate({
                to: '/manufacturing/boms' as never,
                search: {} as never,
                replace: true,
              })
            }
          }}
          onSaved={(bom) => setOpenBomId(bom.id)}
        />
      )}
    </div>
  )
}
