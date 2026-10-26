import { useEffect, useMemo, useState } from 'react'
import { Loader2, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetFloorMaterialChoicesQuery,
  useSetFloorIssueMethodMutation,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductTypeBadge } from './badges'
import { FilterChips, SearchField } from './list-controls'

/**
 * Which materials are kept in production stock: issued to the floor in bulk and used
 * from there by every finished good — instead of being issued to each production order.
 * Open orders follow the change at once.
 */
export function FloorMaterialsSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void
  /** After a successful save (e.g. reload the screen that opened the sheet). */
  onSaved?: () => void
}) {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canEdit = hasAnyPermission('manageBoms', 'editProducts')
  const { data, isLoading } = useGetFloorMaterialChoicesQuery({})
  const [save, { isLoading: saving }] = useSetFloorIssueMethodMutation()
  const [type, setType] = useState<'packaging_material' | 'all' | 'on'>(
    'packaging_material'
  )
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const original = useMemo(
    () => new Set((data || []).filter((p) => p.isFloor).map((p) => p.id)),
    [data]
  )

  useEffect(() => {
    if (!data) return
    const ticked = data.filter((p) => p.isFloor)
    setSelected(new Set(ticked.map((p) => p.id)))
    // Something other than packaging is ticked: open on the ticked list so it is seen.
    if (ticked.some((p) => p.productType !== 'packaging_material'))
      setType('on')
  }, [data])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data || []).filter(
      (p) =>
        (type === 'all' ||
          (type === 'on'
            ? selected.has(p.id) || original.has(p.id)
            : p.productType === type)) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q))
    )
  }, [data, type, search, selected, original])
  const turnOn = [...selected].filter((id) => !original.has(id))
  const turnOff = [...original].filter((id) => !selected.has(id))
  const dirty = turnOn.length + turnOff.length > 0
  const allVisibleOn =
    visible.length > 0 && visible.every((p) => selected.has(p.id))
  // Raw materials are normally issued per order; ticking them is allowed but called out.
  const nonPackagingOn = (data || []).filter(
    (p) => turnOn.includes(p.id) && p.productType !== 'packaging_material'
  )

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const submit = async () => {
    try {
      let orders = 0
      if (turnOn.length) {
        const r = await save({
          productIds: turnOn,
          issueMethod: 'floor',
        }).unwrap()
        orders += r.ordersUpdated
      }
      if (turnOff.length) {
        const r = await save({
          productIds: turnOff,
          issueMethod: 'order',
        }).unwrap()
        orders += r.ordersUpdated
      }
      toast.success(
        `${t('Saved')} · ${selected.size} ${t('material(s) in production stock')}${orders ? ` · ${orders} ${t('open order(s) updated')}` : ''}`
      )
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save')))
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 sm:max-w-lg'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle className='flex items-center gap-2'>
            <Settings2 className='h-4 w-4' />
            {t('Production stock materials')}
          </SheetTitle>
          <SheetDescription>
            {t(
              'Ticked materials are issued to the production floor in bulk and used from there automatically when finished goods are received or packed. They are no longer issued to each production order.'
            )}
          </SheetDescription>
        </SheetHeader>

        <div className='space-y-3 border-b px-5 py-3'>
          <FilterChips
            label={t('Show')}
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={[
              { value: 'packaging_material', label: t('Packaging') },
              { value: 'on', label: `${t('Ticked')} (${selected.size})` },
              { value: 'all', label: t('All materials') },
            ]}
          />
          <div className='flex items-center gap-2'>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={t('Search material')}
            />
            {canEdit && visible.length > 0 && (
              <Button
                variant='outline'
                size='sm'
                className='h-9 shrink-0'
                onClick={() =>
                  setSelected((s) => {
                    const next = new Set(s)
                    visible.forEach((p) =>
                      allVisibleOn ? next.delete(p.id) : next.add(p.id)
                    )
                    return next
                  })
                }
              >
                {allVisibleOn ? t('Untick all') : t('Tick all')}
              </Button>
            )}
          </div>
        </div>

        <div className='flex-1 overflow-y-auto'>
          {isLoading ? (
            <div className='space-y-2 p-5'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
            </div>
          ) : visible.length === 0 ? (
            <p className='text-muted-foreground px-5 py-10 text-center text-sm'>
              {type === 'packaging_material'
                ? t(
                    'No packaging materials. Classify cartons, labels and bottles as Packaging Material on the Products tab, or show All materials.'
                  )
                : t('No materials match')}
            </p>
          ) : (
            <ul className='divide-y'>
              {visible.map((p) => {
                const on = selected.has(p.id)
                const changed = on !== original.has(p.id)
                return (
                  <li key={p.id}>
                    <label
                      className={cn(
                        'hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-5 py-2.5',
                        !canEdit && 'cursor-default'
                      )}
                    >
                      <Checkbox
                        checked={on}
                        disabled={!canEdit}
                        onCheckedChange={(v) => toggle(p.id, v === true)}
                        aria-label={p.name}
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='truncate text-sm font-medium'>
                          {p.name}
                        </div>
                        <div className='text-muted-foreground truncate text-xs'>
                          {[p.sku, getUnitLabel(p.unit)]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      {changed && (
                        <span className='text-xs font-medium text-amber-600 dark:text-amber-400'>
                          {on ? t('will turn on') : t('will turn off')}
                        </span>
                      )}
                      <ProductTypeBadge type={p.productType} />
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {nonPackagingOn.length > 0 && (
          <p className='border-t border-amber-500/30 bg-amber-500/5 px-5 py-2 text-xs text-amber-800 dark:text-amber-300'>
            {nonPackagingOn.length} {t('of these are not packaging')} (
            {nonPackagingOn
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ')}
            {nonPackagingOn.length > 3 ? '…' : ''}).{' '}
            {t(
              'They will no longer appear on Material Issue Vouchers — production uses them from production stock.'
            )}
          </p>
        )}
        <div className='bg-muted/30 flex items-center justify-between gap-2 border-t px-5 py-3'>
          <span className='text-muted-foreground text-xs'>
            {dirty
              ? `${turnOn.length} ${t('on')} · ${turnOff.length} ${t('off')}`
              : t('No changes')}
          </span>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={onClose}>
              {t('Close')}
            </Button>
            {canEdit && (
              <Button onClick={submit} disabled={!dirty || saving}>
                {saving && <Loader2 className='h-4 w-4 animate-spin' />}
                {t('Save')}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
