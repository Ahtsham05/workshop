/**
 * Teacher Portal Page
 * Accessible only to users with schoolRole=teacher
 * Full-featured portal: Dashboard, Students, Attendance, Mark Entry, Exams, Timetable, Subjects
 */
import { useState, useMemo, useEffect, useRef, type KeyboardEvent } from 'react';
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
  Search, Save, ChevronRight, Calendar, NotebookPen, UserCheck,
  Plus, Trash2, Bell, Loader2,
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
  useGetTeacherPortalMyAttendanceQuery,
  useGetTeacherPortalDiariesQuery,
  useCreateTeacherPortalDiaryMutation,
  useDeleteTeacherPortalDiaryMutation,
  useGetNotificationUnreadCountQuery,
  useMarkAllNotificationsReadMutation,
} from '@/stores/school.api';
import { NOTIFICATION_UNREAD_CACHE_OPTIONS } from '@/stores/notification-query-options';
import { Textarea } from '@/components/ui/textarea';
import { NotificationList } from '@/components/notification-list';
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

type TeacherSubjectCol = {
  id: string;
  name: string;
  totalMarks: number;
  passingMarks: number;
};

const ATT_STATUS_LABELS: Record<AttStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  leave: 'Leave',
  half_day: 'Half day',
};

/** Stable fallback so query hooks don't create a new [] every render while loading. */
const EMPTY_LIST: never[] = [];

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
  const [marksGrid, setMarksGrid] = useState<Record<string, { obtainedMarks: string; isAbsent: boolean }>>({});
  const [subjectMarksConfig, setSubjectMarksConfig] = useState<Record<string, { totalMarks: string; passingMarks: string }>>({});
  const [attSearch, setAttSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // ── Daily Diary state ──
  type DiaryItem = { subjectId: string; subjectName: string; classwork: string; homework: string };
  const [diaryClassId, setDiaryClassId] = useState('');
  const [diarySectionId, setDiarySectionId] = useState('');
  const [diaryDate, setDiaryDate] = useState(today());
  const [diaryTitle, setDiaryTitle] = useState('');
  const [diaryNote, setDiaryNote] = useState('');
  const [diaryItems, setDiaryItems] = useState<DiaryItem[]>([{ subjectId: '', subjectName: '', classwork: '', homework: '' }]);
  const [diaryFilterClassId, setDiaryFilterClassId] = useState('all');

  // ── Queries ──
  const { data: teacher, isLoading: tLoading } = useGetTeacherPortalMeQuery(undefined);
  const { data: dashboard } = useGetTeacherPortalDashboardQuery(undefined);
  const { data: studentsData, isLoading: sLoading } = useGetTeacherPortalStudentsQuery(undefined);
  const { data: examsData, isLoading: eLoading } = useGetTeacherPortalExamsQuery(undefined);
  const { data: subjectsData } = useGetTeacherPortalSubjectsQuery(undefined);
  const { data: timetableData } = useGetTeacherPortalTimetableQuery(undefined);
  const { data: examStudentsData, fulfilledTimeStamp: examStudentsLoadedAt, isLoading: examStudentsLoading, isFetching: examStudentsFetching, isError: examStudentsError, error: examStudentsErrorDetail } = useGetTeacherPortalExamStudentsQuery(
    { examId: selectedExamId },
    { skip: !selectedExamId }
  );
  const { data: attRecordsData } = useGetTeacherPortalAttendanceQuery({ date: attDate });
  const { data: myAttendance } = useGetTeacherPortalMyAttendanceQuery({});
  const { data: diariesData } = useGetTeacherPortalDiariesQuery(
    diaryFilterClassId && diaryFilterClassId !== 'all' ? { classId: diaryFilterClassId } : {}
  );

  const students = studentsData ?? EMPTY_LIST;
  const exams = examsData ?? EMPTY_LIST;
  const subjects = subjectsData ?? EMPTY_LIST;
  const timetable = timetableData ?? EMPTY_LIST;
  const attRecords = attRecordsData ?? EMPTY_LIST;
  const diaries = diariesData ?? EMPTY_LIST;
  const { data: notifUnreadData } = useGetNotificationUnreadCountQuery(undefined, NOTIFICATION_UNREAD_CACHE_OPTIONS);
  const notifUnread = notifUnreadData?.count || 0;
  const [markAllNotificationsRead] = useMarkAllNotificationsReadMutation();
  const notifMarkedOnTabRef = useRef(false);
  const markInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
  const [createDiary, { isLoading: savingDiary }] = useCreateTeacherPortalDiaryMutation();
  const [deleteDiary] = useDeleteTeacherPortalDiaryMutation();

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

  const diarySections = useMemo(() => {
    const map: Record<string, any> = {};
    (students as any[]).forEach(s => {
      if (s.classId?._id === diaryClassId && s.sectionId?._id) map[s.sectionId._id] = s.sectionId;
    });
    return Object.values(map);
  }, [students, diaryClassId]);

  const diarySubjects = useMemo(() => {
    if (!diaryClassId) return subjects as any[];
    return (subjects as any[]).filter(
      (sub) => !sub.classId || String(sub.classId?._id || sub.classId) === diaryClassId
    );
  }, [subjects, diaryClassId]);

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
    const next: Record<string, { obtainedMarks: string; isAbsent: boolean }> = {};
    const marksMap = examStudentsData?.marksMap as Record<string, any> | undefined;
    if (marksMap) {
      Object.entries(marksMap).forEach(([key, val]) => {
        next[key] = {
          obtainedMarks: String(val?.obtainedMarks ?? ''),
          isAbsent: !!val?.isAbsent,
        };
      });
    }
    setMarksGrid(next);
  };

  useEffect(() => {
    if (selectedExamId && examStudentsData) prefillMarks();
    else setMarksGrid({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamId, examStudentsLoadedAt]);

  // Mark notifications read once when the Notifications tab is opened.
  useEffect(() => {
    if (activeTab !== 'notifications') {
      notifMarkedOnTabRef.current = false;
      return;
    }
    if (notifMarkedOnTabRef.current || notifUnread <= 0) return;
    notifMarkedOnTabRef.current = true;
    markAllNotificationsRead();
  }, [activeTab, notifUnread, markAllNotificationsRead]);

  const teacherSubjectColumns = useMemo((): TeacherSubjectCol[] => {
    const exam = examStudentsData?.exam as any;
    const subjectLookup = new Map(
      (subjects as any[]).map((s) => [String(s._id || s.id), s.name])
    );
    if (exam?.subjects?.length) {
      return exam.subjects.map((s: any) => {
        const id = String(s.subjectId?._id || s.subjectId?.id || s.subjectId);
        return {
          id,
          name: s.subjectId?.name || subjectLookup.get(id) || 'Subject',
          totalMarks: s.totalMarks ?? 100,
          passingMarks: s.passingMarks ?? 40,
        };
      });
    }
    const classId = exam?.classId ? String(exam.classId) : '';
    return (subjects as any[])
      .filter((s) => !classId || String(s.classId?._id || s.classId) === classId)
      .map((s) => ({
        id: String(s._id || s.id),
        name: s.name,
        totalMarks: 100,
        passingMarks: 40,
      }));
  }, [examStudentsData, subjects]);

  // Clear editable total/pass when switching exams (defaults come from column headers).
  useEffect(() => {
    setSubjectMarksConfig({});
  }, [selectedExamId]);

  const getSubjectMarks = (subjectId: string) => {
    const cfg = subjectMarksConfig[subjectId];
    const col = teacherSubjectColumns.find((c) => c.id === subjectId);
    return {
      totalMarks: Math.max(0, Number(cfg?.totalMarks) || col?.totalMarks || 100),
      passingMarks: Math.max(0, Number(cfg?.passingMarks) || col?.passingMarks || 40),
    };
  };

  const getTeacherCell = (studentId: string, subjectId: string) => {
    const key = `${studentId}_${subjectId}`;
    if (marksGrid[key]) return marksGrid[key];
    return { obtainedMarks: '', isAbsent: false };
  };

  const setTeacherCell = (studentId: string, subjectId: string, value: Partial<{ obtainedMarks: string; isAbsent: boolean }>) => {
    const key = `${studentId}_${subjectId}`;
    setMarksGrid((prev) => ({
      ...prev,
      [key]: { ...getTeacherCell(studentId, subjectId), ...value },
    }));
  };

  const markCellKey = (studentId: string, subjectId: string) => `${studentId}_${subjectId}`;

  const focusNextMarkCell = (studentIdx: number, subjectIdx: number) => {
    const studentList = (examStudentsData?.students as any[]) || [];
    const cols = teacherSubjectColumns;
    if (!studentList.length || !cols.length) return;

    let s = studentIdx;
    let c = subjectIdx + 1;
    const maxSteps = studentList.length * cols.length;

    for (let step = 0; step < maxSteps; step++) {
      if (c >= cols.length) {
        c = 0;
        s += 1;
      }
      if (s >= studentList.length) {
        handleSaveMarks();
        return;
      }
      const sid = studentList[s]._id || studentList[s].id;
      const subId = cols[c].id;
      const cell = getTeacherCell(sid, subId);
      if (!cell.isAbsent) {
        const el = markInputRefs.current[markCellKey(sid, subId)];
        if (el) {
          el.focus();
          el.select();
          return;
        }
      }
      c += 1;
    }
  };

  const handleMarkKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    studentIdx: number,
    subjectIdx: number,
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    // Defer focus so the current input can finish its change event first.
    requestAnimationFrame(() => focusNextMarkCell(studentIdx, subjectIdx));
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
    const exam = examStudentsData.exam as any;
    const classId = String(exam?.classId?._id || exam?.classId || '');

    const invalidSubject = teacherSubjectColumns.find((sub) => {
      const { totalMarks, passingMarks } = getSubjectMarks(sub.id);
      return !totalMarks || totalMarks < 1 || passingMarks < 0 || passingMarks > totalMarks;
    });
    if (invalidSubject) {
      toast.error(`Check total/pass marks for ${invalidSubject.name}`);
      return;
    }

    const marks: any[] = [];
    try {
      (examStudentsData.students || []).forEach((s: any) => {
        const sid = s._id || s.id;
        teacherSubjectColumns.forEach((sub) => {
          const cell = getTeacherCell(sid, sub.id);
          if (cell.obtainedMarks === '' && !cell.isAbsent) return;
          const { totalMarks } = getSubjectMarks(sub.id);
          const obtained = Number(cell.obtainedMarks) || 0;
          if (!cell.isAbsent && obtained > totalMarks) {
            throw new Error(`Mark for ${sub.name} cannot exceed ${totalMarks}`);
          }
          marks.push({
            studentId: sid,
            examId: selectedExamId,
            subjectId: sub.id,
            classId,
            obtainedMarks: obtained,
            totalMarks,
            isAbsent: cell.isAbsent,
          });
        });
      });
    } catch (err: any) {
      toast.error(err.message || 'Invalid marks');
      return;
    }

    if (!marks.length) { toast.error('Enter at least one mark before saving'); return; }

    const subjectConfig = teacherSubjectColumns.map((sub) => {
      const { totalMarks, passingMarks } = getSubjectMarks(sub.id);
      return { subjectId: sub.id, totalMarks, passingMarks };
    });

    try {
      const result = await saveBulkMarks({ marks, subjectConfig }).unwrap();
      toast.success(`${result.saved ?? marks.length} marks saved`);
      prefillMarks();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save marks');
    }
  };

  const updateDiaryItem = (index: number, patch: Partial<DiaryItem>) => {
    setDiaryItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };
  const addDiaryItem = () => setDiaryItems((prev) => [...prev, { subjectId: '', subjectName: '', classwork: '', homework: '' }]);
  const removeDiaryItem = (index: number) => setDiaryItems((prev) => prev.filter((_, i) => i !== index));

  const resetDiaryForm = () => {
    setDiaryTitle('');
    setDiaryNote('');
    setDiaryItems([{ subjectId: '', subjectName: '', classwork: '', homework: '' }]);
  };

  const handleSaveDiary = async () => {
    if (!diaryClassId) { toast.error('Select a class first'); return; }
    const items = diaryItems
      .filter((it) => it.subjectId || it.subjectName || it.classwork || it.homework)
      .map((it) => {
        const subj = (subjects as any[]).find((s) => String(s._id || s.id) === it.subjectId);
        return {
          subjectId: it.subjectId || undefined,
          subjectName: it.subjectName || subj?.name || '',
          classwork: it.classwork || '',
          homework: it.homework || '',
        };
      });
    if (!items.length && !diaryNote.trim()) { toast.error('Add at least one subject entry or a note'); return; }
    try {
      await createDiary({
        classId: diaryClassId,
        sectionId: diarySectionId && diarySectionId !== 'all' ? diarySectionId : null,
        date: diaryDate,
        title: diaryTitle,
        note: diaryNote,
        items,
      }).unwrap();
      toast.success('Diary entry saved');
      resetDiaryForm();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save diary');
    }
  };

  const handleDeleteDiary = async (id: string) => {
    try {
      await deleteDiary(id).unwrap();
      toast.success('Diary entry deleted');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to delete diary');
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
          <TabsTrigger value="diary" className="gap-1.5"><NotebookPen className="h-4 w-4" />Daily Diary</TabsTrigger>
          <TabsTrigger value="marks" className="gap-1.5"><ClipboardList className="h-4 w-4" />Mark Entry</TabsTrigger>
          <TabsTrigger value="my-attendance" className="gap-1.5"><UserCheck className="h-4 w-4" />My Attendance</TabsTrigger>
          <TabsTrigger value="exams" className="gap-1.5"><BookOpen className="h-4 w-4" />Exams</TabsTrigger>
          <TabsTrigger value="timetable" className="gap-1.5"><Clock className="h-4 w-4" />Timetable</TabsTrigger>
          <TabsTrigger value="subjects" className="gap-1.5"><GraduationCap className="h-4 w-4" />Subjects</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Notifications
            {notifUnread > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                {notifUnread > 99 ? '99+' : notifUnread}
              </span>
            )}
          </TabsTrigger>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-3 lg:items-end">
                <div className="col-span-1">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Date</p>
                  <input type="date" className="text-sm border rounded px-2 py-1.5 bg-background w-full" value={attDate} onChange={e => setAttDate(e.target.value)} />
                </div>
                <div className="col-span-1">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Class</p>
                  <Select value={attClassId} onValueChange={v => { setAttClassId(v); setAttSectionId(''); setAttMap({}); }}>
                    <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="All classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {teacherClasses.map((c: any) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {attClassId && attClassId !== 'all' && attSections.length > 0 && (
                  <div className="col-span-1">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Section</p>
                    <Select value={attSectionId} onValueChange={v => { setAttSectionId(v); setAttMap({}); }}>
                      <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="All sections" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sections</SelectItem>
                        {attSections.map((sec: any) => <SelectItem key={sec._id} value={sec._id}>{sec.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Search</p>
                  <Input placeholder="Search student…" value={attSearch} onChange={e => setAttSearch(e.target.value)} className="h-9 text-sm w-full" />
                </div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex gap-2">
                  <Button variant="outline" size="sm" className="h-9 flex-1 lg:flex-none" onClick={prefillAtt} disabled={attStudents.length === 0}>
                    <Calendar className="h-3.5 w-3.5 mr-1.5 shrink-0" /> Load
                  </Button>
                  <Button size="sm" className="h-9 flex-1 lg:flex-none lg:ml-auto" onClick={handleSaveAttendance} disabled={savingAtt || Object.keys(attMap).length === 0}>
                    <Save className="h-3.5 w-3.5 mr-1.5 shrink-0" /> {savingAtt ? 'Saving…' : 'Save'}
                  </Button>
                </div>
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
                {/* Mobile: card list with status dropdown */}
                <div className="md:hidden divide-y">
                  {attStudents.map((s: any, i: number) => {
                    const sid = s._id || s.id;
                    const current = attMap[sid] || 'present';
                    return (
                      <div key={sid} className="p-3 space-y-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                          <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender} className="h-8 w-8 rounded-full shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{s.firstName} {s.lastName || ''}</p>
                            <p className="text-xs text-muted-foreground">{s.rollNumber || '—'}</p>
                          </div>
                        </div>
                        <Select value={current} onValueChange={(v) => setAttMap((prev) => ({ ...prev, [sid]: v as AttStatus }))}>
                          <SelectTrigger className={`h-9 w-full text-sm capitalize ${ATT_COLORS[current as AttStatus]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ATT_STATUS_OPTIONS.map((st) => (
                              <SelectItem key={st} value={st} className="capitalize">{ATT_STATUS_LABELS[st]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: full table */}
                <div className="hidden md:block overflow-x-auto">
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
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════════════ DAILY DIARY ════════════════ */}
        <TabsContent value="diary" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Compose */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-blue-500" /> Write Today's Diary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Class *</p>
                    <Select value={diaryClassId} onValueChange={(v) => { setDiaryClassId(v); setDiarySectionId(''); }}>
                      <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>
                        {teacherClasses.map((c: any) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {diaryClassId && diarySections.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Section</p>
                      <Select value={diarySectionId} onValueChange={setDiarySectionId}>
                        <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Whole class" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Whole class</SelectItem>
                          {diarySections.map((sec: any) => <SelectItem key={sec._id} value={sec._id}>{sec.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Date</p>
                    <input type="date" className="text-sm border rounded px-2 py-1.5 bg-background" value={diaryDate} onChange={e => setDiaryDate(e.target.value)} />
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Title (optional)</p>
                  <Input value={diaryTitle} onChange={e => setDiaryTitle(e.target.value)} placeholder="e.g. Homework for the weekend" className="h-9 text-sm" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Subject Entries</p>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addDiaryItem}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add subject
                    </Button>
                  </div>
                  {diaryItems.map((it, idx) => (
                    <div key={idx} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Select value={it.subjectId} onValueChange={(v) => updateDiaryItem(idx, { subjectId: v })}>
                          <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Select subject" /></SelectTrigger>
                          <SelectContent>
                            {diarySubjects.map((sub: any) => (
                              <SelectItem key={sub._id || sub.id} value={String(sub._id || sub.id)}>{sub.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {diaryItems.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeDiaryItem(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <Textarea value={it.classwork} onChange={e => updateDiaryItem(idx, { classwork: e.target.value })} placeholder="Classwork…" rows={2} className="text-sm resize-y" />
                      <Textarea value={it.homework} onChange={e => updateDiaryItem(idx, { homework: e.target.value })} placeholder="Homework…" rows={2} className="text-sm resize-y" />
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">General Note (optional)</p>
                  <Textarea value={diaryNote} onChange={e => setDiaryNote(e.target.value)} placeholder="Announcement for the whole class…" rows={2} className="text-sm resize-y" />
                </div>

                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSaveDiary} disabled={savingDiary || !diaryClassId}>
                    <Save className="h-3.5 w-3.5 mr-1.5" /> {savingDiary ? 'Saving…' : 'Save Diary'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Recent entries */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Recent Diary</CardTitle>
                  <Select value={diaryFilterClassId} onValueChange={setDiaryFilterClassId}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {teacherClasses.map((c: any) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[560px] overflow-y-auto">
                {(diaries as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No diary entries yet</p>
                ) : (
                  (diaries as any[]).map((d: any) => (
                    <div key={d._id || d.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{d.title || 'Daily Diary'}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.classId?.name || ''}{d.sectionId?.name ? ` · ${d.sectionId.name}` : ''} · {new Date(d.date).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive flex-shrink-0" onClick={() => handleDeleteDiary(d._id || d.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {(d.items || []).length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {(d.items as any[]).map((it: any, i: number) => (
                            <div key={i} className="text-xs border-l-2 border-blue-200 pl-2">
                              <span className="font-medium">{it.subjectId?.name || it.subjectName || 'Subject'}</span>
                              {it.classwork && <p className="text-muted-foreground"><span className="font-medium">CW:</span> {it.classwork}</p>}
                              {it.homework && <p className="text-muted-foreground"><span className="font-medium">HW:</span> {it.homework}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {d.note && <p className="text-xs text-muted-foreground mt-2 italic">{d.note}</p>}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════════════════ MARK ENTRY ════════════════ */}
        <TabsContent value="marks" className="space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-48">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Select Exam</p>
                  <Select value={selectedExamId} onValueChange={(v) => { setSelectedExamId(v); setMarksGrid({}); }}>
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
                <Button size="sm" className="h-9 ml-auto" onClick={handleSaveMarks} disabled={savingMarks || !selectedExamId}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> {savingMarks ? 'Saving…' : 'Save All Marks'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {!selectedExamId ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                Select an exam above to begin entering marks
              </CardContent>
            </Card>
          ) : examStudentsLoading || (examStudentsFetching && !examStudentsData) ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                Loading students and marks…
              </CardContent>
            </Card>
          ) : examStudentsError ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-destructive">
                Failed to load exam data. {(examStudentsErrorDetail as any)?.data?.message || 'Please try again.'}
              </CardContent>
            </Card>
          ) : examStudentsData ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  {(exams as any[]).find(e => (e._id || e.id) === selectedExamId)?.name}
                  <span className="text-muted-foreground font-normal text-sm">
                    — {(examStudentsData.students || []).length} students × {teacherSubjectColumns.length} subjects
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {(examStudentsData.students || []).length === 0 || !teacherSubjectColumns.length ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No students or subjects found for this exam</p>
                ) : (
                  <>
                  {/* Mobile: subject config + student cards */}
                  <div className="md:hidden">
                    <div className="p-3 bg-muted/20 border-b space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Total / Passing marks per subject</p>
                      <div className="space-y-2">
                        {teacherSubjectColumns.map((sub) => (
                          <div key={sub.id} className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium min-w-[72px] truncate" title={sub.name}>{sub.name}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">Tot</span>
                              <Input
                                type="number"
                                min={1}
                                className="h-8 w-14 text-xs text-center"
                                value={subjectMarksConfig[sub.id]?.totalMarks ?? String(sub.totalMarks)}
                                onChange={(e) => setSubjectMarksConfig((prev) => ({
                                  ...prev,
                                  [sub.id]: {
                                    totalMarks: e.target.value,
                                    passingMarks: prev[sub.id]?.passingMarks ?? String(sub.passingMarks),
                                  },
                                }))}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">Pass</span>
                              <Input
                                type="number"
                                min={0}
                                className="h-8 w-14 text-xs text-center"
                                value={subjectMarksConfig[sub.id]?.passingMarks ?? String(sub.passingMarks)}
                                onChange={(e) => setSubjectMarksConfig((prev) => ({
                                  ...prev,
                                  [sub.id]: {
                                    totalMarks: prev[sub.id]?.totalMarks ?? String(sub.totalMarks),
                                    passingMarks: e.target.value,
                                  },
                                }))}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="divide-y">
                      {(examStudentsData.students as any[]).map((s: any, i: number) => {
                        const sid = s._id || s.id;
                        return (
                          <div key={sid} className="p-3 space-y-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                              <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender} className="h-8 w-8 rounded-full shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">{s.firstName} {s.lastName || ''}</p>
                                <p className="text-xs text-muted-foreground">{s.rollNumber || '—'}</p>
                              </div>
                            </div>
                            <div className="space-y-1.5 pl-7">
                              {teacherSubjectColumns.map((sub, subIdx) => {
                                const cell = getTeacherCell(sid, sub.id);
                                const { totalMarks, passingMarks } = getSubjectMarks(sub.id);
                                const obtained = Number(cell.obtainedMarks);
                                const belowPass = !cell.isAbsent && cell.obtainedMarks !== '' && obtained < passingMarks;
                                return (
                                  <div key={sub.id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${cell.isAbsent ? 'bg-gray-50' : belowPass ? 'bg-red-50/60' : 'bg-muted/30'}`}>
                                    <span className="text-xs flex-1 truncate" title={sub.name}>{sub.name}</span>
                                    <span className="text-[10px] text-muted-foreground shrink-0">/{totalMarks}</span>
                                    {cell.isAbsent ? (
                                      <button type="button" className="text-[10px] text-muted-foreground px-2" onClick={() => setTeacherCell(sid, sub.id, { isAbsent: false })}>ABS</button>
                                    ) : (
                                      <Input
                                        ref={(el) => { markInputRefs.current[markCellKey(sid, sub.id)] = el; }}
                                        type="number"
                                        min={0}
                                        max={totalMarks}
                                        value={cell.obtainedMarks}
                                        onChange={(e) => setTeacherCell(sid, sub.id, { obtainedMarks: e.target.value })}
                                        onKeyDown={(e) => handleMarkKeyDown(e, i, subIdx)}
                                        onDoubleClick={() => setTeacherCell(sid, sub.id, { isAbsent: true, obtainedMarks: '' })}
                                        className="h-8 w-16 text-center text-xs shrink-0"
                                        placeholder="—"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="px-4 py-2 text-[10px] text-muted-foreground border-t">
                      Press <kbd className="rounded border px-1">Enter</kbd> for next cell. Double-tap to mark absent.
                    </p>
                  </div>

                  {/* Desktop: spreadsheet table */}
                  <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-max">
                    <thead>
                      <tr className="border-b bg-muted/30 text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium w-8">#</th>
                        <th className="text-left px-3 py-2 font-medium min-w-[140px]">Student</th>
                        <th className="text-left px-2 py-2 font-medium w-16">Roll</th>
                        {teacherSubjectColumns.map((sub) => (
                          <th key={sub.id} className="text-center px-1.5 py-2 font-medium min-w-[88px] border-l">
                            <div className="truncate max-w-[96px] mx-auto text-xs" title={sub.name}>{sub.name}</div>
                            <div className="mt-1 flex flex-col items-center gap-0.5">
                              <div className="flex items-center gap-0.5">
                                <span className="text-[9px] text-muted-foreground">Tot</span>
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-6 w-11 text-[10px] px-0.5 text-center"
                                  value={subjectMarksConfig[sub.id]?.totalMarks ?? String(sub.totalMarks)}
                                  onChange={(e) => setSubjectMarksConfig((prev) => ({
                                    ...prev,
                                    [sub.id]: {
                                      totalMarks: e.target.value,
                                      passingMarks: prev[sub.id]?.passingMarks ?? String(sub.passingMarks),
                                    },
                                  }))}
                                />
                              </div>
                              <div className="flex items-center gap-0.5">
                                <span className="text-[9px] text-muted-foreground">Pass</span>
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-6 w-11 text-[10px] px-0.5 text-center"
                                  value={subjectMarksConfig[sub.id]?.passingMarks ?? String(sub.passingMarks)}
                                  onChange={(e) => setSubjectMarksConfig((prev) => ({
                                    ...prev,
                                    [sub.id]: {
                                      totalMarks: prev[sub.id]?.totalMarks ?? String(sub.totalMarks),
                                      passingMarks: e.target.value,
                                    },
                                  }))}
                                />
                              </div>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(examStudentsData.students as any[]).map((s: any, i: number) => {
                        const sid = s._id || s.id;
                        return (
                          <tr key={sid} className="border-b hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender} className="h-7 w-7 rounded-full flex-shrink-0" />
                                <span className="font-medium whitespace-nowrap">{s.firstName} {s.lastName || ''}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-muted-foreground text-xs">{s.rollNumber || '—'}</td>
                            {teacherSubjectColumns.map((sub, subIdx) => {
                              const cell = getTeacherCell(sid, sub.id);
                              const { totalMarks, passingMarks } = getSubjectMarks(sub.id);
                              const obtained = Number(cell.obtainedMarks);
                              const belowPass = !cell.isAbsent && cell.obtainedMarks !== '' && obtained < passingMarks;
                              return (
                                <td key={sub.id} className={`px-1.5 py-1 border-l text-center ${cell.isAbsent ? 'bg-gray-50' : belowPass ? 'bg-red-50/60' : ''}`}>
                                  {cell.isAbsent ? (
                                    <button type="button" className="text-[10px] text-muted-foreground" onClick={() => setTeacherCell(sid, sub.id, { isAbsent: false })}>ABS</button>
                                  ) : (
                                    <Input
                                      ref={(el) => { markInputRefs.current[markCellKey(sid, sub.id)] = el; }}
                                      type="number"
                                      min={0}
                                      max={totalMarks}
                                      value={cell.obtainedMarks}
                                      onChange={(e) => setTeacherCell(sid, sub.id, { obtainedMarks: e.target.value })}
                                      onKeyDown={(e) => handleMarkKeyDown(e, i, subIdx)}
                                      onDoubleClick={() => setTeacherCell(sid, sub.id, { isAbsent: true, obtainedMarks: '' })}
                                      className="h-7 w-[68px] mx-auto text-center text-xs px-1"
                                      placeholder="—"
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-4 py-2 text-[10px] text-muted-foreground border-t">
                    Press <kbd className="rounded border px-1">Enter</kbd> for next cell (skips absent). On the last cell, Enter saves all marks.
                  </p>
                  </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ════════════════ MY ATTENDANCE ════════════════ */}
        <TabsContent value="my-attendance" className="space-y-3">
          {(() => {
            const summary = (myAttendance as any)?.summary || { total: 0 };
            const records: any[] = (myAttendance as any)?.records || [];
            const tiles: { key: string; label: string; color: string }[] = [
              { key: 'total', label: 'Total Days', color: 'bg-slate-100 text-slate-700' },
              { key: 'present', label: 'Present', color: 'bg-green-100 text-green-700' },
              { key: 'absent', label: 'Absent', color: 'bg-red-100 text-red-700' },
              { key: 'late', label: 'Late', color: 'bg-yellow-100 text-yellow-700' },
              { key: 'on_leave', label: 'On Leave', color: 'bg-blue-100 text-blue-700' },
            ];
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {tiles.map(t => (
                    <Card key={t.key}>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{summary[t.key] || 0}</p>
                        <Badge className={`${t.color} text-[10px] mt-1`}>{t.label}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4 text-blue-500" /> My Attendance History</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {records.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">No attendance records yet</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30 text-muted-foreground">
                              <th className="text-left px-4 py-2.5 font-medium">Date</th>
                              <th className="text-left px-4 py-2.5 font-medium">Status</th>
                              <th className="text-left px-4 py-2.5 font-medium">Check-in</th>
                              <th className="text-left px-4 py-2.5 font-medium">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {records.map((r: any) => (
                              <tr key={r._id || r.id} className="border-b hover:bg-muted/20">
                                <td className="px-4 py-2">{new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                <td className="px-4 py-2 capitalize">
                                  <Badge className={`text-[10px] ${r.status === 'present' ? 'bg-green-100 text-green-700' : r.status === 'absent' ? 'bg-red-100 text-red-700' : r.status === 'late' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {String(r.status || '').replace('_', ' ')}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2 text-muted-foreground">{r.checkInTime || '—'}</td>
                                <td className="px-4 py-2 text-muted-foreground">{r.remarks || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
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

        {/* ════════════════ NOTIFICATIONS ════════════════ */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-500" />
                Notifications
                {notifUnread > 0 && (
                  <Badge className="bg-red-100 text-red-700 text-[10px]">{notifUnread} new</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <NotificationList
                limit={50}
                showHeader={notifUnread > 0}
                unreadCount={notifUnread}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
