import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Trash2, Users, BookOpen, Star, CheckCircle2, XCircle,
  Wand2, Search, ChevronRight, ChevronDown, ChevronUp, GraduationCap,
} from 'lucide-react';
import {
  useGetTeachersQuery,
  useGetSchoolClassesQuery,
  useGetSectionsQuery,
  useGetSubjectsQuery,
  useGetTeacherAssignmentsQuery,
  useCreateTeacherAssignmentMutation,
  useDeleteTeacherAssignmentMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Assignment {
  id: string;
  teacherId: { id: string; firstName: string; lastName: string; employeeId: string } | null;
  classId: { id: string; name: string } | null;
  sectionId: { id: string; name: string } | null;
  subjectId: { id: string; name: string } | null;
  isClassTeacher: boolean;
}

interface WizardRow {
  key: string;
  classId: string;
  sectionId: string;
  className: string;
  sectionName: string;
  subjectId: string;
  isClassTeacher: boolean;
}

interface CreationResult {
  key: string;
  label: string;
  success: boolean;
  message?: string;
}

type WizardStep = 1 | 2 | 3;

const NONE_SUBJECT_VALUE = '__none__';

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

export default function TeacherAssignmentsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [teacherId, setTeacherId] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selections, setSelections] = useState<WizardRow[]>([]);
  const [results, setResults] = useState<CreationResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());

  const { data: teachersData } = useGetTeachersQuery({ limit: 100, status: 'active' } as Record<string, unknown>);
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 } as Record<string, unknown>);
  const { data: allSectionsData } = useGetSectionsQuery({ limit: 200 } as Record<string, unknown>);
  const { data: allSubjectsData } = useGetSubjectsQuery({ limit: 200 } as Record<string, unknown>);
  const { data: assignmentsData, isLoading } = useGetTeacherAssignmentsQuery({ limit: 200 } as Record<string, unknown>);

  const [createAssignment] = useCreateTeacherAssignmentMutation();
  const [deleteAssignment] = useDeleteTeacherAssignmentMutation();

  type Teacher = { id: string; firstName: string; lastName: string; employeeId?: string };
  type SchoolClass = { id: string; name: string; order?: number };
  type Section = { id: string; name: string; classId: { _id?: string; id?: string; name?: string } | string };
  type Subject = { id: string; name: string; classId: { _id?: string; id?: string } | string };

  const teachers = ((teachersData as { results?: unknown[] })?.results ?? []) as Teacher[];
  const classes = ((classesData as { results?: unknown[] })?.results ?? []) as SchoolClass[];
  const allSections = ((allSectionsData as { results?: unknown[] })?.results ?? []) as Section[];
  const allSubjects = ((allSubjectsData as { results?: unknown[] })?.results ?? []) as Subject[];
  const assignments: Assignment[] = ((assignmentsData as { results?: unknown[] })?.results ?? []) as Assignment[];

  const getSectionClassId = (s: Section) =>
    (s.classId as { _id?: string; id?: string })?._id ||
    (s.classId as { _id?: string; id?: string })?.id ||
    (s.classId as string) || '';

  const getSectionClassName = (s: Section) => (s.classId as { name?: string })?.name || '';

  const getSubjectClassId = (sub: Subject) =>
    (sub.classId as { _id?: string; id?: string })?._id ||
    (sub.classId as { _id?: string; id?: string })?.id ||
    (sub.classId as string) || '';

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.toLowerCase();
    return teachers.filter(
      (t) =>
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
        (t.employeeId ?? '').toLowerCase().includes(q),
    );
  }, [teachers, teacherSearch]);

  const selectedTeacher = teachers.find((t) => t.id === teacherId);

  const sectionsByClass = useMemo(() => {
    const map = new Map<string, { classId: string; className: string; sections: Section[] }>();
    for (const s of allSections) {
      const cId = getSectionClassId(s);
      const cName = getSectionClassName(s);
      if (!map.has(cId)) map.set(cId, { classId: cId, className: cName, sections: [] });
      map.get(cId)!.sections.push(s);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ca = classes.find((c) => c.id === a.classId);
      const cb = classes.find((c) => c.id === b.classId);
      return (ca?.order ?? 0) - (cb?.order ?? 0);
    });
  }, [allSections, classes]);

  const subjectsByClass = useMemo(() => {
    const map = new Map<string, Subject[]>();
    for (const sub of allSubjects) {
      const cId = getSubjectClassId(sub);
      if (!map.has(cId)) map.set(cId, []);
      map.get(cId)!.push(sub);
    }
    return map;
  }, [allSubjects]);

  const assignmentsByTeacher = useMemo(() => {
    const q = tableSearch.toLowerCase();
    const filtered = assignments.filter((a) => {
      if (!q) return true;
      const name = a.teacherId ? `${a.teacherId.firstName} ${a.teacherId.lastName}`.toLowerCase() : '';
      return name.includes(q);
    });
    const map = new Map<string, { teacher: Assignment['teacherId']; items: Assignment[] }>();
    for (const a of filtered) {
      const tid = a.teacherId?.id ?? 'unknown';
      if (!map.has(tid)) map.set(tid, { teacher: a.teacherId, items: [] });
      map.get(tid)!.items.push(a);
    }
    return Array.from(map.values()).sort((a, b) => {
      const na = a.teacher ? `${a.teacher.firstName} ${a.teacher.lastName}` : '';
      const nb = b.teacher ? `${b.teacher.firstName} ${b.teacher.lastName}` : '';
      return na.localeCompare(nb);
    });
  }, [assignments, tableSearch]);

  const openWizard = () => {
    setWizardStep(1);
    setTeacherId('');
    setTeacherSearch('');
    setSelections([]);
    setResults(null);
    setWizardOpen(true);
  };

  const isSelected = (sectionId: string, classId: string) =>
    selections.some((r) => r.sectionId === sectionId && r.classId === classId);

  const toggleSection = (s: Section) => {
    const cId = getSectionClassId(s);
    const cName = getSectionClassName(s);
    const key = `${cId}__${s.id}`;
    setSelections((prev) => {
      const exists = prev.find((r) => r.key === key);
      if (exists) return prev.filter((r) => r.key !== key);
      return [...prev, { key, classId: cId, sectionId: s.id, className: cName, sectionName: s.name, subjectId: '', isClassTeacher: false }];
    });
  };

  const toggleClass = (group: { classId: string; className: string; sections: Section[] }) => {
    const allSel = group.sections.every((s) => isSelected(s.id, group.classId));
    if (allSel) {
      setSelections((prev) => prev.filter((r) => r.classId !== group.classId));
    } else {
      const toAdd = group.sections
        .filter((s) => !isSelected(s.id, group.classId))
        .map((s) => ({
          key: `${group.classId}__${s.id}`,
          classId: group.classId,
          sectionId: s.id,
          className: group.className,
          sectionName: s.name,
          subjectId: '',
          isClassTeacher: false,
        }));
      setSelections((prev) => [...prev, ...toAdd]);
    }
  };

  const updateRow = (key: string, updates: Partial<WizardRow>) =>
    setSelections((prev) => prev.map((r) => (r.key === key ? { ...r, ...updates } : r)));

  const handleSubmit = async () => {
    if (!teacherId || selections.length === 0) return;
    setSubmitting(true);
    const out: CreationResult[] = [];
    for (const row of selections) {
      const label = `${row.className} › ${row.sectionName}`;
      try {
        await createAssignment({
          teacherId,
          classId: row.classId,
          sectionId: row.sectionId,
          subjectId: row.subjectId || null,
          isClassTeacher: row.isClassTeacher,
        }).unwrap();
        out.push({ key: row.key, label, success: true });
      } catch (err: unknown) {
        const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Failed';
        out.push({ key: row.key, label, success: false, message: msg });
      }
    }
    setResults(out);
    setSubmitting(false);
    const ok = out.filter((r) => r.success).length;
    if (ok > 0) toast.success(`${ok} assignment(s) created`);
    if (ok < out.length) toast.error(`${out.length - ok} failed`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAssignment(id).unwrap();
      toast.success('Assignment removed');
    } catch {
      toast.error('Failed to remove assignment');
    }
  };

  const toggleTeacherExpand = (tid: string) =>
    setExpandedTeachers((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teacher Assignments</h1>
          <p className="text-muted-foreground text-sm mt-1">Assign teachers to classes, sections, and subjects</p>
        </div>
        <Button
          onClick={openWizard}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md"
        >
          <Wand2 className="mr-2 h-4 w-4" />
          Bulk Assign
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Assignments</p>
              <p className="text-2xl font-bold">{assignments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-yellow-50 to-yellow-100/50 dark:from-yellow-950/30 dark:to-yellow-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <Star className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Class Teachers</p>
              <p className="text-2xl font-bold">{assignments.filter((a) => a.isClassTeacher).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Subject Assignments</p>
              <p className="text-2xl font-bold">{assignments.filter((a) => a.subjectId).length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignments table grouped by teacher */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">All Assignments</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teacher..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-8 h-8 w-52 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-center py-10 text-muted-foreground">Loading...</p>
          ) : assignmentsByTeacher.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">No assignments yet. Click "Bulk Assign" to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {assignmentsByTeacher.map(({ teacher, items }) => {
                const tid = teacher?.id ?? 'unknown';
                const isOpen = expandedTeachers.has(tid);
                const ctCount = items.filter((a) => a.isClassTeacher).length;
                return (
                  <div key={tid} className="border rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleTeacherExpand(tid)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {teacher ? getInitials(teacher.firstName, teacher.lastName) : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">
                          {teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unknown'}
                        </div>
                        {teacher?.employeeId && (
                          <div className="text-xs text-muted-foreground">{teacher.employeeId}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mr-2">
                        <Badge variant="secondary" className="text-xs">
                          {items.length} section{items.length !== 1 ? 's' : ''}
                        </Badge>
                        {ctCount > 0 && (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">
                            {ctCount} CT
                          </Badge>
                        )}
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="border-t bg-muted/20">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left border-b bg-muted/30">
                              <th className="py-2 px-4 font-medium text-muted-foreground text-xs">Class</th>
                              <th className="py-2 px-4 font-medium text-muted-foreground text-xs">Section</th>
                              <th className="py-2 px-4 font-medium text-muted-foreground text-xs">Subject</th>
                              <th className="py-2 px-4 font-medium text-muted-foreground text-xs">Role</th>
                              <th className="py-2 px-4 w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((a) => (
                              <tr
                                key={a.id}
                                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                              >
                                <td className="py-2 px-4">{a.classId?.name ?? '—'}</td>
                                <td className="py-2 px-4">{a.sectionId?.name ?? '—'}</td>
                                <td className="py-2 px-4 text-muted-foreground">
                                  {a.subjectId?.name ?? '—'}
                                </td>
                                <td className="py-2 px-4">
                                  {a.isClassTeacher ? (
                                    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">
                                      Class Teacher
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      Subject Teacher
                                    </Badge>
                                  )}
                                </td>
                                <td className="py-2 px-4">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleDelete(a.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Assign Wizard Dialog */}
      <Dialog
        open={wizardOpen}
        onOpenChange={(open) => {
          if (!submitting) setWizardOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-violet-600" />
              Bulk Teacher Assignment
            </DialogTitle>
            {/* Step progress */}
            <div className="flex items-center gap-1 pt-3">
              {[
                { n: 1 as WizardStep, label: 'Select Teacher' },
                { n: 2 as WizardStep, label: 'Select Sections' },
                { n: 3 as WizardStep, label: 'Configure Roles' },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center gap-1 flex-1">
                  <div
                    className={cn(
                      'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                      wizardStep > s.n
                        ? 'bg-violet-600 text-white'
                        : wizardStep === s.n
                          ? 'bg-violet-600 text-white ring-2 ring-violet-300'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {wizardStep > s.n ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
                  </div>
                  <span
                    className={cn(
                      'text-xs hidden sm:block',
                      wizardStep >= s.n ? 'text-foreground font-medium' : 'text-muted-foreground',
                    )}
                  >
                    {s.label}
                  </span>
                  {i < 2 && (
                    <div
                      className={cn(
                        'h-px flex-1 mx-1',
                        wizardStep > s.n ? 'bg-violet-600' : 'bg-border',
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden px-6 py-4">
            {/* Step 1 — Select Teacher */}
            {wizardStep === 1 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Search and select a teacher</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or employee ID..."
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    className="pl-8"
                    autoFocus
                  />
                </div>
                <ScrollArea className="h-64 border rounded-lg">
                  <div className="p-2 space-y-1">
                    {filteredTeachers.length === 0 ? (
                      <p className="text-center py-8 text-sm text-muted-foreground">No teachers found</p>
                    ) : (
                      filteredTeachers.map((t) => {
                        const teacherSubjects = (t as any).subjects || [];
                        return (
                        <button
                          key={t.id}
                          onClick={() => setTeacherId(t.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                            teacherId === t.id
                              ? 'bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <div
                            className={cn(
                              'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                              teacherId === t.id
                                ? 'bg-violet-600 text-white'
                                : 'bg-gradient-to-br from-gray-400 to-gray-500 text-white',
                            )}
                          >
                            {getInitials(t.firstName, t.lastName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">
                              {t.firstName} {t.lastName}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {t.employeeId && (
                                <span className="text-xs text-muted-foreground">{t.employeeId}</span>
                              )}
                              {teacherSubjects.length > 0 && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  {teacherSubjects.slice(0, 4).map((sub: any) => (
                                    <span key={sub._id || sub.id || sub} className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-1">
                                      {sub.code || sub.name || ''}
                                    </span>
                                  ))}
                                  {teacherSubjects.length > 4 && (
                                    <span className="text-[10px] text-muted-foreground">+{teacherSubjects.length - 4}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {teacherId === t.id && <CheckCircle2 className="h-4 w-4 text-violet-600" />}
                        </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Step 2 — Select Sections */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Select sections to assign</Label>
                  {selections.length > 0 && (
                    <Badge variant="secondary">{selections.length} selected</Badge>
                  )}
                </div>
                <ScrollArea className="h-72 border rounded-lg">
                  <div className="p-3 space-y-3">
                    {sectionsByClass.length === 0 ? (
                      <p className="text-center py-8 text-sm text-muted-foreground">
                        No sections found. Add sections first.
                      </p>
                    ) : (
                      sectionsByClass.map((group) => {
                        const allSel = group.sections.every((s) => isSelected(s.id, group.classId));
                        const someSel = group.sections.some((s) => isSelected(s.id, group.classId));
                        return (
                          <div key={group.classId}>
                            <button
                              onClick={() => toggleClass(group)}
                              className="flex items-center gap-2 w-full hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors"
                            >
                              <div
                                className={cn(
                                  'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0',
                                  allSel
                                    ? 'bg-violet-600 border-violet-600'
                                    : someSel
                                      ? 'bg-violet-200 border-violet-400'
                                      : 'border-muted-foreground/40',
                                )}
                              >
                                {(allSel || someSel) && (
                                  <div className="h-2 w-2 bg-white rounded-sm" />
                                )}
                              </div>
                              <span className="font-semibold text-sm">{group.className}</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {group.sections.length} sections
                              </span>
                            </button>
                            <div className="ml-6 mt-1.5 flex flex-wrap gap-1.5">
                              {group.sections.map((s) => {
                                const sel = isSelected(s.id, group.classId);
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => toggleSection(s)}
                                    className={cn(
                                      'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                                      sel
                                        ? 'bg-violet-100 dark:bg-violet-900/30 border-violet-400 text-violet-700 dark:text-violet-300'
                                        : 'border-muted-foreground/30 hover:border-muted-foreground/60 text-muted-foreground hover:text-foreground',
                                    )}
                                  >
                                    {s.name}
                                  </button>
                                );
                              })}
                            </div>
                            <Separator className="mt-3" />
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Step 3 — Configure or Results */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                {results ? (
                  <>
                    <Label className="text-sm font-medium">Creation Results</Label>
                    <ScrollArea className="h-72 border rounded-lg">
                      <div className="p-3 space-y-1.5">
                        {results.map((r) => (
                          <div
                            key={r.key}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                              r.success
                                ? 'bg-green-50 dark:bg-green-950/20'
                                : 'bg-red-50 dark:bg-red-950/20',
                            )}
                          >
                            {r.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                            )}
                            <span
                              className={
                                r.success
                                  ? 'text-green-700 dark:text-green-300'
                                  : 'text-red-600 dark:text-red-400'
                              }
                            >
                              {r.label}
                            </span>
                            {r.message && (
                              <span className="text-xs text-muted-foreground ml-auto">{r.message}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Configure role per section</Label>
                      <span className="text-xs text-muted-foreground">
                        Assigning to{' '}
                        <strong>
                          {selectedTeacher?.firstName} {selectedTeacher?.lastName}
                        </strong>
                      </span>
                    </div>
                    <ScrollArea className="h-72 border rounded-lg">
                      <div className="p-2">
                        <div className="grid grid-cols-[1fr_160px_auto] gap-2 px-2 pb-1.5 text-xs font-medium text-muted-foreground">
                          <span>Section</span>
                          <span>Subject (optional)</span>
                          <span className="text-center">Class Teacher</span>
                        </div>
                        <Separator className="mb-2" />
                        <div className="space-y-1.5">
                          {selections.map((row) => {
                            const classSubjects = subjectsByClass.get(row.classId) ?? [];
                            return (
                              <div
                                key={row.key}
                                className="grid grid-cols-[1fr_160px_auto] gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-muted/40"
                              >
                                <div className="text-sm min-w-0">
                                  <span className="font-medium">{row.className}</span>
                                  <span className="text-muted-foreground"> › {row.sectionName}</span>
                                </div>
                                <Select
                                  value={row.subjectId || NONE_SUBJECT_VALUE}
                                  onValueChange={(v) =>
                                    updateRow(row.key, {
                                      subjectId: v === NONE_SUBJECT_VALUE ? '' : v,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="None" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE_SUBJECT_VALUE}>None</SelectItem>
                                    {classSubjects.map((sub) => (
                                      <SelectItem key={sub.id} value={sub.id}>
                                        {sub.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <div className="flex items-center justify-center px-2">
                                  <Checkbox
                                    checked={row.isClassTeacher}
                                    onCheckedChange={(v) =>
                                      updateRow(row.key, { isClassTeacher: !!v })
                                    }
                                    className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </ScrollArea>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t gap-2">
            {results ? (
              <Button className="w-full" onClick={() => setWizardOpen(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (wizardStep === 1) setWizardOpen(false);
                    else setWizardStep((s) => (s - 1) as WizardStep);
                  }}
                  disabled={submitting}
                >
                  {wizardStep === 1 ? 'Cancel' : 'Back'}
                </Button>
                {wizardStep < 3 ? (
                  <Button
                    onClick={() => setWizardStep((s) => (s + 1) as WizardStep)}
                    disabled={
                      wizardStep === 1 ? !teacherId : wizardStep === 2 ? selections.length === 0 : false
                    }
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
                  >
                    {submitting
                      ? 'Assigning...'
                      : `Assign to ${selections.length} Section${selections.length !== 1 ? 's' : ''}`}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
