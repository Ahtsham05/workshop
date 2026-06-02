/**
 * Student Progress Report — printable A4 report card
 * /school/reports/progress
 */
import { useState, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Printer, User, BookOpen, CheckCircle2, Search, CreditCard } from 'lucide-react';
import {
  useGetExamsQuery,
  useGetStudentProgressReportQuery,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { RootState } from '@/stores/store';
import StudentSearchPicker from '../components/student-search-picker';
import { buildProgressReportPrintHtml, openProgressReportPrint } from './progress-report-print-html';
import { mapReportToPrintInput } from './progress-report-utils';
import ClassBatchProgressReports from './progress-report-class-batch';

const GRADE_COLOR: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-yellow-100 text-yellow-800',
  D: 'bg-orange-100 text-orange-800',
  E: 'bg-gray-100 text-gray-700',
  F: 'bg-red-100 text-red-800',
  AB: 'bg-slate-100 text-slate-500',
};

type FeeSummary = {
  totalDue: number;
  totalPaid: number;
  balance: number;
  voucherCount: number;
  unpaidCount: number;
};

function formatFeeDisplay(fees: FeeSummary) {
  if (fees.voucherCount === 0) {
    return {
      headline: 'No fee records',
      sub: 'No vouchers issued for this student',
      badge: 'No records',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (fees.balance <= 0) {
    return {
      headline: 'Cleared',
      sub: `Paid Rs ${fees.totalPaid.toLocaleString()} of Rs ${fees.totalDue.toLocaleString()}`,
      badge: 'All clear',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }
  return {
    headline: `Rs ${fees.balance.toLocaleString()} pending`,
    sub: `${fees.unpaidCount} unpaid voucher${fees.unpaidCount === 1 ? '' : 's'} · Due Rs ${fees.totalDue.toLocaleString()}, paid Rs ${fees.totalPaid.toLocaleString()}`,
    badge: 'Fee pending',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
  };
}

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLOR[grade] || 'bg-gray-100 text-gray-600'}`}
    >
      {grade}
    </span>
  );
}

export default function ProgressReportPage() {
  const [mode, setMode] = useState<'single' | 'class'>('single');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedExam, setSelectedExam] = useState('all');
  const user = useSelector((state: RootState) => state.auth.data?.user);

  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const schoolName = org?.name || 'School Name';

  const { data: examsData } = useGetExamsQuery({ limit: 100 });

  const skip = !selectedStudent;
  const { data: reportData, isLoading: reportLoading, isFetching } = useGetStudentProgressReportQuery(
    { studentId: selectedStudent, examId: selectedExam !== 'all' ? selectedExam : undefined },
    { skip }
  );

  const examTitle = useMemo(() => {
    if (selectedExam !== 'all') {
      const ex = examsData?.results?.find((e: { id?: string; _id?: string }) => (e.id || e._id) === selectedExam);
      return ex?.name || 'Exam';
    }
    const first = reportData?.exams?.[0];
    return first?.exam?.name || 'Progress Report';
  }, [selectedExam, examsData, reportData]);

  const handlePrint = useCallback(() => {
    if (!reportData) return;
    const printExam = reportData.exams[0];
    if (!printExam) return;

    const input = mapReportToPrintInput(reportData, schoolName, examTitle);
    if (!input) return;
    openProgressReportPrint(buildProgressReportPrintHtml(input));
  }, [reportData, schoolName, examTitle]);

  const exams = examsData?.results ?? [];
  const loading = reportLoading || isFetching;

  return (
    <div className="h-full w-full p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progress Reports</h1>
          <p className="text-sm text-muted-foreground">
            Print one student or an entire class. Fee status is screen-only (not on printed cards).
          </p>
        </div>
        {mode === 'single' && reportData && reportData.exams.length > 0 && (
          <Button onClick={handlePrint} size="sm" className="gap-2 bg-emerald-700 hover:bg-emerald-800">
            <Printer className="h-4 w-4" /> Print A4 Report
          </Button>
        )}
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'class')}>
        <TabsList>
          <TabsTrigger value="single">Single student</TabsTrigger>
          <TabsTrigger value="class">Class / batch</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4 mt-4">
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-6 min-w-0">
              <StudentSearchPicker
                label="Student *"
                value={selectedStudent}
                onChange={(sid) => {
                  setSelectedStudent(sid);
                  setSelectedExam('all');
                }}
              />
            </div>
            <div className="sm:col-span-4 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">Exam *</p>
              <Select value={selectedExam} onValueChange={setSelectedExam} disabled={!selectedStudent}>
                <SelectTrigger className="h-9 w-full min-w-0 [&>span]:truncate">
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Latest exam (recommended)</SelectItem>
                  {exams.map((e: { id?: string; _id?: string; name: string; classId?: { name?: string } }) => (
                    <SelectItem key={e.id || e._id} value={e.id || e._id!}>
                      {e.name} {e.classId?.name ? `(${e.classId.name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 min-w-0 flex items-end">
              {loading && <p className="text-sm text-muted-foreground animate-pulse">Generating…</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedStudent && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <Search className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">Search and select a student to generate their progress report</p>
          </CardContent>
        </Card>
      )}

      {reportData && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={<User className="h-5 w-5 text-blue-500" />}
              label="Student"
              value={`${reportData.student.firstName} ${reportData.student.lastName || ''}`}
              sub={`${reportData.student.className}${reportData.student.sectionName ? ` — ${reportData.student.sectionName}` : ''}`}
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
              label="Attendance"
              value={
                reportData.attendance.hasRecords ?? reportData.attendance.total > 0
                  ? `${reportData.attendance.percentage ?? 0}%`
                  : 'Manual on print'
              }
              sub={
                reportData.attendance.total > 0
                  ? `${reportData.attendance.present} / ${reportData.attendance.total} days`
                  : 'Blank lines on printed card'
              }
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5 text-violet-500" />}
              label="Overall Grade"
              value={reportData.overall.grade}
              sub={`${reportData.overall.percentage}% — ${reportData.overall.label}`}
            />
            {reportData.fees && (
              <FeeStatCard fees={reportData.fees as FeeSummary} />
            )}
          </div>

          {reportData.exams.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                No exam results found for this student.
              </CardContent>
            </Card>
          )}

          {reportData.exams.map((exam, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                    {exam.exam?.name || 'Exam'}
                    <Badge variant="outline" className="text-[10px]">
                      {exam.exam?.type?.replace('_', ' ')}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-2 text-sm font-normal flex-wrap justify-end">
                    <span className="text-muted-foreground">
                      {exam.totalObtained}/{exam.totalMax}
                    </span>
                    <span className="font-bold">{exam.percentage}%</span>
                    <GradeBadge grade={exam.grade} />
                    {exam.highestPercentageInClass != null && (
                      <span className="text-xs text-muted-foreground">
                        Class highest: {exam.highestPercentageInClass}%
                      </span>
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Subject</th>
                        <th className="text-center py-2 px-3 font-medium">Max</th>
                        <th className="text-center py-2 px-3 font-medium">Obtained</th>
                        <th className="text-center py-2 px-3 font-medium">%</th>
                        <th className="text-center py-2 px-3 font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exam.subjects.map((sub, j) => (
                        <tr key={j} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium">{sub.subjectName}</td>
                          <td className="text-center py-2 px-3 text-muted-foreground">{sub.totalMarks}</td>
                          <td className="text-center py-2 px-3">
                            {sub.isAbsent ? (
                              <span className="text-red-400 text-xs font-medium">Absent</span>
                            ) : (
                              <span className="font-semibold">{sub.obtainedMarks ?? '—'}</span>
                            )}
                          </td>
                          <td className="text-center py-2 px-3">
                            {sub.isAbsent || sub.percentage === null ? '—' : `${sub.percentage}%`}
                          </td>
                          <td className="text-center py-2 px-3">
                            <GradeBadge grade={sub.grade} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
        </TabsContent>

        <TabsContent value="class" className="mt-4">
          <ClassBatchProgressReports schoolName={schoolName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FeeStatCard({ fees }: { fees: FeeSummary }) {
  const f = formatFeeDisplay(fees);
  const iconTone =
    fees.voucherCount === 0
      ? 'text-slate-400'
      : fees.balance <= 0
        ? 'text-emerald-500'
        : 'text-amber-500';

  return (
    <StatCard
      icon={<CreditCard className={`h-5 w-5 ${iconTone}`} />}
      label="Fee status"
      value={f.headline}
      sub={f.sub}
    />
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className="shrink-0 p-2 rounded-lg bg-muted/50">{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="text-sm font-bold leading-tight truncate">{value}</p>
          <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}
