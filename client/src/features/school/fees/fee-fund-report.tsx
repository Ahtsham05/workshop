import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { useFormatMoney } from '@/lib/format-money';
import { useGetFeeFundDetailQuery, useGetFeeFundReportQuery, useGetFeeFundYearsQuery } from '@/stores/school.api';
import { EmptyState, ExportButtons, Loading, StatusBadge } from './fee-reports';
import { ChoiceTabs, FeeReceivedTable, FeeTypeSummary } from './fee-position';
import { printReport, useOrgAndUser, type PrintSection } from './report-print';

/** Coming back to a report re-fetches it only if the last copy is older than this. */
const REFRESH_AFTER_SECONDS = 60;

const TH = 'px-3 py-2 text-right font-semibold whitespace-nowrap';
const TD = 'px-3 py-1.5 text-right tabular-nums';
const COLLECTED = 'text-emerald-700 dark:text-emerald-400';
const PENDING = 'text-red-600 dark:text-red-400';
const PREVIOUS = 'text-amber-700 dark:text-amber-400';
const BILLED = 'text-blue-700 dark:text-blue-400';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  online: 'Online',
  credit_wallet: 'Advance Wallet',
  other: 'Other',
  not_recorded: 'Not Recorded',
};
const methodLabel = (method: string) => METHOD_LABELS[method] || method;

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** A failed request must not read as "no fees": that looks like a school with nothing owed. */
function ReportUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-semibold">This report could not be loaded.</p>
      <p className="mt-1">The server did not return it, so nothing can be shown yet. This does not mean there are no fees. If the app was just updated, the server may need the same update.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try Again</Button>
    </div>
  );
}

