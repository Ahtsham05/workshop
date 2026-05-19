import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  TrendingUp, TrendingDown, BarChart2, Printer, FileText, Download, FileSpreadsheet,
  BookOpen, GraduationCap, DollarSign, PieChart, Activity, Briefcase,
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
  useGetReportStudentListQuery,
  useGetReportStudentFeeStatusQuery,
  useGetReportStudentAttendanceQuery,
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

type TabKey = 'financial' | 'students' | 'teachers' | 'vouchers' | 'analytics' | 'feeCollection';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'feeCollection', label: 'Fee Collection', icon: FileText },
  { key: 'financial', label: 'Financial', icon: DollarSign },
  { key: 'students', label: 'Students', icon: GraduationCap },
  { key: 'teachers', label: 'Teachers', icon: Briefcase },
  { key: 'vouchers', label: 'Vouchers', icon: BookOpen },
  { key: 'analytics', label: 'Analytics', icon: Activity },
];

export default function FeeReports() {
  const now = new Date();
  const user = useSelector((s: RootState) => s.auth.data?.user);
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [tab, setTab] = useState<TabKey>('feeCollection');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [financialSub, setFinancialSub] = useState<'monthly' | 'daily' | 'pnl' | 'categories'>('monthly');
  const [studentSub, setStudentSub] = useState<'list' | 'feeStatus' | 'attendance'>('feeStatus');
  const [teacherSub, setTeacherSub] = useState<'salary' | 'workload'>('salary');
  const [voucherStatus, setVoucherStatus] = useState<string>('all');

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const classes: any[] = (classesData?.results || []).map((c: any) => ({ ...c, id: c.id || c._id })).filter((c: any) => c.id);

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

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${tab === key ? 'bg-background shadow text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Fee Collection Tab */}
      {tab === 'feeCollection' && (
        <FeeCollectionTab year={year} month={month} classFilter={classFilter}
          setClassFilter={setClassFilter} classes={classes} orgName={org?.name || 'School'} />
      )}

      {/* Financial Tab */}
      {tab === 'financial' && (
        <div className="space-y-4">
          <SubTabBar items={[
            { key: 'monthly', label: 'Monthly Income/Expense' },
            { key: 'daily', label: 'Daily Collection' },
            { key: 'pnl', label: 'Profit & Loss' },
            { key: 'categories', label: 'Category-wise' },
          ]} active={financialSub} onChange={(k) => setFinancialSub(k as any)} />

          {financialSub === 'monthly' && <FinancialMonthlyReport year={year} />}
          {financialSub === 'daily' && <FinancialDailyReport year={year} month={month} />}
          {financialSub === 'pnl' && <FinancialPnlReport year={year} />}
          {financialSub === 'categories' && <FinancialCategoryReport />}
        </div>
      )}

      {/* Students Tab */}
      {tab === 'students' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <SubTabBar items={[
              { key: 'feeStatus', label: 'Fee Status' },
              { key: 'attendance', label: 'Attendance' },
              { key: 'list', label: 'Student List' },
            ]} active={studentSub} onChange={(k) => setStudentSub(k as any)} />
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-40 h-8"><SelectValue placeholder="All Classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {studentSub === 'list' && <StudentListReport classId={classFilter !== 'all' ? classFilter : undefined} />}
          {studentSub === 'feeStatus' && <StudentFeeStatusReport year={year} month={month} classId={classFilter !== 'all' ? classFilter : undefined} />}
          {studentSub === 'attendance' && <StudentAttendanceReport year={year} month={month} classId={classFilter !== 'all' ? classFilter : undefined} />}
        </div>
      )}

      {/* Teachers Tab */}
      {tab === 'teachers' && (
        <div className="space-y-4">
          <SubTabBar items={[
            { key: 'salary', label: 'Salary Report' },
            { key: 'workload', label: 'Workload' },
          ]} active={teacherSub} onChange={(k) => setTeacherSub(k as any)} />
          {teacherSub === 'salary' && <TeacherSalaryReport year={year} />}
          {teacherSub === 'workload' && <TeacherWorkloadReport />}
        </div>
      )}

      {/* Vouchers Tab */}
      {tab === 'vouchers' && (
        <div className="space-y-4">
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
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-40 h-8"><SelectValue placeholder="All Classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <VoucherReport year={year} month={month}
            status={voucherStatus !== 'all' ? voucherStatus : undefined}
            classId={classFilter !== 'all' ? classFilter : undefined} />
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && <AnalyticsTab year={year} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Sub-tab Bar Component ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function SubTabBar({ items, active, onChange }: { items: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 p-0.5 bg-muted/60 rounded-md w-fit">
      {items.map(({ key, label }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded text-xs transition-all ${active === key ? 'bg-background shadow text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Fee Collection Tab ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function FeeCollectionTab({ year, month, classFilter, setClassFilter, classes, orgName }: any) {
  const { data: yearlyReport, isLoading } = useGetYearlyFeeReportQuery(
    { year, ...(classFilter !== 'all' ? { classId: classFilter } : {}) }
  );
  const { data: receivable } = useGetReceivableSummaryQuery({ month, year });

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
            yearlyReport.forEach((cls: any) => cls.students.forEach((s: any) => {
              const row: any = { Class: cls.className, Name: s.name, 'Roll#': s.rollNumber, Father: s.fatherName, Phone: s.phone };
              MONTHS.forEach((m) => { const e = s.months[m]; row[m.slice(0, 3)] = e ? (e.status === 'paid' ? e.paidAmount : e.paidAmount > 0 ? `${e.paidAmount}/${e.netAmount}` : `Due: ${e.netAmount}`) : '-'; });
              row.Paid = s.totalPaid; row.Pending = s.totalPending;
              rows.push(row);
            }));
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
                <p className="text-lg font-bold text-purple-700">PKR {monthExpected.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-[10px] font-medium text-emerald-500 uppercase tracking-wide mb-1">Collected</p>
                <p className="text-lg font-bold text-emerald-700">PKR {monthCollected.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="text-[10px] font-medium text-red-400 uppercase tracking-wide mb-1">Pending</p>
                <p className="text-lg font-bold text-red-600">PKR {monthPending.toLocaleString()}</p>
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
                <span>PKR {monthCollected.toLocaleString()} collected</span>
                <span>PKR {monthPending.toLocaleString()} outstanding</span>
              </div>
            </div>
            {/* Arrears & wallet row */}
            {receivable && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Previous Arrears</p>
                    <p className="text-sm font-semibold text-amber-600">PKR {(receivable.previousArrears || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-400" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Advance Wallet</p>
                    <p className="text-sm font-semibold text-teal-600">PKR {(receivable.totalCreditBalance || 0).toLocaleString()}</p>
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
                <p className="text-lg font-bold text-indigo-700">PKR {yearExpected.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                <p className="text-[10px] font-medium text-green-500 uppercase tracking-wide mb-1">Collected</p>
                <p className="text-lg font-bold text-green-700">PKR {yearCollected.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                <p className="text-[10px] font-medium text-orange-400 uppercase tracking-wide mb-1">Pending</p>
                <p className="text-lg font-bold text-orange-600">PKR {(yearExpected - yearCollected).toLocaleString()}</p>
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
              <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
                  <td className="px-3 py-1.5 text-right text-purple-700">{row.expected > 0 ? `PKR ${row.expected.toLocaleString()}` : '-'}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{row.collected > 0 ? `PKR ${row.collected.toLocaleString()}` : '-'}</td>
                  <td className="px-3 py-1.5 text-right text-red-500">{row.pending > 0 ? `PKR ${row.pending.toLocaleString()}` : '-'}</td>
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
              <td className="px-3 py-2 text-right text-purple-700">PKR {yearExpected.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-emerald-700">PKR {yearCollected.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-red-700">PKR {(yearExpected - yearCollected).toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{yearRate}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Class-wise Detail ── */}
      {isLoading ? <Loading /> : !yearlyReport?.length ? <EmptyState text={`No fee data for ${year}`} /> : (
        yearlyReport.map((cls: any) => {
          // per-month expected for this class
          const clsMonthExpected = MONTHS.reduce((acc: Record<string, number>, m) => {
            acc[m] = cls.students.reduce((s: number, st: any) => s + (st.months[m]?.netAmount || 0), 0);
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
                    Expected: PKR {cls.students.reduce((s: number, st: any) => s + (st.totalPaid || 0) + (st.totalPending || 0), 0).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    Paid: PKR {cls.classTotalPaid?.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-red-600 font-medium">
                    Pending: PKR {cls.classTotalPending?.toLocaleString()}
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
                      {MONTHS.map((m) => (
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
                        {MONTHS.map((m) => {
                          const e = s.months[m];
                          const net = e?.netAmount || 0;
                          const paid = e?.paidAmount || 0;
                          return (
                            <td key={m} className={`px-1 py-1.5 text-center ${m === month ? 'bg-blue-50/60' : ''}`}>
                              {e ? (
                                net === 0 && paid === 0
                                  ? <span className="text-muted-foreground font-medium" title="Zero fee">0</span>
                                  : e.status === 'paid'
                                    ? <span className="text-emerald-600 font-semibold">{paid.toLocaleString()}</span>
                                    : paid > 0
                                      ? <span className="text-blue-600 font-medium" title={`Partial: ${paid}/${net}`}>{paid.toLocaleString()}<span className="text-[9px] text-muted-foreground">/{net.toLocaleString()}</span></span>
                                      : <span className="text-red-500 font-semibold">{net.toLocaleString()}</span>
                              ) : <span className="text-muted-foreground/30">-</span>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right font-semibold text-emerald-600">{(s.totalPaid || 0).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-red-600">{s.totalPending > 0 ? s.totalPending.toLocaleString() : <span className="text-muted-foreground/40">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/60 font-bold text-[11px]">
                      <td colSpan={5} className="px-2 py-2 sticky left-0 bg-muted/60">Class Total</td>
                      {MONTHS.map((m) => {
                        const mPaid = cls.students.reduce((s: number, st: any) => s + (st.months[m]?.paidAmount || 0), 0);
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
                      })}
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
          <p className="text-2xl font-bold text-emerald-700">PKR {(summary.income || 0).toLocaleString()}</p>
          <p className="text-[11px] text-emerald-600 mt-1">{months.filter((m: any) => m.income > 0).length} active months</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Total Expense {year}</p>
          <p className="text-2xl font-bold text-red-700">PKR {(summary.expense || 0).toLocaleString()}</p>
          <p className="text-[11px] text-red-600 mt-1">{months.filter((m: any) => m.expense > 0).length} active months</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${summary.profit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${summary.profit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
            <TrendingUp className="h-3 w-3" /> Net Profit {year}
          </p>
          <p className={`text-2xl font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>PKR {(summary.profit || 0).toLocaleString()}</p>
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
              <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
                  <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{m.income > 0 ? `PKR ${m.income.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-2 text-right text-red-500">{m.expense > 0 ? `PKR ${m.expense.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-2 text-right">
                    {hasData ? <span className={`font-bold ${m.profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>PKR {m.profit.toLocaleString()}</span> : '-'}
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
              <td className="px-4 py-2.5 text-right text-emerald-700">PKR {(summary.income || 0).toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right text-red-600">PKR {(summary.expense || 0).toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right"><span className={summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}>PKR {(summary.profit || 0).toLocaleString()}</span></td>
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
          <p className="text-2xl font-bold text-emerald-700">PKR {(summary.totalCollected || 0).toLocaleString()}</p>
          <p className="text-[11px] text-emerald-600 mt-1">{month} {year}</p>
        </div>
        <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-4">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Active Days</p>
          <p className="text-2xl font-bold text-blue-700">{summary.activeDays} <span className="text-sm font-normal text-blue-500">/ {summary.totalDays}</span></p>
          <p className="text-[11px] text-blue-600 mt-1">{activePct}% days had collection</p>
        </div>
        <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-4">
          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-1">Daily Average</p>
          <p className="text-2xl font-bold text-purple-700">PKR {avgDaily.toLocaleString()}</p>
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
              <Tooltip formatter={(v: number, name: string) => [`PKR ${(v as number).toLocaleString()}`, name]} labelFormatter={(l) => `Day ${l}`} />
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
                <td className="px-4 py-2 text-right font-bold text-emerald-600">PKR {d.amount.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-slate-600">{d.transactions}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={2} className="px-4 py-2.5">Total ({summary.activeDays} days)</td>
              <td className="px-4 py-2.5 text-right text-emerald-700">PKR {(summary.totalCollected || 0).toLocaleString()}</td>
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
          <p className="text-2xl font-bold text-emerald-700">PKR {(summary.income || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Expense</p>
          <p className="text-2xl font-bold text-red-700">PKR {(summary.expense || 0).toLocaleString()}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${summary.profit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${summary.profit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Net Profit / Loss</p>
          <p className={`text-2xl font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>PKR {(summary.profit || 0).toLocaleString()}</p>
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
              <p className="text-xl font-bold text-purple-700">PKR {(summary.feeExpected || 0).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mb-1">Fee Collected</p>
              <p className="text-xl font-bold text-emerald-700">PKR {(summary.feeCollected || 0).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide mb-1">Fee Pending</p>
              <p className="text-xl font-bold text-amber-600">PKR {(summary.feePending || 0).toLocaleString()}</p>
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
              <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
                  <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{m.income > 0 ? `PKR ${m.income.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-2 text-right text-red-500">{m.expense > 0 ? `PKR ${m.expense.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-2 text-right"><span className={`font-bold ${m.profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{hasData ? `PKR ${m.profit.toLocaleString()}` : '-'}</span></td>
                  <td className="px-4 py-2 text-right text-purple-600">{m.feeExpected > 0 ? `PKR ${m.feeExpected.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-2 text-right text-teal-600 font-semibold">{m.feeCollected > 0 ? `PKR ${m.feeCollected.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-2 text-right text-amber-600">{m.feePending > 0 ? `PKR ${m.feePending.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-2 text-right">{m.feeExpected > 0 ? <span className={`font-semibold ${rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span> : '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td className="px-4 py-2.5">Year Total</td>
              <td className="px-4 py-2.5 text-right text-emerald-700">PKR {(summary.income || 0).toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right text-red-600">PKR {(summary.expense || 0).toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right"><span className={summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}>PKR {(summary.profit || 0).toLocaleString()}</span></td>
              <td className="px-4 py-2.5 text-right text-purple-700">PKR {(summary.feeExpected || 0).toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right text-teal-700">PKR {(summary.feeCollected || 0).toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right text-amber-600">PKR {(summary.feePending || 0).toLocaleString()}</td>
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
          <p className="text-2xl font-bold text-emerald-700">PKR {(summary.totalIncome || 0).toLocaleString()}</p>
          <p className="text-[11px] text-emerald-600 mt-1">{income.length} categor{income.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Total Expense</p>
          <p className="text-2xl font-bold text-red-700">PKR {(summary.totalExpense || 0).toLocaleString()}</p>
          <p className="text-[11px] text-red-600 mt-1">{expense.length} categor{expense.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${summary.profit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${summary.profit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Net Profit</p>
          <p className={`text-2xl font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>PKR {(summary.profit || 0).toLocaleString()}</p>
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
                    <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
                      <span className="font-bold text-emerald-600">PKR {c.total?.toLocaleString()}</span>
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
                    <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
                      <span className="font-bold text-red-600">PKR {c.total?.toLocaleString()}</span>
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
// ─── Student: Fee Status ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function StudentFeeStatusReport({ year, month, classId }: { year: number; month: string; classId?: string }) {
  const { data, isLoading } = useGetReportStudentFeeStatusQuery({ year, month, ...(classId ? { classId } : {}) });
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
          <p className="text-lg font-bold text-purple-700">PKR {(summary.totalExpected || 0).toLocaleString()}</p>
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
            <span className="font-semibold text-emerald-600">Collected: PKR {totalCollected.toLocaleString()}</span>
            <span className="font-semibold text-red-600">Pending: PKR {totalPending.toLocaleString()}</span>
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
                    <td className="px-3 py-1.5 text-right text-purple-600">PKR {s.netAmount?.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">PKR {s.paidAmount?.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-red-500">{s.pending > 0 ? `PKR ${s.pending?.toLocaleString()}` : '-'}</td>
                    <td className="px-3 py-1.5 text-center"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold text-[11px]">
                  <td colSpan={3} className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right text-purple-700">PKR {(summary.totalExpected || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">PKR {totalCollected.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-red-600">PKR {totalPending.toLocaleString()}</td>
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
          <p className="text-2xl font-bold text-green-700">PKR {(summary.totalSalaryPaid || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-amber-100 bg-amber-50 p-4">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Pending (Draft)</p>
          <p className="text-2xl font-bold text-amber-700">PKR {(summary.totalPending || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4">
          <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">Total Payable</p>
          <p className="text-2xl font-bold text-indigo-700">PKR {(summary.totalPayable || 0).toLocaleString()}</p>
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
              <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
                  {t.totalPaid > 0 ? `PKR ${t.totalPaid.toLocaleString()}` : '-'}
                </td>
                <td className="px-3 py-2 text-right font-bold text-amber-600">
                  {(t.totalPending || 0) > 0 ? `PKR ${t.totalPending.toLocaleString()}` : '-'}
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
              <td className="px-3 py-2 text-right text-green-700">PKR {(summary.totalSalaryPaid || 0).toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-amber-600">PKR {(summary.totalPending || 0).toLocaleString()}</td>
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
          <p className="text-xl font-bold text-purple-700">PKR {(summary.totalAmount || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">Total Paid</p>
          <p className="text-xl font-bold text-emerald-700">PKR {(summary.totalPaid || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Total Pending</p>
          <p className="text-xl font-bold text-red-700">PKR {(summary.totalPending || 0).toLocaleString()}</p>
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
                <td className="px-3 py-1.5 text-right text-purple-600">PKR {v.netAmount?.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">PKR {v.paidAmount?.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-red-500">{v.pending > 0 ? `PKR ${v.pending?.toLocaleString()}` : '-'}</td>
                <td className="px-3 py-1.5 text-center"><StatusBadge status={v.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold text-[11px]">
              <td colSpan={4} className="px-3 py-2.5">Total ({vouchers.length} vouchers)</td>
              <td className="px-3 py-2.5 text-right text-purple-700">PKR {(summary.totalAmount || 0).toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right text-emerald-700">PKR {(summary.totalPaid || 0).toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right text-red-600">PKR {(summary.totalPending || 0).toLocaleString()}</td>
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
          <p className="text-xl font-bold text-emerald-700">PKR {totalIncome.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Total Expense ({year})</p>
          <p className="text-xl font-bold text-red-700">PKR {totalExpense.toLocaleString()}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 text-center ${netProfit >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${netProfit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Net Profit / Loss</p>
          <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>PKR {netProfit.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-purple-100 bg-purple-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-1">Fee Expected</p>
          <p className="text-xl font-bold text-purple-700">PKR {totalExpected.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border-2 border-cyan-100 bg-cyan-50 p-4 text-center">
          <p className="text-[10px] font-semibold text-cyan-500 uppercase tracking-wide mb-1">Fee Collected</p>
          <p className="text-xl font-bold text-cyan-700">PKR {totalCollected.toLocaleString()}</p>
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
              <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
              <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
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
                  <Tooltip formatter={(v: number) => `PKR ${v.toLocaleString()}`} />
                </RePieChart>
              </ResponsiveContainer>
              <div className="space-y-2 pt-2">
                {expenseBreakdown.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm hover:bg-muted/20 rounded px-2 py-1.5">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1">{e.name}</span>
                    <span className="font-semibold text-red-600">PKR {e.total?.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground">({totalExpense > 0 ? Math.round((e.total / totalExpense) * 100) : 0}%)</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold text-sm px-2">
                  <span>Total</span>
                  <span className="text-red-700">PKR {totalExpense.toLocaleString()}</span>
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
  return (
    <Card><CardContent className="pt-4 pb-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${color}`}>
        {raw ? value : `PKR ${(value || 0).toLocaleString()}`}
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
    const rows = cls.students.map((s: any, idx: number) => {
      const monthCells = MONTHS.map((m) => {
        const entry = s.months[m];
        if (!entry) return '<td class="mc">-</td>';
        if (entry.status === 'paid') return `<td class="mc paid">${entry.paidAmount.toLocaleString()}</td>`;
        if (entry.paidAmount > 0) return `<td class="mc partial">${entry.paidAmount.toLocaleString()}</td>`;
        return `<td class="mc unpaid">${entry.netAmount.toLocaleString()}</td>`;
      }).join('');
      return `<tr><td class="sno">${idx + 1}</td><td class="name">${s.name}</td><td>${s.rollNumber || '-'}</td><td>${s.fatherName || '-'}</td><td>${s.phone || '-'}</td>${monthCells}<td class="tot paid">${s.totalPaid.toLocaleString()}</td><td class="tot unpaid">${s.totalPending > 0 ? s.totalPending.toLocaleString() : '-'}</td></tr>`;
    }).join('');

    const footerCells = MONTHS.map((m) => {
      let t = 0; cls.students.forEach((s: any) => { if (s.months[m]) t += s.months[m].paidAmount; });
      return `<td class="mc ftot">${t > 0 ? t.toLocaleString() : '-'}</td>`;
    }).join('');

    return `<div class="page"><div class="header"><h1>${schoolName}</h1><h2>Fee Collection Report - ${year}</h2><h3>Class: ${cls.className} | Students: ${cls.totalStudents}</h3></div><table><thead><tr><th class="sno">#</th><th class="name">Student</th><th>Roll#</th><th>Father</th><th>Phone</th>${MONTHS.map((m) => `<th class="mh">${m.slice(0, 3)}</th>`).join('')}<th class="toth">Paid</th><th class="toth">Pending</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="frow"><td colspan="5" class="ftlabel">Total</td>${footerCells}<td class="ftot paid">${cls.classTotalPaid.toLocaleString()}</td><td class="ftot unpaid">${cls.classTotalPending.toLocaleString()}</td></tr></tfoot></table><div class="footer"><span>Printed: ${new Date().toLocaleDateString()}</span><span>${schoolName}</span></div></div>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html><head><title>Fee Report</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:8px;color:#000;background:#fff}.page{width:297mm;padding:8mm 6mm;page-break-after:always}.page:last-child{page-break-after:auto}.header{text-align:center;margin-bottom:6px}.header h1{font-size:16px;font-weight:900;text-transform:uppercase}.header h2{font-size:11px;font-weight:700}.header h3{font-size:10px;color:#444}table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border:1px solid #999;padding:3px 4px}thead tr{background:#e8e8e8}th{font-size:7.5px;font-weight:700;text-transform:uppercase}th.sno{width:20px;text-align:center}th.name{min-width:100px}th.mh{text-align:center;width:48px}th.toth{text-align:right;width:52px}td.sno{text-align:center;color:#555;font-size:7px}td.name{font-weight:600;white-space:nowrap}td.mc{text-align:center;font-size:7.5px}td.mc.paid{color:#047857;font-weight:700}td.mc.partial{color:#2563eb;font-weight:600}td.mc.unpaid{color:#dc2626;font-weight:700}td.tot{text-align:right;font-weight:700;font-size:8px}td.tot.paid{color:#047857}td.tot.unpaid{color:#dc2626}tfoot tr.frow{background:#f3f3f3}td.ftlabel{font-weight:800;font-size:8px}td.ftot{text-align:center;font-weight:800;font-size:8px}td.ftot.paid{color:#047857;text-align:right}td.ftot.unpaid{color:#dc2626;text-align:right}tbody tr:nth-child(even){background:#fafafa}.footer{display:flex;justify-content:space-between;margin-top:6px;font-size:7px;color:#888;border-top:1px solid #ccc;padding-top:3px}@media print{@page{size:A4 landscape;margin:5mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${classPages}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}
