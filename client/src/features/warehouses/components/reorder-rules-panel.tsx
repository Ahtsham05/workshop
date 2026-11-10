import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import {
  useDeleteReorderRuleMutation,
  useGetReorderRulesQuery,
  useGetWarehouseStockQuery,
  useGetWarehousesQuery,
  useSaveReorderRulesMutation,
  type ReorderRule,
} from '@/stores/warehouse.api'
import { WAREHOUSE_PERMS, fmtQty } from '../lib/labels'

const AUTO = '__default__'

const STATE_META: Record<ReorderRule['state'], { label: string; className: string }> = {
  ok: { label: 'OK', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  low: { label: 'Low', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  empty: { label: 'Empty', className: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

/** Min / max per product for one warehouse. */
export function ReorderRulesPanel({ warehouseId, isDefault }: { warehouseId: string; isDefault: boolean }) {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canManage = hasAnyPermission(...WAREHOUSE_PERMS.manage)
  const { data: rules = [], isLoading } = useGetReorderRulesQuery({ warehouseId })
  const [remove] = useDeleteReorderRuleMutation()
  const [editing, setEditing] = useState<ReorderRule | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ReorderRule | null>(null)

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>
          {isDefault
            ? t('When a product here falls to its min, the Replenishment tab lists it to buy up to max.')
            : t('When a product here falls to its min, Replenishment suggests moving it in from the refill-from warehouse up to max — and what to buy if that runs short.')}
        </p>
        {canManage ? (
          <Button className='shrink-0' onClick={() => setEditing('new')}>
            <Plus className='mr-2 h-4 w-4' />
            {t('Add rule')}
          </Button>
        ) : null}
      </div>

      <Card className='overflow-hidden p-0'>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[640px] text-sm'>
            <thead className='bg-muted/50 text-xs text-muted-foreground'>
              <tr>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Product')}</th>
                <th className='px-3 py-2.5 text-right font-medium'>{t('On hand')}</th>
                <th className='px-3 py-2.5 text-right font-medium'>{t('Min')}</th>
                <th className='px-3 py-2.5 text-right font-medium'>{t('Max')}</th>
                <th className='px-3 py-2.5 text-left font-medium'>{t('Refill from')}</th>
                <th className='px-3 py-2.5 text-left font-medium'>{t('State')}</th>
                {canManage ? <th className='w-20 px-3 py-2.5' /> : null}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className='py-10 text-center'>
                    <Loader2 className='mx-auto h-5 w-5 animate-spin text-muted-foreground' />
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-12 text-center text-muted-foreground'>
                    {t('No reorder rules for this warehouse yet.')}
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id} className={cn('border-t', !r.isActive && 'opacity-50')}>
                    <td className='px-4 py-2'>
                      <p className='font-medium'>{r.name}</p>
                      {r.sku ? <p className='text-xs text-muted-foreground'>{r.sku}</p> : null}
                    </td>
                    <td className='px-3 py-2 text-right tabular-nums'>{fmtQty(r.quantity)}</td>
                    <td className='px-3 py-2 text-right tabular-nums'>{fmtQty(r.minQty)}</td>
                    <td className='px-3 py-2 text-right tabular-nums'>{fmtQty(r.maxQty)}</td>
                    <td className='px-3 py-2 text-muted-foreground'>{r.source?.name || t('Default warehouse')}</td>
                    <td className='px-3 py-2'>
                      <Badge variant='outline' className={STATE_META[r.state].className}>
                        {r.isActive ? t(STATE_META[r.state].label) : t('Paused')}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td className='px-3 py-2 text-right'>
                        <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => setEditing(r)}>
                          <Pencil className='h-4 w-4' />
                        </Button>
                        <Button variant='ghost' size='icon' className='h-8 w-8 text-muted-foreground hover:text-destructive' onClick={() => setDeleting(r)}>
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <RuleDialog warehouseId={warehouseId} rule={editing === 'new' ? null : editing} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('Delete this rule?')}
        desc={t('The product stays in stock — only its min / max for this warehouse is removed.')}
        destructive
        confirmText={t('Delete')}
        handleConfirm={async () => {
          if (!deleting) return
          try {
            await remove(deleting.id).unwrap()
            toast.success(t('Rule deleted'))
          } catch (err) {
            toast.error(getErrorMessage(err, t('Could not delete the rule')))
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}

function RuleDialog({ warehouseId, rule, open, onOpenChange }: { warehouseId: string; rule: ReorderRule | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useLanguage()
  const { data: allWarehouses = [] } = useGetWarehousesQuery(undefined, { skip: !open })
  const warehouses = useMemo(() => allWarehouses.filter((w) => w.isActive), [allWarehouses])
  const [save, { isLoading }] = useSaveReorderRulesMutation()
  const [product, setProduct] = useState<{ productId: string; variantId: string | null; name: string } | null>(null)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [minQty, setMinQty] = useState('')
  const [maxQty, setMaxQty] = useState('')
  const [source, setSource] = useState(AUTO)
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (!open) return
    setProduct(rule ? { productId: rule.productId, variantId: rule.variantId, name: rule.name } : null)
    setMinQty(rule ? String(rule.minQty) : '')
    setMaxQty(rule ? String(rule.maxQty) : '')
    setSource(rule?.source?.id || AUTO)
    setActive(rule ? rule.isActive : true)
    setSearch('')
    setDebounced('')
  }, [open, rule])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search])

  const { data: found, isFetching } = useGetWarehouseStockQuery({ warehouseId, search: debounced, filter: 'all', limit: 10 }, { skip: !open || !debounced || Boolean(rule) })
  const sources = useMemo(() => warehouses.filter((w) => w.id !== warehouseId), [warehouses, warehouseId])

  const min = Number(minQty)
  const max = Number(maxQty)
  const valid = Boolean(product) && minQty !== '' && maxQty !== '' && min >= 0 && max > 0 && max >= min

  const submit = async () => {
    if (!valid || !product) return
    try {
      await save({
        warehouseId,
        rules: [{ productId: product.productId, variantId: product.variantId, minQty: min, maxQty: max, sourceWarehouseId: source === AUTO ? null : source, isActive: active }],
      }).unwrap()
      toast.success(rule ? t('Rule updated') : t('Rule added'))
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save the rule')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{rule ? t('Edit reorder rule') : t('Add reorder rule')}</DialogTitle>
          <DialogDescription>{t('Keep this product between min and max in this warehouse.')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label>{t('Product')}</Label>
            {product ? (
              <div className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'>
                <span className='truncate font-medium'>{product.name}</span>
                {!rule ? (
                  <Button variant='ghost' size='sm' className='h-7' onClick={() => setProduct(null)}>
                    {t('Change')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <div className='relative'>
                  <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                  <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name, SKU or barcode…')} className='pl-8' />
                  {isFetching ? <Loader2 className='absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground' /> : null}
                </div>
                {debounced && found ? (
                  <div className='max-h-48 overflow-y-auto rounded-md border'>
                    {found.results.length === 0 ? (
                      <p className='p-3 text-sm text-muted-foreground'>{t('No product matches')}</p>
                    ) : (
                      found.results.map((r) => (
                        <button
                          key={`${r.productId}|${r.variantId || ''}`}
                          type='button'
                          onClick={() => setProduct({ productId: r.productId, variantId: r.variantId, name: r.name })}
                          className='flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted'
                        >
                          <span className='truncate'>{r.name}</span>
                          <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
                            {fmtQty(r.quantity)} {r.unit}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='rule-min'>{t('Min')}</Label>
              <Input id='rule-min' type='number' min={0} step='any' value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder='5' />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='rule-max'>{t('Max')}</Label>
              <Input id='rule-max' type='number' min={0} step='any' value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder='20' />
            </div>
          </div>
          {minQty !== '' && maxQty !== '' && !(max >= min && max > 0) ? <p className='text-xs text-destructive'>{t('Max must be above zero and at least the min.')}</p> : null}
          <div className='space-y-1.5'>
            <Label>{t('Refill from')}</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>{t('Default warehouse')}</SelectItem>
                {sources.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rule ? (
            <label className='flex items-center gap-2 text-sm'>
              <input type='checkbox' checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t('Active')}
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={!valid || isLoading}>
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
