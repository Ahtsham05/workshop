import { useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Trash2, FilePen, CalendarDays, X, BookOpen } from 'lucide-react';
import {
  useGetExamsQuery,
  useCreateExamMutation,
  useUpdateExamMutation,
  useDeleteExamMutation,
  useGetSchoolClassesQuery,
  useGetSubjectsQuery,
} from '@/stores/school.api';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  upcoming: { label: 'Upcoming', color: 'bg-blue-100 text-blue-700' },
  ongoing: { label: 'Ongoing', color: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600' },
};

const TYPE_CONFIG: Record<string, string> = {
  monthly: 'Monthly', midterm: 'Midterm', final: 'Final',
  unit_test: 'Unit Test', assignment: 'Assignment', other: 'Other',
};

const TYPE_COLORS: Record<string, string> = {
  monthly: 'from-blue-500 to-indigo-600',
  midterm: 'from-violet-500 to-purple-600',
  final: 'from-rose-500 to-red-600',
  unit_test: 'from-amber-500 to-orange-500',
  assignment: 'from-teal-500 to-emerald-500',
  other: 'from-gray-500 to-slate-600',
};

interface SubjectRow {
  subjectId: string;
  totalMarks: string;
  passingMarks: string;
}

const EMPTY_FORM = {
  name: '',
  type: 'midterm',
  classId: '',
  startDate: '',
  endDate: '',
  status: 'upcoming',
};

