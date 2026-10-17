import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Check,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Can } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import {
  useAddProductsToListMutation,
  useDeleteProductListMutation,
  useGetProductListMembershipsQuery,
  useGetProductListsQuery,
  useLazyGetProductListOrderLinesQuery,
  useRemoveProductsFromListMutation,
  useUpdateProductListMutation,
  type ProductListSummary,
} from '@/stores/productList.api'
import { ProductListDialog } from './product-list-dialog'
import { PURPOSE_META, describeRule } from './list-meta'
import { ListInsightsPanel, type ListPeriod } from './list-insights'

const productIdOf = (p: { _id?: string; id?: string }) => p._id || p.id || ''

function ListDot({ list }: { list: Pick<ProductListSummary, 'color' | 'purpose'> }) {
  return <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{ backgroundColor: list.color || PURPOSE_META[list.purpose].color }} />
}

/**
 * The Products page's list chips: "All products", then every list in the branch (pinned
 * first) with its live product count; picking one filters the table to it.
 */
export function ProductListsBar({ selectedListId, onSelect }: { selectedListId: string | null; onSelect: (id: string | null) => void }) {
  const { t } = useLanguage()
  const { data: lists = [], isLoading } = useGetProductListsQuery()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className='mb-3 flex items-center gap-2'>
      <span className='shrink-0 text-xs font-medium text-muted-foreground'>{t('Lists')}:</span>
      <div className='flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]'>
        <button
          type='button'
          onClick={() => onSelect(null)}
          aria-pressed={!selectedListId}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent',
            !selectedListId && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {t('All products')}
        </button>
        {isLoading && <Loader2 className='h-4 w-4 shrink-0 animate-spin text-muted-foreground' />}
        {lists.map((list) => {
          const active = list.id === selectedListId
          return (
            <button
              key={list.id}
              type='button'
              onClick={() => onSelect(active ? null : list.id)}
              aria-pressed={active}
              title={list.kind === 'smart' ? describeRule(list.rule) : list.description || undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent',
                active && 'border-primary bg-primary/10 ring-1 ring-primary',
              )}
            >
              <ListDot list={list} />
              {list.pinned && <Pin className='h-3 w-3 text-muted-foreground' />}
              <span className='max-w-[12rem] truncate'>{list.name}</span>
              {list.kind === 'smart' && <Sparkles className='h-3 w-3 text-amber-500' />}
              <span className='tabular-nums text-muted-foreground'>{list.productCount.toLocaleString()}</span>
            </button>
          )
        })}
        <Can permission='editProducts'>
          <Button type='button' variant='ghost' size='sm' className='h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs' onClick={() => setDialogOpen(true)}>
            <Plus className='h-3.5 w-3.5' />
            {t('New list')}
          </Button>
        </Can>
      </div>
      <ProductListDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={(list) => onSelect(list.id)} />
    </div>
  )
}

