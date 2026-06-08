/**
 * Family Portal Page (parent + student variants)
 * Shows linked student(s) profile, academics, attendance, fees, diary & report card.
 */
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users, BookOpen, CreditCard, CalendarCheck, BarChart2, CheckCircle2,
  GraduationCap, TrendingUp, AlertCircle, Clock, NotebookPen, FileText, Inbox,
  Wallet, Building2, Upload, XCircle, Hourglass, Copy,
} from 'lucide-react';
import {
  useGetParentPortalChildrenQuery,
  useGetParentPortalResultsQuery,
  useGetParentPortalExamsQuery,
  useGetParentPortalAttendanceQuery,
  useGetParentPortalFeesQuery,
  useGetParentPortalDiaryQuery,
  useGetParentPortalReportQuery,
  useGetParentPortalBankAccountsQuery,
  useGetParentPortalPaymentRequestsQuery,
  useCreateParentPortalPaymentRequestMutation,
} from '@/stores/school.api';
import StudentAvatar from '../components/student-avatar';

const REQ_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Awaiting approval', color: 'bg-amber-100 text-amber-700', icon: Hourglass },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
};

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

const ATT_BADGE: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  late: 'bg-yellow-100 text-yellow-700',
  leave: 'bg-blue-100 text-blue-700',
  half_day: 'bg-orange-100 text-orange-700',
};

const FEE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
  partial: { label: 'Partial', color: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700' },
};

type AttRange = 'today' | 'week' | 'month' | 'all';

