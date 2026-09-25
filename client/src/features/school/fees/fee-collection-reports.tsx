import { Fragment, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  CalendarClock, TrendingUp, TrendingDown, Wallet, Percent,
  Undo2, Scale, Receipt, Users, ChevronDown, ChevronRight, Printer,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell,
} from 'recharts';
import {
  useGetSchoolClassesQuery,
  useGetFeeCollectionDashboardQuery,
  useGetFeeCollectionMonthlyQuery,
  useGetFeeCollectionDailyQuery,
  useGetFeeCollectionYearlyQuery,
  useGetFeeCollectionTransactionsQuery,
  useGetFeeCollectionPaymentMethodsQuery,
  useGetFeeCollectionStaffQuery,
  useGetFeeCollectionDiscountsQuery,
  useGetFeeCollectionRefundsQuery,
} from '@/stores/school.api';
import { useFormatMoney } from '@/lib/format-money';
import { formatBusinessDate, formatBusinessDateTimeShort, getBusinessToday } from '@/lib/business-timezone';
import { ExportButtons, Loading, EmptyState } from './fee-reports';
import { buildCollectionReportPrintHTML, openReportPrintWindow, useOrgAndUser, type PrintSection } from './report-print';

const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

type CollectionFilters = { startDate: string; endDate: string; classId?: string };

