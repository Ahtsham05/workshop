import { useState } from 'react'
import { AlarmClock, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { formatAppDate } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { useGetCustomerAgingQuery, type AgingItem } from '@/stores/ledgerAlerts.api'
import { AgingChip, DueStateChip } from './aging-chip'
import { rowStyleForTone, toneForCustomer, toneForState } from '../lib/ledger-colors'

const SOURCE_HINT: Record<AgingItem['dueSource'], string> = {
  invoice: '',
  terms: 'from payment terms',
  default: 'default period',
  none: '',
}

function itemLabel(item: AgingItem): string {
  if (item.kind === 'invoice') return item.billNumber ? `Bill #${item.billNumber}` : item.invoiceNumber || item.reference || 'Invoice'
  if (item.kind === 'pending') return `${item.invoiceNumber || item.reference || ''} (pending)`
  if (item.kind === 'unmatched') return 'Earlier balance'
  if (item.entryType === 'opening_balance') return 'Opening balance'
  return item.reference || item.description || 'Ledger entry'
}

/**
 * "Dues & overdue" on a customer's ledger page: what is late (coloured by band), what falls
 * due next, and each open invoice with its due date — matched to the ledger balance, oldest
 * paid first (see ledgerAlerts.service.js). Hidden when the customer owes nothing.
 */
export function CustomerAgingCard({ customerId, customerName, phone, whatsapp, className }: {
  customerId: string
  customerName?: string
  phone?: string
  whatsapp?: string
  className?: string
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const branchName = useBranchName()
  const [open, setOpen] = useState(false)
  const { data } = useGetCustomerAgingQuery(customerId, { skip: !customerId, refetchOnMountOrArgChange: true })
  const aging = data?.aging
  if (!data || !aging || aging.openAmount <= 0.005) return null
  const { settings } = data
  const tone = toneForCustomer(aging, settings)
  const items = aging.items || []

  // One segment per state, in due order — the bar and the amount line share it.
  const countOf = (states: string[]) => items.filter((item) => states.includes(item.state)).length
  const segments = [
    { key: 'overdue', label: 'Overdue', amount: aging.overdueAmount, count: countOf(['overdue']), color: tone?.kind === 'band' ? tone.color : settings.bands[0]?.color || '#EAB308' },
    { key: 'today', label: settings.dueTodayLabel, amount: aging.dueTodayAmount, count: countOf(['due_today']), color: settings.dueTodayColor },
    { key: 'soon', label: settings.dueSoonLabel, amount: aging.dueSoonAmount, count: countOf(['due_soon']), color: settings.dueSoonColor },
    { key: 'later', label: 'Not due yet', amount: aging.notDueAmount, count: countOf(['not_due']), color: '#64748B' },
    { key: 'none', label: 'No due date', amount: aging.noDueDateAmount, count: countOf(['no_due_date']), color: '#CBD5E1' },
  ].filter((segment) => segment.amount > 0.005)
  const total = segments.reduce((sum, segment) => sum + segment.amount, 0) || 1

  const reminder =
    aging.overdueAmount > 0
      ? `${t('Assalam-o-Alaikum')} ${customerName || ''},\n${t('Your payment of')} ${formatMoney(aging.overdueAmount)} ${t('is overdue')}` +
        (aging.oldestDueDate ? ` (${t('since')} ${formatAppDate(aging.oldestDueDate)})` : '') +
        `.\n${t('Total balance')}: ${formatMoney(aging.balance)}.\n${t('Kindly clear it at your earliest.')}\n— ${branchName}`
      : `${t('Assalam-o-Alaikum')} ${customerName || ''},\n${t('A payment of')} ${formatMoney(aging.nextDueAmount)} ${t('is due on')} ${formatAppDate(aging.nextDueDate)}.\n— ${branchName}`

  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)} style={tone ? { borderLeftWidth: 4, borderLeftColor: tone.color } : undefined}>
      <CardContent className='space-y-2.5 px-4 py-3'>
        {/* Line 1 — title, status, total open, actions */}
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
          <div className='flex min-w-0 items-center gap-2'>
            <AlarmClock className='h-4 w-4 shrink-0 text-muted-foreground' />
            <span className='text-sm font-semibold'>{t('Dues & overdue')}</span>
            <AgingChip aging={aging} settings={settings} size='xs' />
          </div>
          <div className='ml-auto flex items-center gap-1'>
            <span className='mr-1 text-xs text-muted-foreground'>
              {t('Open')} <span className='font-semibold text-foreground tabular-nums'>{formatMoney(aging.openAmount)}</span>
            </span>
            {(phone || whatsapp) && (aging.overdueAmount > 0 || aging.nextDueDate) ? (
              <WhatsAppSendButton phone={phone} whatsapp={whatsapp} name={customerName || ''} message={reminder} className='h-7 w-7' />
            ) : null}
            {items.length > 0 ? (
              <Button variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={() => setOpen((v) => !v)}>
                {open ? <ChevronUp className='mr-1 h-3.5 w-3.5' /> : <ChevronDown className='mr-1 h-3.5 w-3.5' />}
                {t('Items')} ({items.length})
              </Button>
            ) : null}
          </div>
        </div>

        {/* Line 2 — how the open balance splits, to scale */}
        <div className='flex h-2 w-full overflow-hidden rounded-full bg-muted' role='img' aria-label={t('Open balance by due status')}>
          {segments.map((segment) => (
            <div
              key={segment.key}
              className='h-full first:rounded-l-full last:rounded-r-full'
              style={{ width: `${Math.max(2, (segment.amount / total) * 100)}%`, backgroundColor: segment.color }}
              title={`${t(segment.label)}: ${formatMoney(segment.amount)}`}
            />
          ))}
        </div>

        {/* Line 3 — the amounts, then the two dates that matter */}
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
          {segments.map((segment) => (
            <span key={segment.key} className='inline-flex items-center gap-1.5 whitespace-nowrap'>
              <span className='h-2 w-2 shrink-0 rounded-full' style={{ backgroundColor: segment.color }} />
              <span className='text-muted-foreground'>{t(segment.label)}</span>
              <span className={cn('font-semibold tabular-nums', segment.key === 'overdue' && 'text-foreground')}>{formatMoney(segment.amount)}</span>
              {segment.count > 0 ? <span className='text-muted-foreground'>({segment.count} {t(segment.count === 1 ? 'item' : 'items')})</span> : null}
            </span>
          ))}
          <span className='ml-auto flex flex-wrap items-center gap-x-3 text-muted-foreground'>
            {aging.oldestDueDate ? (
              <span className='whitespace-nowrap'>
                {t('Oldest due')} <span className='font-medium text-foreground'>{formatAppDate(aging.oldestDueDate)}</span>
              </span>
            ) : null}
            {aging.nextDueDate ? (
              <span className='whitespace-nowrap'>
                {t('Next due')} <span className='font-medium text-foreground'>{formatAppDate(aging.nextDueDate)}</span> · {formatMoney(aging.nextDueAmount)}
              </span>
            ) : null}
          </span>
        </div>

        {open && items.length > 0 ? (
          <div className='overflow-x-auto rounded-md border text-xs [&_td]:py-1.5 [&_th]:h-8'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Reference')}</TableHead>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Due Date')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className='text-right'>{t('Still owed')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => {
                  const itemTone = toneForState(item.state, item.bandIndex, settings)
                  return (
                    <TableRow key={i} style={rowStyleForTone(itemTone, settings)}>
                      <TableCell className='font-mono text-xs'>{t(itemLabel(item))}</TableCell>
                      <TableCell className='text-muted-foreground'>{formatAppDate(item.date)}</TableCell>
                      <TableCell>
                        {item.dueDate ? formatAppDate(item.dueDate) : '—'}
                        {SOURCE_HINT[item.dueSource] ? <span className='ml-1 text-[10px] text-muted-foreground'>({t(SOURCE_HINT[item.dueSource])})</span> : null}
                      </TableCell>
                      <TableCell>
                        <DueStateChip
                          state={item.state}
                          daysOverdue={item.daysOverdue}
                          daysUntilDue={item.daysUntilDue}
                          bandIndex={item.bandIndex}
                          settings={settings}
                          dueDate={item.dueDate}
                        />
                      </TableCell>
                      <TableCell className='text-right font-semibold tabular-nums'>
                        {formatMoney(item.openAmount)}
                        {item.total && item.total - item.openAmount > 0.005 ? (
                          <span className='block text-[10px] font-normal text-muted-foreground'>
                            {t('of')} {formatMoney(item.total)}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <p className='border-t bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground'>
              {t('Payments are applied to the oldest items first, so these add up to the ledger balance.')}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
