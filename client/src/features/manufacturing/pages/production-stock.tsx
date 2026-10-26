import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ClipboardCheck,
  PackagePlus,
  Settings2,
  Undo2,
  Warehouse,
} from 'lucide-react'
import {
  useGetFloorOverviewQuery,
  useGetFloorVoucherQuery,
  useGetFloorVouchersQuery,
  type FloorOverviewRow,
  type FloorVoucher,
  type FloorVoucherKind,
} from '@/stores/manufacturing.api'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { formatAppDate } from '@/lib/date-format'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  getStoredLedgerPeriod,
  LEDGER_PERIOD_PRESETS,
  resolveLedgerPeriod,
  storeLedgerPeriod,
  type LedgerPeriod,
} from '@/features/accounting/utils/ledger-period'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FloorMaterialsSheet } from '../components/floor-materials-sheet'
import {
  FLOOR_MOVE_META,
  FLOOR_VOUCHER_LABELS,
  FloorMaterialSheet,
  FloorVoucherSheet,
} from '../components/floor-stock-sheets'
import { FloorVoucherDialog } from '../components/floor-voucher-dialog'
import { FilterChips, SearchField } from '../components/list-controls'
import { EmptyState, PageHeader, Stat, StatGrid } from '../components/page'
import { Pager } from '../components/pager'
import { fmtQty } from '../lib/constants'
import { useFormatMoney } from '../lib/use-mfg-money'

/*
 * Production stock — packing material (cartons, labels, bottles …) that the store hands
 * to the production floor in bulk, shared by every finished good, and used from there
 * automatically when finished goods are received or packed. Per material:
 *
 *   opening + issued − used − returned ± count difference = in production now
 *
 * Server: services/manufacturing/floorStock.service.js
 */

const PERIOD_KEY = 'mfg-floor-period'
const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(
    new Date()
  )

type Dialog =
  | { mode: FloorVoucherKind; productId?: string }
  | null

