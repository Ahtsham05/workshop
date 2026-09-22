import { useEffect, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  TrendingUp, TrendingDown, BarChart2, Printer, FileText, Download, FileSpreadsheet,
  BookOpen, GraduationCap, DollarSign, PieChart, Activity, Briefcase, Wallet,
  CalendarClock, Receipt, LineChart as LineChartIcon, LayoutGrid, ClipboardList,
  CalendarCheck, Users, Landmark, UserX,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell,
} from 'recharts';
import {
  useGetSchoolClassesQuery,
  useGetReportFinancialMonthlyQuery,
  useGetReportFinancialDailyQuery,
  useGetReportFinancialPnlQuery,
  useGetReportFinancialCategoriesQuery,
  useGetReportFinancialExpenseDetailQuery,
  useGetReportStudentListQuery,
  useGetReportStudentFeeStatusQuery,
  useGetReportStudentAttendanceQuery,
  useGetReportStudentsLeftQuery,
  useGetReportTeacherSalaryQuery,
  useGetReportTeacherWorkloadQuery,
  useGetReportVouchersQuery,
  useGetReportAnalyticsQuery,
  useGetYearlyFeeReportQuery,
  useGetReceivableSummaryQuery,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { useSelector } from 'react-redux';
import type { RootState } from '@/stores/store';
import { toast } from 'sonner';
import { useFormatMoney } from '@/lib/format-money';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// ═══════════════════════════════════════════════════════════════════════════
// ─── Exports ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function exportToExcel(data: any[], sheetName: string, fileName: string) {
  import('xlsx').then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    toast.success('Excel exported');
  });
}