function KpiCard({ icon: Icon, label, value, tone = 'default', sub }: { icon: any; label: string; value: string; tone?: 'default' | 'good' | 'bad' | 'warn'; sub?: string }) {
  const toneClasses: Record<string, string> = {
    default: 'border-border bg-card text-foreground',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bad: 'border-red-200 bg-red-50 text-red-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return (
    <Card className={toneClasses[tone]}>
      <CardContent className="pt-4 pb-3 flex items-start gap-2.5">
        <Icon className="h-4 w-4 mt-0.5 shrink-0 opacity-70" />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide opacity-70 truncate">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
          {sub && <p className="text-[10px] opacity-70">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function useSharedFilters() {
  const today = getBusinessToday();
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const [filters, setFilters] = useState<CollectionFilters>({ startDate: firstOfMonth, endDate: today, classId: undefined });
  const [year, setYear] = useState<number>(Number(today.slice(0, 4)));
  return { filters, setFilters, year, setYear };
}

const periodLabelOf = (filters: CollectionFilters) =>
  filters.startDate === filters.endDate
    ? formatBusinessDate(filters.startDate)
    : `${formatBusinessDate(filters.startDate)} – ${formatBusinessDate(filters.endDate)}`;

function FilterBar({ filters, setFilters, classes }: { filters: CollectionFilters; setFilters: (f: CollectionFilters) => void; classes: any[] }) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">From</span>
        <Input type="date" className="w-36 h-9" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">To</span>
        <Input type="date" className="w-36 h-9" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
      </div>
      <Select value={filters.classId || 'all'} onValueChange={(v) => setFilters({ ...filters, classId: v === 'all' ? undefined : v })}>
        <SelectTrigger className="w-40"><SelectValue placeholder="All Classes" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Classes</SelectItem>
          {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Dashboard ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function DashboardSubTab({ filters, year, setYear }: { filters: CollectionFilters; year: number; setYear: (y: number) => void }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionDashboardQuery(filters);
  const { data: yearly } = useGetFeeCollectionYearlyQuery({ year, classId: filters.classId });
  const { data: byMethod } = useGetFeeCollectionPaymentMethodsQuery(filters);

  if (isLoading || !data) return <Loading />;

  const rangeLabel = filters.startDate === filters.endDate ? formatBusinessDate(filters.startDate) : `${formatBusinessDate(filters.startDate)} – ${formatBusinessDate(filters.endDate)}`;
  const pieData = (byMethod || []).map((m: any) => ({ name: (m.paymentMethod || '').replace('_', ' '), value: m.amount }));

  return (
    <div className="space-y-5">
      {/* Hero: total collection for the selected range */}
      <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0">
        <CardContent className="pt-5 pb-5">
          <p className="text-xs uppercase tracking-wide opacity-90">Total Collection — {rangeLabel}</p>
          <p className="text-3xl font-bold mt-1">{formatMoney(data.collectionInRange)}</p>
          <div className="flex gap-4 mt-2 text-xs opacity-90">
            <span>Current period fees: {formatMoney(data.currentMonthCollection)}</span>
            <span>Previous dues recovered: {formatMoney(data.previousDuesCollection)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard icon={CalendarClock} label="Collected Today" value={formatMoney(data.totalCollectionToday)} tone="good" />
        <KpiCard icon={CalendarClock} label="Collected This Month" value={formatMoney(data.totalCollectionThisMonth)} tone="good" />
        <KpiCard icon={TrendingUp} label="Current-Period Fees" value={formatMoney(data.currentMonthCollection)} />
        <KpiCard icon={TrendingDown} label="Previous Dues Recovered" value={formatMoney(data.previousDuesCollection)} />
        <KpiCard icon={Scale} label="Total Outstanding" value={formatMoney(data.totalOutstanding)} tone={data.totalOutstanding > 0 ? 'warn' : 'good'} />
        <KpiCard icon={Percent} label="Total Discounts" value={formatMoney(data.totalDiscounts)} />
        <KpiCard icon={Undo2} label="Total Refunds" value={formatMoney(data.totalRefunds)} tone={data.totalRefunds > 0 ? 'bad' : 'default'} />
        <KpiCard icon={Wallet} label="Net Collection" value={formatMoney(data.netCollection)} tone="good" />
        <KpiCard icon={Receipt} label="Transactions" value={String(data.transactionCount)} />
        <KpiCard icon={Users} label="Students Who Paid" value={String(data.studentsWhoPaid)} />
      </div>

      {/* Charts */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Academic Year Charts</h3>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[year - 1, year, year + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold">Monthly Collection Trend — {year}</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={yearly?.rows || []} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={10} tickFormatter={(m) => String(m).slice(0, 3)} />
                <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Line type="monotone" dataKey="totalCollection" stroke="#10b981" strokeWidth={2} name="Total Collected" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold">Current vs Previous Dues — {year}</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={yearly?.rows || []} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={10} tickFormatter={(m) => String(m).slice(0, 3)} />
                <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="currentMonthCollection" fill="#10b981" name="Current Month" radius={[3, 3, 0, 0]} />
                <Bar dataKey="previousDues" fill="#f59e0b" name="Previous Dues" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold">Payment Method Distribution — {rangeLabel}</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4">
            {pieData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={240}>
                <RePieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.name}>
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                </RePieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold">Outstanding Trend — {year}</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={yearly?.rows || []} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={10} tickFormatter={(m) => String(m).slice(0, 3)} />
                <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Line type="monotone" dataKey="outstanding" stroke="#ef4444" strokeWidth={2} name="Outstanding" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Monthly Collection Report ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function MonthlySubTab({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionMonthlyQuery(filters);
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data || data.rows.length === 0) return <EmptyState text="No collections in this range." />;

  const headers = ['Fee Month', 'Students', 'Current Fee', 'Previous Dues', 'Discount', 'Total Collected'];
  const rows = data.rows.map((r: any) => [`${r.month} ${r.year}`, r.students, formatMoney(r.currentFee), formatMoney(r.previousDues), formatMoney(r.discount), formatMoney(r.totalCollected)]);

  const handlePrint = () => openReportPrintWindow(buildCollectionReportPrintHTML(org, {
    title: 'Monthly Collection Report',
    periodLabel: periodLabelOf(filters),
    generatedByName,
    sections: [{
      type: 'table', heading: 'Fee Month Breakdown', headers, rows,
      footer: ['Total', data.totals.students, formatMoney(data.totals.currentFee), formatMoney(data.totals.previousDues), formatMoney(data.totals.discount), formatMoney(data.totals.totalCollected)],
    }],
  }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
        <ExportButtons
          data={data.rows.map((r: any) => ({ 'Fee Month': `${r.month} ${r.year}`, Students: r.students, 'Current Fee': r.currentFee, 'Previous Dues': r.previousDues, Discount: r.discount, 'Total Collected': r.totalCollected }))}
          sheetName="MonthlyCollection" fileName="monthly-collection" pdfTitle="Monthly Collection Report"
          headers={headers} rows={rows}
        />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40">{headers.map((h) => <th key={h} className="text-left px-4 py-2 font-medium text-xs">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row: any[], i: number) => (
              <tr key={i} className="border-b hover:bg-muted/20">
                {row.map((c, j) => <td key={j} className="px-4 py-2 text-xs">{c}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="px-4 py-2 text-xs">Total</td>
              <td className="px-4 py-2 text-xs">{data.totals.students}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.currentFee)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.previousDues)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.discount)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.totalCollected)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Yearly Collection Report ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function YearlySubTab({ year, setYear, classId }: { year: number; setYear: (y: number) => void; classId?: string }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionYearlyQuery({ year, classId });
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading || !data) return <Loading />;

  const headers = ['Month', 'Current Month Collection', 'Previous Dues', 'Total Collection', 'Outstanding'];
  const rows = data.rows.map((r: any) => [r.month, formatMoney(r.currentMonthCollection), formatMoney(r.previousDues), formatMoney(r.totalCollection), formatMoney(r.outstanding)]);

  const handlePrint = () => openReportPrintWindow(buildCollectionReportPrintHTML(org, {
    title: 'Yearly Fee Collection Report',
    periodLabel: `Academic Year ${year}`,
    generatedByName,
    sections: [{
      type: 'table', heading: `${year} — Month by Month`, headers, rows,
      footer: ['Annual Total', formatMoney(data.totals.currentMonthCollection), formatMoney(data.totals.previousDues), formatMoney(data.totals.totalCollection), formatMoney(data.totals.discounts) + ' discounts'],
    }],
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{[year - 1, year, year + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
          <ExportButtons
            data={data.rows} sheetName="YearlyCollection" fileName={`yearly-collection-${year}`}
            pdfTitle={`Yearly Fee Collection Report — ${year}`} headers={headers} rows={rows}
          />
        </div>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40">{headers.map((h) => <th key={h} className="text-left px-4 py-2 font-medium text-xs">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row: any[], i: number) => (
              <tr key={i} className="border-b hover:bg-muted/20">
                {row.map((c, j) => <td key={j} className="px-4 py-2 text-xs">{c}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="px-4 py-2 text-xs">Annual Total</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.currentMonthCollection)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.previousDues)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.totalCollection)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.discounts)} discounts</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Daily Collection Report ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function DayTransactions({ date, classId }: { date: string; classId?: string }) {
  const { data, isLoading } = useGetFeeCollectionTransactionsQuery({ startDate: date, endDate: date, classId, limit: 100 });
  const formatMoney = useFormatMoney();
  if (isLoading) return <div className="px-4 py-3 text-xs text-muted-foreground">Loading…</div>;
  const rows = data?.results || [];
  if (!rows.length) return <div className="px-4 py-3 text-xs text-muted-foreground">No transactions.</div>;
  return (
    <div className="bg-muted/20 px-2 py-2">
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground"><th className="text-left px-2 py-1">Receipt</th><th className="text-left px-2 py-1">Student</th><th className="text-left px-2 py-1">Fee Month</th><th className="text-right px-2 py-1">Amount</th><th className="text-left px-2 py-1">Method</th></tr></thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t">
              <td className="px-2 py-1 font-mono">{r.receiptNumber}</td>
              <td className="px-2 py-1">{r.studentName}</td>
              <td className="px-2 py-1">{r.feeMonth} {r.feeYear}</td>
              <td className="px-2 py-1 text-right">{formatMoney(r.amount)}</td>
              <td className="px-2 py-1 capitalize">{(r.paymentMethod || '').replace('_', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailySubTab({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionDailyQuery(filters);
  const { org, generatedByName } = useOrgAndUser();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (isLoading) return <Loading />;
  if (!data || data.days.length === 0) return <EmptyState text="No collections in this range." />;

  const headers = ['Date', 'Receipts', ...data.columns.map((c: any) => `${c.month.slice(0, 3)} ${c.year}`), 'Total'];
  const printRows = data.days.map((d: any) => [formatBusinessDate(d.date), d.receiptCount, ...d.byPeriod.map((v: number) => formatMoney(v)), formatMoney(d.total)]);

  const handlePrint = () => openReportPrintWindow(buildCollectionReportPrintHTML(org, {
    title: 'Daily Collection Report',
    periodLabel: periodLabelOf(filters),
    generatedByName,
    sections: [{
      type: 'table', heading: 'Day by Day', headers, rows: printRows,
      footer: ['Total', data.totals.receiptCount, ...data.totals.byPeriod.map((v: number) => formatMoney(v)), formatMoney(data.totals.total)],
    }],
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Click a date to see its transactions.</p>
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40">{headers.map((h) => <th key={h} className="text-left px-4 py-2 font-medium text-xs">{h}</th>)}</tr></thead>
          <tbody>
            {data.days.map((d: any) => (
              <Fragment key={d.date}>
                <tr className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => setExpanded(expanded === d.date ? null : d.date)}>
                  <td className="px-4 py-2 text-xs flex items-center gap-1">
                    {expanded === d.date ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {formatBusinessDate(d.date)}
                  </td>
                  <td className="px-4 py-2 text-xs">{d.receiptCount}</td>
                  {d.byPeriod.map((v: number, i: number) => <td key={i} className="px-4 py-2 text-xs">{formatMoney(v)}</td>)}
                  <td className="px-4 py-2 text-xs font-semibold">{formatMoney(d.total)}</td>
                </tr>
                {expanded === d.date && (
                  <tr><td colSpan={headers.length} className="p-0"><DayTransactions date={d.date} classId={filters.classId} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="px-4 py-2 text-xs">Total</td>
              <td className="px-4 py-2 text-xs">{data.totals.receiptCount}</td>
              {data.totals.byPeriod.map((v: number, i: number) => <td key={i} className="px-4 py-2 text-xs">{formatMoney(v)}</td>)}
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Detailed Transaction Report ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function TransactionsSubTab({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetFeeCollectionTransactionsQuery({ ...filters, page, limit: 25 });
  if (isLoading) return <Loading />;
  const rows = data?.results || [];
  if (!rows.length) return <EmptyState text="No transactions in this range." />;

  const headers = ['Receipt No', 'Date', 'Student', 'Class', 'Fee Month', 'Amount', 'Discount', 'Method', 'Collected By'];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportButtons
          data={rows.map((r: any) => ({ Receipt: r.receiptNumber, Date: formatBusinessDate(r.paymentDate), Student: r.studentName, Class: r.className, 'Fee Month': `${r.feeMonth} ${r.feeYear}`, Amount: r.amount, Discount: r.discount, Method: r.paymentMethod, 'Collected By': r.collectedByName }))}
          sheetName="Transactions" fileName="fee-transactions" pdfTitle="Detailed Transaction Report" landscape
          headers={headers}
          rows={rows.map((r: any) => [r.receiptNumber, formatBusinessDate(r.paymentDate), r.studentName, r.className, `${r.feeMonth} ${r.feeYear}`, formatMoney(r.amount), formatMoney(r.discount), r.paymentMethod, r.collectedByName])}
        />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40">{headers.map((h) => <th key={h} className="text-left px-4 py-2 font-medium text-xs">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={i} className="border-b hover:bg-muted/20">
                <td className="px-4 py-2 text-xs font-mono">{r.receiptNumber}</td>
                <td className="px-4 py-2 text-xs">{formatBusinessDate(r.paymentDate)}</td>
                <td className="px-4 py-2 text-xs">{r.studentName}</td>
                <td className="px-4 py-2 text-xs">{r.className}</td>
                <td className="px-4 py-2 text-xs">{r.feeMonth} {r.feeYear}</td>
                <td className="px-4 py-2 text-xs text-right">{formatMoney(r.amount)}</td>
                <td className="px-4 py-2 text-xs">{formatMoney(r.discount)}</td>
                <td className="px-4 py-2 text-xs capitalize">{(r.paymentMethod || '').replace('_', ' ')}</td>
                <td className="px-4 py-2 text-xs">{r.collectedByName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <span className="text-sm py-1.5">Page {page} / {data.totalPages} ({data.totalResults} rows)</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Payment Method / Staff reports ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function PaymentMethodSubTab({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionPaymentMethodsQuery(filters);
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data || data.length === 0) return <EmptyState text="No collections in this range." />;
  const total = data.reduce((s: number, r: any) => s + r.amount, 0);
  const totalTxns = data.reduce((s: number, r: any) => s + r.transactions, 0);
  const pieData = data.map((m: any) => ({ name: (m.paymentMethod || '').replace('_', ' '), value: m.amount }));

  const handlePrint = () => openReportPrintWindow(buildCollectionReportPrintHTML(org, {
    title: 'Payment Method Report',
    periodLabel: periodLabelOf(filters),
    generatedByName,
    sections: [{
      type: 'table', heading: 'By Payment Method',
      headers: ['Payment Method', 'Transactions', 'Amount'],
      rows: data.map((r: any) => [(r.paymentMethod || '').replace('_', ' '), r.transactions, formatMoney(r.amount)]),
      footer: ['Total', totalTxns, formatMoney(total)],
    }],
  }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40"><th className="text-left px-4 py-2 font-medium text-xs">Payment Method</th><th className="text-right px-4 py-2 font-medium text-xs">Transactions</th><th className="text-right px-4 py-2 font-medium text-xs">Amount</th></tr></thead>
          <tbody>
            {data.map((r: any) => (
              <tr key={r.paymentMethod} className="border-b hover:bg-muted/20">
                <td className="px-4 py-2 text-xs capitalize">{(r.paymentMethod || '').replace('_', ' ')}</td>
                <td className="px-4 py-2 text-xs text-right">{r.transactions}</td>
                <td className="px-4 py-2 text-xs text-right font-semibold">{formatMoney(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-muted font-bold"><td className="px-4 py-2 text-xs">Total</td><td className="px-4 py-2 text-xs text-right">{data.reduce((s: number, r: any) => s + r.transactions, 0)}</td><td className="px-4 py-2 text-xs text-right">{formatMoney(total)}</td></tr></tfoot>
        </table>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <RePieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.name}>
            {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => formatMoney(v)} />
        </RePieChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

function StaffSubTab({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionStaffQuery(filters);
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data || data.length === 0) return <EmptyState text="No collections in this range." />;
  const total = data.reduce((s: number, r: any) => s + r.amount, 0);
  const totalTxns = data.reduce((s: number, r: any) => s + r.transactions, 0);

  const handlePrint = () => openReportPrintWindow(buildCollectionReportPrintHTML(org, {
    title: 'Collection Staff Report',
    periodLabel: periodLabelOf(filters),
    generatedByName,
    sections: [{
      type: 'table', heading: 'By Staff Member',
      headers: ['Staff', 'Transactions', 'Collection'],
      rows: data.map((r: any) => [r.staffName, r.transactions, formatMoney(r.amount)]),
      footer: ['Total', totalTxns, formatMoney(total)],
    }],
  }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40"><th className="text-left px-4 py-2 font-medium text-xs">Staff</th><th className="text-right px-4 py-2 font-medium text-xs">Transactions</th><th className="text-right px-4 py-2 font-medium text-xs">Collection</th></tr></thead>
          <tbody>
            {data.map((r: any) => (
              <tr key={r.staffId} className="border-b hover:bg-muted/20">
                <td className="px-4 py-2 text-xs">{r.staffName}</td>
                <td className="px-4 py-2 text-xs text-right">{r.transactions}</td>
                <td className="px-4 py-2 text-xs text-right font-semibold">{formatMoney(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-muted font-bold"><td className="px-4 py-2 text-xs">Total</td><td className="px-4 py-2 text-xs text-right">{totalTxns}</td><td className="px-4 py-2 text-xs text-right">{formatMoney(total)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Discount / Refund reports ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function DiscountSubTab({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionDiscountsQuery(filters);
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data || data.rows.length === 0) return <EmptyState text="No discounts on fees collected in this range." />;

  const headers = ['Student', 'Class', 'Fee Month', 'Original Amount', 'Discount', 'Net Amount', 'Receipt(s)'];
  const rows = data.rows.map((r: any) => [r.studentName, r.className, `${r.feeMonth} ${r.feeYear}`, formatMoney(r.originalAmount), formatMoney(r.discount), formatMoney(r.netAmount), r.receiptNumbers]);

  const handlePrint = () => openReportPrintWindow(buildCollectionReportPrintHTML(org, {
    title: 'Discount Report',
    periodLabel: periodLabelOf(filters),
    generatedByName,
    sections: [{
      type: 'table', heading: 'Discounts on Fees Collected', headers, rows,
      footer: ['Total', '', '', formatMoney(data.totals.originalAmount), formatMoney(data.totals.discount), formatMoney(data.totals.netAmount), ''],
    }],
  }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
        <ExportButtons
          data={data.rows.map((r: any) => ({ Student: r.studentName, Class: r.className, 'Fee Month': `${r.feeMonth} ${r.feeYear}`, 'Original Amount': r.originalAmount, Discount: r.discount, 'Net Amount': r.netAmount, Receipts: r.receiptNumbers }))}
          sheetName="Discounts" fileName="discount-report" pdfTitle="Discount Report" landscape
          headers={headers} rows={rows}
        />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40">{headers.map((h) => <th key={h} className="text-left px-4 py-2 font-medium text-xs">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row: any[], i: number) => (
              <tr key={i} className="border-b hover:bg-muted/20">
                {row.map((c, j) => <td key={j} className="px-4 py-2 text-xs">{c}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="px-4 py-2 text-xs" colSpan={3}>Total</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.originalAmount)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.discount)}</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.netAmount)}</td>
              <td className="px-4 py-2 text-xs" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function RefundSubTab({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetFeeCollectionRefundsQuery(filters);
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data || data.rows.length === 0) return <EmptyState text="No cancelled receipts in this range." />;

  const headers = ['Receipt #', 'Student', 'Class', 'Original Amount', 'Collected On', 'Cancelled On', 'Cancelled By', 'Reason'];
  const rows = data.rows.map((r: any) => [r.receiptNumber, r.studentName, r.className, formatMoney(r.amount), formatBusinessDate(r.paymentDate), formatBusinessDateTimeShort(r.cancelledAt), r.cancelledByName, r.reason]);

  const handlePrint = () => openReportPrintWindow(buildCollectionReportPrintHTML(org, {
    title: 'Refund / Cancellation Report',
    periodLabel: periodLabelOf(filters),
    generatedByName,
    sections: [{
      type: 'table', heading: 'Cancelled Receipts', headers, rows,
      footer: ['Total', '', '', formatMoney(data.totals.amount), '', '', '', ''],
    }],
  }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
        <ExportButtons
          data={data.rows.map((r: any) => ({ Receipt: r.receiptNumber, Student: r.studentName, Class: r.className, Amount: r.amount, 'Collected On': r.paymentDate, 'Cancelled On': r.cancelledAt, 'Cancelled By': r.cancelledByName, Reason: r.reason }))}
          sheetName="Refunds" fileName="refund-report" pdfTitle="Refund / Cancellation Report" landscape
          headers={headers} rows={rows}
        />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/40">{headers.map((h) => <th key={h} className="text-left px-4 py-2 font-medium text-xs">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row: any[], i: number) => (
              <tr key={i} className="border-b hover:bg-muted/20">
                {row.map((c, j) => <td key={j} className="px-4 py-2 text-xs">{c}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="px-4 py-2 text-xs" colSpan={3}>Total</td>
              <td className="px-4 py-2 text-xs">{formatMoney(data.totals.amount)}</td>
              <td className="px-4 py-2 text-xs" colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Root ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const SUB_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'payment-methods', label: 'Payment Methods' },
  { key: 'staff', label: 'Staff' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'refunds', label: 'Refunds' },
] as const;

/** The section 12 "professional PDF report" — every summary in one branded document. */
function PrintFullReportButton({ filters }: { filters: CollectionFilters }) {
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  const { data: dashboard } = useGetFeeCollectionDashboardQuery(filters);
  const { data: monthly } = useGetFeeCollectionMonthlyQuery(filters);
  const { data: daily } = useGetFeeCollectionDailyQuery(filters);
  const { data: byMethod } = useGetFeeCollectionPaymentMethodsQuery(filters);
  const { data: txns } = useGetFeeCollectionTransactionsQuery({ ...filters, page: 1, limit: 200 });

  const handlePrint = () => {
    if (!dashboard) return;
    const sections: PrintSection[] = [
      {
        type: 'summary', heading: 'Summary',
        items: [
          { label: 'Total Collection', value: formatMoney(dashboard.collectionInRange) },
          { label: 'Current-Period Fees', value: formatMoney(dashboard.currentMonthCollection) },
          { label: 'Previous Dues Recovered', value: formatMoney(dashboard.previousDuesCollection) },
          { label: 'Discounts', value: formatMoney(dashboard.totalDiscounts) },
          { label: 'Refunds', value: formatMoney(dashboard.totalRefunds) },
          { label: 'Net Collection', value: formatMoney(dashboard.netCollection) },
          { label: 'Outstanding', value: formatMoney(dashboard.totalOutstanding) },
          { label: 'Transactions', value: String(dashboard.transactionCount) },
        ],
      },
    ];

    if (monthly?.rows.length) {
      sections.push({
        type: 'table', heading: 'Fee Month Breakdown',
        headers: ['Fee Month', 'Students', 'Current Fee', 'Previous Dues', 'Discount', 'Total Collected'],
        rows: monthly.rows.map((r: any) => [`${r.month} ${r.year}`, r.students, formatMoney(r.currentFee), formatMoney(r.previousDues), formatMoney(r.discount), formatMoney(r.totalCollected)]),
        footer: ['Total', monthly.totals.students, formatMoney(monthly.totals.currentFee), formatMoney(monthly.totals.previousDues), formatMoney(monthly.totals.discount), formatMoney(monthly.totals.totalCollected)],
      });
    }
    if (daily?.days.length) {
      sections.push({
        type: 'table', heading: 'Daily Collection',
        headers: ['Date', 'Receipts', ...daily.columns.map((c: any) => `${c.month.slice(0, 3)} ${c.year}`), 'Total'],
        rows: daily.days.map((d: any) => [formatBusinessDate(d.date), d.receiptCount, ...d.byPeriod.map((v: number) => formatMoney(v)), formatMoney(d.total)]),
        footer: ['Total', daily.totals.receiptCount, ...daily.totals.byPeriod.map((v: number) => formatMoney(v)), formatMoney(daily.totals.total)],
      });
    }
    if (byMethod?.length) {
      sections.push({
        type: 'table', heading: 'Payment Method Summary',
        headers: ['Payment Method', 'Transactions', 'Amount'],
        rows: byMethod.map((r: any) => [(r.paymentMethod || '').replace('_', ' '), r.transactions, formatMoney(r.amount)]),
      });
    }
    if (txns?.results.length) {
      sections.push({
        type: 'table',
        heading: txns.totalResults > txns.results.length ? `Detailed Transactions (first ${txns.results.length} of ${txns.totalResults})` : 'Detailed Transactions',
        headers: ['Receipt No', 'Date', 'Student', 'Class', 'Fee Month', 'Amount', 'Method'],
        rows: txns.results.map((r: any) => [r.receiptNumber, formatBusinessDate(r.paymentDate), r.studentName, r.className, `${r.feeMonth} ${r.feeYear}`, formatMoney(r.amount), r.paymentMethod]),
      });
    }

    openReportPrintWindow(buildCollectionReportPrintHTML(org, {
      title: 'Fee Collection Report',
      periodLabel: `Collection Period: ${periodLabelOf(filters)}`,
      generatedByName,
      sections,
    }));
  };

  return (
    <Button variant="default" size="sm" onClick={handlePrint} disabled={!dashboard}>
      <Printer className="mr-2 h-3.5 w-3.5" /> Print Full Report
    </Button>
  );
}

export default function FeeCollectionReports() {
  const { filters, setFilters, year, setYear } = useSharedFilters();
  const [subTab, setSubTab] = useState<string>('dashboard');
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const classes = classesData?.results || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar filters={filters} setFilters={setFilters} classes={classes} />
        <PrintFullReportButton filters={filters} />
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto flex-wrap gap-1 rounded-lg bg-muted p-1 min-w-full sm:min-w-0">
            {SUB_TABS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="text-xs sm:text-sm px-2 sm:px-3">{label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardSubTab filters={filters} year={year} setYear={setYear} />
        </TabsContent>
        <TabsContent value="daily" className="mt-4">
          <DailySubTab filters={filters} />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <MonthlySubTab filters={filters} />
        </TabsContent>
        <TabsContent value="yearly" className="mt-4">
          <YearlySubTab year={year} setYear={setYear} classId={filters.classId} />
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          <TransactionsSubTab filters={filters} />
        </TabsContent>
        <TabsContent value="payment-methods" className="mt-4">
          <PaymentMethodSubTab filters={filters} />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <StaffSubTab filters={filters} />
        </TabsContent>
        <TabsContent value="discounts" className="mt-4">
          <DiscountSubTab filters={filters} />
        </TabsContent>
        <TabsContent value="refunds" className="mt-4">
          <RefundSubTab filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
