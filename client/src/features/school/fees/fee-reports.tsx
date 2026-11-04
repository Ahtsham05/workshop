import { Fragment, useEffect, useState } from 'react';
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
  ChevronDown,
  ChevronRight,
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
  useGetReportStudentAttendanceQuery,
  useGetReportStudentsLeftQuery,
  useGetReportTeacherSalaryQuery,
  useGetReportTeacherWorkloadQuery,
  useGetReportVouchersQuery,
  useGetReportAnalyticsQuery,
  useGetYearlyFeeReportQuery,
  useGetFeeFundReportQuery,
  useGetFeePositionQuery,
  useGetFeePositionYearQuery,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { useSelector } from 'react-redux';
import type { RootState } from '@/stores/store';
import { toast } from 'sonner';
import { useFormatMoney } from '@/lib/format-money';
import ReceiptRegister from './receipt-register';
import FeeCollectionReports from './fee-collection-reports';
import { useOrgAndUser, printReport, openReportPrintWindow, type PrintSection } from './report-print';
import { ChoiceTabs, FeeHeadsTable, FeePositionCards, FeeReceivedTable, FeeTypeSummary, FundTotals, MonthDetail, feePositionPrintSections, paidForRows, receivedFigures, type FeeTypeRow } from './fee-position';
import { FundReport } from './fee-fund-report';
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// ═══════════════════════════════════════════════════════════════════════════
// ─── Exports ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export function exportToExcel(data: any[], sheetName: string, fileName: string) {
  import('xlsx').then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    toast.success('Excel exported');
  });
}

