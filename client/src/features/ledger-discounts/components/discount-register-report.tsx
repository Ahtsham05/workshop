import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { BadgePercent, HandCoins, Printer, Receipt, Scale, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { generateReportHTML } from '@/features/manufacturing/lib/report-print'
import {
  useGetDiscountRegisterQuery,
  type DiscountGroup,
  type DiscountRegisterRow,
  type LedgerDiscountReason,
} from '@/stores/ledgerDiscounts.api'
import { DISCOUNT_REASONS, discountReasonLabel } from '../lib/ledger-discounts'

interface Props {
  startDate: string
  endDate: string
}

type SideFilter = 'all' | 'customer' | 'supplier'

/**
 * Discount Register (Reports → Discounts): every Discount Allowed / Discount Received in the
 * period, why it was given, by whom, and how much of collections it cost — plus the bill-level
 * discounts given on invoices/purchases for context. Server: ledgerDiscount.service getRegister.
 */
export const DiscountRegisterReport = forwardRef<{ exportToExcel: () => void }, Props>(({ startDate, endDate }, ref) => {
  const { t } = useLanguage()
  const fmt = useFormatMoney()
  const currency = useCurrencyMeta().symbol
  const [side, setSide] = useState<SideFilter>('all')
  const [reason, setReason] = useState<'all' | LedgerDiscountReason>('all')
  const [search, setSearch] = useState('')

  const { data, isFetching } = useGetDiscountRegisterQuery(
    { startDate, endDate, side, reason: reason === 'all' ? undefined : reason },
    { refetchOnMountOrArgChange: 30 }
  )

  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: org } = useGetMyOrganizationQuery(undefined)

  // Search filters on screen only, so typing never refetches.
  const rows = useMemo(() => {
    const all = data?.rows ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((r) =>
      [r.partyName, r.partyNameUrdu, r.partyPhone, r.description, r.reference, r.notes, r.createdByName, r.approvalNote]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    )
  }, [data, search])
  const rowsTotal = rows.reduce((s, r) => s + r.amount, 0)

  const sideText = (s: 'customer' | 'supplier') => (s === 'customer' ? t('Allowed') : t('Received'))
  const pct = (n: number | null | undefined) => (n ? `${Math.round(n * 100) / 100}%` : '—')
  const figure = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const exportToExcel = () => {
    if (!data) {
      toast.error(t('No data available to export'))
      return
    }
    const wb = XLSX.utils.book_new()
    const s = data.summary
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { Metric: `Discount allowed to customers (${currency})`, Value: s.allowed.total },
        { Metric: 'Discount allowed — entries', Value: s.allowed.count },
        { Metric: `Collected from customers (${currency})`, Value: s.allowed.collections },
        { Metric: 'Discount as % of amount settled', Value: s.allowed.rateOfCollections },
        { Metric: `Discount received from suppliers (${currency})`, Value: s.received.total },
        { Metric: 'Discount received — entries', Value: s.received.count },
        { Metric: `Paid to suppliers (${currency})`, Value: s.received.payments },
        { Metric: 'Discount as % of amount settled (suppliers)', Value: s.received.rateOfPayments },
        { Metric: `Net (received − allowed) (${currency})`, Value: s.net },
        { Metric: `Bill discounts on sale invoices (${currency})`, Value: s.billDiscounts.sales.total },
        { Metric: `Bill discounts on purchases (${currency})`, Value: s.billDiscounts.purchases.total },
        { Metric: 'Approved over limit', Value: s.allowed.overLimit + s.received.overLimit },
      ]),
      'Summary'
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Date: formatAppDate(new Date(r.date)),
          Type: r.side === 'customer' ? 'Discount Allowed' : 'Discount Received',
          Party: r.partyName,
          Phone: r.partyPhone || '',
          Reason: discountReasonLabel(r.reason),
          [`With payment (${currency})`]: r.paymentAmount ?? '',
          [`Discount (${currency})`]: r.amount,
          '%': r.percent ?? '',
          [`Settled (${currency})`]: r.settledAmount ?? '',
          'Over limit': r.overLimit ? 'Yes' : '',
          'Approval note': r.approvalNote || '',
          Note: r.notes || '',
          Description: r.description || '',
          By: r.createdByName || '',
        }))
      ),
      'Register'
    )
    const groupSheet = (list: DiscountGroup[], name: string, keyLabel: string) =>
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          list.map((g) => ({
            [keyLabel]: name === 'By Reason' ? discountReasonLabel(g.key) : g.label,
            Entries: g.count,
            [`Allowed (${currency})`]: g.allowed,
            [`Received (${currency})`]: g.received,
            [`Total (${currency})`]: g.amount,
          }))
        ),
        name
      )
    groupSheet(data.byReason ?? [], 'By Reason', 'Reason')
    groupSheet(data.byParty ?? [], 'By Party', 'Party')
    groupSheet(data.byUser ?? [], 'By User', 'User')
    groupSheet(data.byMonth ?? [], 'By Month', 'Month')
    XLSX.writeFile(wb, `discount-register-${startDate}-to-${endDate}.xlsx`)
    toast.success(t('Data exported successfully'))
  }

  useImperativeHandle(ref, () => ({ exportToExcel }))

  const print = () => {
    if (!data) return
    const s = data.summary
    const showAllowed = side !== 'supplier'
    const showReceived = side !== 'customer'
    try {
      openPrintWindowForFormat(
        generateReportHTML(
          {
            title: t('Discount Register'),
            subtitle: side === 'all' ? t('Discount Allowed & Discount Received') : side === 'customer' ? t('Discount Allowed (customers)') : t('Discount Received (suppliers)'),
            periodStart: startDate,
            periodEnd: endDate,
            orientation: 'landscape',
            info: [
              ...(reason !== 'all' ? [{ label: t('Reason'), value: discountReasonLabel(reason, t) }] : []),
              ...(search.trim() ? [{ label: t('Search'), value: search.trim() }] : []),
              { label: t('Entries'), value: String(rows.length) },
            ],
            summary: [
              ...(showAllowed
                ? [{ label: `${t('Discount allowed')} (${currency})`, value: figure(s.allowed.total), hint: `${s.allowed.count} · ${pct(s.allowed.rateOfCollections)} ${t('of settled')}` }]
                : []),
              ...(showReceived
                ? [{ label: `${t('Discount received')} (${currency})`, value: figure(s.received.total), hint: `${s.received.count} · ${pct(s.received.rateOfPayments)} ${t('of settled')}` }]
                : []),
              ...(side === 'all' ? [{ label: `${t('Net (received − allowed)')} (${currency})`, value: figure(s.net), emphasis: true }] : []),
            ],
            sections: [
              {
                id: 'register',
                title: t('Register'),
                columns: [
                  { key: 'date', label: t('Date'), nowrap: true, width: '9%' },
                  { key: 'type', label: t('Type'), width: '9%' },
                  { key: 'party', label: t('Party'), width: '18%' },
                  { key: 'reason', label: t('Reason'), width: '14%' },
                  { key: 'payment', label: `${t('With payment')} (${currency})`, align: 'right' },
                  { key: 'amount', label: `${t('Discount')} (${currency})`, align: 'right' },
                  { key: 'pct', label: '%', align: 'right', width: '6%' },
                  { key: 'settled', label: `${t('Settled')} (${currency})`, align: 'right' },
                  { key: 'by', label: t('By'), width: '10%' },
                ],
                rows: [
                  ...rows.map((r) => ({
                    cells: {
                      date: formatAppDate(new Date(r.date)),
                      type: sideText(r.side),
                      party: { text: r.partyName, sub: r.approvalNote ? `${t('Approved')}: ${r.approvalNote}` : r.notes || undefined },
                      reason: { text: discountReasonLabel(r.reason, t), sub: r.overLimit ? t('Over limit') : undefined },
                      payment: r.paymentAmount ? figure(r.paymentAmount) : '',
                      amount: { text: figure(r.amount), strong: true },
                      pct: pct(r.percent),
                      settled: r.settledAmount ? figure(r.settledAmount) : '',
                      by: r.createdByName || '',
                    },
                  })),
                  { kind: 'total' as const, label: t('Total'), labelSpan: 5, cells: { amount: { text: figure(rowsTotal), strong: true } } },
                ],
                empty: t('No discounts in this period.'),
              },
              {
                id: 'by-reason',
                title: t('By reason'),
                columns: [
                  { key: 'reason', label: t('Reason') },
                  { key: 'count', label: t('Entries'), align: 'right' },
                  { key: 'allowed', label: `${t('Allowed')} (${currency})`, align: 'right' },
                  { key: 'received', label: `${t('Received')} (${currency})`, align: 'right' },
                ],
                rows: (data.byReason ?? []).map((g) => ({
                  cells: { reason: discountReasonLabel(g.key, t), count: String(g.count), allowed: g.allowed ? figure(g.allowed) : '', received: g.received ? figure(g.received) : '' },
                })),
              },
            ],
            footnotes: [
              t('Ledger discounts move no cash: they lower the balance and settle open invoices oldest first.'),
              `${t('Bill discounts given on sale invoices in the period')}: ${figure(s.billDiscounts.sales.total)} · ${t('on purchases')}: ${figure(s.billDiscounts.purchases.total)}`,
            ],
          },
          {
            companyName: resolveBranchCompanyName(org?.name, branch?.name) || org?.name,
            companyAddress: [branch?.location?.address, branch?.location?.city].filter(Boolean).join(', '),
            companyPhone: branch?.phone,
            companyLogo: org?.logo?.url,
            branchName: branch?.name,
            preparedBy: user?.name,
          },
          t
        ),
        'a4'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not open the print window'))
    }
  }

  const s = data?.summary

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='flex overflow-hidden rounded-md border'>
          {(['all', 'customer', 'supplier'] as const).map((v) => (
            <button
              key={v}
              type='button'
              onClick={() => setSide(v)}
              className={cn('px-3 py-1.5 text-sm', side === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {v === 'all' ? t('All') : v === 'customer' ? t('Customers (allowed)') : t('Suppliers (received)')}
            </button>
          ))}
        </div>
        <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
          <SelectTrigger className='w-full sm:w-56'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All reasons')}</SelectItem>
            {DISCOUNT_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {t(r.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search party, note, user…')} className='w-full sm:w-64' />
        <Button variant='outline' size='sm' onClick={print} disabled={!data} className='sm:ml-auto'>
          <Printer className='mr-2 h-4 w-4' />
          {t('Print')}
        </Button>
      </div>

      {isFetching && !data ? (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-28' />
          ))}
        </div>
      ) : s ? (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <Kpi
            tone='amber'
            icon={<BadgePercent className='h-5 w-5' />}
            label={t('Discount allowed (customers)')}
            value={fmt(s.allowed.total)}
            sub={`${s.allowed.count} ${t('entries')} · ${pct(s.allowed.rateOfCollections)} ${t('of amount settled')}`}
          />
          <Kpi
            tone='emerald'
            icon={<HandCoins className='h-5 w-5' />}
            label={t('Discount received (suppliers)')}
            value={fmt(s.received.total)}
            sub={`${s.received.count} ${t('entries')} · ${pct(s.received.rateOfPayments)} ${t('of amount settled')}`}
          />
          <Kpi
            tone={s.net >= 0 ? 'sky' : 'rose'}
            icon={<Scale className='h-5 w-5' />}
            label={t('Net effect on profit')}
            value={`${s.net >= 0 ? '+' : '−'}${fmt(Math.abs(s.net))}`}
            sub={t('Received − allowed (ledger discounts)')}
          />
          <Kpi
            tone='violet'
            icon={<Receipt className='h-5 w-5' />}
            label={t('Bill discounts (on invoices)')}
            value={fmt(s.billDiscounts.sales.total)}
            sub={`${t('Sales')}: ${s.billDiscounts.sales.invoices} · ${t('Purchases')}: ${fmt(s.billDiscounts.purchases.total)}`}
          />
        </div>
      ) : null}

      {s && s.allowed.overLimit + s.received.overLimit > 0 ? (
        <div className='flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300'>
          <ShieldAlert className='h-4 w-4 shrink-0' />
          {s.allowed.overLimit + s.received.overLimit} {t('discount(s) in this period were approved above the limit — marked in the register below.')}
        </div>
      ) : null}

      {data && (
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
          <GroupCard title={t('By reason')} groups={data.byReason ?? []} labelOf={(g) => discountReasonLabel(g.key, t)} fmt={fmt} t={t} />
          <GroupCard title={t('Top parties')} groups={(data.byParty ?? []).slice(0, 10)} labelOf={(g) => `${g.label}`} fmt={fmt} t={t} showSide />
          <GroupCard title={t('By user')} groups={data.byUser ?? []} labelOf={(g) => g.label} fmt={fmt} t={t} />
        </div>
      )}

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>{t('Discount Register')}</CardTitle>
          <CardDescription>
            {t('Every ledger discount in the period. No cash moves — the balance goes down and open invoices are settled oldest first.')}
          </CardDescription>
        </CardHeader>
        <CardContent className='px-0 sm:px-6'>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Type')}</TableHead>
                  <TableHead className='min-w-[160px]'>{t('Party')}</TableHead>
                  <TableHead>{t('Reason')}</TableHead>
                  <TableHead className='text-right'>{t('With payment')}</TableHead>
                  <TableHead className='text-right'>{t('Discount')}</TableHead>
                  <TableHead className='text-right'>%</TableHead>
                  <TableHead className='text-right'>{t('Settled')}</TableHead>
                  <TableHead>{t('By')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className='py-10 text-center text-sm text-muted-foreground'>
                      {isFetching ? t('Loading...') : t('No discounts in this period.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => <RegisterRow key={r.id} row={r} fmt={fmt} t={t} pct={pct} sideText={sideText} />)
                )}
              </TableBody>
              {rows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className='font-semibold'>
                      {t('Total')} ({rows.length})
                    </TableCell>
                    <TableCell className='text-right font-bold tabular-nums'>{fmt(rowsTotal)}</TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})
DiscountRegisterReport.displayName = 'DiscountRegisterReport'

function Kpi({ tone, icon, label, value, sub }: { tone: 'amber' | 'emerald' | 'sky' | 'rose' | 'violet'; icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card className={kpiCardClass(tone)}>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className={toneIconWrapClass(tone)}>{icon}</div>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='text-xl font-bold tabular-nums'>{value}</p>
          <p className='truncate text-xs text-muted-foreground' title={sub}>
            {sub}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function GroupCard({
  title,
  groups,
  labelOf,
  fmt,
  t,
  showSide,
}: {
  title: string
  groups: DiscountGroup[]
  labelOf: (g: DiscountGroup) => string
  fmt: (n: number) => string
  t: (k: string) => string
  showSide?: boolean
}) {
  const max = Math.max(1, ...groups.map((g) => g.amount))
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm'>{title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-2'>
        {groups.length === 0 ? (
          <p className='py-4 text-center text-xs text-muted-foreground'>{t('Nothing yet')}</p>
        ) : (
          groups.map((g) => (
            <div key={g.key} className='space-y-1'>
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='min-w-0 truncate'>
                  {labelOf(g)}
                  {showSide && g.side ? (
                    <span className='ml-1.5 text-xs text-muted-foreground'>{g.side === 'customer' ? t('customer') : t('supplier')}</span>
                  ) : null}
                </span>
                <span className='shrink-0 font-semibold tabular-nums'>{fmt(g.amount)}</span>
              </div>
              <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
                <div className='h-full rounded-full bg-amber-500' style={{ width: `${Math.max(3, (g.amount / max) * 100)}%` }} />
              </div>
              <p className='text-[11px] text-muted-foreground'>
                {g.count} {t('entries')}
                {g.allowed && g.received ? ` · ${t('allowed')} ${fmt(g.allowed)} · ${t('received')} ${fmt(g.received)}` : ''}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function RegisterRow({
  row,
  fmt,
  t,
  pct,
  sideText,
}: {
  row: DiscountRegisterRow
  fmt: (n: number) => string
  t: (k: string) => string
  pct: (n: number | null | undefined) => string
  sideText: (s: 'customer' | 'supplier') => string
}) {
  return (
    <TableRow className={cn(row.overLimit && 'bg-orange-50/60 dark:bg-orange-950/20')}>
      <TableCell className='whitespace-nowrap text-sm tabular-nums'>{formatAppDate(new Date(row.date))}</TableCell>
      <TableCell>
        <Badge variant='outline' className={row.side === 'customer' ? 'border-amber-400 text-amber-700' : 'border-emerald-400 text-emerald-700'}>
          {sideText(row.side)}
        </Badge>
      </TableCell>
      <TableCell className='text-sm'>
        <div className='font-medium'>{row.partyName}</div>
        {row.notes ? <div className='max-w-[260px] truncate text-xs text-muted-foreground' title={row.notes}>{row.notes}</div> : null}
      </TableCell>
      <TableCell className='text-sm'>
        {discountReasonLabel(row.reason, t)}
        {row.overLimit ? (
          <div className='text-xs font-medium text-orange-700 dark:text-orange-400' title={row.approvalNote || ''}>
            {t('Approved over limit')}
            {row.approvalNote ? `: ${row.approvalNote}` : ''}
          </div>
        ) : null}
      </TableCell>
      <TableCell className='text-right text-sm tabular-nums'>{row.paymentAmount ? fmt(row.paymentAmount) : '—'}</TableCell>
      <TableCell className='text-right font-semibold tabular-nums'>{fmt(row.amount)}</TableCell>
      <TableCell className='text-right text-sm tabular-nums'>{pct(row.percent)}</TableCell>
      <TableCell className='text-right text-sm tabular-nums'>{row.settledAmount ? fmt(row.settledAmount) : '—'}</TableCell>
      <TableCell className='text-sm text-muted-foreground'>{row.createdByName || '—'}</TableCell>
    </TableRow>
  )
}
