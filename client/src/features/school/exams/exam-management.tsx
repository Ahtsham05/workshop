import { useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Trash2, FilePen, CalendarDays, X, BookOpen, ClipboardList, ChevronLeft, GraduationCap, Layers, Printer, Receipt, Loader2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
  useGetExamsQuery,
  useCreateExamMutation,
  useUpdateExamMutation,
  useDeleteExamMutation,
  useBulkUpdateExamsMutation,
  useBulkDeleteExamsMutation,
  useBulkGenerateExamFeeVouchersMutation,
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

interface SubjectRow {
  subjectId: string;
  totalMarks: string;
  passingMarks: string;
}

const EMPTY_FORM = {
  name: '',
  classIds: [] as string[],
  startDate: '',
  endDate: '',
  examFeeAmount: '',
  feeDueDate: '',
  status: 'upcoming',
};

const EMPTY_BULK_FORM = {
  name: '',
  startDate: '',
  endDate: '',
  status: '',
};

const getExamId = (e: any) => e.id || e._id;

export default function ExamManagement() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedViewClass, setSelectedViewClass] = useState<string | null>(null);
  const [rootView, setRootView] = useState<'classes' | 'groups'>('classes');
  const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());
  const [bulkForm, setBulkForm] = useState(EMPTY_BULK_FORM);
  const [form, setForm] = useState(EMPTY_FORM);
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([]);
  const [addSubjectId, setAddSubjectId] = useState('');
  const [focusTotalIdx, setFocusTotalIdx] = useState<number | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data, isLoading } = useGetExamsQuery({ limit: 100, sortBy: 'startDate:desc' });
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const classes = classesData?.results || [];
  const selectedClassId = form.classIds.length === 1 ? form.classIds[0] : '';

  const { data: subjectsData } = useGetSubjectsQuery(
    { classId: selectedClassId, limit: 100, sortBy: 'name:asc' },
    { skip: !selectedClassId }
  );
  const [createExam] = useCreateExamMutation();
  const [updateExam] = useUpdateExamMutation();
  const [deleteExam] = useDeleteExamMutation();
  const [bulkUpdateExams, { isLoading: bulkUpdating }] = useBulkUpdateExamsMutation();
  const [bulkDeleteExams, { isLoading: bulkDeleting }] = useBulkDeleteExamsMutation();
  const [bulkGenerateExamFees, { isLoading: generatingFees }] = useBulkGenerateExamFeeVouchersMutation();

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSubjectRows([]);
    setAddSubjectId('');
    setEditing(null);
  };

  const clearSelection = () => setSelectedExamIds(new Set());

  const toggleExamSelection = (examId: string, checked: boolean) => {
    setSelectedExamIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(examId);
      else next.delete(examId);
      return next;
    });
  };

  const selectExamIds = (ids: string[], checked: boolean) => {
    setSelectedExamIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const openBulkEdit = (ids?: string[]) => {
    if (ids) setSelectedExamIds(new Set(ids));
    setBulkForm(EMPTY_BULK_FORM);
    setBulkEditOpen(true);
  };

  const handleBulkEdit = async () => {
    const ids = [...selectedExamIds];
    if (!ids.length) return;
    const payload: any = { ids };
    if (bulkForm.name.trim()) payload.name = bulkForm.name.trim();
    if (bulkForm.status) payload.status = bulkForm.status;
    if (bulkForm.startDate) payload.startDate = bulkForm.startDate;
    if (bulkForm.endDate) payload.endDate = bulkForm.endDate;
    if (Object.keys(payload).length === 1) {
      toast.error('Change at least one field to update');
      return;
    }
    try {
      const result = await bulkUpdateExams(payload).unwrap();
      toast.success(`${result.updated ?? ids.length} exams updated`);
      setBulkEditOpen(false);
      setBulkForm(EMPTY_BULK_FORM);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Bulk update failed');
    }
  };

  const formatExamDeleteMessage = (result: any, examCount = 1) => {
    const parts = [`${result?.deleted ?? examCount} exam${examCount === 1 ? '' : 's'} deleted`];
    if (result?.deletedMarks) parts.push(`${result.deletedMarks} marks`);
    if (result?.deletedVouchers) parts.push(`${result.deletedVouchers} exam fee voucher${result.deletedVouchers === 1 ? '' : 's'}`);
    return parts.join(' · ');
  };

  const handleDeleteExam = async (exam: any) => {
    try {
      const result = await deleteExam(exam.id || exam._id).unwrap();
      toast.success(formatExamDeleteMessage(result));
    } catch {
      toast.error('Failed to delete exam');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedExamIds];
    if (!ids.length) return;
    try {
      const result = await bulkDeleteExams({ ids }).unwrap();
      toast.success(formatExamDeleteMessage(result, result.deleted ?? ids.length));
      setBulkDeleteOpen(false);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Bulk delete failed');
    }
  };

  const openAdd = () => {
    setEditing(null);
    setSubjectRows([]);
    setAddSubjectId('');
    setForm(selectedViewClass ? { ...EMPTY_FORM, classIds: [selectedViewClass] } : EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (e: any) => {
    setEditing(e);
    setForm({
      name: e.name,
      classIds: [e.classId?._id || e.classId?.id || e.classId || ''].filter(Boolean),
      startDate: e.startDate?.split('T')[0] || '',
      endDate: e.endDate?.split('T')[0] || '',
      examFeeAmount: e.examFeeAmount ? String(e.examFeeAmount) : '',
      feeDueDate: e.feeDueDate?.split('T')[0] || '',
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

  const classNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c: any) => { map[c.id || c._id] = c.name; });
    return map;
  }, [classes]);

  const toggleClassSelection = (classId: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      classIds: checked
        ? prev.classIds.includes(classId) ? prev.classIds : [...prev.classIds, classId]
        : prev.classIds.filter((id) => id !== classId),
    }));
    setSubjectRows([]);
    setAddSubjectId('');
  };

  const selectAllClasses = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      classIds: checked ? classes.map((c: any) => c.id || c._id) : [],
    }));
    setSubjectRows([]);
    setAddSubjectId('');
  };

  const isFormValid =
    !!form.name &&
    form.classIds.length > 0 &&
    (subjectRows.length === 0 ||
      subjectRows.every((r) => r.totalMarks && Number(r.totalMarks) > 0 && r.passingMarks !== ''));

  const handleSubmit = async () => {
    try {
      const body: any = {
        name: form.name,
        status: form.status,
      };
      if (form.startDate) body.startDate = form.startDate;
      if (form.endDate) body.endDate = form.endDate;
      if (form.examFeeAmount !== '') body.examFeeAmount = Number(form.examFeeAmount) || 0;
      if (form.feeDueDate) body.feeDueDate = form.feeDueDate;
      if (subjectRows.length > 0) {
        body.subjects = subjectRows.map((r) => ({
          subjectId: r.subjectId,
          totalMarks: Number(r.totalMarks),
          passingMarks: Number(r.passingMarks),
        }));
      }
      if (editing) {
        await updateExam({ id: editing.id || editing._id, ...body, classId: form.classIds[0] }).unwrap();
        toast.success('Exam updated');
      } else if (form.classIds.length === 1) {
        await createExam({ ...body, classId: form.classIds[0] }).unwrap();
        toast.success('Exam created');
      } else {
        const result = await createExam({ ...body, classIds: form.classIds }).unwrap();
        toast.success(`${result.total ?? form.classIds.length} exams created`);
      }
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed');
    }
  };

  const formatExamFeeResult = (result: any) => {
    const parts = [`${result.created ?? 0} vouchers created`];
    if (result.skipped) parts.push(`${result.skipped} already exist`);
    if (result.excludedZeroFee) parts.push(`${result.excludedZeroFee} skipped (monthly fee is 0)`);
    return parts.join(', ');
  };

  const handleGenerateExamFees = async (exam: any) => {
    const examId = getExamId(exam);
    const amount = Number(exam.examFeeAmount) || 0;
    if (!amount) {
      toast.error('Set exam fee amount first (edit exam or add when creating)');
      openEdit(exam);
      return;
    }
    try {
      const result = await bulkGenerateExamFees({ examId, amount }).unwrap();
      if ((result.created ?? 0) === 0 && (result.skipped ?? 0) > 0) {
        toast.info(`All eligible students already have exam fee vouchers (${result.skipped} skipped)`);
      } else {
        toast.success(formatExamFeeResult(result));
      }
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to generate exam fee vouchers');
    }
  };

  const handleBulkGenerateExamFees = async (exams: any[]) => {
    const withFee = exams.filter((e) => Number(e.examFeeAmount) > 0);
    if (!withFee.length) {
      toast.error('No exam fee set on these exams. Edit and add Exam Fee (Rs.) first.');
      return;
    }
    let created = 0;
    let skipped = 0;
    let excludedZeroFee = 0;
    for (const exam of withFee) {
      try {
        const result = await bulkGenerateExamFees({
          examId: getExamId(exam),
          amount: Number(exam.examFeeAmount),
        }).unwrap();
        created += result.created ?? 0;
        skipped += result.skipped ?? 0;
        excludedZeroFee += result.excludedZeroFee ?? 0;
      } catch (err: any) {
        toast.error(`${exam.classId?.name || 'Class'}: ${err?.data?.message || 'Failed'}`);
      }
    }
    toast.success(formatExamFeeResult({ created, skipped, excludedZeroFee }));
  };

  const examsByClass = useMemo(() => {
    const map: Record<string, any[]> = {};
    (data?.results || []).forEach((e: any) => {
      const cId = e.classId?._id || e.classId?.id || e.classId;
      if (!cId) return;
      if (!map[cId]) map[cId] = [];
      map[cId].push(e);
    });
    return map;
  }, [data]);

  const classExamCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    classes.forEach((c: any) => {
      const id = c.id || c._id;
      counts[id] = examsByClass[id]?.length || 0;
    });
    return counts;
  }, [classes, examsByClass]);

  const examGroups = useMemo(() => {
    const map = new Map<string, { name: string; exams: any[] }>();
    (data?.results || []).forEach((e: any) => {
      const key = (e.name || '').trim().toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, { name: e.name, exams: [] });
      map.get(key)!.exams.push(e);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(() => {
    if (!selectedViewClass) return [];
    return examsByClass[selectedViewClass] || [];
  }, [selectedViewClass, examsByClass]);

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

  const selectedClassName = selectedViewClass ? classNameMap[selectedViewClass] : null;
  const totalExams = data?.results?.length || 0;
  const visibleExamIds = filtered.map(getExamId);
  const allVisibleSelected = visibleExamIds.length > 0 && visibleExamIds.every((id) => selectedExamIds.has(id));
  const selectionCount = selectedExamIds.size;

  const BulkToolbar = ({ className = '' }: { className?: string }) =>
    selectionCount > 0 ? (
      <div className={`flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/40 ${className}`}>
        <span className="text-sm font-medium">{selectionCount} selected</span>
        <Button size="sm" variant="outline" className="h-8" onClick={() => openBulkEdit()}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Bulk Edit
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive" onClick={() => setBulkDeleteOpen(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Bulk Delete
        </Button>
        <Button size="sm" variant="ghost" className="h-8 ml-auto" onClick={clearSelection}>Clear</Button>
      </div>
    ) : null;

  return (
    <div className="h-full w-full p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {selectedViewClass ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" onClick={() => { setSelectedViewClass(null); clearSelection(); }}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Classes
              </Button>
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight">
            {selectedViewClass ? selectedClassName : 'Exams'}
          </h1>
          <p className="text-muted-foreground">
            {selectedViewClass
              ? `${filtered.length} exam${filtered.length === 1 ? '' : 's'} in ${selectedClassName}`
              : `${classes.length} classes · ${totalExams} examinations total`}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Exam
        </Button>
      </div>

      {!selectedViewClass && (
        <div className="flex gap-2">
          <Button
            variant={rootView === 'classes' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setRootView('classes'); clearSelection(); }}
          >
            <GraduationCap className="h-4 w-4 mr-1.5" /> By Class
          </Button>
          <Button
            variant={rootView === 'groups' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setRootView('groups'); clearSelection(); }}
          >
            <Layers className="h-4 w-4 mr-1.5" /> By Exam Name
          </Button>
        </div>
      )}

      <BulkToolbar />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : !selectedViewClass ? (
        rootView === 'groups' ? (
          examGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Layers className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No exam groups yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Create exams to manage them in bulk by name.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {examGroups.map((group) => {
                const ids = group.exams.map(getExamId);
                const allSelected = ids.every((id) => selectedExamIds.has(id));
                const someSelected = ids.some((id) => selectedExamIds.has(id));
                return (
                  <Card key={group.name.toLowerCase()} className={`overflow-hidden ${someSelected ? 'ring-2 ring-primary/30' : ''}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) => selectExamIds(ids, !!checked)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{group.name}</p>
                          <p className="text-sm text-muted-foreground">{group.exams.length} classes</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {group.exams.slice(0, 6).map((e: any) => (
                          <Badge key={getExamId(e)} variant="secondary" className="text-[10px]">
                            {e.classId?.name || classNameMap[e.classId?._id || e.classId] || 'Class'}
                          </Badge>
                        ))}
                        {group.exams.length > 6 && (
                          <Badge variant="outline" className="text-[10px]">+{group.exams.length - 6}</Badge>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openBulkEdit(ids)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit All
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs"
                          disabled={generatingFees}
                          onClick={() => handleBulkGenerateExamFees(group.exams)}
                        >
                          {generatingFees ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating…</>
                          ) : (
                            <><Receipt className="h-3 w-3 mr-1" /> Exam Fees</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs text-destructive hover:text-destructive"
                          onClick={() => { selectExamIds(ids, true); setBulkDeleteOpen(true); }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete All
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <GraduationCap className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No classes found</h3>
            <p className="text-sm text-muted-foreground mt-1">Add classes first, then create exams for each class.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {classes.map((c: any) => {
              const id = c.id || c._id;
              const count = classExamCounts[id] || 0;
              return (
                <Card
                  key={id}
                  className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
                  onClick={() => { setSelectedViewClass(id); clearSelection(); }}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15">
                      <GraduationCap className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{c.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {count === 0 ? 'No exams yet' : `${count} exam${count === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FilePen className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">No exams in {selectedClassName}</h3>
          <Button className="mt-4" onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Create Exam</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={(checked) => selectExamIds(visibleExamIds, !!checked)}
              />
              Select all in {selectedClassName}
            </label>
          </div>
          <BulkToolbar />
        <div className="space-y-6">
          {grouped.map(({ status, exams }) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={`${STATUS_CONFIG[status]?.color} text-sm`}>{STATUS_CONFIG[status]?.label}</Badge>
                <span className="text-sm text-muted-foreground">— {exams.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {exams.map((e: any) => {
                  const examId = getExamId(e);
                  const isSelected = selectedExamIds.has(examId);
                  return (
                  <Card key={examId} className={`group overflow-hidden hover:shadow-md transition-shadow ${isSelected ? 'ring-2 ring-primary/40' : ''}`}>
                    <div className="h-2 bg-gradient-to-r from-primary/80 to-primary" />
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => toggleExamSelection(examId, !!checked)}
                            onClick={(ev) => ev.stopPropagation()}
                          />
                        <div>
                          <p className="font-semibold text-sm leading-tight">{e.name}</p>
                          <Badge variant="outline" className="text-[10px] h-5 mt-1">
                            {STATUS_CONFIG[e.status || 'upcoming']?.label || e.status}
                          </Badge>
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
                                <AlertDialogDescription>
                                  This permanently deletes the exam, all entered marks, and any exam fee vouchers linked to it. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive" onClick={() => handleDeleteExam(e)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        <span>
                          {e.startDate
                            ? new Date(e.startDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
                            : 'No start date'}
                          {e.endDate && e.startDate && e.endDate !== e.startDate && ` — ${new Date(e.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                          {e.endDate && !e.startDate && `Ends ${new Date(e.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`}
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
                        <p className="text-xs text-muted-foreground">No subjects configured — all class subjects will appear in marks entry</p>
                      )}
                      <div className="grid grid-cols-1 gap-2">
                        <Link
                          to="/school/marks"
                          search={{
                            examId: getExamId(e),
                            classId: selectedViewClass,
                          }}
                        >
                          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5">
                            <ClipboardList className="h-3.5 w-3.5" /> Enter Marks
                          </Button>
                        </Link>
                        <div className="grid grid-cols-2 gap-2">
                          <Link
                            to="/school/exams/roll-slips"
                            search={{
                              examId: getExamId(e),
                              classId: selectedViewClass || String(e.classId?._id || e.classId?.id || e.classId || ''),
                            }}
                          >
                            <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1">
                              <Printer className="h-3.5 w-3.5" /> Roll Slips
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            disabled={generatingFees}
                            onClick={() => handleGenerateExamFees(e)}
                          >
                            {generatingFees ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                            ) : (
                              <><Receipt className="h-3.5 w-3.5" /> Exam Fee</>
                            )}
                          </Button>
                        </div>
                        {(e.examFeeAmount > 0) && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            Exam fee: Rs. {Number(e.examFeeAmount).toLocaleString()} — appears in student ledger when voucher is generated
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
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
                <div className="col-span-2">
                  <Label>{editing ? 'Class' : 'Classes'} <span className="text-destructive">*</span></Label>
                  {editing ? (
                    <Select
                      value={form.classIds[0] || ''}
                      onValueChange={(v) => {
                        setForm((p) => ({ ...p, classIds: [v] }));
                        setSubjectRows([]);
                        setAddSubjectId('');
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map((c: any) => (
                          <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-md border">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={classes.length > 0 && form.classIds.length === classes.length}
                              onCheckedChange={(checked) => selectAllClasses(!!checked)}
                            />
                            <span className="text-sm font-medium">Select All</span>
                          </label>
                          <span className="text-xs text-muted-foreground">
                            {form.classIds.length} of {classes.length} selected
                          </span>
                        </div>
                        <ScrollArea className="h-44">
                          <div className="grid grid-cols-2 gap-1 p-2">
                            {classes.map((c: any) => {
                              const id = c.id || c._id;
                              const selected = form.classIds.includes(id);
                              return (
                                <label
                                  key={id}
                                  className={`flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/40 ${selected ? 'bg-muted/50' : ''}`}
                                >
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={(checked) => toggleClassSelection(id, !!checked)}
                                  />
                                  <span className="text-sm truncate">{c.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                      {form.classIds.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {form.classIds.map((id) => (
                            <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1">
                              {classNameMap[id] || id}
                              <button
                                type="button"
                                className="rounded-full hover:bg-muted p-0.5"
                                onClick={() => toggleClassSelection(id, false)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      {form.classIds.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          One exam will be created for each selected class. Enter marks from the Results page.
                        </p>
                      )}
                      {!editing && form.classIds.length <= 1 && (
                        <p className="text-xs text-muted-foreground">
                          Create the exam first, then use Enter Marks on the exam card to fill all subjects at once.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm(p => ({...p, startDate: e.target.value}))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm(p => ({...p, endDate: e.target.value}))} min={form.startDate || undefined} />
                </div>
                <div>
                  <Label>Exam Fee (Rs.)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.examFeeAmount}
                    onChange={(e) => setForm((p) => ({ ...p, examFeeAmount: e.target.value }))}
                    placeholder="e.g. 500"
                  />
                </div>
                <div>
                  <Label>Fee Due Date</Label>
                  <Input type="date" value={form.feeDueDate} onChange={(e) => setForm((p) => ({ ...p, feeDueDate: e.target.value }))} />
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

              {/* Subject config — edit only (optional) */}
              {editing && selectedClassId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Subjects &amp; Max Marks</Label>
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
            <Button onClick={handleSubmit} disabled={!isFormValid}>
              {editing ? 'Save Changes' : form.classIds.length > 1 ? `Create ${form.classIds.length} Exams` : 'Create Exam'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Edit — {selectionCount} exam{selectionCount === 1 ? '' : 's'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Only filled fields will be applied to all selected exams.</p>
          <div className="space-y-4 py-2">
            <div>
              <Label>Exam Name</Label>
              <Input
                value={bulkForm.name}
                onChange={(e) => setBulkForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Leave blank to keep current names"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={bulkForm.startDate} onChange={(e) => setBulkForm((p) => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={bulkForm.endDate} onChange={(e) => setBulkForm((p) => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={bulkForm.status || '__keep__'} onValueChange={(v) => setBulkForm((p) => ({ ...p, status: v === '__keep__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Keep current status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep__">Keep current status</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkEdit} disabled={bulkUpdating}>
              {bulkUpdating ? 'Updating…' : `Update ${selectionCount} Exams`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectionCount} exam{selectionCount === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all selected exams, their marks, and any linked exam fee vouchers. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting…' : `Delete ${selectionCount} Exams`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
