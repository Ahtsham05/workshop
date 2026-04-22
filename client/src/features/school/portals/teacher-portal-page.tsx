/**
 * Teacher Portal Page
 * Accessible only to users with schoolRole=teacher
 * Full-featured portal: Dashboard, Students, Attendance, Mark Entry, Exams, Timetable, Subjects
 */
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useSelector, useDispatch } from 'react-redux';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, BookOpen, GraduationCap, CalendarCheck, ClipboardList,
  LayoutDashboard, Clock, CheckCircle2, AlertCircle,
  Search, Save, ChevronRight, Calendar,
} from 'lucide-react';
import {
  useGetTeacherPortalMeQuery,
  useGetTeacherPortalStudentsQuery,
  useGetTeacherPortalExamsQuery,
  useGetTeacherPortalSubjectsQuery,
  useGetTeacherPortalAttendanceQuery,
  useGetTeacherPortalDashboardQuery,
  useGetTeacherPortalTimetableQuery,
  useGetTeacherPortalExamStudentsQuery,
  useSaveTeacherPortalBulkMarksMutation,
  useMarkTeacherPortalBulkAttendanceMutation,
} from '@/stores/school.api';
import StudentAvatar from '../components/student-avatar';
import type { RootState, AppDispatch } from '@/stores/store';
import { setActiveBranch } from '@/stores/auth.slice';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-blue-100 text-blue-700',
  ongoing: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
};

const ATT_STATUS_OPTIONS = ['present', 'absent', 'late', 'leave', 'half_day'] as const;
type AttStatus = typeof ATT_STATUS_OPTIONS[number];

