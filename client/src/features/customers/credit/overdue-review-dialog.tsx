import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useFormatMoney } from '@/lib/format-money'
import { useBulkUpdateCustomerCreditMutation, useGetOverdueCustomersQuery } from '@/stores/creditControl.api'
import { CREDIT_STATUS_META } from './credit-utils'

const DAY_PRESETS = [1, 15, 30, 60, 90]

/**
 * Overdue review: every customer with an invoice late by more than N days (invoice due
 * date, else invoice date + payment terms), worst first — tick and put them on credit hold
 * in one go. Server: GET /credit-control/overdue-customers + POST /credit-control/bulk.
 */
export function OverdueReviewDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone?: () => void }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [minDays, setMinDays] = useState(30)
  const [typedDays, setTypedDays] = useState('30')
  const { data, isFetching } = useGetOverdueCustomersQuery({ minDays }, { skip: !open, refetchOnMountOrArgChange: true })
  const [bulk, { isLoading }] = useBulkUpdateCustomerCreditMutation()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')

  const rows = useMemo(() => data?.results ?? [], [data])
  useEffect(() => {
    setPicked(new Set(rows.filter((row) => !row.onHold).map((row) => row.customerId)))
    setReason(t('Overdue more than {{n}} days', { n: minDays }))
  }, [rows, minDays, t])

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const holdPicked = async () => {
    if (!picked.size || !reason.trim()) return
    try {
      const res = await bulk({ customerIds: [...picked], action: 'hold', reason: reason.trim() }).unwrap()
      toast.success(t('{{n}} customer(s) put on credit hold', { n: res.updated }))
      onDone?.()
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not put customers on hold')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] max-w-3xl flex-col sm:max-w-3xl'>
        <DialogHeader className='shrink-0'>
          <DialogTitle className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-amber-600' />
            {t('Overdue review')}
          </DialogTitle>
          <DialogDescription>{t('Customers with an invoice past its due date. Put the ones you pick on credit hold — they can still buy for cash.')}</DialogDescription>
        </DialogHeader>

        <div className='flex shrink-0 flex-wrap items-end gap-2'>
          <div className='space-y-1'>
            <Label htmlFor='overdue-days' className='text-xs'>{t('Late by more than (days)')}</Label>
            <Input
              id='overdue-days'
              type='number'
              min={0}
              className='h-8 w-24'
              value={typedDays}
              onChange={(e) => setTypedDays(e.target.value)}
              onBlur={() => setMinDays(Math.max(0, Math.floor(Number(typedDays) || 0)))}
              onKeyDown={(e) => e.key === 'Enter' && setMinDays(Math.max(0, Math.floor(Number(typedDays) || 0)))}
            />
          </div>
          {DAY_PRESETS.map((d) => (
            <Button key={d} type='button' size='sm' variant={minDays === d ? 'default' : 'outline'} className='h-8 px-2.5 text-xs' onClick={() => { setMinDays(d); setTypedDays(String(d)) }}>
              {d === 1 ? t('Any overdue') : t('{{n}}+ days', { n: d })}
            </Button>
          ))}
          {data && (
            <span className='ml-auto text-sm text-muted-foreground'>
              {t('{{n}} customers · {{amount}} overdue', { n: data.totals.customers, amount: formatMoney(data.totals.amount) })}
            </span>
          )}
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto rounded-lg border'>
          {isFetching && !rows.length ? (
            <div className='flex justify-center py-10 text-muted-foreground'>
              <Loader2 className='h-5 w-5 animate-spin' />
            </div>
          ) : rows.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>{t('No customer is overdue by more than {{n}} days.', { n: minDays })}</p>
          ) : (
            <table className='w-full text-sm'>
              <thead className='sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur'>
                <tr>
                  <th className='w-8 px-3 py-2 text-left'>
                    <Checkbox
                      checked={picked.size > 0 && picked.size === rows.filter((r) => !r.onHold).length}
                      onCheckedChange={(v) => setPicked(v ? new Set(rows.filter((r) => !r.onHold).map((r) => r.customerId)) : new Set())}
                      aria-label={t('Select all')}
                    />
                  </th>
                  <th className='px-2 py-2 text-left'>{t('Customer')}</th>
                  <th className='px-2 py-2 text-right'>{t('Days late')}</th>
                  <th className='px-2 py-2 text-right'>{t('Overdue')}</th>
                  <th className='hidden px-2 py-2 text-right sm:table-cell'>{t('Balance')}</th>
                  <th className='hidden px-2 py-2 text-right sm:table-cell'>{t('Limit')}</th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {rows.map((row) => (
                  <tr key={row.customerId} className={row.onHold ? 'opacity-60' : ''}>
                    <td className='px-3 py-2'>
                      <Checkbox disabled={row.onHold} checked={picked.has(row.customerId)} onCheckedChange={(v) => toggle(row.customerId, Boolean(v))} aria-label={row.name} />
                    </td>
                    <td className='px-2 py-2'>
                      <div className='font-medium'>{row.name}</div>
                      <div className='text-xs text-muted-foreground'>
                        {row.overdueCount} {t('invoice(s)')}
                        {row.phone ? ` · ${row.phone}` : ''}
                        {row.onHold && (
                          <Badge variant='outline' className={`ml-1 text-[10px] ${CREDIT_STATUS_META.hold.badge}`}>
                            {t('On hold')}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums font-medium ${row.oldestDays > 60 ? 'text-red-600' : row.oldestDays > 30 ? 'text-orange-600' : 'text-amber-600'}`}>
                      {row.oldestDays}
                    </td>
                    <td className='px-2 py-2 text-right tabular-nums'>{formatMoney(row.overdueAmount)}</td>
                    <td className='hidden px-2 py-2 text-right tabular-nums sm:table-cell'>{formatMoney(row.balance)}</td>
                    <td className='hidden px-2 py-2 text-right tabular-nums text-muted-foreground sm:table-cell'>{row.limit > 0 ? formatMoney(row.limit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className='shrink-0 space-y-1'>
          <Label htmlFor='overdue-hold-reason' className='text-xs'>{t('Hold reason')}</Label>
          <Input id='overdue-hold-reason' value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <DialogFooter className='shrink-0'>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            {t('Close')}
          </Button>
          <Button type='button' variant='destructive' disabled={!picked.size || !reason.trim() || isLoading} onClick={holdPicked}>
            {isLoading ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <ShieldAlert className='mr-2 h-4 w-4' />}
            {t('Put {{n}} on hold', { n: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