function exportToPDF(title: string, headers: string[], rows: string[][], fileName: string, landscape = false) {
  import('jspdf').then(({ jsPDF }) => {
    import('jspdf-autotable').then(() => {
      const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text(title, 14, 15);
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 21);
      (doc as any).autoTable({
        head: [headers],
        body: rows,
        startY: 25,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      doc.save(`${fileName}.pdf`);
      toast.success('PDF exported');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════

type TabKey =
  | 'fee-collection'
  | 'financial-monthly'
  | 'financial-daily'
  | 'financial-expense'
  | 'financial-pnl'
  | 'financial-categories'
  | 'students-fee-status'
  | 'students-attendance'
  | 'students-list'
  | 'students-left'
  | 'teachers-salary'
  | 'teachers-workload'
  | 'vouchers'
  | 'analytics';

const DEFAULT_TAB: TabKey = 'fee-collection';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'fee-collection', label: 'Fee Collection', icon: FileText },
  { key: 'financial-monthly', label: 'Monthly Income/Expense', icon: DollarSign },
  { key: 'financial-daily', label: 'Daily Collection', icon: CalendarClock },
  { key: 'financial-expense', label: 'Expense Report', icon: Receipt },
  { key: 'financial-pnl', label: 'Profit & Loss', icon: LineChartIcon },
  { key: 'financial-categories', label: 'Category-wise', icon: LayoutGrid },
  { key: 'students-fee-status', label: 'Fee Status', icon: ClipboardList },
  { key: 'students-attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'students-list', label: 'Student List', icon: Users },
  { key: 'students-left', label: 'Left / Struck Off', icon: UserX },
  { key: 'teachers-salary', label: 'Salary Report', icon: Landmark },
  { key: 'teachers-workload', label: 'Workload', icon: Briefcase },
  { key: 'vouchers', label: 'Vouchers', icon: BookOpen },
  { key: 'analytics', label: 'Analytics', icon: Activity },
];

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));
const isValidTab = (value: string | undefined): value is TabKey => !!value && TAB_KEYS.has(value);

export default function FeeReports() {
  const now = new Date();
  const user = useSelector((s: RootState) => s.auth.data?.user);
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const search = useSearch({ from: '/_authenticated/school/fees/reports/' });
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [tab, setTab] = useState<TabKey>(isValidTab(search.tab) ? search.tab : DEFAULT_TAB);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [voucherStatus, setVoucherStatus] = useState<string>('all');

  // Deep-links from the sidebar (`?tab=financial-pnl`) and the voice
  // quick-links widget land here by setting this search param — picking a
  // tab by hand stays local state only, matching accounts-system.tsx's and
  // the retail Reports page's existing convention (no writing back to the URL).
  useEffect(() => {
    if (isValidTab(search.tab)) setTab(search.tab);
  }, [search.tab]);

  const handleTabChange = (next: string) => {
    if (isValidTab(next)) setTab(next);
  };

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const classes: any[] = (classesData?.results || []).map((c: any) => ({ ...c, id: c.id || c._id })).filter((c: any) => c.id);

  const classFilterSelect = (
    <Select value={classFilter} onValueChange={setClassFilter}>
      <SelectTrigger className="w-40 h-8"><SelectValue placeholder="All Classes" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Classes</SelectItem>
        {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="h-full w-full p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports Center</h1>
          <p className="text-muted-foreground">Comprehensive financial, student, teacher and voucher reports</p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Every report is a single flat tab — no second click through a category first. */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto flex-wrap gap-1 rounded-lg bg-muted p-1 min-w-full sm:min-w-0">
            {TABS.map(({ key, label, icon: Icon }) => (
              <TabsTrigger key={key} value={key} className="text-xs sm:text-sm px-2 sm:px-3 gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="fee-collection" className="mt-4">
          <FeeCollectionTab year={year} month={month} classFilter={classFilter}
            setClassFilter={setClassFilter} classes={classes} orgName={org?.name || 'School'} />
        </TabsContent>

        <TabsContent value="financial-monthly" className="mt-4">
          <FinancialMonthlyReport year={year} />
        </TabsContent>
        <TabsContent value="financial-daily" className="mt-4">
          <FinancialDailyReport year={year} month={month} />
        </TabsContent>
        <TabsContent value="financial-expense" className="mt-4">
          <FinancialExpenseDetailReport year={year} month={month} />
        </TabsContent>
        <TabsContent value="financial-pnl" className="mt-4">
          <FinancialPnlReport year={year} />
        </TabsContent>
        <TabsContent value="financial-categories" className="mt-4">
          <FinancialCategoryReport />
        </TabsContent>

        <TabsContent value="students-fee-status" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">{classFilterSelect}</div>
          <StudentFeeStatusReport year={year} month={month} classId={classFilter !== 'all' ? classFilter : undefined} />
        </TabsContent>
        <TabsContent value="students-attendance" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">{classFilterSelect}</div>
          <StudentAttendanceReport year={year} month={month} classId={classFilter !== 'all' ? classFilter : undefined} />
        </TabsContent>
        <TabsContent value="students-list" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">{classFilterSelect}</div>
          <StudentListReport classId={classFilter !== 'all' ? classFilter : undefined} />
        </TabsContent>
        <TabsContent value="students-left" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">{classFilterSelect}</div>
          <StudentLeftReport classId={classFilter !== 'all' ? classFilter : undefined} />
        </TabsContent>

        <TabsContent value="teachers-salary" className="mt-4">
          <TeacherSalaryReport year={year} />
        </TabsContent>
        <TabsContent value="teachers-workload" className="mt-4">
          <TeacherWorkloadReport />
        </TabsContent>

        <TabsContent value="vouchers" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={voucherStatus} onValueChange={setVoucherStatus}>
              <SelectTrigger className="w-36 h-8"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            {classFilterSelect}
          </div>
          <VoucherReport year={year} month={month}
            status={voucherStatus !== 'all' ? voucherStatus : undefined}
            classId={classFilter !== 'all' ? classFilter : undefined} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsTab year={year} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Fee Collection Tab ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// One student/month cell. Extra funds (e.g. "Examination Fee") get their own
// dedicated column elsewhere in the row, so this shows only the recurring
// base fee's amount — excluding extraFundNames keeps it from being counted
// (and shown) in two places at once.
function FeeMonthCell({ entry, isCurrent, extraFundNames }: { entry: any; isCurrent: boolean; extraFundNames: string[] }) {
  const cellClass = `px-1 py-1.5 text-center ${isCurrent ? 'bg-blue-50/60' : ''}`;

  if (!entry) {
    return <td className={cellClass}><span className="text-muted-foreground/30">-</span></td>;
  }

  const { net, paid } = baseFundAmounts(entry, extraFundNames);

  if (net === 0 && paid === 0) {
    return <td className={cellClass}><span className="text-muted-foreground font-medium" title="Zero fee">0</span></td>;
  }

  // Fully unpaid months render as a blank cell (per report requirement: only
  // show an amount once something has actually been paid).
  if (paid === 0) {
    return <td className={cellClass}></td>;
  }

  return (
    <td className={cellClass}>
      {paid >= net
        ? <span className="text-emerald-600 font-semibold" title="Paid">{paid.toLocaleString()}</span>
        : <span className="text-blue-600 font-medium" title={`Partial: ${paid}/${net}`}>{paid.toLocaleString()}<span className="text-[9px] text-muted-foreground">/{net.toLocaleString()}</span></span>}
    </td>
  );
}

// A class's students can be billed for extra, non-recurring funds alongside
// their regular monthly fee (e.g. a one-off "Paper Fund" voucher). Each such
// fund gets pulled out into its own year-wide column (see FundCell) instead
// of being folded into that month's combined cell, so a student's Jan-Dec
// cells (see FeeMonthCell/baseFundAmounts) show only the recurring fee and
// never double up with a fund's dedicated column. The fund that appears in
// the most student/month slots is treated as that recurring "base" fee.
function getClassExtraFunds(cls: any): string[] {
  const counts: Record<string, number> = {};
  cls.students.forEach((s: any) => {
    MONTHS.forEach((m) => {
      (s.months[m]?.funds || []).forEach((f: { name: string }) => {
        counts[f.name] = (counts[f.name] || 0) + 1;
      });
    });
  });
  const names = Object.keys(counts);
  if (names.length <= 1) return [];
  const baseFund = names.reduce((a, b) => (counts[b] > counts[a] ? b : a), names[0]);
  return names.filter((n) => n !== baseFund);
}

// A month entry's net/paid amount with every extra fund's own share removed,
// leaving just the recurring base fee (falls back to the entry's raw totals
// when there's no per-fund breakdown or no extra funds to subtract).
function baseFundAmounts(entry: any, extraFundNames: string[]): { net: number; paid: number } {
  if (!entry?.funds?.length || extraFundNames.length === 0) {
    return { net: entry?.netAmount || 0, paid: entry?.paidAmount || 0 };
  }
  return entry.funds.reduce(
    (acc: { net: number; paid: number }, f: { name: string; netAmount: number; paidAmount: number }) =>
      extraFundNames.includes(f.name)
        ? acc
        : { net: acc.net + (f.netAmount || 0), paid: acc.paid + (f.paidAmount || 0) },
    { net: 0, paid: 0 },
  );
}

// Sums a single named fund's paid/net amount for a student across the whole
// year. Renders the amount only once something has been paid toward it.
function studentFundTotal(student: any, fundName: string): { paid: number; net: number } {
  let paid = 0, net = 0;
  MONTHS.forEach((m) => {
    const f = (student.months[m]?.funds || []).find((x: { name: string }) => x.name === fundName);
    if (f) { paid += f.paidAmount || 0; net += f.netAmount || 0; }
  });
  return { paid, net };
}

function FundCell({ student, fundName }: { student: any; fundName: string }) {
  const { paid, net } = studentFundTotal(student, fundName);
  if (paid === 0) return <td className="px-1 py-1.5 text-center"></td>;
  return (
    <td className="px-1 py-1.5 text-center">
      {paid < net
        ? <span className="text-blue-600 font-medium" title={`Partial: ${paid}/${net}`}>{paid.toLocaleString()}<span className="text-[9px] text-muted-foreground">/{net.toLocaleString()}</span></span>
        : <span className="text-emerald-600 font-semibold" title="Paid">{paid.toLocaleString()}</span>}
    </td>
  );
}

function FeeCollectionTab({ year, month, classFilter, setClassFilter, classes, orgName }: any) {
  const { data: yearlyReport, isLoading } = useGetYearlyFeeReportQuery(
    { year, ...(classFilter !== 'all' ? { classId: classFilter } : {}) }
  );
  const { data: receivable } = useGetReceivableSummaryQuery({ month, year });
  const formatMoney = useFormatMoney();

  // Build monthly chart data from yearly report
  const monthlyChartData = MONTHS.map((m) => {
    let expected = 0, collected = 0;
    if (yearlyReport) {
      yearlyReport.forEach((cls: any) => {
        cls.students.forEach((s: any) => {
          const entry = s.months[m];
          if (entry) { expected += entry.netAmount || 0; collected += entry.paidAmount || 0; }
        });
      });
    }
    return { name: m.slice(0, 3), expected, collected, pending: Math.max(0, expected - collected) };
  });

  // Month-specific KPIs
  const currentMonthChart = monthlyChartData[MONTHS.indexOf(month)] || { expected: 0, collected: 0, pending: 0 };
  const monthExpected = currentMonthChart.expected;
  const monthCollected = currentMonthChart.collected;
  const monthPending = currentMonthChart.pending;
  const monthRate = monthExpected > 0 ? Math.round((monthCollected / monthExpected) * 100) : 0;

  // Year totals
  const yearExpected = monthlyChartData.reduce((s, m) => s + m.expected, 0);
  const yearCollected = monthlyChartData.reduce((s, m) => s + m.collected, 0);
  const yearRate = yearExpected > 0 ? Math.round((yearCollected / yearExpected) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            if (!yearlyReport?.length) return;
            const rows: any[] = [];
            yearlyReport.forEach((cls: any) => {
              const extraFunds = getClassExtraFunds(cls);
              cls.students.forEach((s: any) => {
                const row: any = { Class: cls.className, Name: s.name, 'Roll#': s.rollNumber, Father: s.fatherName, Phone: s.phone };
                const setMonth = (m: string) => {
                  const e = s.months[m];
                  if (!e) { row[m.slice(0, 3)] = '-'; return; }
                  const { net, paid } = baseFundAmounts(e, extraFunds);
                  row[m.slice(0, 3)] = net === 0 && paid === 0 ? 0 : paid === 0 ? '' : paid < net ? `${paid}/${net}` : paid;
                };
                setMonth(MONTHS[0]);
                extraFunds.forEach((f) => {
                  const { paid, net } = studentFundTotal(s, f);
                  row[f] = paid === 0 ? '' : paid < net ? `${paid}/${net}` : paid;
                });
                MONTHS.slice(1).forEach(setMonth);
                row.Paid = s.totalPaid; row.Pending = s.totalPending;
                rows.push(row);
              });
            });
            exportToExcel(rows, 'Fee Collection', `Fee_Collection_${year}`);
          }} disabled={!yearlyReport?.length}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => printFeeReport(yearlyReport || [], orgName, year)}
            disabled={!yearlyReport?.length}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* ── KPI Section ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Month KPIs */}
        <Card className="border-2 border-blue-100">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" /> {month} {year} — Monthly Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-purple-50 border border-purple-100 p-3">
                <p className="text-[10px] font-medium text-purple-500 uppercase tracking-wide mb-1">Expected</p>
                <p className="text-lg font-bold text-purple-700">{formatMoney(monthExpected)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-[10px] font-medium text-emerald-500 uppercase tracking-wide mb-1">Collected</p>
                <p className="text-lg font-bold text-emerald-700">{formatMoney(monthCollected)}</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="text-[10px] font-medium text-red-400 uppercase tracking-wide mb-1">Pending</p>
                <p className="text-lg font-bold text-red-600">{formatMoney(monthPending)}</p>
              </div>
            </div>
            {/* Collection rate bar */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-muted-foreground">Collection Rate</span>
                <span className={`text-sm font-bold ${monthRate >= 80 ? 'text-emerald-600' : monthRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{monthRate}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${monthRate >= 80 ? 'bg-emerald-500' : monthRate >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${monthRate}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{formatMoney(monthCollected)} collected</span>
                <span>{formatMoney(monthPending)} outstanding</span>
              </div>
            </div>
            {/* Arrears & wallet row */}
            {receivable && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Previous Arrears</p>
                    <p className="text-sm font-semibold text-amber-600">{formatMoney((receivable.previousArrears || 0))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-400" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Advance Wallet</p>
                    <p className="text-sm font-semibold text-teal-600">{formatMoney((receivable.totalCreditBalance || 0))}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Year KPIs */}
        <Card className="border-2 border-slate-100">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-slate-500" /> {year} — Annual Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                <p className="text-[10px] font-medium text-indigo-500 uppercase tracking-wide mb-1">Expected</p>
                <p className="text-lg font-bold text-indigo-700">{formatMoney(yearExpected)}</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                <p className="text-[10px] font-medium text-green-500 uppercase tracking-wide mb-1">Collected</p>
                <p className="text-lg font-bold text-green-700">{formatMoney(yearCollected)}</p>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                <p className="text-[10px] font-medium text-orange-400 uppercase tracking-wide mb-1">Pending</p>
                <p className="text-lg font-bold text-orange-600">{formatMoney((yearExpected - yearCollected))}</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-muted-foreground">Annual Collection Rate</span>
                <span className={`text-sm font-bold ${yearRate >= 80 ? 'text-green-600' : yearRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{yearRate}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${yearRate >= 80 ? 'bg-green-500' : yearRate >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${yearRate}%` }}
                />
              </div>
            </div>
            {/* Class summary */}
            {yearlyReport && (
              <div className="grid grid-cols-3 gap-2 pt-1 border-t text-center">
                <div>
                  <p className="text-lg font-bold text-blue-600">{yearlyReport.length}</p>
                  <p className="text-[10px] text-muted-foreground">Classes</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-700">{yearlyReport.reduce((s: number, c: any) => s + (c.totalStudents || 0), 0)}</p>
                  <p className="text-[10px] text-muted-foreground">Students</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-600">{monthlyChartData.filter((m) => m.collected > 0).length}</p>
                  <p className="text-[10px] text-muted-foreground">Active Months</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Monthly Trend Chart ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Monthly Fee Collection — {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyChartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="expected" fill="#c7d2fe" name="Expected" radius={[3, 3, 0, 0]} />
              <Bar dataKey="collected" fill="#10b981" name="Collected" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pending" fill="#fca5a5" name="Pending" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Per-month summary row ── */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-3 py-2 font-semibold text-[11px]">Month</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-purple-700">Expected</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-emerald-700">Collected</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-red-600">Pending</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px]">Rate</th>
            </tr>
          </thead>
          <tbody>
            {monthlyChartData.map((row, i) => {
              const rate = row.expected > 0 ? Math.round((row.collected / row.expected) * 100) : 0;
              const isCurrent = MONTHS[i] === month;
              return (
                <tr key={row.name} className={`border-b ${isCurrent ? 'bg-blue-50 font-semibold' : 'hover:bg-muted/20'}`}>
                  <td className="px-3 py-1.5 flex items-center gap-1.5">
                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
                    {MONTHS[i]}
                  </td>
                  <td className="px-3 py-1.5 text-right text-purple-700">{row.expected > 0 ? formatMoney(row.expected) : '-'}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{row.collected > 0 ? formatMoney(row.collected) : '-'}</td>
                  <td className="px-3 py-1.5 text-right text-red-500">{row.pending > 0 ? formatMoney(row.pending) : '-'}</td>
                  <td className="px-3 py-1.5 text-right">
                    {row.expected > 0 ? (
                      <span className={`font-semibold ${rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td className="px-3 py-2">Year Total</td>
              <td className="px-3 py-2 text-right text-purple-700">{formatMoney(yearExpected)}</td>
              <td className="px-3 py-2 text-right text-emerald-700">{formatMoney(yearCollected)}</td>
              <td className="px-3 py-2 text-right text-red-700">{formatMoney((yearExpected - yearCollected))}</td>
              <td className="px-3 py-2 text-right">{yearRate}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Class-wise Detail ── */}
      {isLoading ? <Loading /> : !yearlyReport?.length ? <EmptyState text={`No fee data for ${year}`} /> : (
        yearlyReport.map((cls: any) => {
          const extraFunds = getClassExtraFunds(cls);
          // per-month expected for this class — base recurring fee only, since
          // each extra fund already totals its own "Expected" via its column.
          const clsMonthExpected = MONTHS.reduce((acc: Record<string, number>, m) => {
            acc[m] = cls.students.reduce((s: number, st: any) => s + baseFundAmounts(st.months[m], extraFunds).net, 0);
            return acc;
          }, {});
          return (
            <div key={cls.classId} className="space-y-1">
              {/* Class header */}
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-blue-500" /> {cls.className}
                  <span className="text-xs font-normal text-muted-foreground">· {cls.totalStudents} students</span>
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1 text-purple-700 font-medium">
                    Expected: {formatMoney(cls.students.reduce((s: number, st: any) => s + (st.totalPaid || 0) + (st.totalPending || 0), 0))}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    Paid: {formatMoney(cls.classTotalPaid)}
                  </span>
                  <span className="flex items-center gap-1 text-red-600 font-medium">
                    Pending: {formatMoney(cls.classTotalPending)}
                  </span>
                  {cls.classTotalPaid + cls.classTotalPending > 0 && (
                    <span className={`font-bold ${Math.round(cls.classTotalPaid / (cls.classTotalPaid + cls.classTotalPending) * 100) >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {Math.round(cls.classTotalPaid / (cls.classTotalPaid + cls.classTotalPending) * 100)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-2 py-2 font-semibold text-[11px] sticky left-0 bg-muted/50 min-w-[30px]">#</th>
                      <th className="text-left px-2 py-2 font-semibold text-[11px] sticky left-[30px] bg-muted/50 min-w-[140px]">Student Name</th>
                      <th className="text-left px-2 py-2 font-semibold text-[11px] min-w-[60px]">Roll#</th>
                      <th className="text-left px-2 py-2 font-semibold text-[11px] min-w-[130px]">Father Name</th>
                      <th className="text-left px-2 py-2 font-semibold text-[11px] min-w-[100px]">Phone</th>
                      <th className={`text-center px-1 py-2 font-semibold text-[10px] min-w-[64px] ${MONTHS[0] === month ? 'bg-blue-50 text-blue-700' : ''}`}>
                        {MONTHS[0].slice(0, 3)}
                      </th>
                      {extraFunds.map((f) => (
                        <th key={f} className="text-center px-1 py-2 font-semibold text-[10px] min-w-[70px] text-indigo-700">
                          {f}
                        </th>
                      ))}
                      {MONTHS.slice(1).map((m) => (
                        <th key={m} className={`text-center px-1 py-2 font-semibold text-[10px] min-w-[64px] ${m === month ? 'bg-blue-50 text-blue-700' : ''}`}>
                          {m.slice(0, 3)}
                        </th>
                      ))}
                      <th className="text-right px-2 py-2 font-semibold text-[11px] min-w-[70px] text-emerald-700">Paid</th>
                      <th className="text-right px-2 py-2 font-semibold text-[11px] min-w-[70px] text-red-600">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cls.students.map((s: any, idx: number) => (
                      <tr key={s.studentId} className="border-b hover:bg-muted/20">
                        <td className="px-2 py-1.5 text-muted-foreground sticky left-0 bg-background">{idx + 1}</td>
                        <td className="px-2 py-1.5 font-medium sticky left-[30px] bg-background">{s.name}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{s.rollNumber || '-'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{s.fatherName || '-'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{s.phone || '-'}</td>
                        <FeeMonthCell entry={s.months[MONTHS[0]]} isCurrent={MONTHS[0] === month} extraFundNames={extraFunds} />
                        {extraFunds.map((f) => (
                          <FundCell key={f} student={s} fundName={f} />
                        ))}
                        {MONTHS.slice(1).map((m) => (
                          <FeeMonthCell key={m} entry={s.months[m]} isCurrent={m === month} extraFundNames={extraFunds} />
                        ))}
                        <td className="px-2 py-1.5 text-right font-semibold text-emerald-600">{(s.totalPaid || 0).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-red-600">{s.totalPending > 0 ? s.totalPending.toLocaleString() : <span className="text-muted-foreground/40">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/60 font-bold text-[11px]">
                      <td colSpan={5} className="px-2 py-2 sticky left-0 bg-muted/60">Class Total</td>
                      {(() => {
                        const renderMonthTotal = (m: string) => {
                          const mPaid = cls.students.reduce((s: number, st: any) => s + baseFundAmounts(st.months[m], extraFunds).paid, 0);
                          const mExp = clsMonthExpected[m] || 0;
                          return (
                            <td key={m} className={`px-1 py-2 text-center ${m === month ? 'bg-blue-50' : ''}`}>
                              {mExp > 0 ? (
                                <div>
                                  <div className={mPaid > 0 ? 'text-emerald-700' : 'text-muted-foreground/50'}>{mPaid > 0 ? mPaid.toLocaleString() : '-'}</div>
                                  {mExp !== mPaid && <div className="text-[9px] text-purple-600">/{mExp.toLocaleString()}</div>}
                                </div>
                              ) : '-'}
                            </td>
                          );
                        };
                        return (
                          <>
                            {renderMonthTotal(MONTHS[0])}
                            {extraFunds.map((f) => {
                              const fPaid = cls.students.reduce((s: number, st: any) => s + studentFundTotal(st, f).paid, 0);
                              const fNet = cls.students.reduce((s: number, st: any) => s + studentFundTotal(st, f).net, 0);
                              return (
                                <td key={f} className="px-1 py-2 text-center">
                                  {fPaid > 0 ? (
                                    <div>
                                      <div className="text-emerald-700">{fPaid.toLocaleString()}</div>
                                      {fNet !== fPaid && <div className="text-[9px] text-purple-600">/{fNet.toLocaleString()}</div>}
                                    </div>
                                  ) : ''}
                                </td>
                              );
                            })}
                            {MONTHS.slice(1).map(renderMonthTotal)}
                          </>
                        );
                      })()}
                      <td className="px-2 py-2 text-right text-emerald-700">{cls.classTotalPaid?.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right text-red-700">{cls.classTotalPending > 0 ? cls.classTotalPending.toLocaleString() : '-'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial: Monthly Income/Expense ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function FinancialMonthlyReport({ year }: { year: number }) {
  const { data, isLoading } = useGetReportFinancialMonthlyQuery({ year });
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: months, chartData } = data;
  const profitRate = summary.income > 0 ? Math.round((summary.profit / summary.income) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Income {year}</p>
          <p className="text-2xl font-bold text-emerald-700">{formatMoney((summary.income || 0))}</p>
          <p className="text-[11px] text-emerald-600 mt-1">{months.filter((m: any) => m.income > 0).length} active months</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Total Expense {year}</p>
          <p className="text-2xl font-bold text-red-700">{formatMoney((summary.expense || 0))}</p>
          <p className="text-[11px] text-red-600 mt-1">{months.filter((m: any) => m.expense > 0).length} active months</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${summary.profit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${summary.profit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
            <TrendingUp className="h-3 w-3" /> Net Profit {year}
          </p>
          <p className={`text-2xl font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatMoney((summary.profit || 0))}</p>
          <p className={`text-[11px] mt-1 ${summary.profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Margin: {profitRate}%</p>
        </div>
      </div>

      {/* Chart + Export */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart2 className="h-4 w-4 text-slate-500" /> Monthly Income vs Expense — {year}</CardTitle>
          <ExportButtons data={months} sheetName="Monthly" fileName={`Monthly_Report_${year}`}
            pdfTitle={`Monthly Income/Expense - ${year}`}
            headers={['Month', 'Income', 'Expense', 'Profit']}
            rows={months.map((m: any) => [m.month, m.income.toLocaleString(), m.expense.toLocaleString(), m.profit.toLocaleString()])} />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" fill="#10b981" name="Income" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2.5 font-semibold text-[11px]" style={{ width: 120 }}>Month</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-emerald-700">Income</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-red-600">Expense</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Profit / Loss</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Margin</th>
              <th className="px-4 py-2.5" style={{ width: 24 }} />
            </tr>
          </thead>
          <tbody>
            {months.map((m: any) => {
              const margin = m.income > 0 ? Math.round((m.profit / m.income) * 100) : 0;
              const hasData = m.income > 0 || m.expense > 0;
              return (
                <tr key={m.month} className={`border-b hover:bg-muted/20 ${!hasData ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2 font-medium">{m.month}</td>
                  <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{m.income > 0 ? formatMoney(m.income) : '-'}</td>
                  <td className="px-4 py-2 text-right text-red-500">{m.expense > 0 ? formatMoney(m.expense) : '-'}</td>
                  <td className="px-4 py-2 text-right">
                    {hasData ? <span className={`font-bold ${m.profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{formatMoney(m.profit)}</span> : '-'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {hasData ? <span className={`font-semibold ${margin >= 30 ? 'text-emerald-600' : margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{margin}%</span> : '-'}
                  </td>
                  <td className="px-4 py-2 text-right">{hasData ? (m.profit >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-blue-400 inline" /> : <TrendingDown className="h-3.5 w-3.5 text-orange-400 inline" />) : null}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td className="px-4 py-2.5">Year Total</td>
              <td className="px-4 py-2.5 text-right text-emerald-700">{formatMoney((summary.income || 0))}</td>
              <td className="px-4 py-2.5 text-right text-red-600">{formatMoney((summary.expense || 0))}</td>
              <td className="px-4 py-2.5 text-right"><span className={summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}>{formatMoney((summary.profit || 0))}</span></td>
              <td className="px-4 py-2.5 text-right"><span className={profitRate >= 0 ? 'text-blue-700' : 'text-orange-700'}>{profitRate}%</span></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial: Daily Collection ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function FinancialDailyReport({ year, month }: { year: number; month: string }) {
  const { data, isLoading } = useGetReportFinancialDailyQuery({ year, month });
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: days, chartData } = data;
  const avgDaily = summary.activeDays > 0 ? Math.round(summary.totalCollected / summary.activeDays) : 0;
  const activePct = summary.totalDays > 0 ? Math.round((summary.activeDays / summary.totalDays) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">Total Collected</p>
          <p className="text-2xl font-bold text-emerald-700">{formatMoney((summary.totalCollected || 0))}</p>
          <p className="text-[11px] text-emerald-600 mt-1">{month} {year}</p>
        </div>
        <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-4">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Active Days</p>
          <p className="text-2xl font-bold text-blue-700">{summary.activeDays} <span className="text-sm font-normal text-blue-500">/ {summary.totalDays}</span></p>
          <p className="text-[11px] text-blue-600 mt-1">{activePct}% days had collection</p>
        </div>
        <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-4">
          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-1">Daily Average</p>
          <p className="text-2xl font-bold text-purple-700">{formatMoney(avgDaily)}</p>
          <p className="text-[11px] text-purple-600 mt-1">per active day</p>
        </div>
        <div className="rounded-xl border-2 border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-slate-700">{days.reduce((s: number, d: any) => s + (d.transactions || 0), 0)}</p>
          <p className="text-[11px] text-slate-500 mt-1">across {summary.activeDays} days</p>
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /> Daily Collection — {month} {year}</CardTitle>
          <ExportButtons data={days} sheetName="Daily" fileName={`Daily_Collection_${month}_${year}`}
            pdfTitle={`Daily Collection - ${month} ${year}`}
            headers={['Day', 'Date', 'Amount', 'Transactions']}
            rows={days.map((d: any) => [String(d.day), d.date, d.amount.toLocaleString(), String(d.transactions)])} />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} tickLine={false} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number, name: string) => [formatMoney(v as number), name]} labelFormatter={(l) => `Day ${l}`} />
              <Bar dataKey="amount" fill="#10b981" name="Collected" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Table — only active days */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2.5 font-semibold text-[11px]">Day</th>
              <th className="text-left px-4 py-2.5 font-semibold text-[11px]">Date</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-emerald-700">Amount Collected</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {days.filter((d: any) => d.amount > 0).length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No collections recorded for {month}</td></tr>
            ) : days.filter((d: any) => d.amount > 0).map((d: any) => (
              <tr key={d.day} className="border-b hover:bg-muted/20">
                <td className="px-4 py-2 font-medium text-slate-600">{d.day}</td>
                <td className="px-4 py-2 text-muted-foreground">{d.date}</td>
                <td className="px-4 py-2 text-right font-bold text-emerald-600">{formatMoney(d.amount)}</td>
                <td className="px-4 py-2 text-right text-slate-600">{d.transactions}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={2} className="px-4 py-2.5">Total ({summary.activeDays} days)</td>
              <td className="px-4 py-2.5 text-right text-emerald-700">{formatMoney((summary.totalCollected || 0))}</td>
              <td className="px-4 py-2.5 text-right">{days.reduce((s: number, d: any) => s + (d.transactions || 0), 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial: P&L ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function FinancialPnlReport({ year }: { year: number }) {
  const { data, isLoading } = useGetReportFinancialPnlQuery({ year });
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: months, chartData } = data;
  const feeRate = summary.feeExpected > 0 ? Math.round((summary.feeCollected / summary.feeExpected) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Top KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Income</p>
          <p className="text-2xl font-bold text-emerald-700">{formatMoney((summary.income || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Expense</p>
          <p className="text-2xl font-bold text-red-700">{formatMoney((summary.expense || 0))}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${summary.profit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${summary.profit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Net Profit / Loss</p>
          <p className={`text-2xl font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatMoney((summary.profit || 0))}</p>
        </div>
      </div>

      {/* Fee Collection KPIs */}
      <Card className="border-2 border-purple-100">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-purple-700 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Fee Collection Overview — {year}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-[10px] text-purple-500 font-semibold uppercase tracking-wide mb-1">Fee Expected</p>
              <p className="text-xl font-bold text-purple-700">{formatMoney((summary.feeExpected || 0))}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mb-1">Fee Collected</p>
              <p className="text-xl font-bold text-emerald-700">{formatMoney((summary.feeCollected || 0))}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide mb-1">Fee Pending</p>
              <p className="text-xl font-bold text-amber-600">{formatMoney((summary.feePending || 0))}</p>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Collection Rate</span>
              <span className={`font-bold ${feeRate >= 80 ? 'text-emerald-600' : feeRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{feeRate}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${feeRate >= 80 ? 'bg-emerald-500' : feeRate >= 50 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${feeRate}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-purple-500" /> P&L Trend — {year}</CardTitle>
          <ExportButtons data={months} sheetName="PnL" fileName={`PnL_${year}`}
            pdfTitle={`Profit & Loss - ${year}`}
            headers={['Month', 'Income', 'Expense', 'Profit', 'Fee Expected', 'Fee Collected', 'Fee Pending']}
            rows={months.map((m: any) => [m.month, m.income.toLocaleString(), m.expense.toLocaleString(), m.profit.toLocaleString(), m.feeExpected.toLocaleString(), m.feeCollected.toLocaleString(), m.feePending.toLocaleString()])}
            landscape />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Income" />
              <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Expense" />
              <Line type="monotone" dataKey="feeCollected" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" name="Fee Collected" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detail Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2.5 font-semibold text-[11px]">Month</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-emerald-700">Income</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-red-600">Expense</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Profit</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-purple-700">Fee Expected</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-teal-700">Fee Collected</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-amber-600">Fee Pending</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Rate</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m: any) => {
              const hasData = m.income > 0 || m.expense > 0 || m.feeExpected > 0;
              const rate = m.feeExpected > 0 ? Math.round((m.feeCollected / m.feeExpected) * 100) : 0;
              return (
                <tr key={m.month} className={`border-b hover:bg-muted/20 ${!hasData ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2 font-medium">{m.month}</td>
                  <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{m.income > 0 ? formatMoney(m.income) : '-'}</td>
                  <td className="px-4 py-2 text-right text-red-500">{m.expense > 0 ? formatMoney(m.expense) : '-'}</td>
                  <td className="px-4 py-2 text-right"><span className={`font-bold ${m.profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{hasData ? formatMoney(m.profit) : '-'}</span></td>
                  <td className="px-4 py-2 text-right text-purple-600">{m.feeExpected > 0 ? formatMoney(m.feeExpected) : '-'}</td>
                  <td className="px-4 py-2 text-right text-teal-600 font-semibold">{m.feeCollected > 0 ? formatMoney(m.feeCollected) : '-'}</td>
                  <td className="px-4 py-2 text-right text-amber-600">{m.feePending > 0 ? formatMoney(m.feePending) : '-'}</td>
                  <td className="px-4 py-2 text-right">{m.feeExpected > 0 ? <span className={`font-semibold ${rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span> : '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td className="px-4 py-2.5">Year Total</td>
              <td className="px-4 py-2.5 text-right text-emerald-700">{formatMoney((summary.income || 0))}</td>
              <td className="px-4 py-2.5 text-right text-red-600">{formatMoney((summary.expense || 0))}</td>
              <td className="px-4 py-2.5 text-right"><span className={summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}>{formatMoney((summary.profit || 0))}</span></td>
              <td className="px-4 py-2.5 text-right text-purple-700">{formatMoney((summary.feeExpected || 0))}</td>
              <td className="px-4 py-2.5 text-right text-teal-700">{formatMoney((summary.feeCollected || 0))}</td>
              <td className="px-4 py-2.5 text-right text-amber-600">{formatMoney((summary.feePending || 0))}</td>
              <td className="px-4 py-2.5 text-right"><span className={`${feeRate >= 80 ? 'text-emerald-700' : feeRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{feeRate}%</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial: Category-wise ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function FinancialCategoryReport() {
  const { data, isLoading } = useGetReportFinancialCategoriesQuery({});
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: catData } = data;
  const income = catData.income || [];
  const expense = catData.expense || [];

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Income</p>
          <p className="text-2xl font-bold text-emerald-700">{formatMoney((summary.totalIncome || 0))}</p>
          <p className="text-[11px] text-emerald-600 mt-1">{income.length} categor{income.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Total Expense</p>
          <p className="text-2xl font-bold text-red-700">{formatMoney((summary.totalExpense || 0))}</p>
          <p className="text-[11px] text-red-600 mt-1">{expense.length} categor{expense.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${summary.profit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${summary.profit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Net Profit</p>
          <p className={`text-2xl font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatMoney((summary.profit || 0))}</p>
        </div>
      </div>

      {/* Charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Income Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {income.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <RePieChart>
                    <Pie data={income} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={10}>
                      {income.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {income.map((c: any, i: number) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">({c.count} txn{c.count !== 1 ? 's' : ''})</span>
                      </div>
                      <span className="font-bold text-emerald-600">{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState text="No income categories" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" /> Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {expense.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <RePieChart>
                    <Pie data={expense} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={10}>
                      {expense.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {expense.map((c: any, i: number) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">({c.count} txn{c.count !== 1 ? 's' : ''})</span>
                      </div>
                      <span className="font-bold text-red-600">{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState text="No expense categories" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial: Expense Report (month-wise detail) ────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function FinancialExpenseDetailReport({ year, month }: { year: number; month: string }) {
  const { data, isLoading } = useGetReportFinancialExpenseDetailQuery({ year, month });
  const { data: org } = useGetMyOrganizationQuery();
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: detail } = data;
  const transactions = detail.transactions || [];
  const categories = detail.categories || [];
  const paymentMethods = detail.paymentMethods || [];
  const paidPct = summary.totalTransactions > 0 ? Math.round((summary.paidCount / summary.totalTransactions) * 100) : 0;

  const excelRows = transactions.map((t: any) => ({
    Date: new Date(t.date).toLocaleDateString('en-GB'),
    'Expense #': t.expenseNumber || '-',
    'Voucher #': t.voucherNumber || '-',
    Category: t.categoryName,
    Description: t.description || '-',
    Vendor: t.vendor || '-',
    Reference: t.reference || '-',
    'Payment Method': (t.paymentMethod || '').replace('_', ' '),
    Status: t.isPaid ? 'Paid' : 'Pending',
    'Recorded By': t.createdByName || '-',
    Amount: t.amount,
  }));

  const pdfRows = transactions.map((t: any) => [
    new Date(t.date).toLocaleDateString('en-GB'),
    t.expenseNumber || '-',
    t.categoryName,
    t.description || '-',
    t.vendor || '-',
    (t.paymentMethod || '').replace('_', ' '),
    t.isPaid ? 'Paid' : 'Pending',
    t.createdByName || '-',
    t.amount.toLocaleString(),
  ]);

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Total Expense</p>
          <p className="text-2xl font-bold text-red-700">{formatMoney(summary.totalExpense || 0)}</p>
          <p className="text-[11px] text-red-600 mt-1">{month} {year}</p>
        </div>
        <div className="rounded-xl border-2 border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Transactions</p>
          <p className="text-2xl font-bold text-slate-700">{summary.totalTransactions || 0}</p>
          <p className="text-[11px] text-slate-500 mt-1">{summary.categoriesUsed || 0} categor{summary.categoriesUsed === 1 ? 'y' : 'ies'} used</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">Paid</p>
          <p className="text-2xl font-bold text-emerald-700">{formatMoney(summary.paidTotal || 0)}</p>
          <p className="text-[11px] text-emerald-600 mt-1">{summary.paidCount || 0} txns ({paidPct}%)</p>
        </div>
        <div className="rounded-xl border-2 border-amber-100 bg-amber-50 p-4">
          <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-1">Pending</p>
          <p className="text-2xl font-bold text-amber-700">{formatMoney(summary.pendingTotal || 0)}</p>
          <p className="text-[11px] text-amber-600 mt-1">{summary.pendingCount || 0} txns</p>
        </div>
      </div>

      {/* Category + Payment Method breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><PieChart className="h-4 w-4 text-red-500" /> By Category</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {categories.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <RePieChart>
                    <Pie data={categories} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ percent }: any) => `${(percent * 100).toFixed(0)}%`} fontSize={10}>
                      {categories.map((c: any, i: number) => <Cell key={i} fill={c.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {categories.map((c: any) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="font-medium truncate">{c.name}</span>
                        <span className="text-muted-foreground shrink-0">({c.count})</span>
                      </div>
                      <span className="font-bold text-red-600 shrink-0">{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState text="No expenses this month" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-slate-500" /> By Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {paymentMethods.length > 0 ? paymentMethods.map((m: any) => {
              const pct = summary.totalExpense > 0 ? Math.round((m.total / summary.totalExpense) * 100) : 0;
              return (
                <div key={m._id || 'unknown'}>
                  <div className="flex justify-between items-center mb-1 text-xs">
                    <span className="font-medium capitalize">{(m._id || 'unknown').replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{m.count} txn{m.count !== 1 ? 's' : ''} · {pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-0.5">
                    <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right text-xs font-semibold text-slate-700">{formatMoney(m.total)}</div>
                </div>
              );
            }) : <EmptyState text="No expenses this month" />}
          </CardContent>
        </Card>
      </div>

      {/* Full Detail Table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-red-500" /> Expense Detail — {month} {year}</CardTitle>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => printExpenseReport(data, org?.name || 'School', year, month)} disabled={!transactions.length}>
              <Printer className="mr-1 h-3 w-3" /> Print
            </Button>
            <ExportButtons data={excelRows} sheetName="Expenses" fileName={`Expense_Report_${month}_${year}`}
              pdfTitle={`Expense Report - ${month} ${year}`}
              headers={['Date', 'Expense #', 'Category', 'Description', 'Vendor', 'Method', 'Status', 'Recorded By', 'Amount']}
              rows={pdfRows}
              landscape />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Expense #</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Category</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Description</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Vendor</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Method</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Status</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Recorded By</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[11px]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">No expenses recorded for {month} {year}</td></tr>
                ) : transactions.map((t: any, idx: number) => (
                  <tr key={t.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{t.expenseNumber || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${t.categoryColor}1a`, color: t.categoryColor }}>{t.categoryName}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={t.description}>{t.description || '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.vendor || '-'}</td>
                    <td className="px-3 py-2 capitalize">{(t.paymentMethod || '').replace('_', ' ')}</td>
                    <td className="px-3 py-2">
                      {t.isPaid ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">Paid</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t.createdByName || '-'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">{formatMoney(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              {transactions.length > 0 && (
                <tfoot>
                  <tr className="bg-muted font-bold text-[11px]">
                    <td colSpan={9} className="px-3 py-2.5">Total ({transactions.length} transactions)</td>
                    <td className="px-3 py-2.5 text-right text-red-700">{formatMoney(summary.totalExpense || 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Student: List ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function StudentListReport({ classId }: { classId?: string }) {
  const { data, isLoading } = useGetReportStudentListQuery(classId ? { classId } : {});
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: classList } = data;
  const allStudents = classList.flatMap((c: any) => c.students);

  return (
    <div className="space-y-5">
      {/* KPIs + Export */}
      <div className="flex items-center justify-between gap-4">
        <div className="grid grid-cols-2 gap-4 flex-1">
          <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-4">
            <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Total Students</p>
            <p className="text-2xl font-bold text-blue-700">{summary.totalStudents}</p>
          </div>
          <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-4">
            <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-1">Total Classes</p>
            <p className="text-2xl font-bold text-purple-700">{summary.totalClasses}</p>
          </div>
        </div>
        <ExportButtons data={allStudents} sheetName="Students" fileName="Student_List"
          pdfTitle="Student List Report"
          headers={['Name', 'Adm#', 'Roll#', 'Class', 'Father', 'Phone', 'Gender']}
          rows={allStudents.map((s: any) => [s.name, s.admissionNumber, s.rollNumber, s.className, s.fatherName, s.phone, s.gender])} />
      </div>

      {classList.map((cls: any) => (
        <div key={cls.className} className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <h4 className="font-bold text-sm flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-500" /> {cls.className}
              <span className="text-xs font-normal text-muted-foreground">· {cls.count} students</span>
            </h4>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2 font-semibold text-[11px]" style={{ width: 30 }}>#</th>
                  <th className="text-left px-3 py-2 font-semibold text-[11px]">Name</th>
                  <th className="text-left px-3 py-2 font-semibold text-[11px]">Adm#</th>
                  <th className="text-left px-3 py-2 font-semibold text-[11px]">Roll#</th>
                  <th className="text-left px-3 py-2 font-semibold text-[11px]">Father Name</th>
                  <th className="text-left px-3 py-2 font-semibold text-[11px]">Phone</th>
                  <th className="text-left px-3 py-2 font-semibold text-[11px]">Gender</th>
                </tr>
              </thead>
              <tbody>
                {cls.students.map((s: any, i: number) => (
                  <tr key={s.admissionNumber || i} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-semibold">{s.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.admissionNumber || '-'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.rollNumber || '-'}</td>
                    <td className="px-3 py-1.5">{s.fatherName || '-'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.phone || '-'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.gender === 'male' ? 'bg-blue-100 text-blue-700' : s.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
                        {s.gender || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Student: Left / Struck Off ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const LEAVING_REASONS = [
  { value: 'all', label: 'All Reasons' },
  { value: 'fee_default', label: 'Fee Default' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'relocation', label: 'Relocation' },
  { value: 'disciplinary', label: 'Disciplinary' },
  { value: 'academic', label: 'Academic' },
  { value: 'other', label: 'Other' },
];

function StudentLeftReport({ classId }: { classId?: string }) {
  const [reason, setReason] = useState('all');
  const { data, isLoading } = useGetReportStudentsLeftQuery({
    ...(classId ? { classId } : {}),
    ...(reason !== 'all' ? { reason } : {}),
  });
  const formatMoney = useFormatMoney();

  const reasonSelect = (
    <Select value={reason} onValueChange={setReason}>
      <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
      <SelectContent>
        {LEAVING_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (isLoading) return <div className="space-y-4">{reasonSelect}<Loading /></div>;
  if (!data) return <EmptyState />;
  const { summary, data: students, chartData } = data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {reasonSelect}
        <ExportButtons data={students} sheetName="Left Students" fileName="Left_Struck_Off_Students"
          pdfTitle="Left / Struck-Off Students Report"
          headers={['Name', 'Adm#', 'Class', 'Left Date', 'Reason', 'TC#', 'Dues at Leaving', 'Pending Now']}
          rows={students.map((s: any) => [
            s.name, s.admissionNumber, s.className,
            s.leftDate ? new Date(s.leftDate).toLocaleDateString() : '-',
            s.reasonLabel, s.tcNumber || '-',
            s.outstandingDuesAtLeaving.toLocaleString(), s.currentPendingAmount.toLocaleString(),
          ])}
          landscape
        />
      </div>

      {!students.length ? (
        <EmptyState text="No students have been struck off / left yet" />
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Left" value={summary.totalLeft} color="text-slate-700" raw />
            <SummaryCard label="Dues Cleared" value={summary.clearedCount} color="text-emerald-600" raw />
            <SummaryCard label="Still Owing" value={summary.pendingCount} color="text-red-600" raw />
            <SummaryCard label="Outstanding Now" value={summary.totalOutstandingNow} color="text-red-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Reason breakdown chart */}
            {chartData.length > 0 && (
              <Card className="lg:col-span-1">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-slate-500" /> By Reason
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <RePieChart>
                      <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.name}: ${e.value}`}>
                        {chartData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Table */}
            <div className="lg:col-span-2 rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-semibold text-[11px]">Student</th>
                    <th className="text-left px-3 py-2 font-semibold text-[11px]">Class</th>
                    <th className="text-left px-3 py-2 font-semibold text-[11px]">Left Date</th>
                    <th className="text-left px-3 py-2 font-semibold text-[11px]">Reason</th>
                    <th className="text-right px-3 py-2 font-semibold text-[11px] text-red-600">Pending Now</th>
                    <th className="text-center px-3 py-2 font-semibold text-[11px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-muted-foreground text-[10px]">#{s.admissionNumber}</div>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{s.className || '-'}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{s.leftDate ? new Date(s.leftDate).toLocaleDateString() : '-'}</td>
                      <td className="px-3 py-1.5">{s.reasonLabel}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {s.currentPendingAmount > 0
                          ? <span className="text-red-600">{formatMoney(s.currentPendingAmount)}</span>
                          : <span className="text-emerald-600">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {s.isCleared ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">Cleared</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">Owing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Student: Fee Status ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function StudentFeeStatusReport({ year, month, classId }: { year: number; month: string; classId?: string }) {
  const { data, isLoading } = useGetReportStudentFeeStatusQuery({ year, month, ...(classId ? { classId } : {}) });
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: students, chartData } = data;
  const totalCollected = students.reduce((s: number, st: any) => s + (st.paidAmount || 0), 0);
  const totalPending = students.reduce((s: number, st: any) => s + (st.pending || 0), 0);

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Students</p>
          <p className="text-xl font-bold text-blue-700">{summary.totalStudents}</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">Paid</p>
          <p className="text-xl font-bold text-emerald-700">{summary.paid}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Unpaid</p>
          <p className="text-xl font-bold text-red-700">{summary.unpaid}</p>
        </div>
        <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-1">Expected</p>
          <p className="text-lg font-bold text-purple-700">{formatMoney((summary.totalExpected || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-teal-100 bg-teal-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-teal-500 uppercase tracking-wide mb-1">Collection Rate</p>
          <p className={`text-xl font-bold ${summary.collectionRate >= 80 ? 'text-emerald-600' : summary.collectionRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{summary.collectionRate}%</p>
        </div>
      </div>

      {/* Collected vs Pending bar */}
      {(totalCollected + totalPending) > 0 && (
        <div className="rounded-lg border p-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="font-semibold text-emerald-600">Collected: {formatMoney(totalCollected)}</span>
            <span className="font-semibold text-red-600">Pending: {formatMoney(totalPending)}</span>
          </div>
          <div className="h-3 bg-red-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round(totalCollected / (totalCollected + totalPending) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Chart + Table */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-xs font-semibold text-muted-foreground">Status Distribution</CardTitle></CardHeader>
          <CardContent className="pt-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <RePieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, value }: any) => `${name}: ${value}`} fontSize={10}>
                  {chartData.map((e: any, i: number) => <Cell key={i} fill={e.color || PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <div className="md:col-span-3">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Student</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Class</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-purple-700">Net Amount</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-emerald-700">Paid</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-red-600">Pending</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-[11px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s: any, i: number) => (
                  <tr key={s.admissionNumber || i} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.admissionNumber}</p>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.className}</td>
                    <td className="px-3 py-1.5 text-right text-purple-600">{formatMoney(s.netAmount)}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{formatMoney(s.paidAmount)}</td>
                    <td className="px-3 py-1.5 text-right text-red-500">{s.pending > 0 ? formatMoney(s.pending) : '-'}</td>
                    <td className="px-3 py-1.5 text-center"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold text-[11px]">
                  <td colSpan={3} className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right text-purple-700">{formatMoney((summary.totalExpected || 0))}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{formatMoney(totalCollected)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{formatMoney(totalPending)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Student: Attendance ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function StudentAttendanceReport({ year, month, classId }: { year: number; month: string; classId?: string }) {
  const { data, isLoading } = useGetReportStudentAttendanceQuery({ year, month, ...(classId ? { classId } : {}) });
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: students, chartData } = data;
  const avgRate = students.length > 0 ? Math.round(students.reduce((s: number, st: any) => s + (st.attendanceRate || 0), 0) / students.length) : 0;

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Students</p>
          <p className="text-xl font-bold text-blue-700">{summary.totalStudents}</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">Present</p>
          <p className="text-xl font-bold text-emerald-700">{summary.totalPresent}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Absent</p>
          <p className="text-xl font-bold text-red-700">{summary.totalAbsent}</p>
        </div>
        <div className="rounded-xl border-2 border-amber-100 bg-amber-50 p-3 text-center">
          <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-1">Late</p>
          <p className="text-xl font-bold text-amber-700">{summary.totalLate}</p>
        </div>
        <div className={`rounded-xl border-2 p-3 text-center ${avgRate >= 80 ? 'border-green-100 bg-green-50' : avgRate >= 60 ? 'border-amber-100 bg-amber-50' : 'border-red-100 bg-red-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${avgRate >= 80 ? 'text-green-500' : avgRate >= 60 ? 'text-amber-500' : 'text-red-500'}`}>Avg Rate</p>
          <p className={`text-xl font-bold ${avgRate >= 80 ? 'text-green-700' : avgRate >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{avgRate}%</p>
        </div>
      </div>

      {/* Chart + Table */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-xs font-semibold text-muted-foreground">Breakdown</CardTitle></CardHeader>
          <CardContent className="pt-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <RePieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, value }: any) => `${name}: ${value}`} fontSize={10}>
                  {chartData.map((e: any, i: number) => <Cell key={i} fill={e.color || PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <div className="md:col-span-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{month} {year} attendance</span>
            <ExportButtons data={students} sheetName="Attendance" fileName={`Attendance_${month}_${year}`}
              pdfTitle={`Attendance Summary - ${month} ${year}`}
              headers={['Name', 'Class', 'Roll#', 'Present', 'Absent', 'Late', 'Leave', 'Rate']}
              rows={students.map((s: any) => [s.name, s.className, s.rollNumber, String(s.present), String(s.absent), String(s.late), String(s.leave), `${s.attendanceRate}%`])} />
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Name</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Class</th>
                  <th className="text-center px-2 py-2.5 font-semibold text-[11px] text-emerald-700">Present</th>
                  <th className="text-center px-2 py-2.5 font-semibold text-[11px] text-red-600">Absent</th>
                  <th className="text-center px-2 py-2.5 font-semibold text-[11px] text-amber-600">Late</th>
                  <th className="text-center px-2 py-2.5 font-semibold text-[11px] text-purple-600">Leave</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[11px]">Rate</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s: any, i: number) => (
                  <tr key={s.name + i} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-semibold">{s.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.className || '-'}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-emerald-600">{s.present}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-red-500">{s.absent}</td>
                    <td className="px-2 py-1.5 text-center text-amber-600">{s.late}</td>
                    <td className="px-2 py-1.5 text-center text-purple-600">{s.leave}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={`font-bold ${s.attendanceRate >= 80 ? 'text-emerald-600' : s.attendanceRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{s.attendanceRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold text-[11px]">
                  <td colSpan={3} className="px-3 py-2">Total</td>
                  <td className="px-2 py-2 text-center text-emerald-700">{summary.totalPresent}</td>
                  <td className="px-2 py-2 text-center text-red-600">{summary.totalAbsent}</td>
                  <td className="px-2 py-2 text-center text-amber-600">{summary.totalLate}</td>
                  <td className="px-2 py-2 text-center text-purple-600">{summary.totalLeave}</td>
                  <td className="px-3 py-2 text-right">{avgRate}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Teacher: Salary ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function TeacherSalaryReport({ year }: { year: number }) {
  const { data, isLoading } = useGetReportTeacherSalaryQuery({ year });
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: teachers, chartData } = data;

  return (
    <div className="space-y-5">
      {/* KPI Row — 4 cards: Teachers, Paid, Pending, Payable */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-4">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Total Teachers</p>
          <p className="text-2xl font-bold text-blue-700">{summary.totalTeachers}</p>
        </div>
        <div className="rounded-xl border-2 border-green-100 bg-green-50 p-4">
          <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1">Total Paid — {year}</p>
          <p className="text-2xl font-bold text-green-700">{formatMoney((summary.totalSalaryPaid || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-amber-100 bg-amber-50 p-4">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Pending (Draft)</p>
          <p className="text-2xl font-bold text-amber-700">{formatMoney((summary.totalPending || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4">
          <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">Total Payable</p>
          <p className="text-2xl font-bold text-indigo-700">{formatMoney((summary.totalPayable || 0))}</p>
        </div>
      </div>

      {/* Chart — paid (green) vs pending (amber) bars */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-indigo-500" /> Monthly Salary — Paid vs Pending — {year}
          </CardTitle>
          <ExportButtons data={teachers.map((t: any) => {
            const row: any = { Name: t.name, EmpID: t.employeeId, Basic: t.basicSalary };
            MONTHS.forEach((m, i) => {
              const amount = t.months[i + 1] || 0;
              const status = t.monthStatuses?.[i + 1] || '';
              row[m.slice(0, 3)] = amount > 0 ? `${amount} (${status})` : '-';
            });
            row['Paid'] = t.totalPaid;
            row['Pending'] = t.totalPending;
            return row;
          })} sheetName="Salary" fileName={`Teacher_Salary_${year}`}
            pdfTitle={`Teacher Salary - ${year}`}
            headers={['Name', 'Emp ID', ...MONTHS.map((m) => m.slice(0, 3)), 'Paid', 'Pending']}
            rows={teachers.map((t: any) => [t.name, t.employeeId || '', ...MONTHS.map((_: any, i: number) => (t.months[i + 1] || 0).toLocaleString()), t.totalPaid.toLocaleString(), (t.totalPending || 0).toLocaleString()])}
            landscape />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend />
              <Bar dataKey="paid" fill="#10b981" name="Paid" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pending" fill="#f59e0b" name="Pending (Draft)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-teacher table — cell colors: green=paid, amber=pending */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2.5 font-semibold text-[11px] sticky left-0 bg-muted/50 min-w-[140px]">Teacher</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px] min-w-[70px]">Emp ID</th>
              {MONTHS.map((m) => <th key={m} className="text-right px-2 py-2.5 font-semibold text-[10px] min-w-[56px]">{m.slice(0, 3)}</th>)}
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-green-700 min-w-[80px]">Paid</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-amber-600 min-w-[80px]">Pending</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t: any) => (
              <tr key={t.teacherId} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 font-semibold sticky left-0 bg-background">{t.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{t.employeeId || '-'}</td>
                {MONTHS.map((_: any, i: number) => {
                  const amount = t.months[i + 1];
                  const status = t.monthStatuses?.[i + 1];
                  const isPaid = status === 'paid';
                  return (
                    <td key={i} className="px-2 py-2 text-right">
                      {amount ? (
                        <span className={`font-semibold ${isPaid ? 'text-green-600' : 'text-amber-600'}`}>
                          {amount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-bold text-green-700">
                  {t.totalPaid > 0 ? formatMoney(t.totalPaid) : '-'}
                </td>
                <td className="px-3 py-2 text-right font-bold text-amber-600">
                  {(t.totalPending || 0) > 0 ? formatMoney(t.totalPending) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={2} className="px-3 py-2 sticky left-0 bg-muted">Total ({summary.totalTeachers} teachers)</td>
              {MONTHS.map((_: any, i: number) => {
                const mPaid = teachers.filter((t: any) => t.monthStatuses?.[i + 1] === 'paid').reduce((s: number, t: any) => s + (t.months[i + 1] || 0), 0);
                const mPending = teachers.filter((t: any) => t.monthStatuses?.[i + 1] === 'draft').reduce((s: number, t: any) => s + (t.months[i + 1] || 0), 0);
                const total = mPaid + mPending;
                return (
                  <td key={i} className="px-2 py-2 text-right">
                    {total > 0 ? (
                      <span className={mPaid > 0 && mPending === 0 ? 'text-green-700' : mPending > 0 ? 'text-amber-700' : 'text-indigo-700'}>
                        {total.toLocaleString()}
                      </span>
                    ) : '-'}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right text-green-700">{formatMoney((summary.totalSalaryPaid || 0))}</td>
              <td className="px-3 py-2 text-right text-amber-600">{formatMoney((summary.totalPending || 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Paid — salary disbursed</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> Pending — draft / not yet paid</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Teacher: Workload ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function TeacherWorkloadReport() {
  const { data, isLoading } = useGetReportTeacherWorkloadQuery({});
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: teachers, chartData } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SummaryCard label="Total Teachers" value={summary.totalTeachers} color="text-blue-600" raw />
        <ExportButtons data={teachers} sheetName="Workload" fileName="Teacher_Workload"
          pdfTitle="Teacher Workload Report"
          headers={['Name', 'Emp ID', 'Total Periods', 'Days', 'Classes', 'Subjects']}
          rows={teachers.map((t: any) => [t.name, t.employeeId || '', String(t.totalPeriods), String(t.totalDays), String(t.totalClasses), String(t.totalSubjects)])} />
      </div>

      <Card><CardContent className="pt-5">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" fontSize={10} />
            <YAxis dataKey="name" type="category" fontSize={10} width={80} />
            <Tooltip />
            <Legend />
            <Bar dataKey="periods" fill="#8b5cf6" name="Periods/Week" />
            <Bar dataKey="classes" fill="#14b8a6" name="Classes" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent></Card>

      <ReportTable
        headers={['#', 'Teacher', 'Emp ID', 'Total Periods', 'Days/Week', 'Classes', 'Subjects']}
        rows={teachers.map((t: any, i: number) => [
          String(i + 1),
          t.name,
          t.employeeId || '-',
          <span className="font-semibold">{t.totalPeriods}</span>,
          String(t.totalDays),
          String(t.totalClasses),
          String(t.totalSubjects),
        ])}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Voucher Report ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function VoucherReport({ year, month, status, classId }: { year: number; month: string; status?: string; classId?: string }) {
  const { data, isLoading } = useGetReportVouchersQuery({ year, month, ...(status ? { status } : {}), ...(classId ? { classId } : {}) });
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data?.summary) return <EmptyState />;
  const vouchers: any[] = data.data || [];
  const summary = data.summary;
  const chartData: any[] = data.chartData || [];
  const collRate = summary.totalAmount > 0 ? Math.round((summary.totalPaid / summary.totalAmount) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Total Vouchers</p>
          <p className="text-2xl font-bold text-blue-700">{summary.totalVouchers}</p>
        </div>
        <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-1">Total Amount</p>
          <p className="text-xl font-bold text-purple-700">{formatMoney((summary.totalAmount || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">Total Paid</p>
          <p className="text-xl font-bold text-emerald-700">{formatMoney((summary.totalPaid || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Total Pending</p>
          <p className="text-xl font-bold text-red-700">{formatMoney((summary.totalPending || 0))}</p>
        </div>
      </div>

      {/* Collection rate + status pie */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-500" /> {month} {year} — Collection Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Collection Rate</span>
              <span className={`font-bold text-lg ${collRate >= 80 ? 'text-emerald-600' : collRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{collRate}%</span>
            </div>
            <div className="h-3 bg-red-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${collRate >= 80 ? 'bg-emerald-500' : collRate >= 50 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${collRate}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-1">
              {chartData.map((c: any, i: number) => (
                <div key={c.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color || PIE_COLORS[i] }} />
                  <div>
                    <p className="text-[10px] text-muted-foreground">{c.name}</p>
                    <p className="text-sm font-bold">{c.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {chartData.length > 0 && (
          <Card className="md:col-span-1">
            <CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-xs font-semibold text-muted-foreground">Status Distribution</CardTitle></CardHeader>
            <CardContent className="pt-2 pb-4">
              <ResponsiveContainer width="100%" height={150}>
                <RePieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} fontSize={10}>
                    {chartData.map((c: any, i: number) => <Cell key={i} fill={c.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </RePieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Voucher Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
          <span className="text-sm font-semibold">{vouchers.length} Vouchers</span>
          <ExportButtons data={vouchers} sheetName="Vouchers" fileName={`Vouchers_${month}_${year}`}
            pdfTitle={`Voucher Report - ${month} ${year}`}
            headers={['V#', 'Student', 'Class', 'Amount', 'Paid', 'Pending', 'Status']}
            rows={vouchers.map((v: any) => [v.voucherNumber || '', v.name, v.className, v.netAmount?.toLocaleString(), v.paidAmount?.toLocaleString(), v.pending?.toLocaleString(), v.status])} />
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">#</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Voucher#</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Student</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Class</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-purple-700">Amount</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-emerald-700">Paid</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-red-600">Pending</th>
              <th className="text-center px-3 py-2.5 font-semibold text-[11px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No vouchers found</td></tr>
            ) : vouchers.map((v: any, i: number) => (
              <tr key={v.voucherNumber || i} className="border-b hover:bg-muted/20">
                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] font-medium">{v.voucherNumber || '-'}</td>
                <td className="px-3 py-1.5">
                  <p className="font-semibold">{v.name}</p>
                  {v.fatherName && <p className="text-[10px] text-muted-foreground">{v.fatherName}</p>}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{v.className || '-'}</td>
                <td className="px-3 py-1.5 text-right text-purple-600">{formatMoney(v.netAmount)}</td>
                <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{formatMoney(v.paidAmount)}</td>
                <td className="px-3 py-1.5 text-right text-red-500">{v.pending > 0 ? formatMoney(v.pending) : '-'}</td>
                <td className="px-3 py-1.5 text-center"><StatusBadge status={v.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={4} className="px-3 py-2.5">Total ({vouchers.length} vouchers)</td>
              <td className="px-3 py-2.5 text-right text-purple-700">{formatMoney((summary.totalAmount || 0))}</td>
              <td className="px-3 py-2.5 text-right text-emerald-700">{formatMoney((summary.totalPaid || 0))}</td>
              <td className="px-3 py-2.5 text-right text-red-600">{formatMoney((summary.totalPending || 0))}</td>
              <td className="px-3 py-2.5 text-center">{collRate}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Analytics Tab ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function AnalyticsTab({ year }: { year: number }) {
  const { data, isLoading } = useGetReportAnalyticsQuery({ year });
  const formatMoney = useFormatMoney();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { incomeVsExpense, feeCollectionTrend, expenseBreakdown } = data.chartData;

  const totalIncome = incomeVsExpense.reduce((s: number, r: any) => s + (r.income || 0), 0);
  const totalExpense = incomeVsExpense.reduce((s: number, r: any) => s + (r.expense || 0), 0);
  const totalExpected = feeCollectionTrend.reduce((s: number, r: any) => s + (r.expected || 0), 0);
  const totalCollected = feeCollectionTrend.reduce((s: number, r: any) => s + (r.collected || 0), 0);
  const netProfit = totalIncome - totalExpense;
  const collRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Year KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">Total Income ({year})</p>
          <p className="text-xl font-bold text-emerald-700">{formatMoney(totalIncome)}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Total Expense ({year})</p>
          <p className="text-xl font-bold text-red-700">{formatMoney(totalExpense)}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 text-center ${netProfit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${netProfit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Net Profit / Loss</p>
          <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatMoney(netProfit)}</p>
        </div>
        <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-1">Fee Expected</p>
          <p className="text-xl font-bold text-purple-700">{formatMoney(totalExpected)}</p>
        </div>
        <div className="rounded-xl border-2 border-cyan-100 bg-cyan-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-cyan-500 uppercase tracking-wide mb-1">Fee Collected</p>
          <p className="text-xl font-bold text-cyan-700">{formatMoney(totalCollected)}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 text-center ${collRate >= 80 ? 'border-emerald-100 bg-emerald-50' : collRate >= 50 ? 'border-amber-100 bg-amber-50' : 'border-red-100 bg-red-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${collRate >= 80 ? 'text-emerald-500' : collRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>Collection Rate</p>
          <p className={`text-xl font-bold ${collRate >= 80 ? 'text-emerald-700' : collRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{collRate}%</p>
          <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div className={`h-full rounded-full ${collRate >= 80 ? 'bg-emerald-500' : collRate >= 50 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${collRate}%` }} />
          </div>
        </div>
      </div>

      {/* Income vs Expense Bar Chart */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-emerald-500" /> Monthly Income vs Expense — {year}
          </CardTitle>
          <ExportButtons data={incomeVsExpense} sheetName="IncomeVsExpense" fileName={`IncomeVsExpense_${year}`}
            pdfTitle={`Income vs Expense - ${year}`}
            headers={['Month', 'Income', 'Expense']}
            rows={incomeVsExpense.map((r: any) => [r.name, r.income?.toLocaleString(), r.expense?.toLocaleString()])} />
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={incomeVsExpense} margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" fill="#10b981" name="Income" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Fee Collection Trend */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" /> Fee Collection Trend — {year}
          </CardTitle>
          <ExportButtons data={feeCollectionTrend} sheetName="FeeTrend" fileName={`FeeTrend_${year}`}
            pdfTitle={`Fee Collection Trend - ${year}`}
            headers={['Month', 'Expected', 'Collected', 'Rate %']}
            rows={feeCollectionTrend.map((r: any) => [r.name, r.expected?.toLocaleString(), r.collected?.toLocaleString(), `${r.rate}%`])} />
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={feeCollectionTrend} margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="expected" stroke="#8b5cf6" strokeWidth={2} name="Expected" dot={false} />
              <Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} name="Collected" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Expense Breakdown */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PieChart className="h-4 w-4 text-red-500" /> Expense Breakdown — {year}
          </CardTitle>
          {expenseBreakdown?.length > 0 && (
            <ExportButtons data={expenseBreakdown} sheetName="ExpenseBreakdown" fileName={`ExpenseBreakdown_${year}`}
              pdfTitle={`Expense Breakdown - ${year}`}
              headers={['Category', 'Total']}
              rows={expenseBreakdown.map((e: any) => [e.name, e.total?.toLocaleString()])} />
          )}
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          {expenseBreakdown?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={260}>
                <RePieChart>
                  <Pie data={expenseBreakdown} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={10} labelLine>
                    {expenseBreakdown.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                </RePieChart>
              </ResponsiveContainer>
              <div className="space-y-2 pt-2">
                {expenseBreakdown.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm hover:bg-muted/20 rounded px-2 py-1.5">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1">{e.name}</span>
                    <span className="font-semibold text-red-600">{formatMoney(e.total)}</span>
                    <span className="text-[10px] text-muted-foreground">({totalExpense > 0 ? Math.round((e.total / totalExpense) * 100) : 0}%)</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold text-sm px-2">
                  <span>Total</span>
                  <span className="text-red-700">{formatMoney(totalExpense)}</span>
                </div>
              </div>
            </div>
          ) : <EmptyState text="No expense data" />}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Shared Components ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function SummaryCard({ label, value, color, raw }: { label: string; value: any; color: string; raw?: boolean }) {
  const formatMoney = useFormatMoney();
  return (
    <Card><CardContent className="pt-4 pb-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${color}`}>
        {raw ? value : formatMoney(value || 0)}
      </p>
    </CardContent></Card>
  );
}

function ReportTable({ headers, rows, footer }: { headers: string[]; rows: any[][]; footer?: any[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            {headers.map((h, i) => <th key={i} className="text-left px-4 py-2 font-medium text-xs">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="text-center py-8 text-muted-foreground">No data</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
              {row.map((cell, j) => <td key={j} className="px-4 py-2 text-xs">{cell}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="bg-muted font-bold">
              {footer.map((cell, i) => <td key={i} className="px-4 py-2 text-xs">{cell}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
    overdue: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {status?.toUpperCase()}
    </span>
  );
}

function ExportButtons({ data, sheetName, fileName, pdfTitle, headers, rows, landscape }: any) {
  return (
    <div className="flex gap-1.5 shrink-0">
      <Button variant="outline" size="sm" onClick={() => exportToExcel(data, sheetName, fileName)} disabled={!data?.length}>
        <FileSpreadsheet className="mr-1 h-3 w-3" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => exportToPDF(pdfTitle, headers, rows, fileName, landscape)} disabled={!rows?.length}>
        <Download className="mr-1 h-3 w-3" /> PDF
      </Button>
    </div>
  );
}

function Loading() {
  return <div className="text-center py-16 text-muted-foreground text-sm">Loading report...</div>;
}

function EmptyState({ text }: { text?: string }) {
  return <div className="text-center py-16 text-muted-foreground text-sm">{text || 'No data available'}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Print Fee Collection Report ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function printFeeReport(reportData: any[], schoolName: string, year: number) {
  if (!reportData.length) return;
  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow pop-ups to print'); return; }

  const classPages = reportData.map((cls: any) => {
    const extraFunds = getClassExtraFunds(cls);
    const monthCell = (entry: any) => {
      if (!entry) return '<td class="mc">-</td>';
      const { net, paid } = baseFundAmounts(entry, extraFunds);
      if (net === 0 && paid === 0) return '<td class="mc">0</td>';
      if (paid === 0) return '<td class="mc"></td>';
      if (paid >= net) return `<td class="mc paid">${paid.toLocaleString()}</td>`;
      return `<td class="mc partial">${paid.toLocaleString()}</td>`;
    };
    const fundCell = (s: any, f: string) => {
      const { paid } = studentFundTotal(s, f);
      return paid === 0 ? '<td class="mc"></td>' : `<td class="mc paid">${paid.toLocaleString()}</td>`;
    };

    const rows = cls.students.map((s: any, idx: number) => {
      const monthCells = monthCell(s.months[MONTHS[0]])
        + extraFunds.map((f) => fundCell(s, f)).join('')
        + MONTHS.slice(1).map((m) => monthCell(s.months[m])).join('');
      return `<tr><td class="sno">${idx + 1}</td><td class="name">${s.name}</td><td>${s.rollNumber || '-'}</td><td>${s.fatherName || '-'}</td><td>${s.phone || '-'}</td>${monthCells}<td class="tot paid">${s.totalPaid.toLocaleString()}</td><td class="tot unpaid">${s.totalPending > 0 ? s.totalPending.toLocaleString() : '-'}</td></tr>`;
    }).join('');

    const monthFooterCell = (m: string) => {
      const t = cls.students.reduce((s: number, st: any) => s + baseFundAmounts(st.months[m], extraFunds).paid, 0);
      return `<td class="mc ftot">${t > 0 ? t.toLocaleString() : '-'}</td>`;
    };
    const fundFooterCell = (f: string) => {
      const t = cls.students.reduce((s: number, st: any) => s + studentFundTotal(st, f).paid, 0);
      return `<td class="mc ftot">${t > 0 ? t.toLocaleString() : ''}</td>`;
    };
    const footerCells = monthFooterCell(MONTHS[0])
      + extraFunds.map(fundFooterCell).join('')
      + MONTHS.slice(1).map(monthFooterCell).join('');

    const monthHeaders = `<th class="mh">${MONTHS[0].slice(0, 3)}</th>`
      + extraFunds.map((f) => `<th class="mh">${f}</th>`).join('')
      + MONTHS.slice(1).map((m) => `<th class="mh">${m.slice(0, 3)}</th>`).join('');

    // The total row is a plain tbody row, not a <tfoot> — a real <tfoot> is
    // repeated by the browser at the bottom of every printed page a table
    // spans across, which would show the class total on every sheet instead
    // of once at the end of that class's table.
    const totalRow = `<tr class="frow"><td colspan="5" class="ftlabel">Total</td>${footerCells}<td class="ftot paid">${cls.classTotalPaid.toLocaleString()}</td><td class="ftot unpaid">${cls.classTotalPending.toLocaleString()}</td></tr>`;

    return `<div class="page"><div class="header"><h1>${schoolName}</h1><h2>Fee Collection Report - ${year}</h2><h3>Class: ${cls.className} | Students: ${cls.totalStudents}</h3></div><table><thead><tr><th class="sno">#</th><th class="name">Student</th><th>Roll#</th><th>Father</th><th>Phone</th>${monthHeaders}<th class="toth">Paid</th><th class="toth">Pending</th></tr></thead><tbody>${rows}${totalRow}</tbody></table><div class="footer"><span>Printed: ${new Date().toLocaleDateString()}</span><span>${schoolName}</span></div></div>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html><head><title>Fee Report</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:8px;color:#000;background:#fff}.page{width:297mm;padding:8mm 6mm;page-break-after:always}.page:last-child{page-break-after:auto}.header{text-align:center;margin-bottom:6px}.header h1{font-size:16px;font-weight:900;text-transform:uppercase}.header h2{font-size:11px;font-weight:700}.header h3{font-size:10px;color:#444}table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border:1px solid #999;padding:3px 4px}thead tr{background:#e8e8e8}th{font-size:7.5px;font-weight:700;text-transform:uppercase}th.sno{width:20px;text-align:center}th.name{min-width:100px}th.mh{text-align:center;width:48px}th.toth{text-align:right;width:52px}td.sno{text-align:center;color:#555;font-size:7px}td.name{font-weight:600;white-space:nowrap}td.mc{text-align:center;font-size:7.5px}td.mc.paid{color:#047857;font-weight:700}td.mc.partial{color:#2563eb;font-weight:600}td.mc.unpaid{color:#dc2626;font-weight:700}td.tot{text-align:right;font-weight:700;font-size:8px}td.tot.paid{color:#047857}td.tot.unpaid{color:#dc2626}td.ftlabel{font-weight:800;font-size:8px}td.ftot{text-align:center;font-weight:800;font-size:8px}td.ftot.paid{color:#047857;text-align:right}td.ftot.unpaid{color:#dc2626;text-align:right}tbody tr:nth-child(even){background:#fafafa}tbody tr.frow{background:#f3f3f3;break-inside:avoid}.footer{display:flex;justify-content:space-between;margin-top:6px;font-size:7px;color:#888;border-top:1px solid #ccc;padding-top:3px}@media print{@page{size:A4 landscape;margin:5mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${classPages}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Print Expense Report ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function printExpenseReport(reportData: any, schoolName: string, year: number, month: string) {
  const { summary, data: detail } = reportData;
  const transactions = detail.transactions || [];
  const categories = detail.categories || [];
  if (!transactions.length) return;
  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow pop-ups to print'); return; }

  const fmt = (n: number) => (n || 0).toLocaleString();

  const catRows = categories.map((c: any) => {
    const pct = summary.totalExpense > 0 ? Math.round((c.total / summary.totalExpense) * 100) : 0;
    return `<tr><td>${c.name}</td><td class="c">${c.count}</td><td class="r">${fmt(c.total)}</td><td class="c">${pct}%</td></tr>`;
  }).join('');

  const txnRows = transactions.map((t: any, idx: number) => `<tr>
    <td class="c">${idx + 1}</td>
    <td>${new Date(t.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
    <td>${t.expenseNumber || '-'}</td>
    <td>${t.categoryName}</td>
    <td>${t.description || '-'}</td>
    <td>${t.vendor || '-'}</td>
    <td class="cap">${(t.paymentMethod || '').replace('_', ' ')}</td>
    <td class="c ${t.isPaid ? 'paid' : 'pending'}">${t.isPaid ? 'Paid' : 'Pending'}</td>
    <td>${t.createdByName || '-'}</td>
    <td class="r">${fmt(t.amount)}</td>
  </tr>`).join('');

  win.document.write(`<!DOCTYPE html><html><head><title>Expense Report - ${month} ${year}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:9px;color:#111;background:#fff;padding:10mm}
.header{text-align:center;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:8px}
.header h1{font-size:18px;font-weight:900;text-transform:uppercase}
.header h2{font-size:12px;font-weight:700;margin-top:2px;color:#333}
.header h3{font-size:10px;color:#666;margin-top:2px}
.summary{display:flex;gap:8px;margin:12px 0}
.box{flex:1;border:1px solid #ccc;border-radius:4px;padding:8px;text-align:center}
.box .l{font-size:8px;text-transform:uppercase;color:#666;font-weight:700}
.box .v{font-size:14px;font-weight:800;margin-top:2px}
.box.exp .v{color:#b91c1c}
.box.paid .v{color:#047857}
.box.pend .v{color:#b45309}
h4.section{font-size:11px;text-transform:uppercase;margin:14px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px}
table{width:100%;border-collapse:collapse;margin-top:2px}
th,td{border:1px solid #ccc;padding:4px 5px}
thead{display:table-header-group}
th{background:#f0f0f0;font-size:8px;text-transform:uppercase;font-weight:700;text-align:left}
td{font-size:8.5px}
td.c{text-align:center}
td.r{text-align:right;font-weight:700}
td.cap{text-transform:capitalize}
td.paid{color:#047857;font-weight:700}
td.pending{color:#b45309;font-weight:700}
tbody tr:nth-child(even){background:#fafafa}
tfoot td{font-weight:800;background:#f0f0f0}
.footer{display:flex;justify-content:space-between;margin-top:10px;font-size:7.5px;color:#888;border-top:1px solid #ccc;padding-top:4px}
@media print{@page{size:A4 portrait;margin:8mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header">
  <h1>${schoolName}</h1>
  <h2>Expense Report</h2>
  <h3>${month} ${year}</h3>
</div>
<div class="summary">
  <div class="box exp"><div class="l">Total Expense</div><div class="v">${fmt(summary.totalExpense)}</div></div>
  <div class="box"><div class="l">Transactions</div><div class="v">${summary.totalTransactions || 0}</div></div>
  <div class="box paid"><div class="l">Paid</div><div class="v">${fmt(summary.paidTotal)}</div></div>
  <div class="box pend"><div class="l">Pending</div><div class="v">${fmt(summary.pendingTotal)}</div></div>
</div>
<h4 class="section">Category Breakdown</h4>
<table><thead><tr><th>Category</th><th class="c">Txns</th><th class="r">Total</th><th class="c">%</th></tr></thead><tbody>${catRows}</tbody></table>
<h4 class="section">Transaction Detail</h4>
<table><thead><tr><th>#</th><th>Date</th><th>Expense #</th><th>Category</th><th>Description</th><th>Vendor</th><th>Method</th><th>Status</th><th>Recorded By</th><th class="r">Amount</th></tr></thead>
<tbody>${txnRows}</tbody>
<tfoot><tr><td colspan="9">Total (${transactions.length} transactions)</td><td class="r">${fmt(summary.totalExpense)}</td></tr></tfoot>
</table>
<div class="footer"><span>Printed: ${new Date().toLocaleString()}</span><span>${schoolName} — Expense Report</span></div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}
