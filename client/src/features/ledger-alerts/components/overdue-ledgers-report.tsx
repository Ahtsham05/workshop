import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { AlarmClock, ArrowDownWideNarrow, CalendarClock, CalendarX2, Hourglass, Printer, RefreshCw, Search, Wallet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { useLanguage } from '@/context/language-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { useCurrencyMeta, useFormatMoney, formatMoneyWithMeta } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { escapeHtml } from '@/lib/escape-html'
import { cn } from '@/lib/utils'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import type { CustomerAging } from '@/stores/ledgerAlerts.api'
import { useLedgerStatus } from '../hooks/use-ledger-alerts'
import { AgingChip } from './aging-chip'
import { LedgerColorLegend } from './ledger-color-legend'
import { bandRangeText, describeDays, hexToRgba, matchesLedgerFilter, rowStyleForTone, toneForCustomer, type LedgerColorFilter } from '../lib/ledger-colors'
import { reportEntityName } from '@/features/reports/utils/report-entity-name'

type SortKey = 'late' | 'overdue' | 'balance' | 'name'

const BUCKET_COLUMNS = [
  { key: 'current', label: 'Not due' },
  { key: 'd1_30', label: '1–30' },
  { key: 'd31_60', label: '31–60' },
  { key: 'd61_90', label: '61–90' },
  { key: 'd90_plus', label: '90+' },
  { key: 'noDueDate', label: 'No date' },
] as const

/**
 * Reports → Overdue Ledgers: every customer who owes, coloured by how late they are
 * (Settings → Due Dates & Ledger Colours), with band totals, aging buckets, a colour filter,
 * WhatsApp reminders, Excel export and a colour print. Amounts follow the ledger balance
 * (payments clear the oldest invoices first — ledgerAlerts.service.js).
 */
export const OverdueLedgersReport = forwardRef<{ exportToExcel: () => void }, { initialFilter?: string }>(({ initialFilter }, ref) => {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const branchName = useBranchName()
  const { board, settings, isFetching, refetch } = useLedgerStatus({ context: 'report' })
  const [filter, setFilter] = useState<LedgerColorFilter>(initialFilter || 'all')
  const [scope, setScope] = useState<'late' | 'all'>(initialFilter ? 'all' : 'late')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('late')
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery()
  const colors = settings.colorsEnabled && settings.showInReports

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = (board?.rows || []).filter((row) => {
      if (scope === 'late' && filter === 'all' && !['overdue', 'due_today', 'due_soon'].includes(row.state)) return false
      if (!matchesLedgerFilter(row, filter)) return false
      if (!needle) return true
      return [row.name, row.nameUrdu, row.phone, row.whatsapp].some((v) => v && String(v).toLowerCase().includes(needle))
    })
    const sorted = [...list]
    if (sort === 'overdue') sorted.sort((a, b) => b.overdueAmount - a.overdueAmount)
    else if (sort === 'balance') sorted.sort((a, b) => b.openAmount - a.openAmount)
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    // 'late' keeps the server order: overdue first, oldest first.
    return sorted
  }, [board, filter, scope, search, sort])

  const totals = board?.totals
  const filteredTotals = useMemo(
    () => ({
      open: rows.reduce((s, r) => s + r.openAmount, 0),
      overdue: rows.reduce((s, r) => s + r.overdueAmount, 0),
      buckets: BUCKET_COLUMNS.reduce<Record<string, number>>((acc, col) => {
        acc[col.key] = rows.reduce((s, r) => s + (r.buckets[col.key] || 0), 0)
        return acc
      }, {}),
    }),
    [rows]
  )

  const statusText = (row: CustomerAging) => {
    if (row.state === 'overdue') return `${describeDays('overdue', row.oldestDaysOverdue, null)}`
    if (row.state === 'due_today') return settings.dueTodayLabel
    if (row.state === 'due_soon') return settings.dueSoonLabel
    if (row.state === 'no_due_date') return 'No due date'
    return 'Not due'
  }

  const reminderFor = (row: CustomerAging) =>
    row.overdueAmount > 0
      ? `${t('Assalam-o-Alaikum')} ${row.name},\n${t('Your payment of')} ${formatMoney(row.overdueAmount)} ${t('is overdue')}` +
        (row.oldestDueDate ? ` (${t('since')} ${formatAppDate(row.oldestDueDate)})` : '') +
        `.\n${t('Total balance')}: ${formatMoney(row.balance)}.\n${t('Kindly clear it at your earliest.')}\n— ${branchName}`
      : `${t('Assalam-o-Alaikum')} ${row.name},\n${t('A payment of')} ${formatMoney(row.nextDueAmount)} ${t('is due on')} ${formatAppDate(row.nextDueDate)}.\n— ${branchName}`

  const exportToExcel = () => {
    if (!rows.length) {
      toast.error(t('No data available to export'))
      return
    }
    const data = rows.map((row) => {
      const tone = toneForCustomer(row, settings)
      return {
        [t('customer')]: reportEntityName(language, row.name, row.nameUrdu),
        [t('phone')]: row.phone || '',
        [t('Status')]: t(statusText(row)),
        [t('Colour band')]: tone ? t(tone.label) : '',
        [t('Balance')]: row.openAmount,
        [t('Overdue')]: row.overdueAmount,
        [t('Days late')]: row.oldestDaysOverdue || '',
        [t('Oldest due date')]: row.oldestDueDate || '',
        [t('Next due date')]: row.nextDueDate || '',
        ...Object.fromEntries(BUCKET_COLUMNS.map((col) => [t(col.label), row.buckets[col.key] || 0])),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Overdue Ledgers')
    XLSX.writeFile(wb, `overdue-ledgers-${board?.today || 'report'}.xlsx`)
    toast.success(t('Data exported successfully'))
  }
  useImperativeHandle(ref, () => ({ exportToExcel }))

  const print = () => {
    if (!rows.length) {
      toast.error(t('Nothing to print'))
      return
    }
    const money = (n: number) => formatMoneyWithMeta(n, currencyMeta)
    const printColors = colors && settings.printColors
    const body = rows
      .map((row, i) => {
        const tone = printColors ? toneForCustomer(row, settings) : null
        const style = tone ? ` style="background:${hexToRgba(tone.color, 0.16)};box-shadow:inset 4px 0 0 0 ${tone.color}"` : ''
        return `<tr${style}>
          <td>${i + 1}</td>
          <td><b>${escapeHtml(reportEntityName(language, row.name, row.nameUrdu))}</b><div class="muted">${escapeHtml(row.phone || '')}</div></td>
          <td>${tone ? `<span class="dot" style="background:${tone.color}"></span>` : ''}${escapeHtml(t(statusText(row)))}</td>
          <td class="num">${row.oldestDueDate ? formatAppDate(row.oldestDueDate) : '—'}</td>
          ${BUCKET_COLUMNS.map((col) => `<td class="num">${row.buckets[col.key] ? money(row.buckets[col.key]) : '—'}</td>`).join('')}
          <td class="num"><b>${money(row.openAmount)}</b></td>
        </tr>`
      })
      .join('')
    const legend = printColors
      ? [
          ...settings.bands.map((b, i) => `<span><i style="background:${b.color}"></i>${escapeHtml(b.label)} (${escapeHtml(bandRangeText(settings.bands, i))})</span>`),
          `<span><i style="background:${settings.dueTodayColor}"></i>${escapeHtml(settings.dueTodayLabel)}</span>`,
          settings.dueSoonEnabled ? `<span><i style="background:${settings.dueSoonColor}"></i>${escapeHtml(settings.dueSoonLabel)} (${settings.dueSoonDays}d)</span>` : '',
        ].join('')
      : ''
    const company = resolveBranchCompanyName(orgData?.name, branchData?.name) || orgData?.name || 'Business'
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Overdue Ledgers — ${escapeHtml(company)}</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11.5px; color: #111827; margin: 0; padding: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.head { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
.head h1 { margin: 0; font-size: 18px; } .head h2 { margin: 4px 0 0; font-size: 14px; font-weight: 600; } .muted { color: #6b7280; font-size: 10.5px; }
.sum { display: flex; gap: 8px; margin-bottom: 10px; } .sum div { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; } .sum b { display: block; font-size: 14px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 8px; font-size: 10.5px; } .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #d1d5db; padding: 5px 6px; text-align: left; vertical-align: top; }
th { background: #f3f4f6; font-size: 10.5px; text-transform: uppercase; letter-spacing: .02em; } .num { text-align: right; white-space: nowrap; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; } tfoot td { font-weight: 700; background: #f9fafb; }
.no-print { margin-top: 14px; text-align: center; } @media print { .no-print { display: none; } }
</style></head><body>
<div class="head"><h1>${escapeHtml(company)}</h1><h2>${escapeHtml(t('Overdue Ledgers'))}</h2><div class="muted">${escapeHtml(t('As of'))} ${formatAppDate(board?.today)} · ${rows.length} ${escapeHtml(t('customers'))}</div></div>
<div class="sum">
  <div>${escapeHtml(t('Total receivable'))}<b>${money(filteredTotals.open)}</b></div>
  <div>${escapeHtml(t('Overdue'))}<b>${money(filteredTotals.overdue)}</b></div>
  <div>${escapeHtml(t('Not due yet'))}<b>${money(filteredTotals.buckets.current || 0)}</b></div>
</div>
${legend ? `<div class="legend">${legend}</div>` : ''}
<table><thead><tr><th>#</th><th>${escapeHtml(t('Customer'))}</th><th>${escapeHtml(t('Status'))}</th><th class="num">${escapeHtml(t('Oldest due'))}</th>
${BUCKET_COLUMNS.map((c) => `<th class="num">${escapeHtml(t(c.label))}</th>`).join('')}<th class="num">${escapeHtml(t('Balance'))}</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td colspan="4">${escapeHtml(t('Total'))}</td>${BUCKET_COLUMNS.map((c) => `<td class="num">${money(filteredTotals.buckets[c.key] || 0)}</td>`).join('')}<td class="num">${money(filteredTotals.open)}</td></tr></tfoot>
</table>
<div class="no-print"><button onclick="window.print()">${escapeHtml(t('Print'))}</button></div>
</body></html>`
    openPrintWindowForFormat(html, 'a4')
  }

  if (!board && isFetching) return <Skeleton className='h-[420px] w-full' />
  if (!board) return <p className='py-10 text-center text-muted-foreground'>{t('Could not load the overdue ledgers.')}</p>

  const tiles = [
    { label: 'Total receivable', value: formatMoney(totals?.openAmount || 0), sub: `${totals?.customersOwing || 0} ${t('customers')}`, icon: Wallet, color: '#6366F1' },
    {
      label: 'Overdue',
      value: formatMoney(totals?.overdueAmount || 0),
      sub: `${totals?.overdueCustomers || 0} ${t('customers late')}`,
      icon: AlarmClock,
      color: settings.bands[settings.bands.length - 1]?.color || '#EF4444',
    },
    { label: settings.dueTodayLabel, value: formatMoney(totals?.dueTodayAmount || 0), sub: `${totals?.dueTodayCustomers || 0} ${t('customers')}`, icon: CalendarClock, color: settings.dueTodayColor },
    {
      label: `${settings.dueSoonLabel} (${settings.dueSoonDays}d)`,
      value: formatMoney(totals?.dueSoonAmount || 0),
      sub: `${totals?.dueSoonCustomers || 0} ${t('customers')}`,
      icon: Hourglass,
      color: settings.dueSoonColor,
    },
    { label: 'No due date', value: formatMoney(totals?.noDueDateAmount || 0), sub: t('Not counted as late'), icon: CalendarX2, color: '#94A3B8' },
  ]
  const bandTotal = (totals?.bands || []).reduce((s, b) => s + b.amount, 0)

  return (
    <div className='space-y-5'>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5'>
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <Card key={tile.label} className='overflow-hidden' style={{ borderTop: `3px solid ${tile.color}` }}>
              <CardContent className='p-4'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-xs font-medium text-muted-foreground'>{t(tile.label)}</p>
                  <span className='rounded-md p-1.5' style={{ backgroundColor: hexToRgba(tile.color, 0.14), color: tile.color }}>
                    <Icon className='h-4 w-4' />
                  </span>
                </div>
                <p className='mt-1 text-lg font-bold tabular-nums sm:text-xl'>{tile.value}</p>
                <p className='text-[11px] text-muted-foreground'>{tile.sub}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Overdue amount split by colour band */}
      {bandTotal > 0 ? (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm'>{t('Overdue by colour band')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex h-3 w-full overflow-hidden rounded-full bg-muted'>
              {(totals?.bands || []).map((band) =>
                band.amount > 0 ? (
                  <div
                    key={band.index}
                    className='h-full transition-all'
                    style={{ width: `${(band.amount / bandTotal) * 100}%`, backgroundColor: band.color }}
                    title={`${band.label}: ${formatMoney(band.amount)}`}
                  />
                ) : null
              )}
            </div>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'>
              {(totals?.bands || []).map((band) => (
                <button
                  key={band.index}
                  type='button'
                  onClick={() => setFilter(filter === `band:${band.index}` ? 'all' : `band:${band.index}`)}
                  className={cn('rounded-lg border p-2.5 text-left transition hover:shadow-sm', filter === `band:${band.index}` && 'ring-2')}
                  style={{ backgroundColor: hexToRgba(band.color, 0.08), borderColor: hexToRgba(band.color, 0.4), ...(filter === `band:${band.index}` ? ({ '--tw-ring-color': band.color } as React.CSSProperties) : {}) }}
                >
                  <div className='flex items-center gap-1.5 text-xs font-medium'>
                    <span className='h-2.5 w-2.5 rounded-full' style={{ backgroundColor: band.color }} />
                    {t(band.label)}
                    <span className='ml-auto text-muted-foreground'>{bandRangeText(settings.bands, band.index)}</span>
                  </div>
                  <div className='mt-1 flex items-baseline justify-between'>
                    <span className='text-base font-bold tabular-nums'>{formatMoney(band.amount)}</span>
                    <span className='text-xs text-muted-foreground'>
                      {band.customers} {t('customers')} · {bandTotal ? Math.round((band.amount / bandTotal) * 100) : 0}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className='space-y-3'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <CardTitle>{t('Overdue Ledgers')}</CardTitle>
              <CardDescription>
                {t('Customers who owe, coloured by how late they are. Payments clear the oldest invoices first.')}
              </CardDescription>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button variant='outline' size='sm' onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn('mr-1.5 h-4 w-4', isFetching && 'animate-spin')} />
                {t('Refresh')}
              </Button>
              <Button variant='outline' size='sm' onClick={print}>
                <Printer className='mr-1.5 h-4 w-4' />
                {t('Print')}
              </Button>
            </div>
          </div>
          <div className='flex flex-col gap-2 lg:flex-row lg:items-center'>
            <div className='relative w-full lg:max-w-xs'>
              <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search customers...')} className='pl-8' />
            </div>
            <Select value={scope} onValueChange={(v) => setScope(v as 'late' | 'all')}>
              <SelectTrigger className='w-full lg:w-48'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='late'>{t('Late or due soon')}</SelectItem>
                <SelectItem value='all'>{t('Everyone who owes')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className='w-full lg:w-48'>
                <ArrowDownWideNarrow className='h-4 w-4 text-muted-foreground' />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='late'>{t('Most days late')}</SelectItem>
                <SelectItem value='overdue'>{t('Biggest overdue')}</SelectItem>
                <SelectItem value='balance'>{t('Biggest balance')}</SelectItem>
                <SelectItem value='name'>{t('Name A–Z')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <LedgerColorLegend board={board} filter={filter} onFilterChange={setFilter} />
        </CardHeader>
        <CardContent className='p-0'>
          {rows.length === 0 ? (
            <p className='py-12 text-center text-sm text-muted-foreground'>
              {filter === 'all' && scope === 'late' ? t('Nobody is late — no overdue or soon-due ledgers.') : t('No customers match.')}
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow className='bg-muted/50'>
                    <TableHead>{t('customer')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead className='text-right'>{t('Overdue')}</TableHead>
                    <TableHead>{t('Oldest due')}</TableHead>
                    <TableHead>{t('Next due')}</TableHead>
                    {BUCKET_COLUMNS.map((col) => (
                      <TableHead key={col.key} className='hidden text-right xl:table-cell'>
                        {t(col.label)}
                      </TableHead>
                    ))}
                    <TableHead className='text-right'>{t('Balance')}</TableHead>
                    <TableHead className='w-10' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.customerId}
                      className='cursor-pointer hover:bg-muted/40'
                      style={colors ? rowStyleForTone(toneForCustomer(row, settings), settings) : undefined}
                      onClick={() => navigate({ to: '/accounting', search: { tab: 'customer-ledger', customerId: row.customerId, customerName: row.name } })}
                    >
                      <TableCell>
                        <div className='font-medium'>{reportEntityName(language, row.name, row.nameUrdu)}</div>
                        <div className='text-xs text-muted-foreground'>{row.phone || ''}</div>
                      </TableCell>
                      <TableCell>
                        {colors ? <AgingChip aging={row} settings={settings} /> : null}
                        {!toneForCustomer(row, settings) || !colors ? (
                          <span className='text-xs text-muted-foreground'>{t(statusText(row))}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className='text-right font-semibold tabular-nums'>{row.overdueAmount ? formatMoney(row.overdueAmount) : '—'}</TableCell>
                      <TableCell className='text-sm whitespace-nowrap'>{row.oldestDueDate ? formatAppDate(row.oldestDueDate) : '—'}</TableCell>
                      <TableCell className='text-sm whitespace-nowrap'>
                        {row.nextDueDate ? (
                          <>
                            {formatAppDate(row.nextDueDate)}
                            <span className='block text-[11px] text-muted-foreground tabular-nums'>{formatMoney(row.nextDueAmount)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      {BUCKET_COLUMNS.map((col) => (
                        <TableCell key={col.key} className='hidden text-right tabular-nums xl:table-cell'>
                          {row.buckets[col.key] ? formatMoney(row.buckets[col.key]) : '—'}
                        </TableCell>
                      ))}
                      <TableCell className='text-right font-semibold tabular-nums'>{formatMoney(row.openAmount)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {row.phone || row.whatsapp ? (
                          <WhatsAppSendButton phone={row.phone} whatsapp={row.whatsapp} name={row.name} message={reminderFor(row)} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <TableRow className='bg-muted/40 font-semibold'>
                    <TableCell colSpan={2}>
                      {t('Total')} · {rows.length} {t('customers')}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{formatMoney(filteredTotals.overdue)}</TableCell>
                    <TableCell colSpan={2} />
                    {BUCKET_COLUMNS.map((col) => (
                      <TableCell key={col.key} className='hidden text-right tabular-nums xl:table-cell'>
                        {formatMoney(filteredTotals.buckets[col.key] || 0)}
                      </TableCell>
                    ))}
                    <TableCell className='text-right tabular-nums'>{formatMoney(filteredTotals.open)}</TableCell>
                    <TableCell />
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
})

OverdueLedgersReport.displayName = 'OverdueLedgersReport'