export default function ProductionStockPage() {
  const { t } = useLanguage()
  const { hasPermission, hasAnyPermission } = usePermissions()
  const canIssue = hasPermission('issueMaterials')
  const canCount = hasPermission('manageProductionOrders')
  const canSetUp = hasAnyPermission('manageBoms', 'editProducts')
  const canSeeCosts = useCanViewManufacturingCosts()
  const formatMoney = useFormatMoney()

  const [period, setPeriod] = useState<LedgerPeriod>(() =>
    getStoredLedgerPeriod(PERIOD_KEY)
  )
  const changePeriod = (next: LedgerPeriod) => {
    setPeriod(next)
    storeLedgerPeriod(PERIOD_KEY, next)
  }
  const range = { dateFrom: period.startDate, dateTo: period.endDate }
  const endsToday = period.endDate >= todayKey()

  const [tab, setTab] = useState<'balance' | 'vouchers'>('balance')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [materialId, setMaterialId] = useState<string | null>(null)
  const [voucherId, setVoucherId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useGetFloorOverviewQuery(range)
  const rows = data?.rows || []
  const totals = data?.totals
  const hasMaterials = rows.length > 0

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Production Stock')}
        description={t(
          'Packing material issued to production in bulk — how much was issued, which finished goods used it, and how much is still on the floor.'
        )}
        actions={
          <>
            {canSetUp && (
              <Button variant='outline' size='sm' onClick={() => setSetupOpen(true)}>
                <Settings2 className='h-4 w-4' />
                {t('Materials')}
              </Button>
            )}
            {hasMaterials && canCount && (
              <Button variant='outline' size='sm' onClick={() => setDialog({ mode: 'count' })}>
                <ClipboardCheck className='h-4 w-4' />
                {t('Count')}
              </Button>
            )}
            {hasMaterials && canIssue && (
              <Button variant='outline' size='sm' onClick={() => setDialog({ mode: 'return' })}>
                <Undo2 className='h-4 w-4' />
                {t('Return')}
              </Button>
            )}
            {hasMaterials && canIssue && (
              <Button size='sm' onClick={() => setDialog({ mode: 'issue' })}>
                <PackagePlus className='h-4 w-4' />
                {t('Issue to production')}
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <Skeleton className='h-64 w-full rounded-xl' />
      ) : !hasMaterials ? (
        <HowItWorks canSetUp={canSetUp} onSetUp={() => setSetupOpen(true)} />
      ) : (
        <>
          <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
            <FilterChips
              label={t('Period')}
              value={period.preset}
              onChange={(v) =>
                changePeriod(
                  resolveLedgerPeriod(v as Exclude<LedgerPeriod['preset'], 'custom'>)
                )
              }
              options={[
                ...LEDGER_PERIOD_PRESETS.map((p) => ({ value: p.value, label: t(p.label) })),
                ...(period.preset === 'custom' ? [{ value: 'custom', label: t('Custom') }] : []),
              ]}
            />
            <div className='grid grid-cols-2 gap-2 sm:w-[22rem]'>
              {(['startDate', 'endDate'] as const).map((field) => (
                <div key={field} className='min-w-0 space-y-1'>
                  <Label className='text-muted-foreground text-xs'>
                    {field === 'startDate' ? t('From') : t('To')}
                  </Label>
                  <Input
                    type='date'
                    value={period[field]}
                    onChange={(e) => {
                      const value = e.target.value
                      if (!value) return
                      const next = { ...period, preset: 'custom' as const, [field]: value }
                      if (next.startDate > next.endDate) {
                        if (field === 'startDate') next.endDate = value
                        else next.startDate = value
                      }
                      changePeriod(next)
                    }}
                    className='h-9'
                  />
                </div>
              ))}
            </div>
          </div>

          {totals && (
            <StatGrid className='md:grid-cols-4'>
              <Stat
                label={t('Materials in production stock')}
                value={rows.filter((r) => r.inProduction > 0).length}
                hint={
                  canSeeCosts && totals.inProductionValue != null
                    ? `${t('Worth')} ${formatMoney(totals.inProductionValue)}`
                    : `${t('of')} ${totals.materials} ${t('materials')}`
                }
              />
              <Stat
                label={t('Short for open orders')}
                value={totals.short}
                tone='warning'
                active={totals.short > 0}
                hint={
                  totals.short > 0
                    ? t('Issue more before the next receipt')
                    : t('Floor covers every open order')
                }
              />
              <Stat
                label={t('Auto-issued in period')}
                value={rows.filter((r) => r.autoIssued > 0).length}
                tone='warning'
                active={totals.autoIssued > 0}
                hint={t('Receipts that found the floor short')}
              />
              <Stat
                label={t('Wastage in period')}
                value={rows.filter((r) => r.countDiff < 0).length}
                tone='danger'
                active={totals.wastage > 0}
                hint={t('Materials counted short')}
              />
            </StatGrid>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value='balance'>{t('Balance')}</TabsTrigger>
              <TabsTrigger value='vouchers'>{t('Vouchers')}</TabsTrigger>
            </TabsList>
            <TabsContent value='balance' className='mt-4'>
              <BalanceTable
                rows={rows}
                endsToday={endsToday}
                fetching={isFetching}
                onOpen={setMaterialId}
              />
            </TabsContent>
            <TabsContent value='vouchers' className='mt-4'>
              <VouchersList range={range} onOpen={setVoucherId} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {dialog && (
        <FloorVoucherDialog
          mode={dialog.mode}
          productId={dialog.productId}
          onClose={() => setDialog(null)}
        />
      )}
      {setupOpen && <FloorMaterialsSheet onClose={() => setSetupOpen(false)} />}
      {materialId && (
        <FloorMaterialSheet
          productId={materialId}
          period={range}
          onAction={(mode, productId) => setDialog({ mode, productId })}
          onOpenVoucher={setVoucherId}
          onClose={() => setMaterialId(null)}
        />
      )}
      {voucherId && (
        <VoucherById key={voucherId} id={voucherId} onClose={() => setVoucherId(null)} />
      )}
    </div>
  )
}

/* ── First run ───────────────────────────────────────────────────────────────── */

function HowItWorks({
  canSetUp,
  onSetUp,
}: {
  canSetUp: boolean
  onSetUp: () => void
}) {
  const { t } = useLanguage()
  const steps = [
    {
      title: t('Choose the materials'),
      text: t('Cartons, labels, bottles, bags — anything the store hands to production in bulk and many products share.'),
    },
    {
      title: t('Issue them in bulk'),
      text: t('“Issue to production” moves them from the store to production stock. No order needed.'),
    },
    {
      title: t('Production uses them automatically'),
      text: t('Receiving or packing finished goods takes the BOM / pack-size quantity from production stock, oldest first.'),
    },
    {
      title: t('Count and reconcile'),
      text: t('Issued − used − returned = what should be on the floor. A count shows the wastage.'),
    },
  ]
  return (
    <div className='rounded-xl border border-dashed p-6'>
      <div className='mx-auto max-w-3xl space-y-5'>
        <div className='flex items-center gap-3'>
          <span className='bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'>
            <Warehouse className='h-5 w-5' />
          </span>
          <div>
            <p className='font-medium'>{t('No materials in production stock yet')}</p>
            <p className='text-muted-foreground text-sm'>
              {t('Set it up once — then nobody issues packing material per order again.')}
            </p>
          </div>
        </div>
        <ol className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          {steps.map((s, i) => (
            <li key={s.title} className='bg-card flex gap-3 rounded-lg border p-3'>
              <span className='bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                {i + 1}
              </span>
              <div className='min-w-0'>
                <p className='text-sm font-medium'>{s.title}</p>
                <p className='text-muted-foreground text-xs'>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {canSetUp && (
          <Button onClick={onSetUp}>
            <Settings2 className='h-4 w-4' />
            {t('Choose materials')}
            <ArrowRight className='h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  )
}

/* ── Balance ─────────────────────────────────────────────────────────────────── */

function BalanceTable({
  rows,
  endsToday,
  fetching,
  onOpen,
}: {
  rows: FloorOverviewRow[]
  endsToday: boolean
  fetching: boolean
  onOpen: (productId: string) => void
}) {
  const { t } = useLanguage()
  const [show, setShow] = useState<'all' | 'stock' | 'short' | 'used'>('all')
  const [search, setSearch] = useState('')
  const short = (r: FloorOverviewRow) => r.isFloor && r.openOrderNeed > r.inProduction + 1e-6
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (show === 'all' ||
          (show === 'stock' && r.inProduction > 0) ||
          (show === 'short' && short(r)) ||
          (show === 'used' && r.used > 0)) &&
        (!q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
    )
  }, [rows, show, search])

  const num = (v: number, opts: { sign?: boolean; muted?: boolean } = {}) =>
    Math.abs(v) < 1e-9 ? (
      <span className='text-muted-foreground/60'>—</span>
    ) : (
      <span className={cn(opts.muted && 'text-muted-foreground')}>
        {opts.sign ? `${v > 0 ? '+' : '−'}${fmtQty(Math.abs(v))}` : fmtQty(v)}
      </span>
    )

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <FilterChips
          label={t('Show')}
          value={show}
          onChange={(v) => setShow(v as typeof show)}
          options={[
            { value: 'all', label: t('All') },
            { value: 'stock', label: t('On the floor') },
            { value: 'used', label: t('Used in period') },
            { value: 'short', label: `${t('Short')} (${rows.filter(short).length})` },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder={t('Search material')} />
      </div>
      {visible.length === 0 ? (
        <EmptyState icon={Warehouse} title={t('No materials match')} />
      ) : (
        <div className={cn('bg-card overflow-x-auto rounded-xl border', fetching && 'opacity-70')}>
          <table className='w-full min-w-[920px] text-sm'>
            <thead className='bg-muted/50 text-muted-foreground text-xs'>
              <tr className='text-right'>
                <th className='px-3 py-2 text-left font-medium'>{t('Material')}</th>
                <th className='px-3 py-2 font-medium'>{t('Opening')}</th>
                <th className='px-3 py-2 font-medium'>{t('Issued')}</th>
                <th className='px-3 py-2 font-medium'>{t('Used')}</th>
                <th className='px-3 py-2 font-medium'>{t('Returned')}</th>
                <th className='px-3 py-2 font-medium'>{t('Count ±')}</th>
                {!endsToday && <th className='px-3 py-2 font-medium'>{t('Closing')}</th>}
                <th className='bg-muted/60 text-foreground px-3 py-2 font-semibold'>
                  {t('In production now')}
                </th>
                <th className='px-3 py-2 font-medium'>{t('Open orders need')}</th>
                <th className='px-3 py-2 font-medium'>{t('In store')}</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {visible.map((r) => {
                const u = getUnitLabel(r.unit)
                const isShort = short(r)
                return (
                  <tr
                    key={r.productId}
                    className='hover:bg-muted/40 cursor-pointer text-right tabular-nums'
                    onClick={() => onOpen(r.productId)}
                  >
                    <td className='max-w-[18rem] px-3 py-2 text-left'>
                      <div className='flex items-center gap-2'>
                        <span className='truncate font-medium'>{r.name}</span>
                        {!r.isFloor && (
                          <Badge variant='outline' className='text-muted-foreground shrink-0 font-normal'>
                            {t('off')}
                          </Badge>
                        )}
                      </div>
                      <div className='text-muted-foreground truncate text-xs'>
                        {r.usedFor.length > 0
                          ? `${t('Used in')}: ${r.usedFor
                              .slice(0, 2)
                              .map((x) => `${x.name} ${fmtQty(x.quantity)}`)
                              .join(' · ')}${r.usedFor.length > 2 ? ` +${r.usedFor.length - 2}` : ''}`
                          : [r.sku, u].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className='px-3 py-2'>{num(r.opening, { muted: true })}</td>
                    <td className='px-3 py-2'>
                      {num(r.issued)}
                      {r.autoIssued > 0 && (
                        <div className='text-[11px] text-amber-600 dark:text-amber-400'>
                          {fmtQty(r.autoIssued)} {t('auto')}
                        </div>
                      )}
                    </td>
                    <td className='px-3 py-2'>{num(r.used)}</td>
                    <td className='px-3 py-2'>{num(r.returned, { muted: true })}</td>
                    <td
                      className={cn(
                        'px-3 py-2',
                        r.countDiff < 0 && 'text-rose-600 dark:text-rose-400',
                        r.countDiff > 0 && 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {num(r.countDiff, { sign: true })}
                    </td>
                    {!endsToday && <td className='px-3 py-2'>{num(r.closing)}</td>}
                    <td className='bg-muted/30 px-3 py-2 font-semibold'>
                      {fmtQty(r.inProduction)}
                      <span className='text-muted-foreground ml-1 text-xs font-normal'>{u}</span>
                    </td>
                    <td className={cn('px-3 py-2', isShort && 'text-amber-600 dark:text-amber-400')}>
                      {num(r.openOrderNeed)}
                      {isShort && (
                        <div className='text-[11px]'>
                          {t('short')} {fmtQty(r.openOrderNeed - r.inProduction)}
                        </div>
                      )}
                    </td>
                    <td className='text-muted-foreground px-3 py-2'>{fmtQty(r.storeQuantity)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className='text-muted-foreground text-xs'>
        {t('Opening + Issued − Used − Returned ± Count = what is in production. “Used” is taken automatically when finished goods are received or packed; “auto” is what was issued from the store on the spot because the floor was short.')}
      </p>
    </div>
  )
}

/* ── Vouchers ────────────────────────────────────────────────────────────────── */

function VouchersList({
  range,
  onOpen,
}: {
  range: { dateFrom: string; dateTo: string }
  onOpen: (id: string) => void
}) {
  const { t } = useLanguage()
  const [kind, setKind] = useState<FloorVoucherKind | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search, 300)
  useEffect(() => setPage(1), [kind, debounced, range.dateFrom, range.dateTo])
  const { data, isLoading, isFetching } = useGetFloorVouchersQuery({
    ...range,
    kind,
    search: debounced.trim() || undefined,
    page,
    limit: 25,
  })
  const vouchers = data?.results || []

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <FilterChips
          label={t('Type')}
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          options={[
            { value: 'all', label: t('All') },
            { value: 'issue', label: t('Issues') },
            { value: 'return', label: t('Returns') },
            { value: 'count', label: t('Counts') },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder={t('Search voucher or material')} />
      </div>
      {isLoading ? (
        <Skeleton className='h-40 w-full rounded-xl' />
      ) : vouchers.length === 0 ? (
        <EmptyState icon={Warehouse} title={t('No vouchers in this period')} />
      ) : (
        <div className={cn('bg-card overflow-x-auto rounded-xl border', isFetching && 'opacity-70')}>
          <table className='w-full min-w-[640px] text-sm'>
            <thead className='bg-muted/50 text-muted-foreground text-xs'>
              <tr className='text-left'>
                <th className='px-3 py-2 font-medium'>{t('Date')}</th>
                <th className='px-3 py-2 font-medium'>{t('Voucher')}</th>
                <th className='px-3 py-2 font-medium'>{t('Materials')}</th>
                <th className='px-3 py-2 font-medium'>{t('By')}</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {vouchers.map((v) => (
                <VoucherRow key={v.id} voucher={v} onOpen={() => onOpen(v.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager data={data} page={page} onPageChange={setPage} />
    </div>
  )
}

function VoucherRow({ voucher: v, onOpen }: { voucher: FloorVoucher; onOpen: () => void }) {
  const { t } = useLanguage()
  const cancelled = v.status === 'cancelled'
  const meta = FLOOR_MOVE_META[v.kind === 'issue' && v.auto ? 'auto_issue' : v.kind]
  return (
    <tr
      className={cn('hover:bg-muted/40 cursor-pointer', cancelled && 'text-muted-foreground')}
      onClick={onOpen}
    >
      <td className='px-3 py-2 whitespace-nowrap'>{formatAppDate(new Date(v.voucherDate))}</td>
      <td className='px-3 py-2 whitespace-nowrap'>
        <span className={cn('font-mono font-medium', cancelled && 'line-through')}>
          {v.voucherNumber}
        </span>
        <Badge variant='outline' className={cn('ml-2', meta.className)}>
          {v.auto ? t('Auto-issued') : t(FLOOR_VOUCHER_LABELS[v.kind])}
        </Badge>
        {cancelled && (
          <Badge variant='outline' className='ml-1 border-rose-500/40 text-rose-600'>
            {t('Cancelled')}
          </Badge>
        )}
      </td>
      <td className='px-3 py-2'>
        {v.lines
          .slice(0, 3)
          .map((l) =>
            v.kind === 'count'
              ? `${l.productName} ${Math.abs(l.quantity) < 1e-9 ? '✓' : `${l.quantity > 0 ? '+' : '−'}${fmtQty(Math.abs(l.quantity))}`}`
              : `${fmtQty(l.quantity)} ${getUnitLabel(l.unit)} ${l.productName}`
          )
          .join(' · ')}
        {v.lines.length > 3 ? ` +${v.lines.length - 3}` : ''}
        {v.auto && v.source?.number && (
          <span className='text-muted-foreground ml-1 text-xs'>
            ({t('for')} {v.source.number})
          </span>
        )}
      </td>
      <td className='text-muted-foreground px-3 py-2 text-xs whitespace-nowrap'>
        {v.createdByName || '—'}
      </td>
    </tr>
  )
}

function VoucherById({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useGetFloorVoucherQuery(id)
  if (!data) return null
  return <FloorVoucherSheet voucher={data} onClose={onClose} />
}