export default function ParentPortalPage({ variant = 'parent' }: { variant?: 'parent' | 'student' }) {
  const isStudent = variant === 'student';
  const [selectedChild, setSelectedChild] = useState('');
  const [selectedExam, setSelectedExam] = useState('all');
  const [attRange, setAttRange] = useState<AttRange>('month');

  const { data: children = [], isLoading: cLoading } = useGetParentPortalChildrenQuery(undefined);
  const childId = selectedChild || ((children as any[])[0]?.id || (children as any[])[0]?._id || '');

  const skip = !childId;
  const { data: results = [] } = useGetParentPortalResultsQuery({ studentId: childId }, { skip });
  const { data: exams = [] } = useGetParentPortalExamsQuery({ studentId: childId }, { skip });
  const attDateRange = useMemo(() => computeRange(attRange), [attRange]);
  const todayRange = useMemo(() => computeRange('today'), []);
  const { data: attendance = [], isFetching: attFetching } = useGetParentPortalAttendanceQuery(
    { studentId: childId, from: attDateRange.from, to: attDateRange.to },
    { skip },
  );
  const { data: todayAttendance = [] } = useGetParentPortalAttendanceQuery(
    { studentId: childId, from: todayRange.from, to: todayRange.to },
    { skip, refetchOnFocus: true, pollingInterval: 60_000 },
  );
  const { data: fees = [] } = useGetParentPortalFeesQuery({ studentId: childId }, { skip });
  const { data: diary = [] } = useGetParentPortalDiaryQuery({ studentId: childId }, { skip });
  const { data: report } = useGetParentPortalReportQuery({ studentId: childId }, { skip });
  const { data: bankAccounts = [] } = useGetParentPortalBankAccountsQuery(undefined, { skip });
  const { data: paymentRequests = [] } = useGetParentPortalPaymentRequestsQuery({ studentId: childId }, { skip });

  // Fee voucher selection + pay dialog
  const [selectedVouchers, setSelectedVouchers] = useState<Record<string, boolean>>({});
  const [payOpen, setPayOpen] = useState(false);

  // Group marks by exam (hook must run before any early return)
  const marksByExam = useMemo(() => {
    const map: Record<string, any[]> = {};
    (results as any[]).forEach((r: any) => {
      const eid = r.examId?._id || r.examId?.id || r.examId;
      if (!eid) return;
      const key = String(eid);
      (map[key] ||= []).push(r);
    });
    return map;
  }, [results]);

  // Attendance summary for the selected range
  const attSummary = useMemo(() => {
    const list = attendance as any[];
    const acc = { present: 0, absent: 0, late: 0, leave: 0, half_day: 0 };
    list.forEach((a) => { if (acc[a.status as keyof typeof acc] !== undefined) acc[a.status as keyof typeof acc] += 1; });
    return { total: list.length, ...acc };
  }, [attendance]);

  const todayRecord = (todayAttendance as any[])[0] || null;
  const todayEntryTime = todayRecord
    ? todayRecord.checkInTime || ((todayRecord.status === 'present' || todayRecord.status === 'late') ? todayRecord.createdAt : null)
    : null;

  if (cLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading {isStudent ? 'student' : 'parent'} portal…</div>;
  }

  if ((children as any[]).length === 0) {
    return (
      <div className="p-8 text-center">
        <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-lg font-semibold">{isStudent ? 'No Student Profile Linked' : 'No Children Linked'}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your account is not linked to {isStudent ? 'a student record' : 'any student'}. Contact the school admin.
        </p>
      </div>
    );
  }

  const activeChild = (children as any[]).find((c: any) => (c.id || c._id) === childId) || (children as any[])[0];

  // Quick stats
  const attPct = report?.attendance?.percentage;
  const overallGrade = report?.overall?.grade;
  const overallPct = report?.overall?.percentage;
  const pendingFees = (fees as any[]).filter((f: any) => f.status !== 'paid').reduce((s: number, f: any) => s + ((f.amount || 0) - (f.paidAmount || 0)), 0);

  // Payable (unpaid/partial/overdue) vouchers eligible for online payment
  const payableFees = (fees as any[]).filter((f: any) => f.status !== 'paid' && f.status !== 'cancelled');
  const remainingOf = (f: any) => Math.max(0, (f.amount || 0) - (f.paidAmount || 0));
  const selectedList = payableFees.filter((f: any) => selectedVouchers[f.id]);
  const selectedTotal = selectedList.reduce((s: number, f: any) => s + remainingOf(f), 0);
  const toggleVoucher = (id: string) => setSelectedVouchers((p) => ({ ...p, [id]: !p[id] }));
  const allSelected = payableFees.length > 0 && payableFees.every((f: any) => selectedVouchers[f.id]);
  const toggleAll = () => {
    if (allSelected) { setSelectedVouchers({}); return; }
    const next: Record<string, boolean> = {};
    payableFees.forEach((f: any) => { next[f.id] = true; });
    setSelectedVouchers(next);
  };

  // ── Academics: exam selection ──
  const examList = exams as any[];
  const examsWithResults = examList.filter((e) => (marksByExam[String(e.id || e._id)] || []).length > 0);
  // Resolve which exam to display in Academics
  const resolvedExamId = selectedExam === 'all'
    ? (examsWithResults[0]?.id || examsWithResults[0]?._id || examList[0]?.id || examList[0]?._id || '')
    : selectedExam;
  const selectedExamObj = examList.find((e) => String(e.id || e._id) === String(resolvedExamId));
  const selectedExamMarks = marksByExam[String(resolvedExamId)] || [];

  // ── Diary grouping (today vs previous) ──
  const diaryList = diary as any[];
  const todayKey = new Date().toDateString();
  const todaysDiary = diaryList.filter((d) => new Date(d.date).toDateString() === todayKey);
  const previousDiary = diaryList.filter((d) => new Date(d.date).toDateString() !== todayKey);

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {isStudent ? <GraduationCap className="h-6 w-6 text-blue-600" /> : <Users className="h-6 w-6 text-blue-600" />}
            {isStudent ? 'Student Portal' : 'Parent Portal'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isStudent ? 'My academic dashboard' : "Your children's academic dashboard"}
          </p>
        </div>
        {!isStudent && (children as any[]).length > 1 && (
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

      {/* Today's Attendance */}
      {todayRecord ? (
        <Card className={`border-2 ${
          todayRecord.status === 'present' ? 'border-green-200 bg-green-50/50' :
          todayRecord.status === 'absent' ? 'border-red-200 bg-red-50/50' :
          todayRecord.status === 'late' ? 'border-yellow-200 bg-yellow-50/50' :
          'border-blue-200 bg-blue-50/50'
        }`}>
          <CardContent className="flex items-center justify-between gap-4 py-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                todayRecord.status === 'present' ? 'bg-green-100 text-green-700' :
                todayRecord.status === 'absent' ? 'bg-red-100 text-red-700' :
                todayRecord.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                <CalendarCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Today's Attendance</p>
                <p className="text-lg font-bold capitalize">{todayRecord.status?.replace('_', ' ')}</p>
                {todayEntryTime && (todayRecord.status === 'present' || todayRecord.status === 'late') && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3.5 w-3.5" />
                    Arrived at {new Date(todayEntryTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </p>
                )}
              </div>
            </div>
            <Badge className={`${ATT_BADGE[todayRecord.status] || 'bg-gray-100'} text-sm px-3 py-1`}>
              {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short' })}
            </Badge>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-slate-200">
          <CardContent className="flex items-center gap-3 py-4 text-muted-foreground">
            <CalendarCheck className="h-5 w-5" />
            <p className="text-sm">No attendance recorded for today yet.</p>
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
          value={String(examList.length || report?.exams?.length || 0)}
          sub="this period"
          ok
        />
      </div>

      <Tabs defaultValue="results">
        <TabsList className="grid w-full grid-cols-3 sm:flex sm:w-auto h-auto gap-1">
          <TabsTrigger value="results" className="gap-1.5"><BookOpen className="h-4 w-4" />{isStudent ? 'Academics' : 'Results'}</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><CalendarCheck className="h-4 w-4" />Attendance</TabsTrigger>
          <TabsTrigger value="fees" className="gap-1.5"><CreditCard className="h-4 w-4" />Fees</TabsTrigger>
          <TabsTrigger value="diary" className="gap-1.5"><NotebookPen className="h-4 w-4" />Diary</TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5"><TrendingUp className="h-4 w-4" />{isStudent ? 'Report Card' : 'Full Report'}</TabsTrigger>
        </TabsList>

        {/* ── Academics ── */}
        <TabsContent value="results">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
              <CardTitle className="text-base">Exam Results</CardTitle>
              {examList.length > 0 && (
                <Select value={String(resolvedExamId)} onValueChange={setSelectedExam}>
                  <SelectTrigger className="w-[230px] h-9"><SelectValue placeholder="Select exam" /></SelectTrigger>
                  <SelectContent>
                    {examList.map((e) => {
                      const has = (marksByExam[String(e.id || e._id)] || []).length > 0;
                      return (
                        <SelectItem key={e.id || e._id} value={String(e.id || e._id)}>
                          {e.name}{!has ? ' (pending)' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </CardHeader>
            <CardContent>
              {examList.length === 0 ? (
                <EmptyState icon={<BookOpen className="h-10 w-10" />} title="No exams scheduled"
                  message="No exams have been set up for this class yet. Results will appear here once exams are conducted." />
              ) : selectedExamMarks.length === 0 ? (
                <EmptyState icon={<Inbox className="h-10 w-10" />} title="Result not uploaded yet"
                  message={`The result for "${selectedExamObj?.name || 'this exam'}" has not been published yet. Please check back later.`} />
              ) : (
                <AcademicsTable exam={selectedExamObj} marks={selectedExamMarks} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Attendance ── */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
              <CardTitle className="text-base">Attendance</CardTitle>
              <div className="flex gap-1 flex-wrap">
                {(['today', 'week', 'month', 'all'] as AttRange[]).map((r) => (
                  <Button key={r} size="sm" variant={attRange === r ? 'default' : 'outline'}
                    className="h-8 px-3 capitalize" onClick={() => setAttRange(r)}>
                    {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : r === 'today' ? 'Today' : 'All'}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Range summary */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <AttPill label="Total" value={attSummary.total} color="bg-slate-100 text-slate-700" />
                <AttPill label="Present" value={attSummary.present} color="bg-green-100 text-green-700" />
                <AttPill label="Absent" value={attSummary.absent} color="bg-red-100 text-red-700" />
                <AttPill label="Late" value={attSummary.late} color="bg-yellow-100 text-yellow-700" />
                <AttPill label="Leave" value={attSummary.leave + attSummary.half_day} color="bg-blue-100 text-blue-700" />
              </div>

              {attFetching ? (
                <p className="text-sm text-muted-foreground py-6 text-center animate-pulse">Loading…</p>
              ) : (attendance as any[]).length === 0 ? (
                <EmptyState icon={<CalendarCheck className="h-10 w-10" />} title="No attendance records"
                  message="There are no attendance records for the selected period." />
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Date</th>
                        <th className="text-left py-2 pr-4 font-medium">Entry Time</th>
                        <th className="text-left py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attendance as any[]).map((a: any, i: number) => {
                        const entry = a.checkInTime || (a.status === 'present' || a.status === 'late' ? a.createdAt : null);
                        return (
                          <tr key={i} className="border-b hover:bg-muted/20">
                            <td className="py-1.5 pr-4">{new Date(a.date).toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td className="py-1.5 pr-4 text-muted-foreground">
                              {entry ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {new Date(entry).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-1.5">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${ATT_BADGE[a.status] || 'bg-gray-100'} ${ATT_COLOR[a.status] || ''}`}>
                                {a.status?.replace('_', ' ')}
                              </span>
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

        {/* ── Fees ── */}
        <TabsContent value="fees">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap space-y-0">
              <CardTitle className="text-base">Fee Statements</CardTitle>
              {payableFees.length > 0 && (
                <Button variant="outline" size="sm" className="h-8" onClick={toggleAll}>
                  {allSelected ? 'Clear selection' : 'Select all pending'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {(fees as any[]).length === 0 ? (
                <EmptyState icon={<CreditCard className="h-10 w-10" />} title="No fee records"
                  message="There are no fee vouchers issued for this student yet." />
              ) : (
                <div className="space-y-3 pb-20">
                  {(fees as any[]).map((f: any, i: number) => {
                    const cfg = FEE_STATUS[f.status] || { label: f.status, color: 'bg-gray-100 text-gray-700' };
                    const items = (f.feeItems || []) as any[];
                    const isPayable = f.status !== 'paid' && f.status !== 'cancelled';
                    const checked = !!selectedVouchers[f.id];
                    return (
                      <div key={i} className={`border rounded-lg p-3 ${checked ? 'border-blue-300 bg-blue-50/40' : ''}`}>
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div className="flex items-start gap-2">
                            {isPayable && (
                              <Checkbox className="mt-1" checked={checked} onCheckedChange={() => toggleVoucher(f.id)} />
                            )}
                            <div>
                              <p className="font-semibold">{formatPeriod(f)}</p>
                              <p className="text-xs text-muted-foreground">
                                {f.typeLabel || 'Fee'}
                                {f.voucherNumber ? ` · #${f.voucherNumber}` : ''}
                                {f.dueDate ? ` · Due ${new Date(f.dueDate).toLocaleDateString()}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                        </div>

                        {items.length > 0 && (
                          <div className="mt-2 border-t pt-2 space-y-1">
                            {items.map((it, j) => (
                              <div key={j} className="flex justify-between text-xs text-muted-foreground">
                                <span>{it.name}</span>
                                <span>Rs. {(it.amount || 0).toLocaleString()}</span>
                              </div>
                            ))}
                            {f.discount > 0 && (
                              <div className="flex justify-between text-xs text-green-600">
                                <span>Discount</span><span>- Rs. {f.discount.toLocaleString()}</span>
                              </div>
                            )}
                            {f.fine > 0 && (
                              <div className="flex justify-between text-xs text-red-600">
                                <span>Fine</span><span>+ Rs. {f.fine.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-2 border-t pt-2 flex justify-between text-sm font-semibold">
                          <span>Payable</span>
                          <span>
                            Rs. {(f.amount || 0).toLocaleString()}
                            {f.paidAmount > 0 && <span className="text-green-600 font-normal text-xs"> (Paid Rs. {f.paidAmount.toLocaleString()})</span>}
                          </span>
                        </div>

                        {isPayable && (
                          <div className="mt-2 flex justify-end">
                            <Button size="sm" variant="secondary" className="h-7 gap-1"
                              onClick={() => { setSelectedVouchers({ [f.id]: true }); setPayOpen(true); }}>
                              <Wallet className="h-3.5 w-3.5" /> Pay this
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-3 font-bold">
                    <span>Total Outstanding</span>
                    <span>Rs. {pendingFees.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* My payment requests */}
          {(paymentRequests as any[]).length > 0 && (
            <Card className="mt-3">
              <CardHeader className="pb-2"><CardTitle className="text-base">My Payment Submissions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(paymentRequests as any[]).map((r: any) => {
                  const cfg = REQ_STATUS[r.status] || REQ_STATUS.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={r.id || r._id} className="border rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">
                          Rs. {(r.amount || 0).toLocaleString()}
                          <span className="text-muted-foreground font-normal"> · {(r.voucherSummary || []).length} voucher(s)</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(r.voucherSummary || []).map((v: any) => v.period).filter(Boolean).join(', ') || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Submitted {new Date(r.createdAt).toLocaleDateString()}
                          {r.transactionRef ? ` · Ref ${r.transactionRef}` : ''}
                        </p>
                        {r.status === 'rejected' && r.reviewNote && (
                          <p className="text-xs text-red-600 mt-0.5">Reason: {r.reviewNote}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 ${cfg.color}`}>
                        <Icon className="h-3.5 w-3.5" /> {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Sticky pay bar */}
          {selectedList.length > 0 && (
            <div className="sticky bottom-3 mt-3 z-10">
              <div className="mx-auto max-w-2xl bg-white border shadow-lg rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{selectedList.length} voucher(s) selected</p>
                  <p className="text-xs text-muted-foreground">Total Rs. {selectedTotal.toLocaleString()}</p>
                </div>
                <Button className="gap-1.5" onClick={() => setPayOpen(true)}>
                  <Wallet className="h-4 w-4" /> Pay Now
                </Button>
              </div>
            </div>
          )}

          <PaymentDialog
            open={payOpen}
            onClose={() => setPayOpen(false)}
            studentId={childId}
            vouchers={selectedList}
            total={selectedTotal}
            bankAccounts={bankAccounts as any[]}
            onSuccess={() => { setSelectedVouchers({}); setPayOpen(false); }}
          />
        </TabsContent>

        {/* ── Daily Diary ── */}
        <TabsContent value="diary">
          <div className="space-y-3">
            <Card className="border-blue-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-blue-600" /> Today's Diary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {todaysDiary.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3 text-center">No diary posted for today yet.</p>
                ) : (
                  <div className="space-y-3">{todaysDiary.map((d, i) => <DiaryEntry key={i} entry={d} />)}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Previous Diary</CardTitle></CardHeader>
              <CardContent>
                {previousDiary.length === 0 ? (
                  <EmptyState icon={<NotebookPen className="h-10 w-10" />} title="No previous entries"
                    message="Earlier diary entries from the class will appear here." />
                ) : (
                  <div className="space-y-3">{previousDiary.map((d, i) => <DiaryEntry key={i} entry={d} />)}</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Report Card ── */}
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
              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryTile label="Overall" value={`${report.overall.percentage}%`} sub={`Grade ${report.overall.grade}`} />
                <SummaryTile label="Marks" value={`${report.overall.totalObtained}/${report.overall.totalMax}`} sub={report.overall.label} />
                <SummaryTile label="Attendance" value={report.attendance.percentage != null ? `${report.attendance.percentage}%` : 'N/A'} sub={`${report.attendance.present}/${report.attendance.total} days`} />
                <SummaryTile label="Class Strength" value={String(report.classStrength ?? '—')} sub="students" />
              </div>

              {report.exams.length === 0 ? (
                <EmptyState icon={<FileText className="h-10 w-10" />} title="No results published"
                  message="Detailed exam results will appear here once teachers upload the marks." />
              ) : report.exams.map((exam: any, i: number) => (
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 pr-4 font-medium">Subject</th>
                            <th className="text-center py-2 pr-4 font-medium">Marks</th>
                            <th className="text-center py-2 pr-4 font-medium">%</th>
                            <th className="text-center py-2 font-medium">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exam.subjects.map((sub: any, j: number) => (
                            <tr key={j} className="border-b hover:bg-muted/20">
                              <td className="py-1.5 pr-4 font-medium">{sub.subjectName}</td>
                              <td className="text-center py-1.5 pr-4">
                                {sub.isAbsent ? 'Absent' : `${sub.obtainedMarks} / ${sub.totalMarks}`}
                              </td>
                              <td className="text-center py-1.5 pr-4">{sub.isAbsent ? '—' : `${sub.percentage}%`}</td>
                              <td className="text-center py-1.5">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLOR[sub.grade] || 'bg-gray-100'}`}>
                                  {sub.isAbsent ? 'ABS' : sub.grade}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-bold border-t bg-muted/20">
                            <td className="py-1.5 pr-4">Total</td>
                            <td className="text-center py-1.5 pr-4">{exam.totalObtained} / {exam.totalMax}</td>
                            <td className="text-center py-1.5 pr-4">{exam.percentage}%</td>
                            <td className="text-center py-1.5">{exam.grade}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {exam.highestPercentageInClass != null && (
                      <p className="text-xs text-muted-foreground mt-2">Class highest: {exam.highestPercentageInClass}%</p>
                    )}
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function AcademicsTable({ exam, marks }: { exam: any; marks: any[] }) {
  let totalObt = 0;
  let totalMax = 0;
  marks.forEach((m) => { if (!m.isAbsent) { totalObt += m.obtainedMarks || 0; totalMax += m.totalMarks || 0; } });
  const pct = totalMax > 0 ? Math.round((totalObt / totalMax) * 100) : 0;

  return (
    <div className="space-y-3">
      {exam && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            {exam.name}{exam.type ? ` · ${String(exam.type).replace('_', ' ')}` : ''}
            {exam.startDate ? ` · ${new Date(exam.startDate).toLocaleDateString()}` : ''}
          </p>
          <span className={`px-3 py-1 rounded font-bold text-sm ${GRADE_COLOR[calcGradeSimple(pct)] || 'bg-gray-100'}`}>
            {pct}% · Grade {calcGradeSimple(pct)}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 pr-4 font-medium">Subject</th>
              <th className="text-center py-2 pr-4 font-medium">Marks</th>
              <th className="text-center py-2 pr-4 font-medium">%</th>
              <th className="text-center py-2 font-medium">Grade</th>
            </tr>
          </thead>
          <tbody>
            {marks.map((r: any, i: number) => {
              const p = r.isAbsent || !r.totalMarks ? null : Math.round((r.obtainedMarks / r.totalMarks) * 100);
              const grade = r.isAbsent ? 'AB' : p !== null ? calcGradeSimple(p) : '—';
              return (
                <tr key={i} className="border-b hover:bg-muted/20">
                  <td className="py-1.5 pr-4 font-medium">{r.subjectId?.name || '—'}</td>
                  <td className="text-center py-1.5 pr-4">{r.isAbsent ? 'Absent' : `${r.obtainedMarks} / ${r.totalMarks}`}</td>
                  <td className="text-center py-1.5 pr-4">{p !== null ? `${p}%` : '—'}</td>
                  <td className="text-center py-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLOR[grade] || 'bg-gray-100'}`}>{grade}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t bg-muted/20">
              <td className="py-1.5 pr-4">Total</td>
              <td className="text-center py-1.5 pr-4">{totalObt} / {totalMax}</td>
              <td className="text-center py-1.5 pr-4">{pct}%</td>
              <td className="text-center py-1.5">{calcGradeSimple(pct)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PaymentDialog({
  open, onClose, studentId, vouchers, total, bankAccounts, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  vouchers: any[];
  total: number;
  bankAccounts: any[];
  onSuccess: () => void;
}) {
  const [createRequest, { isLoading }] = useCreateParentPortalPaymentRequestMutation();
  const [bankAccountId, setBankAccountId] = useState('');
  const [senderName, setSenderName] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const submit = async () => {
    if (vouchers.length === 0) return toast.error('No vouchers selected');
    if (!file) return toast.error('Please attach the payment screenshot');
    const selectedBank = bankAccounts.find((b) => (b.id || b._id) === bankAccountId);
    const fd = new FormData();
    fd.append('studentId', studentId);
    fd.append('voucherIds', JSON.stringify(vouchers.map((v) => v.id)));
    if (bankAccountId) fd.append('bankAccountId', bankAccountId);
    if (selectedBank) fd.append('bankAccountLabel', `${selectedBank.bankName || selectedBank.name} · ${selectedBank.accountNumber || ''}`);
    if (senderName) fd.append('senderName', senderName);
    if (transactionRef) fd.append('transactionRef', transactionRef);
    if (note) fd.append('note', note);
    fd.append('screenshot', file);
    try {
      await createRequest(fd).unwrap();
      toast.success('Payment submitted for approval');
      setBankAccountId(''); setSenderName(''); setTransactionRef(''); setNote(''); setFile(null);
      onSuccess();
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to submit payment');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-blue-600" /> Pay Fees</DialogTitle>
          <DialogDescription>Transfer the amount to a school account below, then upload the payment screenshot for approval.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected vouchers */}
          <div className="rounded-lg border p-3 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Paying for</p>
            {vouchers.map((v) => (
              <div key={v.id} className="flex justify-between text-sm">
                <span>{formatPeriod(v)}{v.voucherNumber ? ` · #${v.voucherNumber}` : ''}</span>
                <span>Rs. {Math.max(0, (v.amount || 0) - (v.paidAmount || 0)).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold border-t mt-1 pt-1 text-sm">
              <span>Total</span><span>Rs. {total.toLocaleString()}</span>
            </div>
          </div>

          {/* School bank accounts */}
          <div>
            <p className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Building2 className="h-4 w-4" /> School Accounts</p>
            {bankAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bank account is configured. Please contact the school.</p>
            ) : (
              <div className="space-y-2">
                {bankAccounts.map((b) => {
                  const id = b.id || b._id;
                  const selected = bankAccountId === id;
                  return (
                    <button type="button" key={id} onClick={() => setBankAccountId(id)}
                      className={`w-full text-left border rounded-lg p-2.5 transition ${selected ? 'border-blue-400 bg-blue-50' : 'hover:bg-muted/30'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{b.bankName || b.name}{b.accountType === 'mobile_wallet' ? ' (Wallet)' : ''}</p>
                          <p className="text-xs text-muted-foreground">{b.name}{b.branchName ? ` · ${b.branchName}` : ''}</p>
                        </div>
                        {b.accountNumber && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm">{b.accountNumber}</span>
                            <Copy className="h-3.5 w-3.5 text-muted-foreground cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(b.accountNumber); toast.success('Account number copied'); }} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Sender Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Account holder name" />
            </div>
            <div className="space-y-1">
              <Label>Transaction / Ref # <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="e.g. TXN123456" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Payment Screenshot <span className="text-red-500">*</span></Label>
            <label className="flex items-center gap-2 border border-dashed rounded-lg px-3 py-3 cursor-pointer hover:bg-muted/30">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground truncate">{file ? file.name : 'Tap to upload screenshot (image)'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <div className="space-y-1">
            <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Any message for the school…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={isLoading} className="gap-1.5">
            <Wallet className="h-4 w-4" /> {isLoading ? 'Submitting…' : 'Submit Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiaryEntry({ entry }: { entry: any }) {
  const items = (entry.items || []) as any[];
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="font-semibold text-sm">
          {entry.title || 'Daily Diary'}
        </p>
        <span className="text-xs text-muted-foreground">
          {new Date(entry.date).toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
      {entry.note && <p className="text-sm text-muted-foreground mt-1">{entry.note}</p>}
      {items.length > 0 && (
        <div className="mt-2 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="bg-muted/30 rounded p-2 text-sm">
              <p className="font-medium">{it.subjectId?.name || it.subjectName || 'Subject'}</p>
              {it.classwork && <p className="text-xs mt-0.5"><span className="font-semibold text-blue-600">Classwork: </span>{it.classwork}</p>}
              {it.homework && <p className="text-xs mt-0.5"><span className="font-semibold text-amber-600">Homework: </span>{it.homework}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto text-muted-foreground/40 mb-2 flex justify-center">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{message}</p>
    </div>
  );
}

function AttPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${color}`}>
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="text-[11px] mt-1">{label}</p>
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatPeriod(f: any): string {
  const m = f.month;
  const year = f.year;
  if (m === undefined || m === null || m === '') return f.period || f.typeLabel || 'Fee';
  // Numeric month → name
  const num = Number(m);
  const monthLabel = Number.isInteger(num) && num >= 1 && num <= 12 ? MONTH_NAMES[num - 1] : String(m);
  return year ? `${monthLabel} ${year}` : monthLabel;
}

function computeRange(range: AttRange): { from?: string; to?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') {
    start.setDate(start.getDate() - 6);
  } else if (range === 'month') {
    start.setDate(1);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

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