export function exportToPDF(title: string, headers: string[], rows: string[][], fileName: string, landscape = false) {
  import('jspdf').then(({ jsPDF }) => {
    import('jspdf-autotable').then(() => {
      const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text(title, 14, 15);
      doc.setFontSize(8);
      doc.text(`Generated: ${formatAppDate(new Date())}`, 14, 21);
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
  | 'collection-reports'
  | 'receipt-register'
  | 'funds-report'
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
  { key: 'collection-reports', label: 'Collection Reports', icon: PieChart },
  { key: 'receipt-register', label: 'Receipt Register', icon: Receipt },
  { key: 'funds-report', label: 'Funds Report', icon: Wallet },
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

        <TabsContent value="collection-reports" className="mt-4">
          <FeeCollectionReports />
        </TabsContent>

        <TabsContent value="receipt-register" className="mt-4">
          <ReceiptRegister />
        </TabsContent>

        <TabsContent value="funds-report" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">{classFilterSelect}</div>
          <FundReport year={year} classId={classFilter !== 'all' ? classFilter : undefined} />
        </TabsContent>

        <TabsContent value="financial-monthly" className="mt-4">
          <FinancialMonthlyReport year={year} onOpenFunds={() => handleTabChange('funds-report')} />
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
  const cellClass = `px-1 py-1.5 text-center ${isCurrent ? 'bg-blue-50/60 dark:bg-blue-950/40' : ''}`;

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
  const classParam = classFilter !== 'all' ? { classId: classFilter } : {};
  // The cards come from the fast summary, so they don't wait for the per-student figures.
  const { data: position, isLoading: positionLoading } = useGetFeePositionQuery({ month, year, ...classParam }, { refetchOnMountOrArgChange: 60 });
  const { data: studentPositions } = useGetFeePositionQuery({ month, year, detail: 'students', ...classParam }, { refetchOnMountOrArgChange: 60 });
  const { data: positionYear } = useGetFeePositionYearQuery({ year, ...classParam }, { refetchOnMountOrArgChange: 60 });
  const formatMoney = useFormatMoney();
  const studentPosition = (studentId: string) => studentPositions?.students?.find((row: any) => row.studentId === studentId);
  const shortMonth = month.slice(0, 3);

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
                const pos = studentPosition(s.studentId);
                row.Paid = s.totalPaid;
                row['Previous Pending'] = pos?.previousPending || 0;
                row[`${shortMonth} Pending`] = pos?.currentPending || 0;
                row['Total Pending'] = pos?.totalPending || 0;
                rows.push(row);
              });
            });
            exportToExcel(rows, 'Fee Collection', `Fee_Collection_${year}`);
          }} disabled={!yearlyReport?.length}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => printFeeReport(yearlyReport || [], orgName, year, month, studentPositions?.students || [])}
            disabled={!yearlyReport?.length}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* ── Fee position for the selected month ── */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Activity className="h-4 w-4 text-blue-500" /> {month} {year} — Fee Position
        </h3>
        <FeePositionCards summary={position?.summary} month={month} isLoading={positionLoading} />
        <FeeHeadsTable heads={position?.heads} summary={position?.summary} month={month} isLoading={positionLoading} />
      </div>

      {/* ── KPI Section ── */}
      <div className="grid grid-cols-1 gap-4">
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
                <p className="text-[10px] font-medium text-indigo-500 uppercase tracking-wide mb-1">Billed in {year}</p>
                <p className="text-lg font-bold text-indigo-700">{formatMoney(yearExpected)}</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                <p className="text-[10px] font-medium text-green-500 uppercase tracking-wide mb-1">Collected</p>
                <p className="text-lg font-bold text-green-700">{formatMoney(yearCollected)}</p>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                <p className="text-[10px] font-medium text-orange-400 uppercase tracking-wide mb-1">Unpaid from {year}</p>
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
              <Bar dataKey="expected" fill="#c7d2fe" name="Billed" radius={[3, 3, 0, 0]} />
              <Bar dataKey="collected" fill="#10b981" name="Collected" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pending" fill="#fca5a5" name="Pending" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Per-month summary row ── */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-3 py-2 font-semibold text-[11px]">Month</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-amber-700 dark:text-amber-400">Previous Pending</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-blue-700 dark:text-blue-400">Month's Fee</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-purple-700 dark:text-purple-400">Total Expected</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-emerald-700 dark:text-emerald-400">Received</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px] text-red-600 dark:text-red-400">Total Pending</th>
              <th className="text-right px-3 py-2 font-semibold text-[11px]">Rate</th>
            </tr>
          </thead>
          <tbody>
            {(positionYear?.rows || []).map((row: any) => {
              const isCurrent = row.month === month;
              const money = (v: number) => (v > 0 ? formatMoney(v) : '-');
              return (
                <tr key={row.month} className={`border-b ${isCurrent ? 'bg-blue-50 dark:bg-blue-950/50 font-semibold' : 'hover:bg-muted/20'}`}>
                  <td className="px-3 py-1.5 flex items-center gap-1.5">
                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
                    {row.month}
                  </td>
                  <td className="px-3 py-1.5 text-right text-amber-700 dark:text-amber-400">{money(row.previousDue)}</td>
                  <td className="px-3 py-1.5 text-right text-blue-700 dark:text-blue-400">{money(row.currentFee)}</td>
                  <td className="px-3 py-1.5 text-right text-purple-700 dark:text-purple-400">{money(row.totalExpected)}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold">{money(row.totalReceived)}</td>
                  <td className="px-3 py-1.5 text-right text-red-500 dark:text-red-400">{money(row.totalPending)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {row.totalExpected > 0 ? (
                      <span className={`font-semibold ${row.collectionRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : row.collectionRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{row.collectionRate}%</span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {positionYear?.totals && (
            <tfoot>
              <tr className="bg-muted font-bold text-[11px]">
                <td className="px-3 py-2">Whole Year</td>
                <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">{formatMoney(positionYear.totals.previousDue)}</td>
                <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-400">{formatMoney(positionYear.totals.currentFee)}</td>
                <td className="px-3 py-2 text-right text-purple-700 dark:text-purple-400">{formatMoney(positionYear.totals.totalExpected)}</td>
                <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">{formatMoney(positionYear.totals.totalReceived)}</td>
                <td className="px-3 py-2 text-right text-red-700 dark:text-red-400">{formatMoney(positionYear.totals.totalPending)}</td>
                <td className="px-3 py-2 text-right">{positionYear.totals.collectionRate}%</td>
              </tr>
            </tfoot>
          )}
        </table>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Previous Pending is what is still unpaid today from earlier months, plus what was recovered during that month. Whole Year starts from dues older than January.
        </p>
      </div>

      {/* ── Class-wise Detail ── */}
      {isLoading ? <Loading /> : !yearlyReport?.length ? <EmptyState text={`No fee data for ${year}`} /> : (
        yearlyReport.map((cls: any) => {
          const extraFunds = getClassExtraFunds(cls);
          const clsPosition = cls.students.reduce(
            (acc: { previous: number; current: number; total: number }, st: any) => {
              const pos = studentPosition(st.studentId);
              return {
                previous: acc.previous + (pos?.previousPending || 0),
                current: acc.current + (pos?.currentPending || 0),
                total: acc.total + (pos?.totalPending || 0),
              };
            },
            { previous: 0, current: 0, total: 0 },
          );
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
                  <GraduationCap className="h-4 w-4 text-blue-500 dark:text-blue-400" /> {cls.className}
                  <span className="text-xs font-normal text-muted-foreground">· {cls.totalStudents} students</span>
                </h3>
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1 text-purple-700 dark:text-purple-400 font-medium">
                    Billed in {year}: {formatMoney(cls.students.reduce((s: number, st: any) => s + (st.totalPaid || 0) + (st.totalPending || 0), 0))}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    Paid: {formatMoney(cls.classTotalPaid)}
                  </span>
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                    Previous Pending: {formatMoney(clsPosition.previous)}
                  </span>
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    Total Pending: {formatMoney(clsPosition.total)}
                  </span>
                  {cls.classTotalPaid + cls.classTotalPending > 0 && (
                    <span className={`font-bold ${Math.round(cls.classTotalPaid / (cls.classTotalPaid + cls.classTotalPending) * 100) >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
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
                      <th className={`text-center px-1 py-2 font-semibold text-[10px] min-w-[64px] ${MONTHS[0] === month ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400' : ''}`}>
                        {MONTHS[0].slice(0, 3)}
                      </th>
                      {extraFunds.map((f) => (
                        <th key={f} className="text-center px-1 py-2 font-semibold text-[10px] min-w-[70px] text-indigo-700">
                          {f}
                        </th>
                      ))}
                      {MONTHS.slice(1).map((m) => (
                        <th key={m} className={`text-center px-1 py-2 font-semibold text-[10px] min-w-[64px] ${m === month ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400' : ''}`}>
                          {m.slice(0, 3)}
                        </th>
                      ))}
                      <th className="text-right px-2 py-2 font-semibold text-[11px] min-w-[70px] text-emerald-700 dark:text-emerald-400">Paid</th>
                      <th className="text-right px-2 py-2 font-semibold text-[11px] min-w-[80px] text-amber-700 dark:text-amber-400">Previous Pending</th>
                      <th className="text-right px-2 py-2 font-semibold text-[11px] min-w-[70px] text-blue-700 dark:text-blue-400">{shortMonth} Pending</th>
                      <th className="text-right px-2 py-2 font-semibold text-[11px] min-w-[70px] text-red-600 dark:text-red-400">Total Pending</th>
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
                        <td className="px-2 py-1.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{(s.totalPaid || 0).toLocaleString()}</td>
                        {(() => {
                          const pos = studentPosition(s.studentId);
                          const amount = (v?: number) => ((v || 0) > 0 ? (v || 0).toLocaleString() : <span className="text-muted-foreground/40">-</span>);
                          return (
                            <>
                              <td className="px-2 py-1.5 text-right font-medium text-amber-700 dark:text-amber-400" title={pos?.previousMonths?.join(', ')}>{amount(pos?.previousPending)}</td>
                              <td className="px-2 py-1.5 text-right font-medium text-blue-700 dark:text-blue-400">{amount(pos?.currentPending)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold text-red-600 dark:text-red-400">{amount(pos?.totalPending)}</td>
                            </>
                          );
                        })()}
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
                            <td key={m} className={`px-1 py-2 text-center ${m === month ? 'bg-blue-50 dark:bg-blue-950/50' : ''}`}>
                              {mExp > 0 ? (
                                <div>
                                  <div className={mPaid > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/50'}>{mPaid > 0 ? mPaid.toLocaleString() : '-'}</div>
                                  {mExp !== mPaid && <div className="text-[9px] text-purple-600 dark:text-purple-400">/{mExp.toLocaleString()}</div>}
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
                                      <div className="text-emerald-700 dark:text-emerald-400">{fPaid.toLocaleString()}</div>
                                      {fNet !== fPaid && <div className="text-[9px] text-purple-600 dark:text-purple-400">/{fNet.toLocaleString()}</div>}
                                    </div>
                                  ) : ''}
                                </td>
                              );
                            })}
                            {MONTHS.slice(1).map(renderMonthTotal)}
                          </>
                        );
                      })()}
                      <td className="px-2 py-2 text-right text-emerald-700 dark:text-emerald-400">{cls.classTotalPaid?.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right text-amber-700 dark:text-amber-400">{clsPosition.previous > 0 ? clsPosition.previous.toLocaleString() : '-'}</td>
                      <td className="px-2 py-2 text-right text-blue-700 dark:text-blue-400">{clsPosition.current > 0 ? clsPosition.current.toLocaleString() : '-'}</td>
                      <td className="px-2 py-2 text-right text-red-700 dark:text-red-400">{clsPosition.total > 0 ? clsPosition.total.toLocaleString() : '-'}</td>
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

// Paid once when a student joins, so it isn't part of the regular fee picture.
const isOneOffFee = (name: string) => /admission/i.test(name);

function FinancialMonthlyReport({ year, onOpenFunds }: { year: number; onOpenFunds: () => void }) {
  const { data, isLoading } = useGetReportFinancialMonthlyQuery({ year }, { refetchOnMountOrArgChange: 60 });
  const { data: fundReport, isLoading: fundReportLoading } = useGetFeeFundReportQuery({ year }, { refetchOnMountOrArgChange: 60 });
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  const [feeView, setFeeView] = useState('all');
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: months, chartData } = data;
  const profitRate = summary.income > 0 ? Math.round((summary.profit / summary.income) * 100) : 0;
  const allFundNames: string[] = data.fundNames || [];
  // One-off fees stay out of these fee tables. Their money is still income, so it moves to Other Income.
  const fundNames = allFundNames.filter((f) => !isOneOffFee(f));
  const oneOffFunds = allFundNames.filter(isOneOffFee);
  const otherIncomeOf = (m: any): number =>
    (m.otherIncome || 0) + oneOffFunds.reduce((total, f) => total + (m.funds?.[f] || 0), 0);
  const oneOffTotal = oneOffFunds.reduce((total, f) => total + (summary.funds?.[f] || 0), 0);
  const totalOtherIncome = (summary.otherIncome || 0) + oneOffTotal;
  const hasOtherIncome = totalOtherIncome > 0;
  // An older server sends no fee breakdown: show income only rather than a false Rs0.00 pending.
  const hasFeeDetail = summary.feePending !== undefined;
  const money = (v: number) => (v > 0 ? formatMoney(v) : '-');

  const feeTypes: FeeTypeRow[] = fundNames.map((name) => {
    const collected = summary.funds?.[name] || 0;
    const pending = summary.pendingFunds?.[name] || 0;
    return { name, total: collected + pending, collected, pending };
  });
  const view = feeView !== 'all' && fundNames.includes(feeView) ? feeView : 'all';
  const feesOf = (m: any, fund: string) => {
    const sumOf = (bucket: any) => (fund === 'all' ? fundNames : [fund]).reduce((total, f) => total + (bucket?.[f] || 0), 0);
    const collected = sumOf(m.funds);
    const pending = sumOf(m.pendingFunds);
    return { total: collected + pending, collected, pending };
  };
  const feeTotals = view === 'all'
    ? feeTypes.reduce((acc, r) => ({ total: acc.total + r.total, collected: acc.collected + r.collected, pending: acc.pending + r.pending }), { total: 0, collected: 0, pending: 0 })
    : feeTypes.find((r) => r.name === view) || { total: 0, collected: 0, pending: 0 };
  const percent = (f: { total: number; collected: number }) => (f.total > 0 ? Math.min(100, Math.round((f.collected / f.total) * 100)) : 0);

  const toggleMonth = (month: string) => setOpenMonths((prev) => ({ ...prev, [month]: !prev[month] }));
  const monthHasFees = (m: any) => feesOf(m, 'all').total > 0;
  // First cell of a month row: clicking anywhere on the row opens it, this keeps it reachable by keyboard.
  const monthToggle = (m: any) => monthHasFees(m) ? (
    <button
      type="button"
      aria-expanded={!!openMonths[m.month]}
      className="flex items-center gap-1 underline-offset-2 hover:underline"
      onClick={(event) => { event.stopPropagation(); toggleMonth(m.month); }}
    >
      {openMonths[m.month] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      {m.month}
    </button>
  ) : <span className="pl-[18px]">{m.month}</span>;
  const monthDetailRow = (m: any, columns: number, funds: string[]) => openMonths[m.month] && (
    <tr className="border-b bg-blue-50/50 text-left dark:bg-blue-950/20">
      <td colSpan={columns} className="p-0">
        <div className="sticky left-0 px-3 py-3" style={{ width: 'max(280px, min(1100px, calc(100vw - 340px)))' }}>
          <MonthDetail
            month={m.month}
            year={year}
            funds={funds}
            loading={fundReportLoading}
            received={fundReport?.months?.find((row: any) => row.month === m.month)}
            feeOf={(fund) => feesOf(m, fund)}
          />
        </div>
      </td>
    </tr>
  );

  // A bank-style balance after each month: income less expense, built up from January.
  const closingBalance: Record<string, number> = {};
  months.reduce((balance: number, m: any) => {
    closingBalance[m.month] = balance + m.profit;
    return closingBalance[m.month];
  }, 0);
  // What was already unpaid before January: every pending total starts from it.
  const openingOf = (fund: string): number =>
    (fund === 'all' ? fundNames : [fund]).reduce((total, f) => total + (summary.openingPendingFunds?.[f] || 0), 0);
  const pendingBalanceOf = (fund: string) => {
    const balances: Record<string, number> = {};
    months.reduce((balance: number, m: any) => {
      balances[m.month] = balance + feesOf(m, fund).pending;
      return balances[m.month];
    }, openingOf(fund));
    return balances;
  };
  const closingPendingOf = (fund: string) => pendingBalanceOf(fund).December;
  const feeGroups = [
    ...(fundNames.length > 1 ? fundNames.map((f) => ({ key: f, label: f })) : []),
    { key: 'all', label: 'All Fees' },
  ];
  const groupBalances = Object.fromEntries(feeGroups.map((g) => [g.key, pendingBalanceOf(g.key)]));
  const hasOpening = openingOf('all') > 0;
  const feeColumns = ['Expected', 'Collected', 'Pending', 'Pending Total'];
  const viewPendingBalance = pendingBalanceOf(view);
  const balanceText = (v: number) => `${formatMoney(Math.abs(v))} ${v < 0 ? 'Dr' : 'Cr'}`;
  const signedText = (v: number) => (v < 0 ? `(${formatMoney(Math.abs(v))})` : formatMoney(v));
  const hasIncomeOrExpense = (m: any) => m.income > 0 || m.expense > 0;
  const hasSalaries = months.some((m: any) => (m.salaryExpense || 0) > 0);

  // Every column, for Print and PDF: one line per month with activity, ending on its balance.
  const pdfHeaders = [
    'Month',
    ...fundNames,
    ...(hasOtherIncome ? ['Other Income'] : []),
    'Total Income',
    ...(hasSalaries ? ['Salaries', 'Other Expenses'] : []),
    'Total Expense',
    'Net',
    'Balance',
  ];
  const pdfRows = months.filter(hasIncomeOrExpense).map((m: any) => [
    m.month,
    ...fundNames.map((f) => money(m.funds?.[f] || 0)),
    ...(hasOtherIncome ? [money(otherIncomeOf(m))] : []),
    money(m.income),
    ...(hasSalaries ? [money(m.salaryExpense || 0), money(m.expense - (m.salaryExpense || 0))] : []),
    money(m.expense),
    signedText(m.profit),
    balanceText(closingBalance[m.month]),
  ]);
  const salaryTotal = months.reduce((total: number, m: any) => total + (m.salaryExpense || 0), 0);
  const statementFooter = [
    'Year Total',
    ...fundNames.map((f) => money(summary.funds?.[f] || 0)),
    ...(hasOtherIncome ? [money(totalOtherIncome)] : []),
    money(summary.income || 0),
    ...(hasSalaries ? [money(salaryTotal), money((summary.expense || 0) - salaryTotal)] : []),
    money(summary.expense || 0),
    signedText(summary.profit || 0),
    balanceText(summary.profit || 0),
  ];
  const excelRows = months.map((m: any) => ({
    Month: m.month,
    ...Object.fromEntries(fundNames.flatMap((f) => {
      const fees = feesOf(m, f);
      return [[`${f} Expected`, fees.total], [`${f} Collected`, fees.collected], [`${f} Pending`, fees.pending], [`${f} Pending Total`, pendingBalanceOf(f)[m.month]]];
    })),
    'All Fees Expected': feesOf(m, 'all').total,
    'All Fees Collected': feesOf(m, 'all').collected,
    'All Fees Pending': feesOf(m, 'all').pending,
    'All Fees Pending Total': pendingBalanceOf('all')[m.month],
    ...(hasOtherIncome ? { 'Other Income': otherIncomeOf(m) } : {}),
    'Total Income': m.income,
    ...(hasSalaries ? { Salaries: m.salaryExpense || 0, 'Other Expenses': m.expense - (m.salaryExpense || 0) } : {}),
    'Total Expense': m.expense,
    Net: m.profit,
    Balance: closingBalance[m.month],
  }));
  // Same figures as the Fees by Type table on screen, older unpaid fees included.
  const feeTypesWithOpening = feeTypes.map((r) => ({
    ...r,
    before: openingOf(r.name),
    total: r.total + openingOf(r.name),
    pending: r.pending + openingOf(r.name),
  }));
  const beforeLabel = `Of Which From Before ${year}`;
  const feeTypeHeaders = ['Fee Type', ...(hasOpening ? [beforeLabel] : []), 'Total Fee', 'Collected', 'Pending', 'Collected %'];
  const feeTypeRows = feeTypesWithOpening.map((r) => [r.name, ...(hasOpening ? [money(r.before)] : []), money(r.total), money(r.collected), money(r.pending), `${percent(r)}%`]);
  const allFees = feeTypes.reduce((acc, r) => ({ total: acc.total + r.total, collected: acc.collected + r.collected, pending: acc.pending + r.pending }), { total: 0, collected: 0, pending: 0 });
  const feeStatement = (heading: string, fund: string): PrintSection => {
    const balances = pendingBalanceOf(fund);
    const totals = fund === 'all' ? allFees : feeTypes.find((r) => r.name === fund) || allFees;
    return {
      type: 'table',
      heading,
      note: "Pending Total adds each month's pending to all earlier unpaid fees.",
      balanceColumn: true,
      headers: ['Month', 'Expected', 'Collected', 'Pending', 'Collected %', 'Pending Total'],
      rows: [
        ...(openingOf(fund) > 0 ? [[`Brought Forward from before ${year}`, '', '', '', '', money(openingOf(fund))]] : []),
        ...months.filter((m: any) => feesOf(m, fund).total > 0).map((m: any) => {
          const fees = feesOf(m, fund);
          return [m.month, money(fees.total), money(fees.collected), money(fees.pending), `${percent(fees)}%`, money(balances[m.month])];
        }),
      ],
      footer: ['Year Total', money(totals.total), money(totals.collected), money(totals.pending), `${percent(totals)}%`, money(closingPendingOf(fund))],
    };
  };
  const receivedColumnsFor = fundNames.length > 1 ? [...fundNames.map((f) => ({ label: f, of: [f] })), { label: 'All Fees', of: fundNames }] : [{ label: 'All Fees', of: fundNames }];
  const receivedMonths: any[] = fundReport?.months || [];
  const receivedActive = receivedMonths.filter((m) => {
    const r = receivedFigures(m, fundNames);
    return r.current + r.previous + r.later > 0;
  });
  const lateRows = receivedActive.flatMap((m) =>
    paidForRows(m, fundNames).map((row) => [
      m.month,
      row.timing === 'later' ? `${row.label} (advance)` : row.label,
      ...fundNames.map((f) => money(row.funds.find((x) => x.name === f)?.amount || 0)),
      money(row.funds.reduce((total, x) => total + x.amount, 0)),
    ]),
  );
  const receivedSections: PrintSection[] = receivedActive.length ? [
    {
      type: 'table',
      heading: 'Fee Received Each Month',
      note: `Shows the month the money actually came in. "This" is that month's own fee, "Previous" is older fees paid late.`,
      headers: ['Received In', ...receivedColumnsFor.flatMap((g) => [`${g.label} This`, `${g.label} Previous`, `${g.label} Total`])],
      rows: receivedActive.map((m) => [
        m.month,
        ...receivedColumnsFor.flatMap((g) => {
          const r = receivedFigures(m, g.of);
          return [money(r.current), money(r.previous + r.later), money(r.current + r.previous + r.later)];
        }),
      ]),
      footer: ['Year Total', ...receivedColumnsFor.flatMap((g) => {
        const t = receivedActive.reduce((acc, m) => {
          const r = receivedFigures(m, g.of);
          return { current: acc.current + r.current, other: acc.other + r.previous + r.later };
        }, { current: 0, other: 0 });
        return [money(t.current), money(t.other), money(t.current + t.other)];
      })],
    },
    ...(lateRows.length ? [{
      type: 'table' as const,
      heading: 'Late Payment Detail',
      note: 'Fees paid in a different month from the one they belong to.',
      headers: ['Received In', 'For Fee Month', ...fundNames, 'Total'],
      rows: lateRows,
    }] : []),
  ] : [];

  const handlePrint = () => printReport(org, {
    title: `Income & Expense Statement - ${year}`,
    periodLabel: `1 January ${year} to 31 December ${year}`,
    generatedByName,
    landscape: true,
    sections: [
      {
        type: 'summary', items: [
          { label: 'Total Income', value: formatMoney(summary.income || 0) },
          { label: 'Total Expense', value: formatMoney(summary.expense || 0) },
          { label: 'Closing Balance', value: balanceText(summary.profit || 0) },
          ...(hasFeeDetail ? [
            { label: 'Fee Expected', value: formatMoney(allFees.total) },
            { label: 'Fee Collected', value: formatMoney(allFees.collected) },
            { label: 'Pending Total', value: formatMoney(closingPendingOf('all')) },
          ] : []),
        ],
      },
      {
        type: 'table',
        heading: 'Income & Expense Statement',
        note: `Balance is income less expense, added up month by month from January ${year}. Cr = income is more than expense, Dr = expense is more than income. It is not a bank or cash balance. Fees are shown under the month they belong to.${oneOffTotal > 0 ? ` ${oneOffFunds.join(', ')} is counted under Other Income.` : ''}`,
        balanceColumn: true,
        headers: pdfHeaders,
        rows: pdfRows,
        footer: statementFooter,
      },
      ...(hasFeeDetail ? [
        {
          type: 'table' as const, heading: 'Fees by Type', headers: feeTypeHeaders, rows: feeTypeRows,
          footer: [
            'Total',
            ...(hasOpening ? [money(openingOf('all'))] : []),
            money(allFees.total + openingOf('all')),
            money(allFees.collected),
            money(closingPendingOf('all')),
            `${percent({ total: allFees.total + openingOf('all'), collected: allFees.collected })}%`,
          ],
        },
        ...fundNames.map((f) => feeStatement(`Fee Statement: ${f}`, f)),
        feeStatement('Fee Statement: All Fees', 'all'),
      ] : []),
      ...receivedSections,
    ],
  });

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

      {/* Each fee type: total, collected, pending */}
      {hasFeeDetail && feeTypes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Fees by Type — {year}</h3>
          <FeeTypeSummary
            rows={feeTypesWithOpening}
            beforeLabel={beforeLabel}
            selected={view === 'all' ? undefined : view}
            onSelect={setFeeView}
          />
        </section>
      )}

      {/* Month by month, for all fees or one fee type */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Month by Month</h3>
          <ExportButtons data={excelRows} sheetName="Monthly" fileName={`Monthly_Report_${year}`}
            pdfTitle={`Monthly Income/Expense - ${year}`}
            headers={pdfHeaders}
            rows={pdfRows}
            landscape
            onPrint={handlePrint} />
        </div>
        {hasFeeDetail && fundNames.length > 0 && (
          <ChoiceTabs
            label="Fee type"
            value={view}
            onChange={setFeeView}
            options={[{ value: 'all', label: 'All' }, ...fundNames.map((f) => ({ value: f, label: f }))]}
          />
        )}
        {view === 'all' && hasFeeDetail ? (
          <>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 150 + feeGroups.length * 460 + (hasOtherIncome ? 5 : 3) * 120 }}>
                <thead>
                  <tr className="bg-muted/60">
                    <th rowSpan={2} className="sticky left-0 z-10 border-b bg-muted px-3 py-2 text-left font-semibold align-bottom">Month</th>
                    {feeGroups.map((g) => (
                      <th key={g.key} colSpan={feeColumns.length} className="border-b border-l px-3 py-1.5 text-center font-semibold">{g.label}</th>
                    ))}
                    <th colSpan={hasOtherIncome ? 5 : 3} className="border-b border-l px-3 py-1.5 text-center font-semibold">Income &amp; Expense</th>
                  </tr>
                  <tr className="border-b bg-muted/60 text-right text-[11px]">
                    {feeGroups.map((g) => (
                      <Fragment key={g.key}>
                        <th className="border-l px-3 py-2 font-semibold whitespace-nowrap">Expected</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-400">Collected</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap text-red-600 dark:text-red-400">Pending</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap text-red-700 dark:text-red-400">Pending Total</th>
                      </Fragment>
                    ))}
                    {hasOtherIncome && (
                      <>
                        <th className="border-l px-3 py-2 font-semibold whitespace-nowrap">Other Income</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Total Income</th>
                      </>
                    )}
                    <th className={`px-3 py-2 font-semibold whitespace-nowrap text-red-600 dark:text-red-400 ${hasOtherIncome ? '' : 'border-l'}`}>Expense</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">Profit / Loss</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {hasOpening && (
                    <tr className="border-b bg-amber-50/60 text-right tabular-nums dark:bg-amber-950/20">
                      <td className="sticky left-0 z-10 bg-amber-50 px-3 py-2 text-left font-medium whitespace-nowrap dark:bg-amber-950">Brought Forward</td>
                      {feeGroups.map((g) => (
                        <Fragment key={g.key}>
                          <td colSpan={3} className="border-l" />
                          <td className="px-3 py-2 font-semibold whitespace-nowrap text-red-700 dark:text-red-400">{money(openingOf(g.key))}</td>
                        </Fragment>
                      ))}
                      <td colSpan={hasOtherIncome ? 5 : 3} className="border-l" />
                    </tr>
                  )}
                  {months.map((m: any) => {
                    const hasData = feesOf(m, 'all').total > 0 || m.income > 0 || m.expense > 0;
                    return (
                      <Fragment key={m.month}>
                      <tr
                        onClick={monthHasFees(m) ? () => toggleMonth(m.month) : undefined}
                        className={`border-b text-right tabular-nums hover:bg-muted/20 ${monthHasFees(m) ? 'cursor-pointer' : ''} ${hasData ? '' : 'text-muted-foreground/50'}`}
                      >
                        <td className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">{monthToggle(m)}</td>
                        {feeGroups.map((g) => {
                          const fees = feesOf(m, g.key);
                          return (
                            <Fragment key={g.key}>
                              <td className="border-l px-3 py-2 font-medium whitespace-nowrap">{money(fees.total)}</td>
                              <td className={`px-3 py-2 whitespace-nowrap ${hasData ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{money(fees.collected)}</td>
                              <td className={`px-3 py-2 whitespace-nowrap ${hasData ? 'text-red-600 dark:text-red-400' : ''}`}>{money(fees.pending)}</td>
                              <td className={`bg-muted/30 px-3 py-2 font-semibold whitespace-nowrap ${hasData ? 'text-red-700 dark:text-red-400' : ''}`}>{money(groupBalances[g.key][m.month])}</td>
                            </Fragment>
                          );
                        })}
                        {hasOtherIncome && (
                          <>
                            <td className="border-l px-3 py-2 whitespace-nowrap">{money(otherIncomeOf(m))}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{money(m.income)}</td>
                          </>
                        )}
                        <td className={`px-3 py-2 whitespace-nowrap ${hasOtherIncome ? '' : 'border-l'} ${hasData ? 'text-red-500 dark:text-red-400' : ''}`}>{money(m.expense)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {hasIncomeOrExpense(m) ? <span className={`font-semibold ${m.profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600'}`}>{signedText(m.profit)}</span> : '-'}
                        </td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{hasIncomeOrExpense(m) ? balanceText(closingBalance[m.month]) : '-'}</td>
                      </tr>
                      {monthDetailRow(m, 1 + feeGroups.length * feeColumns.length + (hasOtherIncome ? 5 : 3), fundNames)}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted text-right font-bold tabular-nums">
                    <td className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-left whitespace-nowrap">Year Total</td>
                    {feeGroups.map((g) => {
                      const totals = g.key === 'all' ? allFees : feeTypes.find((r) => r.name === g.key) || allFees;
                      return (
                        <Fragment key={g.key}>
                          <td className="border-l px-3 py-2.5 whitespace-nowrap">{money(totals.total)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-emerald-700 dark:text-emerald-400">{money(totals.collected)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-red-600 dark:text-red-400">{money(totals.pending)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-red-700 dark:text-red-400">{money(closingPendingOf(g.key))}</td>
                        </Fragment>
                      );
                    })}
                    {hasOtherIncome && (
                      <>
                        <td className="border-l px-3 py-2.5 whitespace-nowrap">{money(totalOtherIncome)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatMoney(summary.income || 0)}</td>
                      </>
                    )}
                    <td className={`px-3 py-2.5 whitespace-nowrap text-red-600 dark:text-red-400 ${hasOtherIncome ? '' : 'border-l'}`}>{formatMoney(summary.expense || 0)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{signedText(summary.profit || 0)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{balanceText(summary.profit || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Click a month to see how much came from the current month and previous months. <strong>Expected</strong> is the fee for that month. <strong>Pending</strong> is what is still unpaid from that month. <strong>Pending Total</strong> adds it to all earlier unpaid fees.
              {feeGroups.length > 1 && ' Scroll sideways to see each fee type.'}
            </p>
          </>
        ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-muted/50 border-b text-right text-xs">
                <th className="text-left px-4 py-2.5 font-semibold">Month</th>
                {hasFeeDetail && (
                  <>
                    <th className="px-4 py-2.5 font-semibold">Expected</th>
                    <th className="px-4 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">Collected</th>
                    <th className="px-4 py-2.5 font-semibold text-red-600 dark:text-red-400">Pending</th>
                  </>
                )}
                {view === 'all' ? (
                  <>
                    {hasOtherIncome && <th className="px-4 py-2.5 font-semibold">Other Income</th>}
                    {(hasOtherIncome || !hasFeeDetail) && <th className="px-4 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">Total Income</th>}
                    <th className="px-4 py-2.5 font-semibold text-red-600 dark:text-red-400">Expense</th>
                    <th className="px-4 py-2.5 font-semibold">Profit / Loss</th>
                    <th className="px-4 py-2.5 font-semibold">Balance</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-2.5 font-semibold">Collected %</th>
                    <th className="px-4 py-2.5 font-semibold text-red-600 dark:text-red-400">Pending Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {view !== 'all' && openingOf(view) > 0 && (
                <tr className="border-b bg-amber-50/60 text-right tabular-nums dark:bg-amber-950/20">
                  <td className="px-4 py-2 text-left font-medium">Brought Forward from before {year}</td>
                  <td colSpan={4} />
                  <td className="px-4 py-2 font-semibold text-red-600 dark:text-red-400">{money(openingOf(view))}</td>
                </tr>
              )}
              {months.map((m: any) => {
                const fees = feesOf(m, view);
                const hasData = view === 'all' ? m.income > 0 || m.expense > 0 || fees.total > 0 : fees.total > 0;
                return (
                  <Fragment key={m.month}>
                  <tr
                    onClick={view !== 'all' && fees.total > 0 ? () => toggleMonth(m.month) : undefined}
                    className={`border-b text-right tabular-nums hover:bg-muted/20 ${view !== 'all' && fees.total > 0 ? 'cursor-pointer' : ''} ${!hasData ? 'opacity-40' : ''}`}
                  >
                    <td className="px-4 py-2 text-left font-medium">{view !== 'all' && fees.total > 0 ? monthToggle(m) : m.month}</td>
                    {hasFeeDetail && (
                      <>
                        <td className="px-4 py-2 font-medium">{money(fees.total)}</td>
                        <td className="px-4 py-2 text-emerald-600 dark:text-emerald-400">{money(fees.collected)}</td>
                        <td className="px-4 py-2 text-red-600 dark:text-red-400">{money(fees.pending)}</td>
                      </>
                    )}
                    {view === 'all' ? (
                      <>
                        {hasOtherIncome && <td className="px-4 py-2">{money(otherIncomeOf(m))}</td>}
                        {(hasOtherIncome || !hasFeeDetail) && <td className="px-4 py-2 text-emerald-600 dark:text-emerald-400">{money(m.income)}</td>}
                        <td className="px-4 py-2 text-red-500 dark:text-red-400">{money(m.expense)}</td>
                        <td className="px-4 py-2">
                          {m.income > 0 || m.expense > 0 ? <span className={`font-semibold ${m.profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600'}`}>{formatMoney(m.profit)}</span> : '-'}
                        </td>
                        <td className="px-4 py-2 font-semibold whitespace-nowrap">{hasIncomeOrExpense(m) ? balanceText(closingBalance[m.month]) : '-'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{fees.total > 0 ? `${percent(fees)}%` : '-'}</td>
                        <td className="px-4 py-2 font-semibold text-red-600 dark:text-red-400">{money(viewPendingBalance[m.month])}</td>
                      </>
                    )}
                  </tr>
                  {view !== 'all' && monthDetailRow(m, 6, [view])}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-bold text-right tabular-nums">
                <td className="px-4 py-2.5 text-left">Year Total</td>
                {hasFeeDetail && (
                  <>
                    <td className="px-4 py-2.5">{money(feeTotals.total)}</td>
                    <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-400">{money(feeTotals.collected)}</td>
                    <td className="px-4 py-2.5 text-red-600 dark:text-red-400">{money(closingPendingOf(view))}</td>
                  </>
                )}
                {view === 'all' ? (
                  <>
                    {hasOtherIncome && <td className="px-4 py-2.5">{money(totalOtherIncome)}</td>}
                    {(hasOtherIncome || !hasFeeDetail) && <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-400">{formatMoney(summary.income || 0)}</td>}
                    <td className="px-4 py-2.5 text-red-600 dark:text-red-400">{formatMoney(summary.expense || 0)}</td>
                    <td className="px-4 py-2.5"><span className={summary.profit >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700'}>{formatMoney(summary.profit || 0)}</span></td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{balanceText(summary.profit || 0)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5">{percent(feeTotals)}%</td>
                    <td className="px-4 py-2.5 text-red-600 dark:text-red-400">{money(feeTotals.pending)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
        )}
        {oneOffTotal > 0 && (
          <p className="text-xs text-muted-foreground">
            {oneOffFunds.join(', ')} ({formatMoney(oneOffTotal)}) is not included in the fee columns or All Fees. It is counted under Other Income, so Total Income and Profit stay correct.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Fees are shown under the month they belong to. To see when money actually came in, how it was paid, and who still owes, open the{' '}
          <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={onOpenFunds}>Funds Report</button>.
        </p>
      </section>

      {/* What actually came in each month: this month's fee vs late payments */}
      {hasFeeDetail && fundNames.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Fee Received Each Month</h3>
            <p className="text-xs text-muted-foreground">
              The month the money actually came in. <strong>This Month's Fee</strong> was paid on time. <strong>Previous Months</strong> is older fee paid late: click a month to see which month it was for.
            </p>
          </div>
          {fundReportLoading ? <Loading /> : <FeeReceivedTable months={receivedMonths} funds={fundNames} />}
        </section>
      )}

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart2 className="h-4 w-4 text-slate-500" /> Monthly Income vs Expense — {year}</CardTitle>
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial: Daily Collection ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function FinancialDailyReport({ year, month }: { year: number; month: string }) {
  const { data, isLoading } = useGetReportFinancialDailyQuery({ year, month }, { refetchOnMountOrArgChange: 60 });
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: days, chartData } = data;
  const avgDaily = summary.activeDays > 0 ? Math.round(summary.totalCollected / summary.activeDays) : 0;
  const activePct = summary.totalDays > 0 ? Math.round((summary.activeDays / summary.totalDays) * 100) : 0;
  const fundNames: string[] = data.fundNames || [];
  const hasOtherIncome = (summary.otherIncome || 0) > 0;
  const activeDays = days.filter((d: any) => d.amount > 0);
  const pdfHeaders = ['Day', 'Date', ...fundNames, ...(hasOtherIncome ? ['Other Income'] : []), 'Total', 'Transactions'];
  const pdfRows = activeDays.map((d: any) => [
    String(d.day),
    d.date,
    ...fundNames.map((f) => (d.funds?.[f] || 0).toLocaleString()),
    ...(hasOtherIncome ? [(d.otherIncome || 0).toLocaleString()] : []),
    d.amount.toLocaleString(),
    String(d.transactions),
  ]);
  const excelRows = activeDays.map((d: any) => ({
    Day: d.day,
    Date: d.date,
    ...Object.fromEntries(fundNames.map((f) => [f, d.funds?.[f] || 0])),
    ...(hasOtherIncome ? { 'Other Income': d.otherIncome || 0 } : {}),
    Total: d.amount,
    Transactions: d.transactions,
  }));
  const handlePrint = () => printReport(org, {
    title: `Daily Collection Report - ${month} ${year}`,
    periodLabel: `${month} ${year}`,
    generatedByName,
    sections: [{
      type: 'summary', items: [
        { label: 'Total Collected', value: formatMoney(summary.totalCollected || 0) },
        { label: 'Active Days', value: `${summary.activeDays} / ${summary.totalDays}` },
        { label: 'Daily Average', value: formatMoney(avgDaily) },
        { label: 'Total Transactions', value: String(days.reduce((s: number, d: any) => s + (d.transactions || 0), 0)) },
      ],
    }, {
      type: 'table', heading: 'Daily Breakdown', headers: pdfHeaders, rows: pdfRows,
      footer: [
        `Total (${summary.activeDays} days)`,
        '',
        ...fundNames.map((f) => formatMoney(summary.funds?.[f] || 0)),
        ...(hasOtherIncome ? [formatMoney(summary.otherIncome || 0)] : []),
        formatMoney(summary.totalCollected || 0),
        String(days.reduce((s: number, d: any) => s + (d.transactions || 0), 0)),
      ],
    }],
  });

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

      <FundTotals names={fundNames} totals={summary.funds} otherIncome={summary.otherIncome} label={`Collected by Fund — ${month} ${year}`} />

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /> Daily Collection — {month} {year}</CardTitle>
          <ExportButtons data={excelRows} sheetName="Daily" fileName={`Daily_Collection_${month}_${year}`}
            pdfTitle={`Daily Collection - ${month} ${year}`}
            headers={pdfHeaders}
            rows={pdfRows}
            onPrint={handlePrint} />
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
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 360 + fundNames.length * 100 }}>
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2.5 font-semibold text-[11px]">Day</th>
              <th className="text-left px-4 py-2.5 font-semibold text-[11px]">Date</th>
              {fundNames.map((f) => (
                <th key={f} className="text-right px-4 py-2.5 font-semibold text-[11px] text-emerald-700 dark:text-emerald-400">{f}</th>
              ))}
              {hasOtherIncome && <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-emerald-700 dark:text-emerald-400">Other Income</th>}
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Total Collected</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {activeDays.length === 0 ? (
              <tr><td colSpan={4 + fundNames.length + (hasOtherIncome ? 1 : 0)} className="text-center py-8 text-muted-foreground">No collections recorded for {month}</td></tr>
            ) : activeDays.map((d: any) => (
              <tr key={d.day} className="border-b hover:bg-muted/20">
                <td className="px-4 py-2 font-medium text-slate-600">{d.day}</td>
                <td className="px-4 py-2 text-muted-foreground">{d.date}</td>
                {fundNames.map((f) => (
                  <td key={f} className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">{d.funds?.[f] > 0 ? formatMoney(d.funds[f]) : '-'}</td>
                ))}
                {hasOtherIncome && <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">{d.otherIncome > 0 ? formatMoney(d.otherIncome) : '-'}</td>}
                <td className="px-4 py-2 text-right font-bold">{formatMoney(d.amount)}</td>
                <td className="px-4 py-2 text-right text-slate-600">{d.transactions}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={2} className="px-4 py-2.5">Total ({summary.activeDays} days)</td>
              {fundNames.map((f) => (
                <td key={f} className="px-4 py-2.5 text-right text-emerald-700 dark:text-emerald-400">{formatMoney(summary.funds?.[f] || 0)}</td>
              ))}
              {hasOtherIncome && <td className="px-4 py-2.5 text-right text-emerald-700 dark:text-emerald-400">{formatMoney(summary.otherIncome || 0)}</td>}
              <td className="px-4 py-2.5 text-right">{formatMoney((summary.totalCollected || 0))}</td>
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
  const { data, isLoading } = useGetReportFinancialPnlQuery({ year }, { refetchOnMountOrArgChange: 60 });
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: months, chartData } = data;
  const feeRate = summary.feeExpected > 0 ? Math.round((summary.feeCollected / summary.feeExpected) * 100) : 0;
  const fundNames: string[] = data.fundNames || [];
  const pdfHeaders = ['Month', ...fundNames, 'Income', 'Expense', 'Profit', 'Previous Pending', "Month's Fee", 'Collected', "Month's Pending", 'Total Pending'];
  const pdfRows = months.map((m: any) => [m.month, ...fundNames.map((f) => (m.funds?.[f] || 0).toLocaleString()), m.income.toLocaleString(), m.expense.toLocaleString(), m.profit.toLocaleString(), (m.feePreviousPending || 0).toLocaleString(), m.feeExpected.toLocaleString(), m.feeCollected.toLocaleString(), m.feePending.toLocaleString(), (m.feeTotalPending || 0).toLocaleString()]);
  const handlePrint = () => printReport(org, {
    title: `Profit & Loss Report - ${year}`,
    periodLabel: `Year ${year}`,
    generatedByName,
    sections: [{
      type: 'summary', items: [
        { label: 'Income', value: formatMoney(summary.income || 0) },
        { label: 'Expense', value: formatMoney(summary.expense || 0) },
        { label: 'Net Profit / Loss', value: formatMoney(summary.profit || 0) },
        { label: 'Fee Collection Rate', value: `${feeRate}%` },
      ],
    }, {
      type: 'table', heading: 'Monthly Breakdown', headers: pdfHeaders, rows: pdfRows,
      footer: ['Year Total', ...fundNames.map((f) => formatMoney(summary.funds?.[f] || 0)), formatMoney(summary.income || 0), formatMoney(summary.expense || 0), formatMoney(summary.profit || 0), formatMoney(summary.feePreviousPending || 0), formatMoney(summary.feeExpected || 0), formatMoney(summary.feeCollected || 0), formatMoney(summary.feePending || 0), formatMoney(summary.feeTotalPending || 0)],
    }],
  });

  return (
    <div className="space-y-5">
      {/* Top KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Income</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatMoney((summary.income || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Expense</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-400">{formatMoney((summary.expense || 0))}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${summary.profit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${summary.profit >= 0 ? 'text-blue-500 dark:text-blue-400' : 'text-orange-500'}`}>Net Profit / Loss</p>
          <p className={`text-2xl font-bold ${summary.profit >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700'}`}>{formatMoney((summary.profit || 0))}</p>
        </div>
      </div>

      {/* Fee Collection KPIs */}
      <Card className="border-2 border-purple-100">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Fee Collection Overview — {year}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-[10px] text-purple-500 dark:text-purple-400 font-semibold uppercase tracking-wide mb-1">Fees Billed in {year}</p>
              <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{formatMoney((summary.feeExpected || 0))}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-emerald-500 dark:text-emerald-400 font-semibold uppercase tracking-wide mb-1">Fee Collected</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{formatMoney((summary.feeCollected || 0))}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-amber-500 dark:text-amber-400 font-semibold uppercase tracking-wide mb-1">Total Fee Pending</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{formatMoney((summary.feeTotalPending || 0))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Before {year}: {formatMoney((summary.feePreviousPending || 0))} · From {year}: {formatMoney((summary.feePending || 0))}</p>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Collection Rate</span>
              <span className={`font-bold ${feeRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : feeRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{feeRate}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${feeRate >= 80 ? 'bg-emerald-500' : feeRate >= 50 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${feeRate}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-purple-500 dark:text-purple-400" /> P&L Trend — {year}</CardTitle>
          <ExportButtons data={months.map(({ funds, ...m }: any) => ({ month: m.month, ...Object.fromEntries(fundNames.map((f) => [f, funds?.[f] || 0])), ...Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'month')) }))} sheetName="PnL" fileName={`PnL_${year}`}
            pdfTitle={`Profit & Loss - ${year}`}
            headers={pdfHeaders}
            rows={pdfRows}
            onPrint={handlePrint}
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
      <FundTotals names={fundNames} totals={summary.funds} otherIncome={summary.otherIncome} />

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 1040 + fundNames.length * 100 }}>
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2.5 font-semibold text-[11px]">Month</th>
              {fundNames.map((f) => (
                <th key={f} className="text-right px-4 py-2.5 font-semibold text-[11px] text-emerald-700 dark:text-emerald-400">{f}</th>
              ))}
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Total Income</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-red-600 dark:text-red-400">Expense</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px]">Profit</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-amber-700 dark:text-amber-400">Previous Pending</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-purple-700 dark:text-purple-400">Month's Fee</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-teal-700">Fee Collected</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-amber-600 dark:text-amber-400">Month's Pending</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[11px] text-red-600 dark:text-red-400">Total Pending</th>
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
                  {fundNames.map((f) => (
                    <td key={f} className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">{m.funds?.[f] > 0 ? formatMoney(m.funds[f]) : '-'}</td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold">{m.income > 0 ? formatMoney(m.income) : '-'}</td>
                  <td className="px-4 py-2 text-right text-red-500 dark:text-red-400">{m.expense > 0 ? formatMoney(m.expense) : '-'}</td>
                  <td className="px-4 py-2 text-right"><span className={`font-bold ${m.profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600'}`}>{hasData ? formatMoney(m.profit) : '-'}</span></td>
                  <td className="px-4 py-2 text-right text-amber-700 dark:text-amber-400">{m.feePreviousPending > 0 ? formatMoney(m.feePreviousPending) : '-'}</td>
                  <td className="px-4 py-2 text-right text-purple-600 dark:text-purple-400">{m.feeExpected > 0 ? formatMoney(m.feeExpected) : '-'}</td>
                  <td className="px-4 py-2 text-right text-teal-600 font-semibold">{m.feeCollected > 0 ? formatMoney(m.feeCollected) : '-'}</td>
                  <td className="px-4 py-2 text-right text-amber-600 dark:text-amber-400">{m.feePending > 0 ? formatMoney(m.feePending) : '-'}</td>
                  <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">{m.feeTotalPending > 0 ? formatMoney(m.feeTotalPending) : '-'}</td>
                  <td className="px-4 py-2 text-right">{m.feeExpected > 0 ? <span className={`font-semibold ${rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{rate}%</span> : '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td className="px-4 py-2.5">Year Total</td>
              {fundNames.map((f) => (
                <td key={f} className="px-4 py-2.5 text-right text-emerald-700 dark:text-emerald-400">{formatMoney(summary.funds?.[f] || 0)}</td>
              ))}
              <td className="px-4 py-2.5 text-right">{formatMoney((summary.income || 0))}</td>
              <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400">{formatMoney((summary.expense || 0))}</td>
              <td className="px-4 py-2.5 text-right"><span className={summary.profit >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700'}>{formatMoney((summary.profit || 0))}</span></td>
              <td className="px-4 py-2.5 text-right text-amber-700 dark:text-amber-400">{formatMoney((summary.feePreviousPending || 0))}</td>
              <td className="px-4 py-2.5 text-right text-purple-700 dark:text-purple-400">{formatMoney((summary.feeExpected || 0))}</td>
              <td className="px-4 py-2.5 text-right text-teal-700">{formatMoney((summary.feeCollected || 0))}</td>
              <td className="px-4 py-2.5 text-right text-amber-600 dark:text-amber-400">{formatMoney((summary.feePending || 0))}</td>
              <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400">{formatMoney((summary.feeTotalPending || 0))}</td>
              <td className="px-4 py-2.5 text-right"><span className={`${feeRate >= 80 ? 'text-emerald-700 dark:text-emerald-400' : feeRate >= 50 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>{feeRate}%</span></td>
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
  const { data, isLoading } = useGetReportFinancialCategoriesQuery({}, { refetchOnMountOrArgChange: 60 });
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: catData } = data;
  const income = catData.income || [];
  const expense = catData.expense || [];

  const pdfHeaders = ['Category', 'Type', 'Transactions', 'Total'];
  const pdfRows = [
    ...income.map((c: any) => [c.name, 'Income', String(c.count), c.total.toLocaleString()]),
    ...expense.map((c: any) => [c.name, 'Expense', String(c.count), c.total.toLocaleString()]),
  ];
  const excelData = [
    ...income.map((c: any) => ({ Category: c.name, Type: 'Income', Transactions: c.count, Total: c.total })),
    ...expense.map((c: any) => ({ Category: c.name, Type: 'Expense', Transactions: c.count, Total: c.total })),
  ];
  const handlePrint = () => printReport(org, {
    title: 'Category-wise Report',
    periodLabel: 'All Time',
    generatedByName,
    sections: [{
      type: 'summary', items: [
        { label: 'Total Income', value: formatMoney(summary.totalIncome || 0) },
        { label: 'Total Expense', value: formatMoney(summary.totalExpense || 0) },
        { label: 'Net Profit', value: formatMoney(summary.profit || 0) },
      ],
    }, { type: 'table', heading: 'Category Breakdown', headers: pdfHeaders, rows: pdfRows }],
  });

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-3 gap-4 flex-1 min-w-[280px]">
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
        <ExportButtons data={excelData} sheetName="Categories" fileName="Category_Report"
          pdfTitle="Category-wise Report"
          headers={pdfHeaders}
          rows={pdfRows}
          onPrint={handlePrint} />
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
    Date: formatAppDate(new Date(t.date)),
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
    formatAppDate(new Date(t.date)),
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
                    <td className="px-3 py-2 whitespace-nowrap">{formatAppDate(new Date(t.date))}</td>
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
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: classList } = data;
  const allStudents = classList.flatMap((c: any) => c.students);
  const pdfHeaders = ['Name', 'Adm#', 'Roll#', 'Class', 'Father', 'Phone', 'Gender'];
  const pdfRows = allStudents.map((s: any) => [s.name, s.admissionNumber, s.rollNumber, s.className, s.fatherName, s.phone, s.gender]);
  const handlePrint = () => printReport(org, {
    title: 'Student List Report',
    periodLabel: `${summary.totalStudents} students across ${summary.totalClasses} classes`,
    generatedByName,
    sections: [{ type: 'table', heading: 'Students', headers: pdfHeaders, rows: pdfRows }],
  });

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
          headers={pdfHeaders}
          rows={pdfRows}
          onPrint={handlePrint} />
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
  const { org, generatedByName } = useOrgAndUser();

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
  const pdfHeaders = ['Name', 'Adm#', 'Class', 'Left Date', 'Reason', 'TC#', 'Dues at Leaving', 'Pending Now'];
  const pdfRows = students.map((s: any) => [
    s.name, s.admissionNumber, s.className,
    s.leftDate ? formatAppDate(new Date(s.leftDate)) : '-',
    s.reasonLabel, s.tcNumber || '-',
    s.outstandingDuesAtLeaving.toLocaleString(), s.currentPendingAmount.toLocaleString(),
  ]);
  const handlePrint = () => printReport(org, {
    title: 'Left / Struck-Off Students Report',
    periodLabel: reason !== 'all' ? (LEAVING_REASONS.find((r) => r.value === reason)?.label || 'All Reasons') : 'All Reasons',
    generatedByName,
    sections: [{
      type: 'summary', items: [
        { label: 'Total Left', value: String(summary.totalLeft) },
        { label: 'Dues Cleared', value: String(summary.clearedCount) },
        { label: 'Still Owing', value: String(summary.pendingCount) },
        { label: 'Outstanding Now', value: formatMoney(summary.totalOutstandingNow || 0) },
      ],
    }, { type: 'table', heading: 'Students', headers: pdfHeaders, rows: pdfRows }],
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {reasonSelect}
        <ExportButtons data={students} sheetName="Left Students" fileName="Left_Struck_Off_Students"
          pdfTitle="Left / Struck-Off Students Report"
          headers={pdfHeaders}
          rows={pdfRows}
          onPrint={handlePrint}
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
                      <td className="px-3 py-1.5 text-muted-foreground">{s.leftDate ? formatAppDate(new Date(s.leftDate)) : '-'}</td>
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
  const { data, isLoading } = useGetFeePositionQuery({ year, month, detail: 'students', ...(classId ? { classId } : {}) }, { refetchOnMountOrArgChange: 60 });
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;

  const summary = data.summary;
  const students: any[] = data.students || [];
  // One column per fee billed this month, so Paper Fund etc. never hide inside a total.
  const feeColumns: string[] = (data.heads || []).filter((h: any) => h.currentFee > 0).map((h: any) => h.name);
  const headAmount = (s: any, name: string) => s.heads.find((h: any) => h.name === name)?.currentFee || 0;
  const counts = {
    paid: students.filter((s) => s.status === 'paid').length,
    partial: students.filter((s) => s.status === 'partial').length,
    unpaid: students.filter((s) => s.status === 'unpaid').length,
  };
  const chartData = [
    { name: 'Cleared', value: counts.paid, color: '#10b981' },
    { name: 'Partial', value: counts.partial, color: '#f59e0b' },
    { name: 'Unpaid', value: counts.unpaid, color: '#ef4444' },
  ];
  const money = (v: number) => (v > 0 ? formatMoney(v) : '-');

  const pdfHeaders = ['Student', 'Class', 'Previous Pending', ...feeColumns, 'Total Expected', 'Received', 'Total Pending', 'Status'];
  const pdfRows = students.map((s) => [
    s.previousMonths.length ? `${s.name} (Prev: ${s.previousMonths.join(', ')})` : s.name,
    s.className,
    money(s.previousDue),
    ...feeColumns.map((f) => money(headAmount(s, f))),
    money(s.totalExpected),
    money(s.totalReceived),
    money(s.totalPending),
    s.status === 'paid' ? 'Cleared' : s.status === 'partial' ? 'Partial' : 'Unpaid',
  ]);
  const totalFor = (f: string) => data.heads.find((h: any) => h.name === f)?.currentFee || 0;
  const pdfFooter = ['Total', '', formatMoney(summary.previousDue), ...feeColumns.map((f) => formatMoney(totalFor(f))), formatMoney(summary.totalExpected), formatMoney(summary.totalReceived), formatMoney(summary.totalPending), `${summary.collectionRate}%`];
  const handlePrint = () => printReport(org, {
    title: 'Student Fee Status Report',
    periodLabel: `${month} ${year}`,
    generatedByName,
    sections: [
      ...feePositionPrintSections(data, month, formatMoney),
      { type: 'table', heading: 'Students', headers: pdfHeaders, rows: pdfRows, footer: pdfFooter },
    ],
  });
  const excelRows = students.map((s) => ({
    Student: s.name,
    'Admission #': s.admissionNumber,
    'Roll #': s.rollNumber,
    Father: s.fatherName,
    Phone: s.phone,
    Class: s.className,
    Section: s.section,
    'Previous Pending': s.previousDue,
    'Previous Months Unpaid': s.previousMonths.join(', '),
    ...Object.fromEntries(feeColumns.map((f) => [f, headAmount(s, f)])),
    [`${month} Fee`]: s.currentFee,
    'Total Expected': s.totalExpected,
    'Received (Previous)': s.previousReceived,
    [`Received (${month})`]: s.currentReceived,
    'Total Received': s.totalReceived,
    'Previous Still Pending': s.previousPending,
    [`${month} Pending`]: s.currentPending,
    'Total Pending': s.totalPending,
    Status: s.status,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <ExportButtons data={excelRows} sheetName="Fee Status" fileName={`Fee_Status_${month}_${year}`}
          pdfTitle={`Student Fee Status - ${month} ${year}`}
          headers={pdfHeaders}
          rows={pdfRows}
          landscape
          onPrint={handlePrint} />
      </div>

      <FeePositionCards summary={summary} month={month} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="min-w-0 lg:col-span-2">
          <FeeHeadsTable heads={data.heads} summary={summary} month={month} />
        </div>
        <Card className="min-w-0">
          <CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-xs font-semibold text-muted-foreground">Students ({students.length})</CardTitle></CardHeader>
          <CardContent className="pt-2 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <RePieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={({ name, value }: any) => `${name}: ${value}`} fontSize={10}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 640 + feeColumns.length * 90 }}>
          <thead>
            <tr className="bg-muted/50 text-[11px]">
              <th colSpan={3} />
              <th className="px-3 pt-2 text-right font-semibold text-amber-700 dark:text-amber-400 align-bottom" rowSpan={2}>Previous Pending</th>
              {feeColumns.length > 0 && (
                <th colSpan={feeColumns.length} className="border-x border-b px-3 py-1 text-center font-semibold text-blue-700 dark:text-blue-400">{month} Fee</th>
              )}
              <th className="px-3 pt-2 text-right font-semibold text-purple-700 dark:text-purple-400 align-bottom" rowSpan={2}>Total Expected</th>
              <th className="px-3 pt-2 text-right font-semibold text-emerald-700 dark:text-emerald-400 align-bottom" rowSpan={2}>Received</th>
              <th className="px-3 pt-2 text-right font-semibold text-red-600 dark:text-red-400 align-bottom" rowSpan={2}>Total Pending</th>
              <th className="px-3 pt-2 text-center font-semibold align-bottom" rowSpan={2}>Status</th>
            </tr>
            <tr className="bg-muted/50 border-b text-[11px]">
              <th className="text-left px-3 py-2 font-semibold">#</th>
              <th className="text-left px-3 py-2 font-semibold">Student</th>
              <th className="text-left px-3 py-2 font-semibold">Class</th>
              {feeColumns.map((f, i) => (
                <th key={f} className={`px-3 py-2 text-right font-semibold text-blue-700 dark:text-blue-400 ${i === 0 ? 'border-l' : ''} ${i === feeColumns.length - 1 ? 'border-r' : ''}`}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr><td colSpan={8 + feeColumns.length} className="py-8 text-center text-muted-foreground">No fees for this month or earlier</td></tr>
            ) : students.map((s, i) => (
              <tr key={s.studentId} className="border-b hover:bg-muted/20">
                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">{s.admissionNumber}</p>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{s.className}{s.section ? ` · ${s.section}` : ''}</td>
                <td className="px-3 py-1.5 text-right text-amber-700 dark:text-amber-400">
                  {money(s.previousDue)}
                  {s.previousMonths.length > 0 && (
                    <p className="text-[10px] font-normal text-muted-foreground" title={s.previousMonths.join(', ')}>
                      {s.previousMonths.length <= 3 ? s.previousMonths.map((label: string) => label.slice(0, 3)).join(', ') : `${s.previousMonths.length} months`}
                    </p>
                  )}
                </td>
                {feeColumns.map((f) => (
                  <td key={f} className="px-3 py-1.5 text-right text-blue-700 dark:text-blue-400">{money(headAmount(s, f))}</td>
                ))}
                <td className="px-3 py-1.5 text-right font-medium text-purple-700 dark:text-purple-400">{money(s.totalExpected)}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{money(s.totalReceived)}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-red-600 dark:text-red-400">{money(s.totalPending)}</td>
                <td className="px-3 py-1.5 text-center"><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={3} className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">{formatMoney(summary.previousDue)}</td>
              {feeColumns.map((f) => (
                <td key={f} className="px-3 py-2 text-right text-blue-700 dark:text-blue-400">{formatMoney(totalFor(f))}</td>
              ))}
              <td className="px-3 py-2 text-right text-purple-700 dark:text-purple-400">{formatMoney(summary.totalExpected)}</td>
              <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">{formatMoney(summary.totalReceived)}</td>
              <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{formatMoney(summary.totalPending)}</td>
              <td className="px-3 py-2 text-center">{summary.collectionRate}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Student: Attendance ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function StudentAttendanceReport({ year, month, classId }: { year: number; month: string; classId?: string }) {
  const { data, isLoading } = useGetReportStudentAttendanceQuery({ year, month, ...(classId ? { classId } : {}) });
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: students, chartData } = data;
  const avgRate = students.length > 0 ? Math.round(students.reduce((s: number, st: any) => s + (st.attendanceRate || 0), 0) / students.length) : 0;
  const pdfHeaders = ['Name', 'Class', 'Roll#', 'Present', 'Absent', 'Late', 'Leave', 'Rate'];
  const pdfRows = students.map((s: any) => [s.name, s.className, s.rollNumber, String(s.present), String(s.absent), String(s.late), String(s.leave), `${s.attendanceRate}%`]);
  const handlePrint = () => printReport(org, {
    title: 'Student Attendance Report',
    periodLabel: `${month} ${year}`,
    generatedByName,
    sections: [{
      type: 'summary', items: [
        { label: 'Students', value: String(summary.totalStudents) },
        { label: 'Present', value: String(summary.totalPresent) },
        { label: 'Absent', value: String(summary.totalAbsent) },
        { label: 'Late', value: String(summary.totalLate) },
        { label: 'Avg Rate', value: `${avgRate}%` },
      ],
    }, {
      type: 'table', heading: 'Attendance', headers: pdfHeaders, rows: pdfRows,
      footer: ['Total', '', '', String(summary.totalPresent), String(summary.totalAbsent), String(summary.totalLate), String(summary.totalLeave), `${avgRate}%`],
    }],
  });

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
              headers={pdfHeaders}
              rows={pdfRows}
              onPrint={handlePrint} />
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
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: teachers, chartData } = data;
  const pdfHeaders = ['Name', 'Emp ID', ...MONTHS.map((m) => m.slice(0, 3)), 'Paid', 'Pending'];
  const pdfRows = teachers.map((t: any) => [t.name, t.employeeId || '', ...MONTHS.map((_: any, i: number) => (t.months[i + 1] || 0).toLocaleString()), t.totalPaid.toLocaleString(), (t.totalPending || 0).toLocaleString()]);
  const excelData = teachers.map((t: any) => {
    const row: any = { Name: t.name, EmpID: t.employeeId, Basic: t.basicSalary };
    MONTHS.forEach((m, i) => {
      const amount = t.months[i + 1] || 0;
      const status = t.monthStatuses?.[i + 1] || '';
      row[m.slice(0, 3)] = amount > 0 ? `${amount} (${status})` : '-';
    });
    row['Paid'] = t.totalPaid;
    row['Pending'] = t.totalPending;
    return row;
  });
  const handlePrint = () => printReport(org, {
    title: `Teacher Salary Report - ${year}`,
    periodLabel: `Year ${year}`,
    generatedByName,
    sections: [{
      type: 'summary', items: [
        { label: 'Total Teachers', value: String(summary.totalTeachers) },
        { label: 'Total Paid', value: formatMoney(summary.totalSalaryPaid || 0) },
        { label: 'Pending (Draft)', value: formatMoney(summary.totalPending || 0) },
        { label: 'Total Payable', value: formatMoney(summary.totalPayable || 0) },
      ],
    }, { type: 'table', heading: 'Monthly Salary', headers: pdfHeaders, rows: pdfRows }],
  });

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
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-indigo-500" /> Monthly Salary — Paid vs Pending — {year}
          </CardTitle>
          <ExportButtons data={excelData} sheetName="Salary" fileName={`Teacher_Salary_${year}`}
            pdfTitle={`Teacher Salary - ${year}`}
            headers={pdfHeaders}
            rows={pdfRows}
            onPrint={handlePrint}
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
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { summary, data: teachers, chartData } = data;
  const pdfHeaders = ['Name', 'Emp ID', 'Total Periods', 'Days', 'Classes', 'Subjects'];
  const pdfRows = teachers.map((t: any) => [t.name, t.employeeId || '', String(t.totalPeriods), String(t.totalDays), String(t.totalClasses), String(t.totalSubjects)]);
  const handlePrint = () => printReport(org, {
    title: 'Teacher Workload Report',
    periodLabel: `${summary.totalTeachers} teachers`,
    generatedByName,
    sections: [{ type: 'table', heading: 'Workload', headers: pdfHeaders, rows: pdfRows }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SummaryCard label="Total Teachers" value={summary.totalTeachers} color="text-blue-600" raw />
        <ExportButtons data={teachers} sheetName="Workload" fileName="Teacher_Workload"
          pdfTitle="Teacher Workload Report"
          headers={pdfHeaders}
          rows={pdfRows}
          onPrint={handlePrint} />
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
  const { data, isLoading } = useGetReportVouchersQuery({ year, month, ...(status ? { status } : {}), ...(classId ? { classId } : {}) }, { refetchOnMountOrArgChange: 60 });
  const formatMoney = useFormatMoney();
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data?.summary) return <EmptyState />;
  const vouchers: any[] = data.data || [];
  const summary = data.summary;
  const chartData: any[] = data.chartData || [];
  const collRate = summary.totalAmount > 0 ? Math.round((summary.totalPaid / summary.totalAmount) * 100) : 0;
  const pdfHeaders = ['V#', 'Student', 'Class', 'Fee Type', 'Amount', 'Paid', 'Pending', 'Previous Pending', 'Student Total Pending', 'Status'];
  const pdfRows = vouchers.map((v: any) => [v.voucherNumber || '', v.name, v.className, v.feeType || '', v.netAmount?.toLocaleString(), v.paidAmount?.toLocaleString(), v.pending?.toLocaleString(), v.previousPending ? v.previousPending.toLocaleString() : '-', v.studentTotalPending ? v.studentTotalPending.toLocaleString() : '-', v.status]);
  const handlePrint = () => printReport(org, {
    title: `Voucher Report - ${month} ${year}`,
    periodLabel: `${month} ${year}${status ? ` · ${status}` : ''}`,
    generatedByName,
    sections: [{
      type: 'summary', items: [
        { label: 'Total Vouchers', value: String(summary.totalVouchers) },
        { label: 'Total Amount', value: formatMoney(summary.totalAmount || 0) },
        { label: 'Total Paid', value: formatMoney(summary.totalPaid || 0) },
        { label: `${month} Pending`, value: formatMoney(summary.totalPending || 0) },
        { label: 'Previous Pending', value: formatMoney(summary.previousPending || 0) },
        { label: 'Total Pending', value: formatMoney(summary.totalPendingWithPrevious || 0) },
      ],
    }, {
      type: 'table', heading: 'Vouchers', headers: pdfHeaders, rows: pdfRows,
      footer: [`Total (${vouchers.length})`, '', '', '', formatMoney(summary.totalAmount || 0), formatMoney(summary.totalPaid || 0), formatMoney(summary.totalPending || 0), formatMoney(summary.previousPending || 0), formatMoney(summary.totalPendingWithPrevious || 0), `${collRate}%`],
    }],
  });

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-1">Total Vouchers</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{summary.totalVouchers}</p>
        </div>
        <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wide mb-1">Total Amount</p>
          <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{formatMoney((summary.totalAmount || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase tracking-wide mb-1">Total Paid</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{formatMoney((summary.totalPaid || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide mb-1">{month} Pending</p>
          <p className="text-xl font-bold text-red-700 dark:text-red-400">{formatMoney((summary.totalPending || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-amber-100 bg-amber-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">Previous Pending</p>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatMoney((summary.previousPending || 0))}</p>
        </div>
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Total Pending</p>
          <p className="text-xl font-bold text-red-700">{formatMoney((summary.totalPendingWithPrevious || 0))}</p>
        </div>
      </div>

      {/* Collection rate + status pie */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-500 dark:text-blue-400" /> {month} {year} — Collection Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Collection Rate</span>
              <span className={`font-bold text-lg ${collRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : collRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{collRate}%</span>
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
      <div className="rounded-lg border overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
          <span className="text-sm font-semibold">{vouchers.length} Vouchers</span>
          <ExportButtons data={vouchers} sheetName="Vouchers" fileName={`Vouchers_${month}_${year}`}
            pdfTitle={`Voucher Report - ${month} ${year}`}
            headers={pdfHeaders}
            rows={pdfRows}
            onPrint={handlePrint} />
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">#</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Voucher#</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Student</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Class</th>
              <th className="text-left px-3 py-2.5 font-semibold text-[11px]">Fee Type</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-purple-700 dark:text-purple-400">Amount</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-emerald-700 dark:text-emerald-400">Paid</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-red-600 dark:text-red-400">Pending</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-amber-700 dark:text-amber-400">Previous Pending</th>
              <th className="text-right px-3 py-2.5 font-semibold text-[11px] text-red-700 dark:text-red-400">Student Total Pending</th>
              <th className="text-center px-3 py-2.5 font-semibold text-[11px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No vouchers found</td></tr>
            ) : vouchers.map((v: any, i: number) => (
              <tr key={v.voucherNumber || i} className="border-b hover:bg-muted/20">
                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] font-medium">{v.voucherNumber || '-'}</td>
                <td className="px-3 py-1.5">
                  <p className="font-semibold">{v.name}</p>
                  {v.fatherName && <p className="text-[10px] text-muted-foreground">{v.fatherName}</p>}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{v.className || '-'}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{v.feeType || '-'}</td>
                <td className="px-3 py-1.5 text-right text-purple-600 dark:text-purple-400">{formatMoney(v.netAmount)}</td>
                <td className="px-3 py-1.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold">{formatMoney(v.paidAmount)}</td>
                <td className="px-3 py-1.5 text-right text-red-500 dark:text-red-400">{v.pending > 0 ? formatMoney(v.pending) : '-'}</td>
                <td className="px-3 py-1.5 text-right text-amber-700 dark:text-amber-400" title={v.previousMonths?.join(', ')}>{v.previousPending > 0 ? formatMoney(v.previousPending) : '-'}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-red-600 dark:text-red-400">{v.studentTotalPending > 0 ? formatMoney(v.studentTotalPending) : '-'}</td>
                <td className="px-3 py-1.5 text-center"><StatusBadge status={v.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={5} className="px-3 py-2.5">Total ({vouchers.length} vouchers)</td>
              <td className="px-3 py-2.5 text-right text-purple-700 dark:text-purple-400">{formatMoney((summary.totalAmount || 0))}</td>
              <td className="px-3 py-2.5 text-right text-emerald-700 dark:text-emerald-400">{formatMoney((summary.totalPaid || 0))}</td>
              <td className="px-3 py-2.5 text-right text-red-600 dark:text-red-400">{formatMoney((summary.totalPending || 0))}</td>
              <td className="px-3 py-2.5 text-right text-amber-700 dark:text-amber-400">{formatMoney((summary.previousPending || 0))}</td>
              <td className="px-3 py-2.5 text-right text-red-700 dark:text-red-400">{formatMoney((summary.totalPendingWithPrevious || 0))}</td>
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
  const { org, generatedByName } = useOrgAndUser();
  if (isLoading) return <Loading />;
  if (!data) return <EmptyState />;
  const { incomeVsExpense, feeCollectionTrend, expenseBreakdown } = data.chartData;

  const totalIncome = incomeVsExpense.reduce((s: number, r: any) => s + (r.income || 0), 0);
  const totalExpense = incomeVsExpense.reduce((s: number, r: any) => s + (r.expense || 0), 0);
  const totalExpected = feeCollectionTrend.reduce((s: number, r: any) => s + (r.expected || 0), 0);
  const totalCollected = feeCollectionTrend.reduce((s: number, r: any) => s + (r.collected || 0), 0);
  const netProfit = totalIncome - totalExpense;
  const collRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const incomeExpenseHeaders = ['Month', 'Income', 'Expense'];
  const incomeExpenseRows = incomeVsExpense.map((r: any) => [r.name, r.income?.toLocaleString(), r.expense?.toLocaleString()]);
  const printIncomeExpense = () => printReport(org, {
    title: `Monthly Income vs Expense - ${year}`,
    periodLabel: `Year ${year}`,
    generatedByName,
    sections: [{ type: 'table', heading: 'Income vs Expense', headers: incomeExpenseHeaders, rows: incomeExpenseRows }],
  });

  const feeTrendHeaders = ['Month', 'Expected', 'Collected', 'Rate %'];
  const feeTrendRows = feeCollectionTrend.map((r: any) => [r.name, r.expected?.toLocaleString(), r.collected?.toLocaleString(), `${r.rate}%`]);
  const printFeeTrend = () => printReport(org, {
    title: `Fee Collection Trend - ${year}`,
    periodLabel: `Year ${year}`,
    generatedByName,
    sections: [{ type: 'table', heading: 'Fee Collection Trend', headers: feeTrendHeaders, rows: feeTrendRows }],
  });

  const expenseBreakdownHeaders = ['Category', 'Total'];
  const expenseBreakdownRows = (expenseBreakdown || []).map((e: any) => [e.name, e.total?.toLocaleString()]);
  const printExpenseBreakdown = () => printReport(org, {
    title: `Expense Breakdown - ${year}`,
    periodLabel: `Year ${year}`,
    generatedByName,
    sections: [{ type: 'table', heading: 'Expense Breakdown', headers: expenseBreakdownHeaders, rows: expenseBreakdownRows }],
  });

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
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-emerald-500" /> Monthly Income vs Expense — {year}
          </CardTitle>
          <ExportButtons data={incomeVsExpense} sheetName="IncomeVsExpense" fileName={`IncomeVsExpense_${year}`}
            pdfTitle={`Income vs Expense - ${year}`}
            headers={incomeExpenseHeaders}
            rows={incomeExpenseRows}
            onPrint={printIncomeExpense} />
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
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" /> Fee Collection Trend — {year}
          </CardTitle>
          <ExportButtons data={feeCollectionTrend} sheetName="FeeTrend" fileName={`FeeTrend_${year}`}
            pdfTitle={`Fee Collection Trend - ${year}`}
            headers={feeTrendHeaders}
            rows={feeTrendRows}
            onPrint={printFeeTrend} />
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
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PieChart className="h-4 w-4 text-red-500" /> Expense Breakdown — {year}
          </CardTitle>
          {expenseBreakdown?.length > 0 && (
            <ExportButtons data={expenseBreakdown} sheetName="ExpenseBreakdown" fileName={`ExpenseBreakdown_${year}`}
              pdfTitle={`Expense Breakdown - ${year}`}
              headers={expenseBreakdownHeaders}
              rows={expenseBreakdownRows}
              onPrint={printExpenseBreakdown} />
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

export function SummaryCard({ label, value, color, raw }: { label: string; value: any; color: string; raw?: boolean }) {
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

export function ReportTable({ headers, rows, footer }: { headers: string[]; rows: any[][]; footer?: any[] }) {
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

export function StatusBadge({ status }: { status: string }) {
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

export function ExportButtons({ data, sheetName, fileName, pdfTitle, headers, rows, landscape, onPrint }: any) {
  return (
    <div className="flex gap-1.5 shrink-0">
      <Button variant="outline" size="sm" onClick={() => exportToExcel(data, sheetName, fileName)} disabled={!data?.length}>
        <FileSpreadsheet className="mr-1 h-3 w-3" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => exportToPDF(pdfTitle, headers, rows, fileName, landscape)} disabled={!rows?.length}>
        <Download className="mr-1 h-3 w-3" /> PDF
      </Button>
      {onPrint && (
        <Button variant="outline" size="sm" onClick={onPrint} disabled={!rows?.length}>
          <Printer className="mr-1 h-3 w-3" /> Print
        </Button>
      )}
    </div>
  );
}

export function Loading() {
  return <div className="text-center py-16 text-muted-foreground text-sm">Loading report...</div>;
}

export function EmptyState({ text }: { text?: string }) {
  return <div className="text-center py-16 text-muted-foreground text-sm">{text || 'No data available'}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Print Fee Collection Report ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function printFeeReport(reportData: any[], schoolName: string, year: number, month: string, positionRows: any[]) {
  if (!reportData.length) return;
  const positionOf = (studentId: string) => positionRows.find((row) => row.studentId === studentId);
  const shortMonth = month.slice(0, 3);

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

    const amount = (v: number) => (v > 0 ? v.toLocaleString() : '-');
    const pendingCells = (studentId: string) => {
      const pos = positionOf(studentId);
      return `<td class="tot">${amount(pos?.previousPending || 0)}</td><td class="tot">${amount(pos?.currentPending || 0)}</td><td class="tot unpaid">${amount(pos?.totalPending || 0)}</td>`;
    };
    const classPending = (field: 'previousPending' | 'currentPending' | 'totalPending') =>
      cls.students.reduce((sum: number, st: any) => sum + (positionOf(st.studentId)?.[field] || 0), 0);

    const rows = cls.students.map((s: any, idx: number) => {
      const monthCells = monthCell(s.months[MONTHS[0]])
        + extraFunds.map((f) => fundCell(s, f)).join('')
        + MONTHS.slice(1).map((m) => monthCell(s.months[m])).join('');
      return `<tr><td class="sno">${idx + 1}</td><td class="name">${s.name}</td><td>${s.rollNumber || '-'}</td><td>${s.fatherName || '-'}</td><td>${s.phone || '-'}</td>${monthCells}<td class="tot paid">${s.totalPaid.toLocaleString()}</td>${pendingCells(s.studentId)}</tr>`;
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
    const totalRow = `<tr class="frow"><td colspan="5" class="ftlabel">Total</td>${footerCells}<td class="ftot paid">${cls.classTotalPaid.toLocaleString()}</td><td class="ftot paid" style="color:#000">${classPending('previousPending').toLocaleString()}</td><td class="ftot paid" style="color:#000">${classPending('currentPending').toLocaleString()}</td><td class="ftot unpaid">${classPending('totalPending').toLocaleString()}</td></tr>`;

    return `<div class="page"><div class="header"><h1>${schoolName}</h1><h2>Fee Collection Report - ${year}</h2><h3>Class: ${cls.className} | Students: ${cls.totalStudents}</h3></div><table><thead><tr><th class="sno">#</th><th class="name">Student</th><th>Roll#</th><th>Father</th><th>Phone</th>${monthHeaders}<th class="toth">Paid</th><th class="toth">Previous Pending</th><th class="toth">${shortMonth} Pending</th><th class="toth">Total Pending</th></tr></thead><tbody>${rows}${totalRow}</tbody></table><div class="footer"><span>Printed: ${formatAppDate(new Date())}</span><span>${schoolName}</span></div></div>`;
  }).join('');

  openReportPrintWindow(`<!DOCTYPE html><html><head><title>Fee Report</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:8px;color:#000;background:#fff}.page{padding:8mm 6mm;page-break-after:always}.page:last-child{page-break-after:auto}.header{text-align:center;margin-bottom:6px}.header h1{font-size:16px;font-weight:900;text-transform:uppercase}.header h2{font-size:11px;font-weight:700}.header h3{font-size:10px;color:#444}table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border:1px solid #999;padding:3px 4px}thead tr{background:#e8e8e8}th{font-size:7.5px;font-weight:700;text-transform:uppercase}th.sno{width:20px;text-align:center}th.name{min-width:100px}th.mh{text-align:center;width:48px}th.toth{text-align:right;width:52px}td.sno{text-align:center;color:#555;font-size:7px}td.name{font-weight:600;white-space:nowrap}td.mc{text-align:center;font-size:7.5px}td.mc.paid{color:#047857;font-weight:700}td.mc.partial{color:#2563eb;font-weight:600}td.mc.unpaid{color:#dc2626;font-weight:700}td.tot{text-align:right;font-weight:700;font-size:8px}td.tot.paid{color:#047857}td.tot.unpaid{color:#dc2626}td.ftlabel{font-weight:800;font-size:8px}td.ftot{text-align:center;font-weight:800;font-size:8px}td.ftot.paid{color:#047857;text-align:right}td.ftot.unpaid{color:#dc2626;text-align:right}tbody tr:nth-child(even){background:#fafafa}tbody tr.frow{background:#f3f3f3;break-inside:avoid}.footer{display:flex;justify-content:space-between;margin-top:6px;font-size:7px;color:#888;border-top:1px solid #ccc;padding-top:3px}@media print{@page{size:A4 landscape;margin:5mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${classPages}</body></html>`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Print Expense Report ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function printExpenseReport(reportData: any, schoolName: string, year: number, month: string) {
  const { summary, data: detail } = reportData;
  const transactions = detail.transactions || [];
  const categories = detail.categories || [];
  if (!transactions.length) return;

  const fmt = (n: number) => (n || 0).toLocaleString();

  const catRows = categories.map((c: any) => {
    const pct = summary.totalExpense > 0 ? Math.round((c.total / summary.totalExpense) * 100) : 0;
    return `<tr><td>${c.name}</td><td class="c">${c.count}</td><td class="r">${fmt(c.total)}</td><td class="c">${pct}%</td></tr>`;
  }).join('');

  const txnRows = transactions.map((t: any, idx: number) => `<tr>
    <td class="c">${idx + 1}</td>
    <td>${formatAppDate(new Date(t.date))}</td>
    <td>${t.expenseNumber || '-'}</td>
    <td>${t.categoryName}</td>
    <td>${t.description || '-'}</td>
    <td>${t.vendor || '-'}</td>
    <td class="cap">${(t.paymentMethod || '').replace('_', ' ')}</td>
    <td class="c ${t.isPaid ? 'paid' : 'pending'}">${t.isPaid ? 'Paid' : 'Pending'}</td>
    <td>${t.createdByName || '-'}</td>
    <td class="r">${fmt(t.amount)}</td>
  </tr>`).join('');

  openReportPrintWindow(`<!DOCTYPE html><html><head><title>Expense Report - ${month} ${year}</title><style>
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
<div class="footer"><span>Printed: ${formatAppDateTime(new Date())}</span><span>${schoolName} — Expense Report</span></div>
</body></html>`);
}