/** Every fund across every year on record: what was billed, collected and is still owed. */
function FundYearView({ classId }: { classId?: string }) {
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  const [split, setSplit] = useState('source');
  const { data, isLoading, isError, refetch } = useGetFeeFundYearsQuery(classId ? { classId } : {}, { refetchOnMountOrArgChange: REFRESH_AFTER_SECONDS });
  if (isLoading) return <Loading />;
  if (isError) return <ReportUnavailable onRetry={refetch} />;
  if (!data?.years?.length) return <EmptyState text="No fees on record" />;

  const money = (v: number) => (v ? formatMoney(v) : '-');
  const years: any[] = data.years;
  const fundNames: string[] = data.fundNames;
  const methodNames: string[] = data.methodNames;
  const hasLater = data.totals.forLaterYears > 0;

  const yearHeaders = ['Year', 'Total Fee', "For That Year's Fees", 'For Previous Years', ...(hasLater ? ['For Later Years'] : []), ...fundNames, ...methodNames.map(methodLabel), 'Total Collected', 'Still Pending'];
  const yearRows = years.map((y) => [
    String(y.year),
    money(y.billed),
    money(y.forThisYear),
    money(y.forPreviousYears),
    ...(hasLater ? [money(y.forLaterYears)] : []),
    ...fundNames.map((f) => money(y.funds[f] || 0)),
    ...methodNames.map((m) => money(y.methods[m] || 0)),
    money(y.total),
    money(y.pending),
  ]);
  const yearFooter = [
    'All Years',
    money(data.totals.billed),
    money(data.totals.forThisYear),
    money(data.totals.forPreviousYears),
    ...(hasLater ? [money(data.totals.forLaterYears)] : []),
    ...fundNames.map((f) => money(data.totals.funds[f] || 0)),
    ...methodNames.map((m) => money(data.totals.methods[m] || 0)),
    money(data.totals.collected),
    money(data.totals.pending),
  ];
  const yearExcel = years.map((y) => ({
    Year: y.year,
    'Total Fee': y.billed,
    "For That Year's Fees": y.forThisYear,
    'For Previous Years': y.forPreviousYears,
    ...(hasLater ? { 'For Later Years': y.forLaterYears } : {}),
    ...Object.fromEntries(fundNames.map((f) => [f, y.funds[f] || 0])),
    ...Object.fromEntries(methodNames.map((m) => [methodLabel(m), y.methods[m] || 0])),
    'Total Collected': y.total,
    'Still Pending': y.pending,
  }));

  const fundYearRows = years.flatMap((y) =>
    data.funds
      .filter((f: any) => f.billedByYear[y.year] || f.collectedByYear[y.year] || f.pendingByYear[y.year])
      .map((f: any) => ({
        key: `${y.year}-${f.name}`,
        year: y.year,
        name: f.name,
        total: f.billedByYear[y.year] || 0,
        collected: f.collectedByYear[y.year] || 0,
        pending: f.pendingByYear[y.year] || 0,
      })),
  );
  const fundHeaders = ['Year', 'Fee Type', 'Total Fee', 'Collected', 'Pending'];
  const fundRows = fundYearRows.map((r: any) => [String(r.year), r.name, money(r.total), money(r.collected), money(r.pending)]);
  const handlePrint = () => printReport(org, {
    title: 'Funds Report - Year-wise',
    periodLabel: `${years[0].year} to ${years[years.length - 1].year}`,
    generatedByName,
    sections: [
      { type: 'table', heading: 'Each Year', headers: yearHeaders, rows: yearRows, footer: yearFooter },
      { type: 'table', heading: 'Each Fee Type by Year', headers: fundHeaders, rows: fundRows },
    ],
  });

  const splitColumns = split === 'fund'
    ? fundNames.map((f) => ({ key: f, label: f, of: (y: any) => y.funds[f] || 0, total: data.totals.funds[f] || 0 }))
    : split === 'type'
      ? methodNames.map((m) => ({ key: m, label: methodLabel(m), of: (y: any) => y.methods[m] || 0, total: data.totals.methods[m] || 0 }))
      : [
          { key: 'this', label: "For That Year's Fee", of: (y: any) => y.forThisYear, total: data.totals.forThisYear },
          { key: 'prev', label: 'For Previous Years', of: (y: any) => y.forPreviousYears, total: data.totals.forPreviousYears },
          ...(hasLater ? [{ key: 'later', label: 'For Later Years', of: (y: any) => y.forLaterYears, total: data.totals.forLaterYears }] : []),
        ];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <SectionTitle
          title="Each Year"
          hint="Total Fee and Pending go by the year of the fee. Collected is the money received in that year."
          action={
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print</Button>
              <ExportButtons data={yearExcel} sheetName="Year-wise" fileName="Year_Wise_Collection" pdfTitle="Year-wise Collection" headers={yearHeaders} rows={yearRows} landscape />
            </div>
          }
        />
        <ChoiceTabs
          label="Split collected by"
          value={split}
          onChange={setSplit}
          options={[{ value: 'source', label: 'Current vs Old Fees' }, { value: 'fund', label: 'By Fee Type' }, { value: 'type', label: 'By Payment Type' }]}
        />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" style={{ minWidth: 420 + splitColumns.length * 120 }}>
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">Year</th>
                <th className={`${TH} !px-4 !py-2.5`}>Total Fee</th>
                {splitColumns.map((c) => <th key={c.key} className={`${TH} !px-4 !py-2.5 ${COLLECTED}`}>{c.label}</th>)}
                <th className={`${TH} !px-4 !py-2.5 ${COLLECTED}`}>Total Collected</th>
                <th className={`${TH} !px-4 !py-2.5 ${PENDING}`}>Pending</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.year} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 font-semibold">{y.year}</td>
                  <td className={`${TD} !px-4 !py-2`}>{money(y.billed)}</td>
                  {splitColumns.map((c) => <td key={c.key} className={`${TD} !px-4 !py-2 ${COLLECTED}`}>{money(c.of(y))}</td>)}
                  <td className={`${TD} !px-4 !py-2 font-semibold ${COLLECTED}`}>{money(y.total)}</td>
                  <td className={`${TD} !px-4 !py-2 font-semibold ${PENDING}`}>{money(y.pending)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-bold">
                <td className="px-4 py-2.5">All Years</td>
                <td className={`${TD} !px-4 !py-2.5`}>{money(data.totals.billed)}</td>
                {splitColumns.map((c) => <td key={c.key} className={`${TD} !px-4 !py-2.5 ${COLLECTED}`}>{money(c.total)}</td>)}
                <td className={`${TD} !px-4 !py-2.5 ${COLLECTED}`}>{money(data.totals.collected)}</td>
                <td className={`${TD} !px-4 !py-2.5 ${PENDING}`}>{money(data.totals.pending)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <SectionTitle title="Each Fee Type by Year" />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">Year</th>
                <th className="px-4 py-2.5 text-left font-semibold">Fee Type</th>
                <th className={`${TH} !px-4 !py-2.5`}>Total Fee</th>
                <th className={`${TH} !px-4 !py-2.5 ${COLLECTED}`}>Collected</th>
                <th className={`${TH} !px-4 !py-2.5 ${PENDING}`}>Pending</th>
              </tr>
            </thead>
            <tbody>
              {fundYearRows.map((r: any) => (
                <tr key={r.key} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{r.year}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className={`${TD} !px-4 !py-2`}>{money(r.total)}</td>
                  <td className={`${TD} !px-4 !py-2 ${COLLECTED}`}>{money(r.collected)}</td>
                  <td className={`${TD} !px-4 !py-2 font-semibold ${PENDING}`}>{money(r.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * Funds Report: one place to answer, for Tuition, Paper Fund and every other fund, how much
 * was billed, which month the money actually came in and what is still owed, and by whom.
 */
export function FundReport({ year, classId }: { year: number; classId?: string }) {
  const [view, setView] = useState<'month' | 'year'>('month');
  return (
    <div className="space-y-4">
      <div className="inline-flex max-w-full">
        <ChoiceTabs
          label="Report view"
          value={view}
          onChange={(next) => setView(next as 'month' | 'year')}
          options={[{ value: 'month', label: `Month-wise (${year})` }, { value: 'year', label: 'Year-wise (All Years)' }]}
        />
      </div>
      {view === 'month' ? <FundMonthView year={year} classId={classId} /> : <FundYearView classId={classId} />}
    </div>
  );
}

function FundMonthView({ year, classId }: { year: number; classId?: string }) {
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  const classParam = classId ? { classId } : {};
  const { data, isLoading, isError, refetch } = useGetFeeFundReportQuery({ year, ...classParam }, { refetchOnMountOrArgChange: REFRESH_AFTER_SECONDS });
  const [selected, setSelected] = useState<string | null>(null);
  const [split, setSplit] = useState('source');
  const [studentFilter, setStudentFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fundNames: string[] = data?.fundNames || [];
  const methodNames: string[] = data?.methodNames || [];
  // A fund's student-level detail is the heaviest part, so it loads only once a fund is chosen.
  const fund = selected && fundNames.includes(selected) ? selected : undefined;
  const { data: detail, isFetching: detailLoading, isError: detailFailed, refetch: refetchDetail } = useGetFeeFundDetailQuery(
    { year, fund: fund as string, ...classParam },
    { skip: !fund, refetchOnMountOrArgChange: REFRESH_AFTER_SECONDS },
  );

  if (isLoading) return <Loading />;
  if (isError) return <ReportUnavailable onRetry={refetch} />;
  if (!data || !data.funds.length) return <EmptyState text={`No fees for ${year}`} />;

  const money = (v: number) => (v ? formatMoney(v) : '-');
  const months: any[] = data.months;
  const hasLater = data.totals.forLaterMonths > 0;

  const overviewHeaders = ['Fee Type', `Of Which From Before ${year}`, 'Total Fee', 'Collected', 'Pending', 'Collected %'];
  const overviewRows = data.funds.map((f: any) => [f.name, money(f.beforeYear), money(f.billed + f.beforeYear), money(f.collected), money(f.pending), `${f.collectionRate}%`]);
  const overviewFooter = ['Total', money(data.totals.beforeYear), money(data.totals.billed + data.totals.beforeYear), money(data.totals.collected), money(data.totals.pending), ''];

  const monthHeaders = ['Month', "Month's Total Fee", "For This Month's Fee", 'For Previous Months', ...(hasLater ? ['For Later Months'] : []), ...fundNames, ...methodNames.map(methodLabel), 'Total Collected', "Month's Fee Still Pending"];
  const monthRowsPrint = months.map((m) => [
    m.month,
    money(m.billed),
    money(m.forThisMonth),
    money(m.forPreviousMonths),
    ...(hasLater ? [money(m.forLaterMonths)] : []),
    ...fundNames.map((f) => money(m.funds[f] || 0)),
    ...methodNames.map((method) => money(m.methods[method] || 0)),
    money(m.total),
    money(m.stillPending),
  ]);
  const monthFooter = [
    'Year Total',
    money(data.totals.monthBilled),
    money(data.totals.forThisMonth),
    money(data.totals.forPreviousMonths),
    ...(hasLater ? [money(data.totals.forLaterMonths)] : []),
    ...fundNames.map((f) => money(data.totals.funds[f] || 0)),
    ...methodNames.map((method) => money(data.totals.methods[method] || 0)),
    money(data.totals.collected),
    money(data.totals.monthStillPending),
  ];

  const collectionMonths: string[] = detail?.collectionMonths || [];
  const shortLabel = (label: string) => `${label.slice(0, 3)} ${label.slice(-4)}`;
  const feeMonthHeaders = ['Fee Month', 'Students', 'Total Fee', ...collectionMonths.map((l) => `Collected in ${shortLabel(l)}`), 'Total Collected', 'Pending'];
  const feeMonthRows = (detail?.byFeeMonth || []).map((r: any) => [
    r.label,
    r.students,
    money(r.billed),
    ...collectionMonths.map((l) => money(r.collectedIn[l] || 0)),
    money(r.collected),
    money(r.pending),
  ]);
  const collectionsText = (s: any) =>
    Object.entries(s.collections)
      .map(([label, amount]) => `${label.slice(0, 3)}: ${(amount as number).toLocaleString()}`)
      .join(' · ');
  const typesText = (s: any) =>
    Object.entries(s.methods)
      .map(([method, amount]) => `${methodLabel(method)}: ${(amount as number).toLocaleString()}`)
      .join(' · ');
  const studentStatus = (s: any) => (s.pending <= 0 ? 'paid' : s.collected > 0 ? 'partial' : 'unpaid');
  const allStudents: any[] = detail?.students || [];
  const term = search.trim().toLowerCase();
  const students = allStudents.filter((s) => {
    if (studentFilter === 'pending' && s.pending <= 0) return false;
    if (studentFilter === 'paid' && s.pending > 0) return false;
    if (term && !`${s.name} ${s.admissionNumber} ${s.fatherName}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const studentHeaders = ['Student', 'Class', 'Fee Month', 'Total Fee', 'Collected', 'Received In', 'Collection Type', 'Pending', 'Status'];
  const studentRows = students.map((s) => [
    s.name,
    s.className,
    s.feeMonths.map((l: string) => shortLabel(l)).join(', '),
    money(s.billed),
    money(s.collected),
    collectionsText(s) || '-',
    typesText(s) || '-',
    money(s.pending),
    studentStatus(s) === 'paid' ? 'Cleared' : studentStatus(s) === 'partial' ? 'Partial' : 'Unpaid',
  ]);
  const studentExcel = students.map((s) => ({
    Student: s.name,
    'Admission #': s.admissionNumber,
    Father: s.fatherName,
    Phone: s.phone,
    Class: s.className,
    'Fee Month': s.feeMonths.join(', '),
    'Total Fee': s.billed,
    Collected: s.collected,
    ...Object.fromEntries(collectionMonths.map((l) => [`Collected in ${l}`, s.collections[l] || 0])),
    'Collection Type': typesText(s),
    Pending: s.pending,
  }));
  const monthExcel = months.map((m) => ({
    Month: m.month,
    "Month's Total Fee": m.billed,
    "For This Month's Fee": m.forThisMonth,
    'For Previous Months': m.forPreviousMonths,
    ...(hasLater ? { 'For Later Months': m.forLaterMonths } : {}),
    ...Object.fromEntries(fundNames.map((f) => [f, m.funds[f] || 0])),
    ...Object.fromEntries(methodNames.map((method) => [methodLabel(method), m.methods[method] || 0])),
    'Total Collected': m.total,
    "Month's Fee Still Pending": m.stillPending,
  }));

  const splitColumns: { key: string; label: string; tone: string; of: (m: any) => number; total: number }[] = split === 'fund'
    ? fundNames.map((f) => ({ key: f, label: f, tone: COLLECTED, of: (m: any) => m.funds[f] || 0, total: data.totals.funds[f] || 0 }))
    : split === 'type'
      ? methodNames.map((method) => ({ key: method, label: methodLabel(method), tone: COLLECTED, of: (m: any) => m.methods[method] || 0, total: data.totals.methods[method] || 0 }))
      : [
          { key: 'this', label: "For This Month's Fee", tone: COLLECTED, of: (m: any) => m.forThisMonth, total: data.totals.forThisMonth },
          { key: 'prev', label: 'For Previous Months', tone: PREVIOUS, of: (m: any) => m.forPreviousMonths, total: data.totals.forPreviousMonths },
          ...(hasLater ? [{ key: 'later', label: 'For Later Months', tone: '', of: (m: any) => m.forLaterMonths, total: data.totals.forLaterMonths }] : []),
        ];

  const handlePrint = () => {
    const sections: PrintSection[] = [
      { type: 'table', heading: `Fees by Type ${year}`, headers: overviewHeaders, rows: overviewRows, footer: overviewFooter },
      { type: 'table', heading: `Money Received Each Month ${year}`, headers: monthHeaders, rows: monthRowsPrint, footer: monthFooter },
      {
        type: 'table',
        heading: `Each Fund by Collection Type ${year}`,
        headers: ['Fund', ...methodNames.map(methodLabel), 'Total Collected'],
        rows: data.funds.map((f: any) => [f.name, ...methodNames.map((method) => money(f.methods[method] || 0)), money(f.collected)]),
        footer: ['Total', ...methodNames.map((method) => money(data.totals.methods[method] || 0)), money(data.totals.collected)],
      },
    ];
    if (detail) {
      sections.push(
        {
          type: 'summary',
          heading: `${detail.fund} Detail`,
          items: [
            { label: 'Total Fee', value: formatMoney(detail.totals.billed) },
            { label: 'Collected', value: formatMoney(detail.totals.collected) },
            { label: 'Pending', value: formatMoney(detail.totals.pending) },
          ],
        },
        { type: 'table', heading: `${detail.fund}: By Fee Month`, headers: feeMonthHeaders, rows: feeMonthRows },
        { type: 'table', heading: `${detail.fund}: Students`, headers: studentHeaders, rows: studentRows },
      );
    }
    printReport(org, { title: `Funds Report - ${year}`, periodLabel: `Year ${year}`, generatedByName, sections });
  };

  return (
    <div className="space-y-6">
      {/* ── Each fee type: total, collected, pending ── */}
      <section className="space-y-2">
        <SectionTitle
          title={`Fees by Type — ${year}`}
          hint="Click a fee type to see its full detail below, including who still owes it. Pending is as of today."
          action={<Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3 w-3" /> Print Full Report</Button>}
        />
        <FeeTypeSummary
          rows={data.funds.map((f: any) => ({ name: f.name, before: f.beforeYear, total: f.billed + f.beforeYear, collected: f.collected, pending: f.pending }))}
          beforeLabel={`Of Which From Before ${year}`}
          selected={fund}
          onSelect={setSelected}
        />
      </section>

      {/* ── What came in each month ── */}
      <section className="space-y-2">
        <SectionTitle
          title="Money Received Each Month"
          hint="Shows the month the money actually came in, whichever month's fee it paid."
          action={
            <ExportButtons data={monthExcel} sheetName="Month-wise" fileName={`Month_Wise_Collection_${year}`}
              pdfTitle={`Money Received Each Month - ${year}`} headers={monthHeaders} rows={monthRowsPrint} landscape />
          }
        />
        <ChoiceTabs
          label="Split money received by"
          value={split}
          onChange={setSplit}
          options={[{ value: 'source', label: 'This Month vs Previous Months' }, { value: 'fund', label: 'By Fee Type' }, { value: 'type', label: 'By Payment Type' }]}
        />
        {split === 'source' ? <FeeReceivedTable months={months} funds={fundNames} /> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" style={{ minWidth: 300 + splitColumns.length * 130 }}>
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">Month</th>
                {splitColumns.map((c) => <th key={c.key} className={`${TH} !px-4 !py-2.5 ${c.tone}`}>{c.label}</th>)}
                <th className={`${TH} !px-4 !py-2.5 ${COLLECTED}`}>Total Received</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className={`border-b hover:bg-muted/20 ${m.total === 0 ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2 font-medium">{m.month}</td>
                  {splitColumns.map((c) => <td key={c.key} className={`${TD} !px-4 !py-2 ${c.tone}`}>{money(c.of(m))}</td>)}
                  <td className={`${TD} !px-4 !py-2 font-bold`}>{money(m.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-bold">
                <td className="px-4 py-2.5">Year Total</td>
                {splitColumns.map((c) => <td key={c.key} className={`${TD} !px-4 !py-2.5 ${c.tone}`}>{money(c.total)}</td>)}
                <td className={`${TD} !px-4 !py-2.5`}>{money(data.totals.collected)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        )}
      </section>

      {/* ── One fund in full ── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Fund Detail</h3>
          <Select value={fund ?? ''} onValueChange={setSelected}>
            <SelectTrigger className="h-9 w-56 max-w-full"><SelectValue placeholder="Choose a fund" /></SelectTrigger>
            <SelectContent>{fundNames.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {!fund && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Choose a fund to see it by fee month, by class and by student, including who still owes it.
          </p>
        )}
        {fund && detailFailed && <ReportUnavailable onRetry={refetchDetail} />}
        {fund && !detailFailed && (detailLoading && !detail ? <Loading /> : detail && (
          <>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              {[
                { label: 'Total Fee', value: detail.totals.billed, tone: BILLED },
                { label: 'Collected', value: detail.totals.collected, tone: COLLECTED },
                { label: 'Pending', value: detail.totals.pending, tone: PENDING },
              ].map(({ label, value, tone }) => (
                <div key={label} className="min-w-0 rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">{detail.fund} {label}</p>
                  <p className={`mt-0.5 text-lg font-bold tabular-nums [overflow-wrap:anywhere] ${tone}`}>{formatMoney(value)}</p>
                </div>
              ))}
            </div>

            {detail.methodNames.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Collected by type:{' '}
                {detail.methodNames.map((method: string) => `${methodLabel(method)} ${formatMoney(detail.methods[method])}`).join(' · ')}
              </p>
            )}

            <SectionTitle title={`${detail.fund} by Fee Month`} hint="Which month it was billed for, and the months that money came in." />
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs" style={{ minWidth: 480 + collectionMonths.length * 100 }}>
                <thead>
                  <tr className="border-b bg-muted/50 text-[11px]">
                    <th className="px-3 py-2 text-left font-semibold">Fee Month</th>
                    <th className={TH}>Students</th>
                    <th className={`${TH} ${BILLED}`}>Total Fee</th>
                    {collectionMonths.map((l) => <th key={l} className={`${TH} ${COLLECTED}`}>Collected in<br />{shortLabel(l)}</th>)}
                    <th className={`${TH} ${COLLECTED}`}>Total Collected</th>
                    <th className={`${TH} ${PENDING}`}>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.byFeeMonth.map((r: any) => (
                    <tr key={r.label} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-medium">{r.label}</td>
                      <td className={TD}>{r.students}</td>
                      <td className={`${TD} ${BILLED}`}>{money(r.billed)}</td>
                      {collectionMonths.map((l) => <td key={l} className={`${TD} ${COLLECTED}`}>{money(r.collectedIn[l] || 0)}</td>)}
                      <td className={`${TD} font-semibold ${COLLECTED}`}>{money(r.collected)}</td>
                      <td className={`${TD} font-semibold ${PENDING}`}>{money(r.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionTitle title={`${detail.fund} by Class`} />
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 text-[11px]">
                    <th className="px-3 py-2 text-left font-semibold">Class</th>
                    <th className={TH}>Students</th>
                    <th className={`${TH} ${BILLED}`}>Total Fee</th>
                    <th className={`${TH} ${COLLECTED}`}>Collected</th>
                    <th className={`${TH} ${PENDING}`}>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.byClass.map((c: any) => (
                    <tr key={c.className} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-medium">{c.className}</td>
                      <td className={TD}>{c.students}</td>
                      <td className={`${TD} ${BILLED}`}>{money(c.billed)}</td>
                      <td className={`${TD} ${COLLECTED}`}>{money(c.collected)}</td>
                      <td className={`${TD} font-semibold ${PENDING}`}>{money(c.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionTitle
              title={`${detail.fund} by Student (${students.length})`}
              action={
                <ExportButtons data={studentExcel} sheetName={detail.fund} fileName={`${detail.fund.replace(/\s+/g, '_')}_${year}`}
                  pdfTitle={`${detail.fund} - ${year}`} headers={studentHeaders} rows={studentRows} landscape />
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student…" className="h-9 min-w-40 flex-1 sm:max-w-64" aria-label="Search student" />
              <Select value={studentFilter} onValueChange={setStudentFilter}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All students</SelectItem>
                  <SelectItem value="pending">With pending</SelectItem>
                  <SelectItem value="paid">Fully paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[860px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 text-[11px]">
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Student</th>
                    <th className="px-3 py-2 text-left font-semibold">Class</th>
                    <th className="px-3 py-2 text-left font-semibold">Fee Month</th>
                    <th className={`${TH} ${BILLED}`}>Total Fee</th>
                    <th className={`${TH} ${COLLECTED}`}>Collected</th>
                    <th className="px-3 py-2 text-left font-semibold">Received In</th>
                    <th className="px-3 py-2 text-left font-semibold">Collection Type</th>
                    <th className={`${TH} ${PENDING}`}>Pending</th>
                    <th className="px-3 py-2 text-center font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">No students match</td></tr>
                  ) : students.map((s, i) => (
                    <tr key={s.studentId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">{s.admissionNumber}</p>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{s.className}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{s.feeMonths.map((l: string) => shortLabel(l)).join(', ')}</td>
                      <td className={`${TD} ${BILLED}`}>{money(s.billed)}</td>
                      <td className={`${TD} font-semibold ${COLLECTED}`}>{money(s.collected)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{collectionsText(s) || '-'}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{typesText(s) || '-'}</td>
                      <td className={`${TD} font-semibold ${PENDING}`}>{money(s.pending)}</td>
                      <td className="px-3 py-1.5 text-center"><StatusBadge status={studentStatus(s)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
      </section>
    </div>
  );
}