export default function ExamManagement() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [classFilter, setClassFilter] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([]);
  const [addSubjectId, setAddSubjectId] = useState('');
  const [focusTotalIdx, setFocusTotalIdx] = useState<number | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data, isLoading } = useGetExamsQuery({ limit: 100, sortBy: 'startDate:desc' });
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: subjectsData } = useGetSubjectsQuery(
    { classId: form.classId, limit: 100, sortBy: 'name:asc' },
    { skip: !form.classId }
  );
  const [createExam] = useCreateExamMutation();
  const [updateExam] = useUpdateExamMutation();
  const [deleteExam] = useDeleteExamMutation();

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSubjectRows([]);
    setAddSubjectId('');
    setEditing(null);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (e: any) => {
    setEditing(e);
    setForm({
      name: e.name,
      type: e.type,
      classId: e.classId?._id || e.classId?.id || e.classId || '',
      startDate: e.startDate?.split('T')[0] || '',
      endDate: e.endDate?.split('T')[0] || '',
      status: e.status || 'upcoming',
    });
    const rows: SubjectRow[] = (e.subjects || []).map((s: any) => ({
      subjectId: s.subjectId?._id || s.subjectId?.id || s.subjectId || '',
      totalMarks: String(s.totalMarks ?? ''),
      passingMarks: String(s.passingMarks ?? ''),
    }));
    setSubjectRows(rows);
    setAddSubjectId('');
    setDialogOpen(true);
  };

  const usedSubjectIds = new Set(subjectRows.map((r) => r.subjectId));
  const availableSubjects = (subjectsData?.results || []).filter(
    (s: any) => !usedSubjectIds.has(s.id || s._id)
  );

  const addSubjectRow = useCallback((id?: string) => {
    const sid = id ?? addSubjectId;
    if (!sid) return;
    setSubjectRows((prev) => {
      setFocusTotalIdx(prev.length);
      return [...prev, { subjectId: sid, totalMarks: '', passingMarks: '' }];
    });
    setAddSubjectId('');
  }, [addSubjectId]);

  const removeSubjectRow = (idx: number) =>
    setSubjectRows((prev) => prev.filter((_, i) => i !== idx));

  const updateSubjectRow = (idx: number, field: 'totalMarks' | 'passingMarks', value: string) =>
    setSubjectRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  const totalMarksSum = subjectRows.reduce((s, r) => s + (Number(r.totalMarks) || 0), 0);
  const passingMarksSum = subjectRows.reduce((s, r) => s + (Number(r.passingMarks) || 0), 0);

  const subjectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (subjectsData?.results || []).forEach((s: any) => { map[s.id || s._id] = s.name; });
    return map;
  }, [subjectsData]);

  const isFormValid =
    !!form.name &&
    !!form.classId &&
    !!form.startDate &&
    subjectRows.length > 0 &&
    subjectRows.every((r) => r.totalMarks && Number(r.totalMarks) > 0 && r.passingMarks !== '');

  const handleSubmit = async () => {
    try {
      const body: any = {
        name: form.name,
        type: form.type,
        classId: form.classId,
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status,
        subjects: subjectRows.map((r) => ({
          subjectId: r.subjectId,
          totalMarks: Number(r.totalMarks),
          passingMarks: Number(r.passingMarks),
        })),
      };
      if (editing) {
        await updateExam({ id: editing.id || editing._id, ...body }).unwrap();
        toast.success('Exam updated');
      } else {
        await createExam(body).unwrap();
        toast.success('Exam created');
      }
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed');
    }
  };

  const filtered = useMemo(() => {
    const items = data?.results || [];
    if (classFilter === 'all') return items;
    return items.filter((e: any) => {
      const cId = e.classId?._id || e.classId?.id || e.classId;
      return cId === classFilter;
    });
  }, [data, classFilter]);

  // Group by status order: ongoing, upcoming, completed, cancelled
  const grouped = useMemo(() => {
    const order = ['ongoing', 'upcoming', 'completed', 'cancelled'];
    const map: Record<string, any[]> = {};
    filtered.forEach((e: any) => {
      const s = e.status || 'upcoming';
      if (!map[s]) map[s] = [];
      map[s].push(e);
    });
    return order.filter(s => map[s]?.length).map(s => ({ status: s, exams: map[s] }));
  }, [filtered]);

  return (
    <div className="h-full w-full p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exams</h1>
          <p className="text-muted-foreground">{data?.results?.length || 0} examinations</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Exam
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classesData?.results?.map((c: any) => (
              <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FilePen className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">No exams found</h3>
          <Button className="mt-4" onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Create First Exam</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ status, exams }) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={`${STATUS_CONFIG[status]?.color} text-sm`}>{STATUS_CONFIG[status]?.label}</Badge>
                <span className="text-sm text-muted-foreground">— {exams.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {exams.map((e: any) => (
                  <Card key={e.id || e._id} className="group overflow-hidden hover:shadow-md transition-shadow">
                    <div className={`h-2 bg-gradient-to-r ${TYPE_COLORS[e.type] || TYPE_COLORS.other}`} />
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm leading-tight">{e.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs h-5">{TYPE_CONFIG[e.type] || e.type}</Badge>
                            {e.classId?.name && <span className="text-xs text-muted-foreground">{e.classId.name}</span>}
                          </div>
                        </div>
                        <div className="hidden group-hover:flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{e.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>All associated marks will be affected.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive" onClick={() => deleteExam(e.id || e._id).unwrap().then(() => toast.success('Deleted')).catch(() => toast.error('Failed'))}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        <span>
                          {new Date(e.startDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                          {e.endDate && e.endDate !== e.startDate && ` — ${new Date(e.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </span>
                      </div>
                      {e.subjects?.length > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <BookOpen className="h-3 w-3" />
                            <span>{e.subjects.length} subjects — Total: <span className="font-medium text-foreground">{e.totalMarks}</span></span>
                          </div>
                          {e.subjects.slice(0, 3).map((sub: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate max-w-[120px]">{sub.subjectId?.name || `Subject ${idx + 1}`}</span>
                              <span className="text-muted-foreground shrink-0">{sub.passingMarks}/{sub.totalMarks}</span>
                            </div>
                          ))}
                          {e.subjects.length > 3 && (
                            <p className="text-xs text-muted-foreground">+{e.subjects.length - 3} more</p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Total: <span className="font-medium text-foreground">{e.totalMarks}</span></span>
                          {e.totalMarks > 0 && (
                            <span className="text-muted-foreground">Pass: <span className="font-medium text-foreground">{e.passingMarks}</span> ({Math.round((e.passingMarks / e.totalMarks) * 100)}%)</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit — ${editing.name}` : 'Create Exam'}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-5 py-2">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Exam Name <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} placeholder="e.g. Mid-Term Examination" autoFocus />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm(p => ({...p, type: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_CONFIG).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Class <span className="text-destructive">*</span></Label>
                  <Select value={form.classId} onValueChange={(v) => { setForm(p => ({...p, classId: v})); setSubjectRows([]); setAddSubjectId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>{classesData?.results?.map((c: any) => <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm(p => ({...p, startDate: e.target.value}))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm(p => ({...p, endDate: e.target.value}))} min={form.startDate} />
                </div>
                {editing && (
                  <div className="col-span-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm(p => ({...p, status: v}))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">Upcoming</SelectItem>
                        <SelectItem value="ongoing">Ongoing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Per-subject marks */}
              {form.classId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Subjects &amp; Marks <span className="text-destructive">*</span></Label>
                    {subjectRows.length > 0 && (
                      <span className="text-xs text-muted-foreground">Total: {totalMarksSum} | Pass: {passingMarksSum}</span>
                    )}
                  </div>

                  {/* Subject picker — selecting auto-adds the row */}
                  <div className="flex gap-2" data-subject-select>
                    <Select value={addSubjectId} onValueChange={(v) => addSubjectRow(v)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a subject to add…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSubjects.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            {subjectsData ? 'All subjects added' : 'Loading…'}
                          </SelectItem>
                        ) : (
                          availableSubjects.map((s: any) => (
                            <SelectItem key={s.id || s._id} value={s.id || s._id}>
                              {s.name}{s.code ? ` (${s.code})` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Subject rows */}
                  {subjectRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">
                      No subjects added yet. Select a subject above — it will be added instantly.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_100px_100px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                        <span>Subject</span><span>Total Marks</span><span>Pass Marks</span><span />
                      </div>
                      {subjectRows.map((row, idx) => {
                        const subName = subjectNameMap[row.subjectId] ||
                          (subjectsData?.results || []).find((s: any) => (s.id || s._id) === row.subjectId)?.name ||
                          row.subjectId;
                        return (
                          <div key={row.subjectId} className="grid grid-cols-[1fr_100px_100px_32px] gap-2 items-center">
                            <span className="text-sm font-medium truncate" title={subName}>{subName}</span>
                            <Input
                              type="number" min={1} placeholder="e.g. 100"
                              value={row.totalMarks}
                              ref={(el) => {
                                inputRefs.current[`total-${idx}`] = el;
                                if (focusTotalIdx === idx && el) { el.focus(); setFocusTotalIdx(null); }
                              }}
                              onChange={(e) => updateSubjectRow(idx, 'totalMarks', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); inputRefs.current[`pass-${idx}`]?.focus(); }
                              }}
                              className="h-8 text-sm"
                            />
                            <Input
                              type="number" min={0} max={Number(row.totalMarks) || undefined} placeholder="e.g. 40"
                              value={row.passingMarks}
                              ref={(el) => { inputRefs.current[`pass-${idx}`] = el; }}
                              onChange={(e) => updateSubjectRow(idx, 'passingMarks', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const nextTotal = inputRefs.current[`total-${idx + 1}`];
                                  if (nextTotal) nextTotal.focus();
                                  else (document.querySelector('[data-subject-select] button') as HTMLButtonElement)?.click();
                                }
                              }}
                              className="h-8 text-sm"
                            />
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeSubjectRow(idx)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!isFormValid}>{editing ? 'Save Changes' : 'Create Exam'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
