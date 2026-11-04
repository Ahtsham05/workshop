import { Fragment, useState } from 'react';
import { AlertCircle, ArrowDownLeft, CalendarClock, ChevronDown, ChevronRight, Equal, History, Minus, Plus, Sigma, Wallet } from 'lucide-react';
import { useFormatMoney } from '@/lib/format-money';

/** See server/src/services/feePosition.service.js for how these figures are defined. */
export type FeeFigures = {
  previousDue: number;
  previousPending: number;
  previousReceived: number;
  currentFee: number;
  currentReceived: number;
  currentPending: number;
  laterPending: number;
  totalExpected: number;
  totalReceived: number;
  totalPending: number;
  collectionRate: number;
};

export type FeeHead = FeeFigures & { name: string };
export type FeeSummary = FeeFigures & { advanceCredit?: number };

type Tile = {
  label: string;
  value: number;
  detail: string[];
  icon: typeof History;
  tone: string;
  operator?: typeof Plus;
};

/** "Previous + This Month = Total Expected − Received = Total Pending", as a row of tiles. */
export function FeePositionCards({ summary, month, isLoading }: { summary?: FeeSummary; month: string; isLoading?: boolean }) {
  const formatMoney = useFormatMoney();
  const s = summary;
  const shortMonth = month.slice(0, 3);

  const tiles: Tile[] = [
    {
      label: 'Previous Pending',
      value: s?.previousDue || 0,
      detail: (s?.previousReceived || 0) > 0
        ? [`${formatMoney(s?.previousPending || 0)} still unpaid`, `${formatMoney(s?.previousReceived || 0)} recovered`]
        : ['From earlier months'],
      icon: History,
      tone: 'text-amber-600',
    },
    {
      label: `${month} Fee`,
      value: s?.currentFee || 0,
      detail: ['Billed for this month'],
      icon: CalendarClock,
      tone: 'text-blue-600',
      operator: Plus,
    },
    {
      label: 'Total Expected',
      value: s?.totalExpected || 0,
      detail: [`Previous + ${shortMonth}`],
      icon: Sigma,
      tone: 'text-purple-600',
      operator: Equal,
    },
    {
      label: 'Received',
      value: s?.totalReceived || 0,
      detail: [`Previous ${formatMoney(s?.previousReceived || 0)}`, `${shortMonth} ${formatMoney(s?.currentReceived || 0)}`],
      icon: ArrowDownLeft,
      tone: 'text-emerald-600',
      operator: Minus,
    },
    {
      label: 'Total Pending',
      value: s?.totalPending || 0,
      detail: [`Previous ${formatMoney(s?.previousPending || 0)}`, `${shortMonth} ${formatMoney(s?.currentPending || 0)}`],
      icon: AlertCircle,
      tone: 'text-red-600',
      operator: Equal,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map(({ label, value, detail, icon: Icon, tone, operator: Operator }, i) => (
          <div
            key={label}
            className={`relative min-w-0 rounded-lg border bg-card px-3 py-3 ${i === tiles.length - 1 ? 'col-span-2 lg:col-span-1 border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : ''}`}
          >
            {Operator && (
              <span className="absolute -left-[17px] top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground lg:flex" aria-hidden>
                <Operator className="h-3 w-3" />
              </span>
            )}
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} /> <span className="truncate">{label}</span>
            </p>
            {isLoading ? (
              <div className="mt-1.5 h-6 w-24 max-w-full animate-pulse rounded bg-muted" />
            ) : (
              <>
                <p className={`mt-1 text-base font-bold tabular-nums [overflow-wrap:anywhere] sm:text-lg ${tone}`}>{formatMoney(value)}</p>
                {detail.map((line) => (
                  <p key={line} className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{line}</p>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      {!isLoading && s && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Collection rate <strong className="text-foreground">{s.collectionRate}%</strong>
          </span>
          {(s.advanceCredit || 0) > 0 && (
            <span className="flex items-center gap-1">
              <Wallet className="h-3 w-3 text-teal-600" /> Advance wallet <strong className="text-foreground">{formatMoney(s.advanceCredit || 0)}</strong>
            </span>
          )}
          {s.laterPending > 0 && (
            <span>
              Later months <strong className="text-foreground">{formatMoney(s.laterPending)}</strong> (billed in advance, not counted above)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** One row per fee type (Tuition, Paper Fund, Fine…), so no fee is hidden inside another. */
export function FeeHeadsTable({ heads, summary, month, isLoading }: { heads?: FeeHead[]; summary?: FeeSummary; month: string; isLoading?: boolean }) {
  const formatMoney = useFormatMoney();
  const cell = (value: number) => (value > 0 ? formatMoney(value) : '-');

  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  if (!heads?.length) {
    return <p className="rounded-lg border py-6 text-center text-sm text-muted-foreground">No fees for this month or earlier.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[620px] text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-right text-[11px]">
            <th className="px-3 py-2 text-left font-semibold">Fee Type</th>
            <th className="px-3 py-2 font-semibold text-amber-700 dark:text-amber-500">Previous Pending</th>
            <th className="px-3 py-2 font-semibold text-blue-700 dark:text-blue-400">{month} Fee</th>
            <th className="px-3 py-2 font-semibold text-purple-700 dark:text-purple-400">Total Expected</th>
            <th className="px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-500">Received</th>
            <th className="px-3 py-2 font-semibold text-red-600">Total Pending</th>
          </tr>
        </thead>
        <tbody>
          {heads.map((h) => (
            <tr key={h.name} className="border-b text-right tabular-nums last:border-0">
              <td className="px-3 py-1.5 text-left font-medium">{h.name}</td>
              <td className="px-3 py-1.5 text-amber-700 dark:text-amber-500">{cell(h.previousDue)}</td>
              <td className="px-3 py-1.5 text-blue-700 dark:text-blue-400">{cell(h.currentFee)}</td>
              <td className="px-3 py-1.5 font-medium">{cell(h.totalExpected)}</td>
              <td className="px-3 py-1.5 text-emerald-700 dark:text-emerald-500">{cell(h.totalReceived)}</td>
              <td className="px-3 py-1.5 font-semibold text-red-600">{cell(h.totalPending)}</td>
            </tr>
          ))}
        </tbody>
        {summary && (
          <tfoot>
            <tr className="bg-muted text-right text-[11px] font-bold tabular-nums">
              <td className="px-3 py-2 text-left">Total</td>
              <td className="px-3 py-2">{formatMoney(summary.previousDue)}</td>
              <td className="px-3 py-2">{formatMoney(summary.currentFee)}</td>
              <td className="px-3 py-2">{formatMoney(summary.totalExpected)}</td>
              <td className="px-3 py-2">{formatMoney(summary.totalReceived)}</td>
              <td className="px-3 py-2 text-red-700 dark:text-red-400">{formatMoney(summary.totalPending)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export type FeeTypeRow = { name: string; total: number; collected: number; pending: number; before?: number };

/** Plain row of choices, one selected: switches what a table shows. */
export function ChoiceTabs({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; label: string }) {
  return (
    <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${value === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The one table that answers it plainly: for each fee type, the total, what came in and what is left. */
export function FeeTypeSummary({ rows, beforeLabel, selected, onSelect }: { rows: FeeTypeRow[]; beforeLabel?: string; selected?: string; onSelect?: (name: string) => void }) {
  const formatMoney = useFormatMoney();
  const showBefore = !!beforeLabel && rows.some((r) => (r.before || 0) > 0);
  const sum = (field: 'total' | 'collected' | 'pending' | 'before') => rows.reduce((total, r) => total + (r[field] || 0), 0);
  const percent = (r: { collected: number; total: number }) => (r.total > 0 ? Math.min(100, Math.round((r.collected / r.total) * 100)) : 0);
  const money = (v: number) => (v > 0 ? formatMoney(v) : '-');

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-right text-xs">
            <th className="px-4 py-2.5 text-left font-semibold">Fee Type</th>
            {showBefore && <th className="px-4 py-2.5 font-semibold">{beforeLabel}</th>}
            <th className="px-4 py-2.5 font-semibold">Total Fee</th>
            <th className="px-4 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">Collected</th>
            <th className="px-4 py-2.5 font-semibold text-red-600 dark:text-red-400">Pending</th>
            <th className="w-40 px-4 py-2.5 font-semibold">Collected %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.name}
              onClick={onSelect ? () => onSelect(r.name) : undefined}
              className={`border-b text-right tabular-nums last:border-0 ${onSelect ? 'cursor-pointer hover:bg-muted/30' : ''} ${selected === r.name ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}
            >
              <td className="px-4 py-2.5 text-left font-medium">
                {onSelect ? <button type="button" className="text-left underline-offset-2 hover:underline">{r.name}</button> : r.name}
              </td>
              {showBefore && <td className="px-4 py-2.5">{money(r.before || 0)}</td>}
              <td className="px-4 py-2.5 font-medium">{money(r.total)}</td>
              <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-400">{money(r.collected)}</td>
              <td className="px-4 py-2.5 font-medium text-red-600 dark:text-red-400">{money(r.pending)}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent(r)}%` }} />
                  </div>
                  <span className="w-9 text-xs">{percent(r)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted text-right font-bold tabular-nums">
            <td className="px-4 py-2.5 text-left">Total</td>
            {showBefore && <td className="px-4 py-2.5">{money(sum('before'))}</td>}
            <td className="px-4 py-2.5">{money(sum('total'))}</td>
            <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-400">{money(sum('collected'))}</td>
            <td className="px-4 py-2.5 text-red-600 dark:text-red-400">{money(sum('pending'))}</td>
            <td className="px-4 py-2.5 text-xs">{percent({ collected: sum('collected'), total: sum('total') })}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type ReceivedMonth = {
  month: string;
  byFund?: Record<string, { current: number; previous: number; later: number }>;
  paidFor?: { label: string; timing: string; funds: Record<string, number> }[];
  collectedIn?: { label: string; funds: Record<string, number> }[];
};

/** This month's fee vs older dues for one month, across the given funds. */
export function receivedFigures(m: ReceivedMonth, funds: string[]) {
  return funds.reduce(
    (acc, f) => {
      const row = m.byFund?.[f];
      return {
        current: acc.current + (row?.current || 0),
        previous: acc.previous + (row?.previous || 0),
        later: acc.later + (row?.later || 0),
      };
    },
    { current: 0, previous: 0, later: 0 },
  );
}

/** Late or early payments for one month, keeping only the given funds. */
export function paidForRows(m: ReceivedMonth, funds: string[]) {
  return (m.paidFor || [])
    .map((row) => ({
      label: row.label,
      timing: row.timing,
      funds: funds.filter((f) => (row.funds[f] || 0) > 0).map((f) => ({ name: f, amount: row.funds[f] })),
    }))
    .filter((row) => row.funds.length > 0);
}

/**
 * What opens when a month row is clicked. The same month from both sides: its own fee and
 * when that was paid, then all the money that came in during the month and what it was for.
 */
export function MonthDetail({ month, year, funds, received, feeOf, loading }: {
  month: string;
  year: number;
  funds: string[];
  received?: ReceivedMonth;
  feeOf: (fund: string) => { total: number; pending: number };
  loading?: boolean;
}) {
  const formatMoney = useFormatMoney();
  const money = (v: number) => (v > 0 ? formatMoney(v) : '-');
  const showTotal = funds.length > 1;
  const sum = (amounts: number[]) => amounts.reduce((total, v) => total + v, 0);
  const amountsOf = (bucket: Record<string, number> = {}) => funds.map((f) => bucket[f] || 0);

  const Header = ({ first }: { first: string }) => (
    <thead>
      <tr className="border-b bg-muted/60 text-right text-[11px]">
        <th className="px-3 py-1.5 text-left font-semibold">{first}</th>
        {funds.map((f) => <th key={f} className="px-3 py-1.5 font-semibold whitespace-nowrap">{f}</th>)}
        {showTotal && <th className="px-3 py-1.5 font-semibold whitespace-nowrap">All Fees</th>}
      </tr>
    </thead>
  );
  const Row = ({ label, amounts, tone = '', strong }: { label: string; amounts: number[]; tone?: string; strong?: boolean }) => (
    <tr className={`border-b text-right tabular-nums last:border-0 ${strong ? 'bg-muted/50 font-bold' : ''}`}>
      <td className="px-3 py-1.5 text-left whitespace-nowrap">{label}</td>
      {amounts.map((v, i) => <td key={funds[i]} className={`px-3 py-1.5 whitespace-nowrap ${tone}`}>{money(v)}</td>)}
      {showTotal && <td className={`px-3 py-1.5 font-semibold whitespace-nowrap ${tone}`}>{money(sum(amounts))}</td>}
    </tr>
  );

  if (loading || !received) {
    return <p className="py-3 text-xs text-muted-foreground">{loading ? 'Loading details…' : 'No details for this month.'}</p>;
  }

  const paidIn = (received.collectedIn || []).filter((row) => sum(amountsOf(row.funds)) > 0);
  const figures = funds.map((f) => receivedFigures(received, [f]));
  const late = (received.paidFor || []).filter((row) => row.timing !== 'later' && sum(amountsOf(row.funds)) > 0);
  const early = (received.paidFor || []).filter((row) => row.timing === 'later' && sum(amountsOf(row.funds)) > 0);
  const totalIn = figures.map((r) => r.current + r.previous + r.later);

  return (
    <div className={`grid grid-cols-1 gap-3 ${funds.length > 2 ? '' : 'lg:grid-cols-2'}`}>
      <div className="min-w-0">
        <p className="mb-1 font-semibold">{month} {year} fee: when it was paid</p>
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-xs">
            <Header first="" />
            <tbody>
              <Row label="Expected" amounts={funds.map((f) => feeOf(f).total)} strong />
              {paidIn.length === 0
                ? <tr className="border-b"><td colSpan={funds.length + (showTotal ? 2 : 1)} className="px-3 py-1.5 text-muted-foreground">Nothing received for this month's fee yet.</td></tr>
                : paidIn.map((row) => <Row key={row.label} label={`Received in ${row.label}`} amounts={amountsOf(row.funds)} tone="text-emerald-700 dark:text-emerald-400" />)}
              <Row label="Still pending" amounts={funds.map((f) => feeOf(f).pending)} tone="text-red-600 dark:text-red-400" strong />
            </tbody>
          </table>
        </div>
      </div>
      <div className="min-w-0">
        <p className="mb-1 font-semibold">Money received in {month}: what it was for</p>
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-xs">
            <Header first="" />
            <tbody>
              <Row label={`Current fee (${month})`} amounts={figures.map((r) => r.current)} tone="text-emerald-700 dark:text-emerald-400" />
              {late.map((row) => <Row key={row.label} label={`Previous: ${row.label}`} amounts={amountsOf(row.funds)} tone="text-amber-700 dark:text-amber-400" />)}
              {early.map((row) => <Row key={row.label} label={`Advance: ${row.label}`} amounts={amountsOf(row.funds)} />)}
              <Row label="Total received" amounts={totalIn} strong />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Money received in each month, by the month it actually came in: for that month's own fee
 * or for older months, per fund. A month with late payments opens to show which fee month
 * each one settled, so a fee paid two months late is visible when it was received.
 */
export function FeeReceivedTable({ months, funds }: { months: ReceivedMonth[]; funds: string[] }) {
  const formatMoney = useFormatMoney();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const money = (v: number) => (v > 0 ? formatMoney(v) : '-');
  const hasEarly = months.some((m) => receivedFigures(m, funds).later > 0);
  const groups = [...(funds.length > 1 ? funds.map((f) => ({ key: f, label: f, of: [f] })) : []), { key: 'all', label: 'All Fees', of: funds }];
  const groupColumns = hasEarly ? 4 : 3;
  const withLate = months.filter((m) => paidForRows(m, funds).length > 0);
  const allOpen = withLate.length > 0 && withLate.every((m) => open[m.month]);
  const yearTotal = (of: string[]) =>
    months.reduce(
      (acc, m) => {
        const r = receivedFigures(m, of);
        return { current: acc.current + r.current, previous: acc.previous + r.previous, later: acc.later + r.later };
      },
      { current: 0, previous: 0, later: 0 },
    );
  const columnSpan = 1 + groups.length * groupColumns;

  return (
    <div className="space-y-2">
      {withLate.length > 0 && (
        <button
          type="button"
          className="text-xs font-medium text-primary underline underline-offset-2"
          onClick={() => setOpen(allOpen ? {} : Object.fromEntries(withLate.map((m) => [m.month, true])))}
        >
          {allOpen ? 'Hide all details' : 'Show all details'}
        </button>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs" style={{ minWidth: 140 + groups.length * groupColumns * 115 }}>
          <thead>
            <tr className="bg-muted/60">
              <th rowSpan={2} className="sticky left-0 z-10 border-b bg-muted px-3 py-2 text-left font-semibold align-bottom">Received In</th>
              {groups.map((g) => (
                <th key={g.key} colSpan={groupColumns} className="border-b border-l px-3 py-1.5 text-center font-semibold">{g.label}</th>
              ))}
            </tr>
            <tr className="border-b bg-muted/60 text-right text-[11px]">
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <th className="border-l px-3 py-2 font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-400">This Month's Fee</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap text-amber-700 dark:text-amber-400">Previous Months</th>
                  {hasEarly && <th className="px-3 py-2 font-semibold whitespace-nowrap">Advance</th>}
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Total Received</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const late = paidForRows(m, funds);
              const isOpen = !!open[m.month];
              const hasData = receivedFigures(m, funds).current + receivedFigures(m, funds).previous + receivedFigures(m, funds).later > 0;
              return (
                <Fragment key={m.month}>
                  <tr className={`border-b text-right tabular-nums hover:bg-muted/20 ${hasData ? '' : 'text-muted-foreground/50'}`}>
                    <td className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
                      {late.length > 0 ? (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          className="flex items-center gap-1 whitespace-nowrap underline-offset-2 hover:underline"
                          onClick={() => setOpen((prev) => ({ ...prev, [m.month]: !prev[m.month] }))}
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {m.month}
                        </button>
                      ) : (
                        <span className="pl-[18px]">{m.month}</span>
                      )}
                    </td>
                    {groups.map((g) => {
                      const r = receivedFigures(m, g.of);
                      return (
                        <Fragment key={g.key}>
                          <td className={`border-l px-3 py-2 whitespace-nowrap ${hasData ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{money(r.current)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap ${hasData ? 'text-amber-700 dark:text-amber-400' : ''}`}>{money(r.previous)}</td>
                          {hasEarly && <td className="px-3 py-2 whitespace-nowrap">{money(r.later)}</td>}
                          <td className="bg-muted/30 px-3 py-2 font-semibold whitespace-nowrap">{money(r.current + r.previous + r.later)}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-amber-50/50 dark:bg-amber-950/20">
                      <td colSpan={columnSpan} className="px-3 py-2">
                        <p className="mb-1 font-semibold">Received in {m.month} for other months' fees</p>
                        <ul className="space-y-0.5">
                          {late.map((row) => (
                            <li key={row.label} className="tabular-nums">
                              <span className="font-medium">{row.timing === 'later' ? 'In advance for' : 'For'} {row.label}:</span>{' '}
                              {row.funds.map((f) => `${f.name} ${formatMoney(f.amount)}`).join(' · ')}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted text-right font-bold tabular-nums">
              <td className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-left whitespace-nowrap">Year Total</td>
              {groups.map((g) => {
                const t = yearTotal(g.of);
                return (
                  <Fragment key={g.key}>
                    <td className="border-l px-3 py-2.5 whitespace-nowrap text-emerald-700 dark:text-emerald-400">{money(t.current)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-amber-700 dark:text-amber-400">{money(t.previous)}</td>
                    {hasEarly && <td className="px-3 py-2.5 whitespace-nowrap">{money(t.later)}</td>}
                    <td className="px-3 py-2.5 whitespace-nowrap">{money(t.current + t.previous + t.later)}</td>
                  </Fragment>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Income split into one tile per fund, so Paper Fund and the rest are never hidden inside Fees. */
export function FundTotals({ names, totals, pending, otherIncome, label = 'Income by Fund' }: { names?: string[]; totals?: Record<string, number>; pending?: Record<string, number>; otherIncome?: number; label?: string }) {
  const formatMoney = useFormatMoney();
  const items = [
    ...(names || []).map((name) => ({ name, amount: totals?.[name] || 0 })),
    ...((otherIncome || 0) > 0 ? [{ name: 'Other Income', amount: otherIncome || 0 }] : []),
  ];
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.name} className="min-w-0 rounded-lg border bg-card px-3 py-2.5">
            <p className="truncate text-xs font-medium text-muted-foreground" title={item.name}>{item.name}</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-emerald-600 [overflow-wrap:anywhere] dark:text-emerald-400">{formatMoney(item.amount)}</p>
            <p className="text-[11px] text-muted-foreground">{total > 0 ? Math.round((item.amount / total) * 100) : 0}% of total</p>
            {(pending?.[item.name] || 0) > 0 && (
              <p className="text-[11px] font-medium text-red-600 dark:text-red-400">Pending {formatMoney(pending?.[item.name] || 0)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Print-report sections showing the same figures as the two components above. */
export function feePositionPrintSections(
  position: { summary: FeeSummary; heads: FeeHead[] },
  month: string,
  formatMoney: (value: number) => string,
) {
  const { summary: s, heads } = position;
  return [
    {
      type: 'summary' as const,
      items: [
        { label: 'Previous Pending', value: formatMoney(s.previousDue) },
        { label: `${month} Fee`, value: formatMoney(s.currentFee) },
        { label: 'Total Expected', value: formatMoney(s.totalExpected) },
        { label: 'Received', value: formatMoney(s.totalReceived) },
        { label: 'Total Pending', value: formatMoney(s.totalPending) },
        { label: 'Collection Rate', value: `${s.collectionRate}%` },
      ],
    },
    {
      type: 'table' as const,
      heading: 'By Fee Type',
      headers: ['Fee Type', 'Previous Pending', `${month} Fee`, 'Total Expected', 'Received', 'Total Pending'],
      rows: heads.map((h) => [h.name, formatMoney(h.previousDue), formatMoney(h.currentFee), formatMoney(h.totalExpected), formatMoney(h.totalReceived), formatMoney(h.totalPending)]),
      footer: ['Total', formatMoney(s.previousDue), formatMoney(s.currentFee), formatMoney(s.totalExpected), formatMoney(s.totalReceived), formatMoney(s.totalPending)],
    },
  ];
}