/** The open list's header: what it is, its totals, and what can be done with it. */
export function SelectedListHeader({
  listId,
  selectedProducts,
  onClose,
  onChanged,
  period,
}: {
  /** Sales period for the insight figures (shared with the table's sales columns). */
  period: ListPeriod
  listId: string
  selectedProducts: { _id?: string; id?: string }[]
  onClose: () => void
  /** The list's contents changed (products removed) — refresh the table. */
  onChanged: () => void
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { data: lists = [] } = useGetProductListsQuery()
  const list = lists.find((l) => l.id === listId)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [updateList] = useUpdateProductListMutation()
  const [deleteList, { isLoading: deleting }] = useDeleteProductListMutation()
  const [removeProducts, { isLoading: removing }] = useRemoveProductsFromListMutation()
  const [loadOrderLines, { isFetching: preparingOrder }] = useLazyGetProductListOrderLinesQuery()

  if (!list) return null
  const meta = PURPOSE_META[list.purpose]
  const Icon = meta.icon
  const isManual = list.kind !== 'smart'

  const createPurchase = async () => {
    try {
      const lines = await loadOrderLines(list.id).unwrap()
      if (!lines.length) {
        toast.error(t('This list has no products to order'))
        return
      }
      navigate({
        to: '/purchase-invoice',
        search: { prefillItems: lines.map((l) => ({ productId: l.productId, quantity: l.quantity || 1 })) },
      })
    } catch {
      toast.error(t('Could not prepare the purchase'))
    }
  }

  const removeSelected = async () => {
    const ids = selectedProducts.map(productIdOf).filter(Boolean)
    try {
      const res = await removeProducts({ id: list.id, productIds: ids }).unwrap()
      toast.success(t('Removed {{n}} from “{{name}}”', { n: String(res.removed), name: list.name }))
      onChanged()
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Could not remove products'))
    }
  }

  return (
    <div className='mb-3 rounded-lg border bg-card p-3' style={{ borderLeft: `4px solid ${list.color || meta.color}` }}>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-2.5'>
          <span className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md' style={{ backgroundColor: `${list.color || meta.color}22`, color: list.color || meta.color }}>
            <Icon className='h-4 w-4' />
          </span>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <h3 className='truncate text-base font-semibold'>{list.name}</h3>
              <Badge variant='outline' className='text-[10px]'>{t(meta.label)}</Badge>
              {list.kind === 'smart' && (
                <Badge variant='outline' className='gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'>
                  <Sparkles className='h-3 w-3' />
                  {t('Smart')} · {describeRule(list.rule)}
                </Badge>
              )}
            </div>
            {list.description && <p className='mt-0.5 text-xs text-muted-foreground'>{list.description}</p>}

          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {list.purpose === 'to_order' && (
            <Can permission='createPurchases'>
              <Button size='sm' className='h-8 gap-1.5' onClick={createPurchase} disabled={preparingOrder || list.productCount === 0}>
                {preparingOrder ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <ShoppingCart className='h-3.5 w-3.5' />}
                {t('Create purchase')}
              </Button>
            </Can>
          )}
          {isManual && selectedProducts.length > 0 && (
            <Can permission='editProducts'>
              <Button size='sm' variant='outline' className='h-8 gap-1.5' onClick={removeSelected} disabled={removing}>
                <X className='h-3.5 w-3.5' />
                {t('Remove {{n}} from list', { n: String(selectedProducts.length) })}
              </Button>
            </Can>
          )}
          <Can permission='editProducts'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size='icon' variant='outline' className='h-8 w-8' aria-label={t('List options')}>
                  <MoreHorizontal className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className='mr-2 h-4 w-4' />
                  {t('Edit list')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => updateList({ id: list.id, pinned: !list.pinned })}>
                  {list.pinned ? <PinOff className='mr-2 h-4 w-4' /> : <Pin className='mr-2 h-4 w-4' />}
                  {list.pinned ? t('Unpin') : t('Pin to the front')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className='text-destructive focus:text-destructive' onSelect={() => setDeleteOpen(true)}>
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Delete list')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
          <Button size='icon' variant='ghost' className='h-8 w-8' onClick={onClose} aria-label={t('Close list')}>
            <X className='h-4 w-4' />
          </Button>
        </div>
      </div>
      <ListInsightsPanel listId={list.id} period={period} />
      {isManual && list.productCount === 0 && (
        <p className='mt-2 text-xs text-muted-foreground'>
          {t('No products yet — tick products in “All products” and use “Add to list”.')}
        </p>
      )}

      <ProductListDialog open={editOpen} onOpenChange={setEditOpen} list={list} onSaved={onChanged} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        destructive
        isLoading={deleting}
        title={t('Delete “{{name}}”?', { name: list.name })}
        desc={t('The list is removed. The products themselves are not touched.')}
        confirmText={t('Delete list')}
        handleConfirm={async () => {
          try {
            await deleteList(list.id).unwrap()
            setDeleteOpen(false)
            onClose()
          } catch {
            toast.error(t('Could not delete the list'))
          }
        }}
      />
    </div>
  )
}

/** "Add to list" for the ticked products — ticks show lists every one of them is already on. */
export function AddToListMenu({ products, onAdded }: { products: { _id?: string; id?: string; name?: string }[]; onAdded?: () => void }) {
  const { t } = useLanguage()
  const { data: lists = [] } = useGetProductListsQuery()
  const ids = products.map(productIdOf).filter(Boolean)
  const [open, setOpen] = useState(false)
  const { data: memberships = {} } = useGetProductListMembershipsQuery(ids.slice(0, 200), { skip: !open || ids.length === 0 || ids.length > 200 })
  const [addProducts, { isLoading }] = useAddProductsToListMutation()
  const [createOpen, setCreateOpen] = useState(false)
  const manualLists = lists.filter((l) => l.kind !== 'smart')

  const add = async (list: ProductListSummary) => {
    try {
      const res = await addProducts({ id: list.id, productIds: ids }).unwrap()
      toast.success(
        res.added
          ? t('Added {{n}} to “{{name}}”', { n: String(res.added), name: list.name }) + (res.alreadyOnList ? ` · ${t('{{n}} already there', { n: String(res.alreadyOnList) })}` : '')
          : t('Already on “{{name}}”', { name: list.name }),
      )
      onAdded?.()
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Could not add to the list'))
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' className='space-x-1' disabled={isLoading}>
            <ListPlus size={16} />
            <span>
              {t('Add to list')} ({ids.length})
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-64'>
          <DropdownMenuLabel className='text-xs text-muted-foreground'>{t('Add the selected products to')}</DropdownMenuLabel>
          {manualLists.length === 0 && <p className='px-2 py-1.5 text-xs text-muted-foreground'>{t('No lists yet')}</p>}
          {manualLists.map((list) => {
            const onAll = ids.length > 0 && ids.every((id) => memberships[id]?.includes(list.id))
            return (
              <DropdownMenuItem key={list.id} onSelect={() => add(list)}>
                <ListDot list={list} />
                <span className='ml-2 flex-1 truncate'>{list.name}</span>
                {onAll && <Check className='h-4 w-4 text-primary' />}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className='mr-2 h-4 w-4' />
            {t('New list…')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProductListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(list) => {
          if (list.kind !== 'smart') void add(list)
        }}
      />
    </>
  )
}
