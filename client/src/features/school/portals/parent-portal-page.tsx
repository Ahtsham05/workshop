/**
 * Parent Portal Page
 * Shows all linked children's profiles, attendance, results, fees.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users, BookOpen, CreditCard, CalendarCheck, BarChart2, CheckCircle2,
  GraduationCap, TrendingUp, AlertCircle,
} from 'lucide-react';
import {
  useGetParentPortalChildrenQuery,
  useGetParentPortalResultsQuery,
  useGetParentPortalAttendanceQuery,
  useGetParentPortalFeesQuery,
  useGetParentPortalReportQuery,
} from '@/stores/school.api';
import StudentAvatar from '../components/student-avatar';

const GRADE_COLOR: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  'A':  'bg-green-100 text-green-800',
  'B':  'bg-blue-100 text-blue-800',
  'C':  'bg-yellow-100 text-yellow-800',
  'D':  'bg-orange-100 text-orange-800',
  'E':  'bg-gray-100 text-gray-700',
  'F':  'bg-red-100 text-red-800',
  'AB': 'bg-slate-100 text-slate-500',
};

const ATT_COLOR: Record<string, string> = {
  present: 'text-green-600',
  absent: 'text-red-500',
  late: 'text-yellow-600',
  leave: 'text-blue-500',
  half_day: 'text-orange-500',
};

const FEE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
  partial: { label: 'Partial', color: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700' },
};

export default function ParentPortalPage() {
  const [selectedChild, setSelectedChild] = useState('');

  const { data: children = [], isLoading: cLoading } = useGetParentPortalChildrenQuery(undefined);
  const childId = selectedChild || ((children as any[])[0]?.id || (children as any[])[0]?._id || '');

  const skip = !childId;
  const { data: results = [] } = useGetParentPortalResultsQuery({ studentId: childId }, { skip });
  const { data: attendance = [] } = useGetParentPortalAttendanceQuery({ studentId: childId }, { skip });
  const { data: fees = [] } = useGetParentPortalFeesQuery({ studentId: childId }, { skip });
  const { data: report } = useGetParentPortalReportQuery({ studentId: childId }, { skip });

  if (cLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading parent portal…</div>;
  }

  if ((children as any[]).length === 0) {
    return (
      <div className="p-8 text-center">
        <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-lg font-semibold">No Children Linked</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your account is not linked to any student. Contact the school admin.
        </p>
      </div>
    );
  }

  const activeChild = (children as any[]).find((c: any) => (c.id || c._id) === childId) || (children as any[])[0];

  // Compute quick stats from report
  const attPct = report?.attendance?.percentage;
  const overallGrade = report?.overall?.grade;
  const overallPct = report?.overall?.percentage;
  const pendingFees = (fees as any[]).filter((f: any) => f.status !== 'paid').reduce((s: number, f: any) => s + ((f.amount || 0) - (f.paidAmount || 0)), 0);

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" /> Parent Portal
          </h1>
          <p className="text-muted-foreground text-sm">Your children's academic dashboard</p>
        </div>
        {(children as any[]).length > 1 && (
          <Select value={childId} onValueChange={setSelectedChild}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select child" /></SelectTrigger>
            <SelectContent>
              {(children as any[]).map((c: any) => (
                <SelectItem key={c.id || c._id} value={c.id || c._id}>
                  {c.firstName} {c.lastName || ''} — {c.classId?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Child Profile Card */}
      {activeChild && (
        <Card className="border-blue-100">
          <CardContent className="flex items-center gap-4 py-4">
            <StudentAvatar
              photoUrl={activeChild.photoUrl?.url}
              gender={activeChild.gender}
              className="h-16 w-16 rounded-full flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold">{activeChild.firstName} {activeChild.lastName || ''}</p>
              <p className="text-sm text-muted-foreground">
                {activeChild.classId?.name}{activeChild.sectionId?.name ? ` - ${activeChild.sectionId.name}` : ''}
                &nbsp;·&nbsp; Adm: {activeChild.admissionNumber}
                {activeChild.rollNumber && ` · Roll: ${activeChild.rollNumber}`}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-blue-100 text-blue-700">
                <GraduationCap className="h-3 w-3 mr-1" />
                {activeChild.status || 'active'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickStat
          icon={<CalendarCheck className="h-5 w-5 text-blue-500" />}
          label="Attendance"
          value={attPct !== null && attPct !== undefined ? `${attPct}%` : 'N/A'}
          sub={report ? `${report.attendance.present}/${report.attendance.total} days` : ''}
          ok={attPct === null || attPct === undefined || attPct >= 75}
        />
        <QuickStat
          icon={<BarChart2 className="h-5 w-5 text-violet-500" />}
          label="Overall Grade"
          value={overallGrade || '—'}
          sub={overallPct !== undefined ? `${overallPct}%` : ''}
          ok={overallGrade !== 'F' && !!overallGrade}
        />
        <QuickStat
          icon={<CreditCard className="h-5 w-5 text-amber-500" />}
          label="Pending Fees"
          value={`Rs. ${pendingFees.toLocaleString()}`}
          sub={pendingFees <= 0 ? 'All Clear' : 'Due'}
          ok={pendingFees <= 0}
        />
        <QuickStat
          icon={<BookOpen className="h-5 w-5 text-green-500" />}
          label="Exams"
          value={String(report?.exams?.length ?? 0)}
          sub="taken this period"
          ok
        />
      </div>

      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results" className="gap-1.5"><BookOpen className="h-4 w-4" />Results</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><CalendarCheck className="h-4 w-4" />Attendance</TabsTrigger>
          <TabsTrigger value="fees" className="gap-1.5"><CreditCard className="h-4 w-4" />Fees</TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5"><TrendingUp className="h-4 w-4" />Full Report</TabsTrigger>
        </TabsList>

        {/* ── Results ── */}
        <TabsContent value="results">
          <Card>
            <CardHeader><CardTitle className="text-base">Exam Results</CardTitle></CardHeader>
            <CardContent>
              {(results as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No results available yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Exam</th>
                        <th className="text-left py-2 pr-4 font-medium">Subject</th>
                        <th className="text-center py-2 pr-4 font-medium">Marks</th>
                        <th className="text-center py-2 font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(results as any[]).map((r: any, i: number) => {
                        const pct = r.isAbsent || !r.totalMarks ? null : Math.round((r.obtainedMarks / r.totalMarks) * 100);
                        const grade = r.isAbsent ? 'AB' : pct !== null ? calcGradeSimple(pct) : '—';
                        return (
                          <tr key={i} className="border-b hover:bg-muted/20">
                            <td className="py-1.5 pr-4 font-medium">{r.examId?.name || '—'}</td>
                            <td className="py-1.5 pr-4">{r.subjectId?.name || '—'}</td>
                            <td className="text-center py-1.5 pr-4">
                              {r.isAbsent ? 'Absent' : `${r.obtainedMarks} / ${r.totalMarks}${pct !== null ? ` (${pct}%)` : ''}`}
                            </td>
                            <td className="text-center py-1.5">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLOR[grade] || 'bg-gray-100'}`}>{grade}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Attendance ── */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader><CardTitle className="text-base">Attendance Records</CardTitle></CardHeader>
            <CardContent>
              {(attendance as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No attendance records found</p>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Date</th>
                        <th className="text-left py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attendance as any[]).map((a: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-muted/20">
                          <td className="py-1.5 pr-4">{new Date(a.date).toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td className={`py-1.5 font-semibold capitalize ${ATT_COLOR[a.status] || ''}`}>{a.status?.replace('_', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fees ── */}
        <TabsContent value="fees">
          <Card>
            <CardHeader><CardTitle className="text-base">Fee Statements</CardTitle></CardHeader>
            <CardContent>
              {(fees as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No fee records found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Description</th>
                        <th className="text-center py-2 pr-4 font-medium">Due Date</th>
                        <th className="text-center py-2 pr-4 font-medium">Amount</th>
                        <th className="text-center py-2 pr-4 font-medium">Paid</th>
                        <th className="text-center py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(fees as any[]).map((f: any, i: number) => {
                        const cfg = FEE_STATUS[f.status] || { label: f.status, color: 'bg-gray-100 text-gray-700' };
                        return (
                          <tr key={i} className="border-b hover:bg-muted/20">
                            <td className="py-1.5 pr-4 font-medium">{f.feeType?.replace('_', ' ') || f.description || '—'}</td>
                            <td className="text-center py-1.5 pr-4 text-muted-foreground">
                              {f.dueDate ? new Date(f.dueDate).toLocaleDateString() : '—'}
                            </td>
                            <td className="text-center py-1.5 pr-4">Rs. {(f.amount || 0).toLocaleString()}</td>
                            <td className="text-center py-1.5 pr-4">Rs. {(f.paidAmount || 0).toLocaleString()}</td>
                            <td className="text-center py-1.5">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold border-t bg-muted/30">
                        <td colSpan={2} className="py-1.5 px-2">Total</td>
                        <td className="text-center py-1.5">Rs. {(fees as any[]).reduce((s: number, f: any) => s + (f.amount || 0), 0).toLocaleString()}</td>
                        <td className="text-center py-1.5">Rs. {(fees as any[]).reduce((s: number, f: any) => s + (f.paidAmount || 0), 0).toLocaleString()}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Full Report Summary ── */}
        <TabsContent value="report">
          {!report ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground">No report data available yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {report.exams.map((exam: any, i: number) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                      <span>{exam.exam?.name} — {exam.exam?.type?.replace('_', ' ')}</span>
                      <span className={`px-3 py-1 rounded font-bold text-sm ${GRADE_COLOR[exam.grade] || 'bg-gray-100'}`}>
                        {exam.percentage}% &nbsp; Grade {exam.grade}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {exam.subjects.map((sub: any, j: number) => (
                        <div key={j} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                          <span className="font-medium truncate">{sub.subjectName}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLOR[sub.grade] || 'bg-gray-100'}`}>
                            {sub.isAbsent ? 'ABS' : sub.grade}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {/* Overall */}
              <Card className={`border-2 ${report.overall.grade === 'F' ? 'border-red-200' : 'border-green-200'}`}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-bold text-lg">Overall Result</p>
                    <p className="text-sm text-muted-foreground">{report.overall.totalObtained} / {report.overall.totalMax}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-3xl font-black ${report.overall.grade === 'F' ? 'text-red-600' : 'text-green-600'}`}>
                      {report.overall.percentage}%
                    </p>
                    <p className="text-sm font-semibold">Grade {report.overall.grade} — {report.overall.label}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcGradeSimple(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 33) return 'E';
  return 'F';
}

function QuickStat({ icon, label, value, sub, ok }: {
  icon: React.ReactNode; label: string; value: string; sub: string; ok: boolean;
}) {
  return (
    <Card className={`border ${ok ? 'border-green-100' : 'border-red-100'}`}>
      <CardContent className="flex items-center gap-3 py-4">
        <div>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-base font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="ml-auto">
          {ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
        </div>
      </CardContent>
    </Card>
  );
}
