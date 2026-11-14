import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, Loader2, PackageCheck, RefreshCcw, ShoppingCart, Truck } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useCreateReplenishmentTransfersMutation, useGetReplenishmentQuery } from '@/stores/warehouse.api'
import { WAREHOUSE_PERMS, fmtQty } from '../lib/labels'
import { getBusinessToday } from '@/lib/business-timezone'

/**
 * Every warehouse at or below its reorder minimum: what to move in from another warehouse
 * (turned into draft transfers in one click) and what is left to buy.
 */
export function ReplenishmentTab({ onTransfersCreated }: { onTransfersCreated?: () => void }) {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)
  const { data, isFetching, refetch } = useGetReplenishmentQuery()
  const [create, { isLoading: creating }] = useCreateReplenishmentTransfersMutation()
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [qty, setQty] = useState<Record<string, string>>({})

  const items = useMemo(() => data?.items || [], [data])
  const transferable = useMemo(() => items.filter((i) => i.transferQty > 0), [items])
  useEffect(() => {
    setPicked(Object.fromEntries(transferable.map((i) => [i.ruleId, true])))
    setQty(Object.fromEntries(transferable.map((i) => [i.ruleId, String(i.transferQty)])))
  }, [transferable])

  const chosen = transferable.filter((i) => picked[i.ruleId] && Number(qty[i.ruleId]) > 0)
  const toBuy = items.filter((i) => i.buyQty > 0)

  const createDrafts = async () => {
    try {
      const res = await create({ lines: chosen.map((i) => ({ ruleId: i.ruleId, quantity: Number(qty[i.ruleId]) })) }).unwrap()
      toast.success(t('{{n}} draft transfer(s) created — post them from the Transfers tab').replace('{{n}}', String(res.length)))
      onTransfersCreated?.()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not create the transfers')))
    }
  }

  const exportToBuy = () => {
    const ws = XLSX.utils.json_to_sheet(
      toBuy.map((i) => ({ Product: i.name, SKU: i.sku, Warehouse: i.warehouse.name, 'On hand': i.quantity, Min: i.minQty, Max: i.maxQty, 'To buy': i.buyQty, Unit: i.unit }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'To buy')
    XLSX.writeFile(wb, `to-buy-${getBusinessToday()}.xlsx`)
  }

  if (isFetching && !data) {
    return (
      <div className='py-16 text-center'>
        <Loader2 className='mx-auto h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    )
  }

  if (!data || data.totals.rules === 0) {
    return (
      <Card className='items-center gap-2 p-10 text-center'>
        <RefreshCcw className='h-8 w-8 text-muted-foreground' />
        <p className='font-medium'>{t('No reorder rules yet')}</p>
        <p className='max-w-md text-sm text-muted-foreground'>
          {t('Open a warehouse → Reorder rules and set a min and max for the products it should always have. This page then tells you what to move in and what to buy.')}
        </p>
      </Card>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <Stat label={t('Reorder rules')} value={data.totals.rules} />
        <Stat label={t('Need refilling')} value={data.totals.triggered} tone={data.totals.triggered ? 'amber' : undefined} />
        <Stat label={t('Can move in')} value={data.totals.toTransfer} tone='emerald' />
        <Stat label={t('Must buy')} value={data.totals.toBuy} tone={data.totals.toBuy ? 'rose' : undefined} />
      </div>

      {items.length === 0 ? (
        <Card className='items-center gap-2 p-10 text-center'>
          <PackageCheck className='h-8 w-8 text-emerald-500' />
          <p className='font-medium'>{t('Every warehouse is above its minimum')}</p>
        </Card>
      ) : (
        <>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm text-muted-foreground'>
              {t('Stock comes first from the rule’s “refill from” warehouse (default warehouse if none). Whatever it can’t cover is listed to buy.')}
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' size='sm' onClick={() => refetch()}>
                <RefreshCcw className='mr-2 h-4 w-4' />
                {t('Refresh')}
              </Button>
              {toBuy.length ? (
                <Button variant='outline' size='sm' onClick={exportToBuy}>
                  <Download className='mr-2 h-4 w-4' />
                  {t('To-buy list')}
                </Button>
              ) : null}
              {canTransfer ? (
                <Button size='sm' onClick={createDrafts} disabled={creating || chosen.length === 0}>
                  {creating ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Truck className='mr-2 h-4 w-4' />}
                  {t('Create transfer drafts')} ({chosen.length})
                </Button>
              ) : null}
            </div>
          </div>

          <Card className='overflow-hidden p-0'>
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[860px] text-sm'>
                <thead className='bg-muted/50 text-xs text-muted-foreground'>
                  <tr>
                    <th className='w-10 px-3 py-2.5' />
                    <th className='px-3 py-2.5 text-left font-medium'>{t('Product')}</th>
                    <th className='px-3 py-2.5 text-left font-medium'>{t('Warehouse')}</th>
                    <th className='px-3 py-2.5 text-right font-medium'>{t('On hand')}</th>
                    <th className='px-3 py-2.5 text-right font-medium'>{t('Min / Max')}</th>
                    <th className='px-3 py-2.5 text-right font-medium'>{t('Need')}</th>
                    <th className='px-3 py-2.5 text-left font-medium'>{t('Refill from')}</th>
                    <th className='px-3 py-2.5 text-right font-medium'>{t('Move')}</th>
                    <th className='px-3 py-2.5 text-right font-medium'>{t('To buy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const canMove = i.transferQty > 0
                    return (
                      <tr key={i.ruleId} className='border-t'>
                        <td className='px-3 py-2'>
                          {canMove && canTransfer ? (
                            <Checkbox checked={Boolean(picked[i.ruleId])} onCheckedChange={(v) => setPicked((p) => ({ ...p, [i.ruleId]: Boolean(v) }))} />
                          ) : null}
                        </td>
                        <td className='px-3 py-2'>
                          <p className='font-medium'>{i.name}</p>
                          {i.sku ? <p className='text-xs text-muted-foreground'>{i.sku}</p> : null}
                        </td>
                        <td className='px-3 py-2'>{i.warehouse.name}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums', i.quantity <= 0 && 'font-medium text-destructive')}>{fmtQty(i.quantity)}</td>
                        <td className='px-3 py-2 text-right text-muted-foreground tabular-nums'>
                          {fmtQty(i.minQty)} / {fmtQty(i.maxQty)}
                        </td>
                        <td className='px-3 py-2 text-right font-medium tabular-nums'>
                          {fmtQty(i.need)} <span className='text-xs font-normal text-muted-foreground'>{i.unit}</span>
                        </td>
                        <td className='px-3 py-2'>
                          {i.source ? (
                            <span className='inline-flex items-center gap-1 text-muted-foreground'>
                              {i.source.name}
                              <span className='text-xs'>({fmtQty(i.sourceQty)})</span>
                              <ArrowRight className='h-3 w-3' />
                            </span>
                          ) : (
                            <span className='text-xs text-muted-foreground'>{t('— (default warehouse: buy)')}</span>
                          )}
                        </td>
                        <td className='px-3 py-2 text-right'>
                          {canMove ? (
                            <Input
                              type='number'
                              min={0}
                              max={i.transferQty}
                              step='any'
                              value={qty[i.ruleId] ?? ''}
                              disabled={!canTransfer}
                              onChange={(e) => setQty((q) => ({ ...q, [i.ruleId]: e.target.value }))}
                              className='ml-auto h-8 w-20 text-right tabular-nums'
                            />
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </td>
                        <td className='px-3 py-2 text-right'>
                          {i.buyQty > 0 ? (
                            <Badge variant='outline' className='gap-1 border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'>
                              <ShoppingCart className='h-3 w-3' />
                              {fmtQty(i.buyQty)}
                            </Badge>
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'emerald' | 'rose' }) {
  const color =
    tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : ''
  return (
    <Card className='gap-0 p-4'>
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value.toLocaleString()}</p>
      <p className='text-xs text-muted-foreground'>{label}</p>
    </Card>
  )
}