const ATT_COLORS: Record<AttStatus, string> = {
  present: 'bg-green-100 text-green-700 border-green-200',
  absent: 'bg-red-100 text-red-700 border-red-200',
  late: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  leave: 'bg-blue-100 text-blue-700 border-blue-200',
  half_day: 'bg-orange-100 text-orange-700 border-orange-200',
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TeacherPortalPage() {
  // ── URL-driven tab (synced with sidebar navigation) ──
  const { tab: activeTab } = useSearch({ from: '/_authenticated/school/portals/teacher' })
  const navigate = useNavigate()

  const setActiveTab = (value: string) => {
    navigate({
      to: '/school/portals/teacher',
      search: { tab: value as any },
      replace: true,
    })
  }

  // ── State ──
  const authUser = useSelector((state: RootState) => state.auth.data?.user)
  const dispatch = useDispatch<AppDispatch>()
  const isTeacherRole = authUser?.schoolRole === 'teacher'
  const [attDate, setAttDate] = useState(today());
  const [attClassId, setAttClassId] = useState('');
  const [attSectionId, setAttSectionId] = useState('');
  const [attMap, setAttMap] = useState<Record<string, AttStatus>>({});
  const [selectedExamId, setSelectedExamId] = useState('');
  const [markMap, setMarkMap] = useState<Record<string, string>>({});
  const [attSearch, setAttSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // ── Queries ──
  const { data: teacher, isLoading: tLoading } = useGetTeacherPortalMeQuery(undefined);
  const { data: dashboard } = useGetTeacherPortalDashboardQuery(undefined);
  const { data: students = [], isLoading: sLoading } = useGetTeacherPortalStudentsQuery(undefined);
  const { data: exams = [], isLoading: eLoading } = useGetTeacherPortalExamsQuery(undefined);
  const { data: subjects = [] } = useGetTeacherPortalSubjectsQuery(undefined);
  const { data: timetable = [] } = useGetTeacherPortalTimetableQuery(undefined);
  const { data: examStudentsData } = useGetTeacherPortalExamStudentsQuery(
    { examId: selectedExamId },
    { skip: !selectedExamId }
  );
  const { data: attRecords = [] } = useGetTeacherPortalAttendanceQuery({ date: attDate });

  // ── Set teacher's branch in Redux so sidebar shows it ──────────────────────
  // The /me response includes the teacher record with branchId populated as
  // { _id, name }.  We store it as activeBranch so:
  //  1. The sidebar branch display shows the teacher's branch name.
  //  2. Subsequent Axios requests include x-branch-id (once branchScope is
  //     updated to allow teacher users to pass their own branch check).
  useEffect(() => {
    const t = teacher as any
    if (!t?.branchId) return
    const id   = typeof t.branchId === 'object' ? String(t.branchId._id ?? t.branchId.id ?? '') : String(t.branchId)
    const name = typeof t.branchId === 'object' ? (t.branchId.name ?? 'My Branch') : 'My Branch'
    if (id) dispatch(setActiveBranch({ id, name }))
  }, [teacher, dispatch])

  // ── Mutations ──
  const [saveBulkMarks, { isLoading: savingMarks }] = useSaveTeacherPortalBulkMarksMutation();
  const [markBulkAttendance, { isLoading: savingAtt }] = useMarkTeacherPortalBulkAttendanceMutation();

  // ── Derived ──
  const filteredStudents = useMemo(() => {
    const all = students as any[];
    if (!studentSearch) return all;
    const q = studentSearch.toLowerCase();
    return all.filter(s => `${s.firstName} ${s.lastName} ${s.admissionNumber} ${s.rollNumber}`.toLowerCase().includes(q));
  }, [students, studentSearch]);

  const teacherClasses = useMemo(() => {
    const map: Record<string, any> = {};
    (students as any[]).forEach(s => { if (s.classId?._id) map[s.classId._id] = s.classId; });
    return Object.values(map);
  }, [students]);

  const attSections = useMemo(() => {
    const map: Record<string, any> = {};
    (students as any[]).forEach(s => {
      if (s.classId?._id === attClassId && s.sectionId?._id) map[s.sectionId._id] = s.sectionId;
    });
    return Object.values(map);
  }, [students, attClassId]);

  const attStudents = useMemo(() => {
    let list = students as any[];
    if (attClassId && attClassId !== 'all') list = list.filter(s => s.classId?._id === attClassId);
    if (attSectionId && attSectionId !== 'all') list = list.filter(s => s.sectionId?._id === attSectionId);
    if (attSearch) {
      const q = attSearch.toLowerCase();
      list = list.filter(s => `${s.firstName} ${s.lastName} ${s.rollNumber}`.toLowerCase().includes(q));
    }
    return list;
  }, [students, attClassId, attSectionId, attSearch]);

  const timetableByDay = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    DAYS.forEach(d => { grouped[d] = []; });
    (timetable as any[]).forEach(t => {
      const day = t.dayOfWeek;
      if (grouped[day]) grouped[day].push(t);
      else grouped[day] = [t];
    });
    return grouped;
  }, [timetable]);

  // ── Handlers ──
  const prefillAtt = () => {
    const existingMap: Record<string, AttStatus> = {};
    (attRecords as any[]).forEach((r: any) => {
      const sid = r.studentId?._id || r.studentId;
      if (sid) existingMap[sid] = r.status;
    });
    const next: Record<string, AttStatus> = {};
    attStudents.forEach(s => {
      const sid = s._id || s.id;
      next[sid] = existingMap[sid] || 'present';
    });
    setAttMap(next);
  };

  const prefillMarks = () => {
    const next: Record<string, string> = {};
    if (examStudentsData?.existingMarks) {
      Object.entries(examStudentsData.existingMarks as Record<string, number>).forEach(([sid, val]) => {
        next[sid] = String(val);
      });
    }
    (examStudentsData?.students || []).forEach((s: any) => {
      const sid = s._id || s.id;
      if (!(sid in next)) next[sid] = '';
    });
    setMarkMap(next);
  };

  const handleSaveAttendance = async () => {
    if (attStudents.length === 0) { toast.error('No students to mark'); return; }
    const records = attStudents.map(s => {
      const sid = s._id || s.id;
      return { studentId: sid, classId: s.classId?._id, sectionId: s.sectionId?._id, date: attDate, status: attMap[sid] || 'present' };
    });
    try {
      await markBulkAttendance({ records }).unwrap();
      toast.success('Attendance saved successfully');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save attendance');
    }
  };

  const handleSaveMarks = async () => {
    if (!selectedExamId || !examStudentsData) { toast.error('Select an exam first'); return; }
    const marks = (examStudentsData.students || []).map((s: any) => {
      const sid = s._id || s.id;
      return { studentId: sid, examId: selectedExamId, obtainedMarks: Number(markMap[sid] || 0) };
    });
    try {
      await saveBulkMarks({ marks }).unwrap();
      toast.success('Marks saved successfully');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save marks');
    }
  };

  // ── Loading / Error ──
  if (tLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading teacher portal…</div>;
  }

  if (!teacher) {
    return (
      <div className="p-8 text-center">
        <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-lg font-semibold">No Teacher Profile Linked</h2>
        <p className="text-muted-foreground text-sm mt-1">Your account is not linked to a teacher record. Contact your school admin.</p>
      </div>
    );
  }

  const fullName = `${teacher.firstName} ${teacher.lastName}`;

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {teacher.firstName?.charAt(0)}
          </div>
          <div>
            {isTeacherRole ? (
              <>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Welcome back</p>
                <h1 className="text-2xl font-bold">{fullName}</h1>
                <p className="text-muted-foreground text-sm">{teacher.employeeId} &nbsp;·&nbsp; {teacher.specialization || 'Teacher'}</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold">{fullName}</h1>
                <p className="text-muted-foreground text-sm">{teacher.employeeId} &nbsp;·&nbsp; {teacher.email}</p>
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <Badge className="bg-blue-100 text-blue-700">{(students as any[]).length} Students</Badge>
          <Badge className="bg-violet-100 text-violet-700">{(subjects as any[]).length} Subjects</Badge>
          <Badge className="bg-green-100 text-green-700">{(exams as any[]).filter((e: any) => e.status === 'ongoing').length} Active Exams</Badge>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="gap-1.5"><LayoutDashboard className="h-4 w-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="students" className="gap-1.5"><Users className="h-4 w-4" />My Students</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><CalendarCheck className="h-4 w-4" />Attendance</TabsTrigger>
          <TabsTrigger value="marks" className="gap-1.5"><ClipboardList className="h-4 w-4" />Mark Entry</TabsTrigger>
          <TabsTrigger value="exams" className="gap-1.5"><BookOpen className="h-4 w-4" />Exams</TabsTrigger>
          <TabsTrigger value="timetable" className="gap-1.5"><Clock className="h-4 w-4" />Timetable</TabsTrigger>
          <TabsTrigger value="subjects" className="gap-1.5"><GraduationCap className="h-4 w-4" />Subjects</TabsTrigger>
        </TabsList>

        {/* ════════════════ DASHBOARD ════════════════ */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Total Students" value={dashboard?.totalStudents ?? (students as any[]).length} color="bg-blue-100 text-blue-600" />
            <StatCard icon={BookOpen} label="Total Exams" value={dashboard?.totalExams ?? (exams as any[]).length} color="bg-violet-100 text-violet-600" />
            <StatCard icon={AlertCircle} label="Active Exams" value={dashboard?.activeExams ?? (exams as any[]).filter((e: any) => e.status === 'ongoing').length} color="bg-green-100 text-green-600" />
            <StatCard icon={CheckCircle2} label="Today's Attendance" value={dashboard?.todayAttendance ?? (attRecords as any[]).length} color="bg-orange-100 text-orange-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-blue-500" /> Today's Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
                  const todayPeriods: any[] = dashboard?.todayTimetable ?? (timetableByDay[todayName] || []);
                  if (todayPeriods.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">No classes scheduled today</p>;
                  return (
                    <div className="space-y-2">
                      {todayPeriods.map((p: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60">
                          <div className="h-8 w-8 rounded-md bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">P{p.periodNumber || i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{p.subjectId?.name || p.subject || 'Class'}</p>
                            <p className="text-xs text-muted-foreground">{p.classId?.name}{p.sectionId?.name ? ` · ${p.sectionId.name}` : ''}</p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{p.startTime}–{p.endTime}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-violet-500" /> Recent Exams</CardTitle>
              </CardHeader>
              <CardContent>
                {eLoading ? <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
                  : (exams as any[]).length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No exams found</p>
                  : (
                    <div className="space-y-2">
                      {(exams as any[]).slice(0, 5).map((e: any) => (
                        <div key={e._id || e.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60">
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.classId?.name} · {e.type?.replace('_', ' ')}</p>
                          </div>
                          <Badge className={`text-[10px] ${STATUS_COLORS[e.status] || ''}`}>{e.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════════════════ MY STUDENTS ════════════════ */}
        <TabsContent value="students">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">My Students ({filteredStudents.length})</CardTitle>
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search by name or roll no." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sLoading ? <div className="p-6 text-sm text-muted-foreground animate-pulse text-center">Loading…</div>
                : filteredStudents.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">No students found</div>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30 text-muted-foreground">
                          <th className="text-left px-4 py-2.5 font-medium">Student</th>
                          <th className="text-left px-4 py-2.5 font-medium">Adm. No.</th>
                          <th className="text-left px-4 py-2.5 font-medium">Roll</th>
                          <th className="text-left px-4 py-2.5 font-medium">Class</th>
                          <th className="text-left px-4 py-2.5 font-medium">Section</th>
                          <th className="text-left px-4 py-2.5 font-medium">Gender</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((s: any) => (
                          <tr key={s._id || s.id} className="border-b hover:bg-muted/20">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2.5">
                                <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender} className="h-8 w-8 rounded-full flex-shrink-0" />
                                <span className="font-medium">{s.firstName} {s.lastName || ''}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{s.admissionNumber}</td>
                            <td className="px-4 py-2 text-center">{s.rollNumber || '—'}</td>
                            <td className="px-4 py-2">{s.classId?.name || '—'}</td>
                            <td className="px-4 py-2">{s.sectionId?.name || '—'}</td>
                            <td className="px-4 py-2 capitalize text-muted-foreground text-xs">{s.gender || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ ATTENDANCE ════════════════ */}
        <TabsContent value="attendance" className="space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Date</p>
                  <input type="date" className="text-sm border rounded px-2 py-1.5 bg-background" value={attDate} onChange={e => setAttDate(e.target.value)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Class</p>
                  <Select value={attClassId} onValueChange={v => { setAttClassId(v); setAttSectionId(''); setAttMap({}); }}>
                    <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {teacherClasses.map((c: any) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {attClassId && attClassId !== 'all' && attSections.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Section</p>
                    <Select value={attSectionId} onValueChange={v => { setAttSectionId(v); setAttMap({}); }}>
                      <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="All sections" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sections</SelectItem>
                        {attSections.map((sec: any) => <SelectItem key={sec._id} value={sec._id}>{sec.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Search</p>
                  <Input placeholder="Search student…" value={attSearch} onChange={e => setAttSearch(e.target.value)} className="h-9 text-sm w-44" />
                </div>
                <Button variant="outline" size="sm" className="h-9" onClick={prefillAtt} disabled={attStudents.length === 0}>
                  <Calendar className="h-3.5 w-3.5 mr-1.5" /> Load Students
                </Button>
                <Button size="sm" className="h-9 ml-auto" onClick={handleSaveAttendance} disabled={savingAtt || Object.keys(attMap).length === 0}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> {savingAtt ? 'Saving…' : 'Save Attendance'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {Object.keys(attMap).length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {ATT_STATUS_OPTIONS.map(s => {
                const count = Object.values(attMap).filter(v => v === s).length;
                return <Badge key={s} className={`${ATT_COLORS[s]} border capitalize text-xs`}>{s.replace('_', ' ')}: {count}</Badge>;
              })}
            </div>
          )}

          {attStudents.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-muted-foreground">Mark all as:</span>
              {(['present', 'absent'] as AttStatus[]).map(s => (
                <Button key={s} variant="outline" size="sm" className={`h-7 text-xs ${ATT_COLORS[s]} border`}
                  onClick={() => {
                    const next: Record<string, AttStatus> = {};
                    attStudents.forEach(st => { next[st._id || st.id] = s; });
                    setAttMap(prev => ({ ...prev, ...next }));
                  }}>
                  All {s}
                </Button>
              ))}
            </div>
          )}

          {attStudents.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {Object.keys(attMap).length === 0
                  ? 'Select a class and click "Load Students" to begin taking attendance'
                  : 'No students match the filter'}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">#</th>
                      <th className="text-left px-4 py-2.5 font-medium">Student</th>
                      <th className="text-left px-4 py-2.5 font-medium">Roll</th>
                      {ATT_STATUS_OPTIONS.map(s => (
                        <th key={s} className="px-2 py-2.5 font-medium capitalize text-center">{s.replace('_', ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attStudents.map((s: any, i: number) => {
                      const sid = s._id || s.id;
                      const current = attMap[sid] || '';
                      return (
                        <tr key={sid} className="border-b hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender} className="h-7 w-7 rounded-full flex-shrink-0" />
                              <span className="font-medium">{s.firstName} {s.lastName || ''}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{s.rollNumber || '—'}</td>
                          {ATT_STATUS_OPTIONS.map(st => (
                            <td key={st} className="px-2 py-2 text-center">
                              <button type="button" onClick={() => setAttMap(prev => ({ ...prev, [sid]: st }))}
                                className={`h-7 w-7 rounded-full border-2 transition-all mx-auto flex items-center justify-center ${current === st ? `${ATT_COLORS[st]} border-current` : 'border-muted-foreground/20 hover:border-muted-foreground/40'}`}>
                                {current === st && <CheckCircle2 className="h-3.5 w-3.5" />}
                              </button>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════════════ MARK ENTRY ════════════════ */}
        <TabsContent value="marks" className="space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-48">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Select Exam</p>
                  <Select value={selectedExamId} onValueChange={v => { setSelectedExamId(v); setMarkMap({}); }}>
                    <SelectTrigger className="h-9 text-sm w-full"><SelectValue placeholder="Choose an exam…" /></SelectTrigger>
                    <SelectContent>
                      {(exams as any[]).map((e: any) => (
                        <SelectItem key={e._id || e.id} value={e._id || e.id}>
                          {e.name} — {e.classId?.name} ({e.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedExamId && examStudentsData && (
                  <Button variant="outline" size="sm" className="h-9" onClick={prefillMarks}>Load Marks</Button>
                )}
                <Button size="sm" className="h-9 ml-auto" onClick={handleSaveMarks} disabled={savingMarks || !selectedExamId || Object.keys(markMap).length === 0}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> {savingMarks ? 'Saving…' : 'Save Marks'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {selectedExamId && examStudentsData ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  {(exams as any[]).find(e => (e._id || e.id) === selectedExamId)?.name}
                  &nbsp;—&nbsp;
                  <span className="text-muted-foreground font-normal">Total: {(exams as any[]).find(e => (e._id || e.id) === selectedExamId)?.totalMarks ?? '—'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(examStudentsData.students || []).length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No students found for this exam</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-muted-foreground">
                        <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                        <th className="text-left px-4 py-2.5 font-medium">Student</th>
                        <th className="text-left px-4 py-2.5 font-medium">Roll</th>
                        <th className="text-left px-4 py-2.5 font-medium w-36">Obtained Marks</th>
                        <th className="text-left px-4 py-2.5 font-medium w-24">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(examStudentsData.students as any[]).map((s: any, i: number) => {
                        const sid = s._id || s.id;
                        const val = markMap[sid] ?? '';
                        const examData = (exams as any[]).find(e => (e._id || e.id) === selectedExamId);
                        const total = examData?.totalMarks ?? 0;
                        const passThreshold = examData?.passingMarks ?? (total * 0.4);
                        const obtained = Number(val);
                        const passed = val !== '' && obtained >= passThreshold;
                        return (
                          <tr key={sid} className="border-b hover:bg-muted/20">
                            <td className="px-4 py-2 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender} className="h-7 w-7 rounded-full flex-shrink-0" />
                                <span className="font-medium">{s.firstName} {s.lastName || ''}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{s.rollNumber || '—'}</td>
                            <td className="px-4 py-2">
                              <input type="number" min="0" max={total} value={val}
                                onChange={e => setMarkMap(prev => ({ ...prev, [sid]: e.target.value }))}
                                className="w-24 h-8 text-sm border rounded px-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                placeholder="—" />
                            </td>
                            <td className="px-4 py-2">
                              {val !== '' ? (
                                <Badge className={passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                                  {passed ? 'Pass' : 'Fail'}
                                </Badge>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                Select an exam above to begin entering marks
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════════════ EXAMS ════════════════ */}
        <TabsContent value="exams">
          <Card>
            <CardHeader><CardTitle className="text-base">All Exams ({(exams as any[]).length})</CardTitle></CardHeader>
            <CardContent>
              {eLoading ? <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
                : (exams as any[]).length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No exams found for your classes</p>
                : (
                  <div className="space-y-2">
                    {(exams as any[]).map((e: any) => (
                      <div key={e._id || e.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/20">
                        <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="h-4 w-4 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{e.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {e.classId?.name} &nbsp;·&nbsp; {e.type?.replace('_', ' ')}
                            {e.startDate && ` · ${new Date(e.startDate).toLocaleDateString()}`}
                            {e.endDate && ` – ${new Date(e.endDate).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">Total: {e.totalMarks}</span>
                          <Badge className={`text-[10px] ${STATUS_COLORS[e.status] || ''}`}>{e.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ TIMETABLE ════════════════ */}
        <TabsContent value="timetable">
          {(timetable as any[]).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                No timetable assigned yet. Contact your school admin.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {DAYS.map(day => {
                const periods: any[] = timetableByDay[day] || [];
                return (
                  <Card key={day} className={periods.length === 0 ? 'opacity-40' : ''}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="w-24 flex-shrink-0 pt-1">
                          <p className="font-semibold text-sm">{day}</p>
                          <p className="text-xs text-muted-foreground">{periods.length} {periods.length === 1 ? 'period' : 'periods'}</p>
                        </div>
                        {periods.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic pt-1">No classes</p>
                        ) : (
                          <div className="flex gap-2 flex-wrap flex-1">
                            {periods.sort((a: any, b: any) => (a.periodNumber || 0) - (b.periodNumber || 0)).map((p: any, i: number) => (
                              <div key={i} className="flex flex-col items-center bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 min-w-[100px]">
                                <span className="text-[10px] text-blue-500 font-medium">Period {p.periodNumber || i + 1}</span>
                                <span className="font-semibold text-xs mt-0.5 text-center">{p.subjectId?.name || p.subject || 'Class'}</span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">{p.classId?.name}{p.sectionId?.name ? ` · ${p.sectionId.name}` : ''}</span>
                                {p.startTime && <span className="text-[10px] text-blue-400 mt-1">{p.startTime}–{p.endTime}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ════════════════ SUBJECTS ════════════════ */}
        <TabsContent value="subjects">
          {(subjects as any[]).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <GraduationCap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                No subjects assigned yet
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {(subjects as any[]).map((sub: any) => (
                <Card key={sub._id || sub.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="flex items-center gap-3 py-4 px-4">
                    <div className="h-11 w-11 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="h-5 w-5 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{sub.name}</p>
                      {sub.code && <p className="text-xs text-muted-foreground font-mono">{sub.code}</p>}
                      {sub.classId?.name && <p className="text-xs text-muted-foreground">{sub.classId.name}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
