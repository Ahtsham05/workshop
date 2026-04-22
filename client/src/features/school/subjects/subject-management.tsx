// import { useState, useMemo } from 'react';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { Badge } from '@/components/ui/badge';
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
// import { Plus, Pencil, Trash2, BookMarked } from 'lucide-react';
// import { useGetSubjectsQuery, useCreateSubjectMutation, useUpdateSubjectMutation, useDeleteSubjectMutation, useGetSchoolClassesQuery } from '@/stores/school.api';
// import { toast } from 'sonner';
// import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, BookMarked, Wand2, X, CheckCircle2, Loader2, GripVertical, BookOpen } from 'lucide-react';
import { useGetSubjectsQuery, useCreateSubjectMutation, useUpdateSubjectMutation, useDeleteSubjectMutation, useGetSchoolClassesQuery } from '@/stores/school.api';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  compulsory: { label: 'Compulsory', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  elective:   { label: 'Elective',   bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  optional:   { label: 'Optional',   bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200' },
};

const SUBJECT_LIBRARY = [
  { name: 'Mathematics',        code: 'MTH', type: 'compulsory' },
  { name: 'English',            code: 'ENG', type: 'compulsory' },
  { name: 'Urdu',               code: 'URD', type: 'compulsory' },
  { name: 'Science',            code: 'SCI', type: 'compulsory' },
  { name: 'Social Studies',     code: 'SST', type: 'compulsory' },
  { name: 'Islamiyat',          code: 'ISL', type: 'compulsory' },
  { name: 'Computer Science',   code: 'CS',  type: 'compulsory' },
  { name: 'Physics',            code: 'PHY', type: 'compulsory' },
  { name: 'Chemistry',          code: 'CHE', type: 'compulsory' },
  { name: 'Biology',            code: 'BIO', type: 'compulsory' },
  { name: 'Art & Drawing',      code: 'ART', type: 'elective' },
  { name: 'Physical Education', code: 'PE',  type: 'elective' },
  { name: 'General Knowledge',  code: 'GK',  type: 'optional' },
  { name: 'Moral Education',    code: 'ME',  type: 'optional' },
  { name: 'Arabic',             code: 'ARB', type: 'optional' },
];

interface BulkSubject {
  name: string;
  code: string;
  type: string;
}

// ── Bulk row for editing ──────────────────────────────────────────────────────
function BulkRow({
  subject,
  onChange,
  onRemove,
}: {
  subject: BulkSubject;
  onChange: (patch: Partial<BulkSubject>) => void;
  onRemove: () => void;
}) {
  const handleNameChange = (name: string) => {
    const patch: Partial<BulkSubject> = { name };
    // Auto-generate code from name if code is empty or was auto-generated
    if (!subject.code || subject.code === subject.name.slice(0, 3).toUpperCase()) {
      patch.code = name.slice(0, 3).toUpperCase();
    }
    onChange(patch);
  };

  return (
    <div className="flex items-center gap-2 group">
      <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
      <Input
        value={subject.name}
        onChange={(e) => handleNameChange(e.target.value)}
        placeholder="Subject name"
        className="h-8 text-sm min-w-[130px] flex-[2]"
      />
      <Input
        value={subject.code}
        onChange={(e) => onChange({ code: e.target.value.toUpperCase() })}
        placeholder="Code"
        className="h-8 text-sm w-[70px] shrink-0 font-mono uppercase"
        maxLength={6}
      />
      <Select value={subject.type} onValueChange={(v) => onChange({ type: v })}>
        <SelectTrigger className="h-8 text-xs w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="compulsory" className="text-xs">Compulsory</SelectItem>
          <SelectItem value="elective" className="text-xs">Elective</SelectItem>
          <SelectItem value="optional" className="text-xs">Optional</SelectItem>
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SubjectManagement() {
  // Dialog mode: 'bulk' | 'edit' | null
  const [dialogMode, setDialogMode] = useState<'bulk' | 'edit' | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [classFilter, setClassFilter] = useState('all');

  // Bulk mode
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkSubject[]>([
    { name: '', code: '', type: 'compulsory' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState<{ name: string; ok: boolean }[]>([]);

  // Edit mode
  const [editForm, setEditForm] = useState({ name: '', code: '', classId: '', type: 'compulsory' });

  const { data, isLoading } = useGetSubjectsQuery({ limit: 500 });
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const [createSubject] = useCreateSubjectMutation();
  const [updateSubject] = useUpdateSubjectMutation();
  const [deleteSubject] = useDeleteSubjectMutation();

  const classes: any[] = (classesData as any)?.results || [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openBulk = () => {
    setBulkClassId('');
    setBulkRows([{ name: '', code: '', type: 'compulsory' }]);
    setSubmitResults([]);
    setDialogMode('bulk');
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setEditForm({
      name: s.name,
      code: s.code || '',
      classId: s.classId?._id || s.classId?.id || s.classId || '',
      type: s.type || 'compulsory',
    });
    setDialogMode('edit');
  };

  const addLibrarySubject = (s: typeof SUBJECT_LIBRARY[0]) => {
    if (bulkRows.some((r) => r.name === s.name)) return;
    setBulkRows((prev) => {
      // Replace the last empty row or append
      const empIdx = prev.reduce((last, r, i) => (!r.name.trim() ? i : last), -1);
      if (empIdx >= 0) {
        const copy = [...prev];
        copy[empIdx] = { name: s.name, code: s.code, type: s.type };
        return copy;
      }
      return [...prev, { name: s.name, code: s.code, type: s.type }];
    });
  };

  const updateRow = (idx: number, patch: Partial<BulkSubject>) => {
    setBulkRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setBulkRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEmptyRow = () => {
    setBulkRows((prev) => [...prev, { name: '', code: '', type: 'compulsory' }]);
  };

  const handleBulkSubmit = async () => {
    const valid = bulkRows.filter((r) => r.name.trim());
    if (!bulkClassId || valid.length === 0) return;
    setIsSubmitting(true);
    setSubmitResults([]);
    const results: { name: string; ok: boolean }[] = [];
    for (const row of valid) {
      try {
        await createSubject({
          name: row.name.trim(),
          code: row.code.trim() || row.name.slice(0, 3).toUpperCase(),
          classId: bulkClassId,
          type: row.type,
        }).unwrap();
        results.push({ name: row.name, ok: true });
      } catch {
        results.push({ name: row.name, ok: false });
      }
    }
    setSubmitResults(results);
    setIsSubmitting(false);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    if (fail === 0) {
      toast.success(`${ok} subject${ok !== 1 ? 's' : ''} created`);
      setDialogMode(null);
    } else if (ok > 0) {
      toast.warning(`${ok} created, ${fail} failed (duplicate or error)`);
      // Remove successfully created rows, keep failed ones
      const failedNames = new Set(results.filter((r) => !r.ok).map((r) => r.name));
      setBulkRows((prev) => prev.filter((r) => failedNames.has(r.name)));
    } else {
      toast.error(`All ${fail} subject${fail !== 1 ? 's' : ''} failed — may already exist for this class`);
    }
  };

  const handleEditSubmit = async () => {
    try {
      await updateSubject({
        id: editing.id || editing._id,
        name: editForm.name,
        code: editForm.code || editForm.name.slice(0, 3).toUpperCase(),
        classId: editForm.classId,
        type: editForm.type,
      }).unwrap();
      toast.success(`"${editForm.name}" updated`);
      setDialogMode(null);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Update failed');
    }
  };

  // ── Grouped view ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const subjects: any[] = (data as any)?.results || [];
    const filtered = classFilter !== 'all'
      ? subjects.filter((s) => (s.classId?._id || s.classId?.id || s.classId) === classFilter)
      : subjects;
    const map: Record<string, { className: string; subjects: any[] }> = {};
    filtered.forEach((s) => {
      const cId = s.classId?._id || s.classId?.id || s.classId || 'unknown';
      const cName = s.classId?.name || 'Unknown Class';
      if (!map[cId]) map[cId] = { className: cName, subjects: [] };
      map[cId].subjects.push(s);
    });
    return Object.entries(map);
  }, [data, classFilter]);

  const totalSubjects = (data as any)?.results?.length || 0;

  return (
    <div className="h-full w-full p-4 md:p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subjects</h1>
          <p className="text-muted-foreground text-sm">
            {totalSubjects} subject{totalSubjects !== 1 ? 's' : ''} configured
          </p>
        </div>
        <Button
          onClick={openBulk}
          className="gap-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white border-0"
        >
          <Wand2 className="h-4 w-4" />
          Quick Add Subjects
        </Button>
      </div>

      {/* ── Filter ── */}
      <div className="flex gap-3 items-center flex-wrap">
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c: any) => (
              <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {classFilter !== 'all' && (
          <Button variant="ghost" size="sm" onClick={() => setClassFilter('all')} className="text-muted-foreground">
            <X className="h-3.5 w-3.5 mr-1" /> Clear filter
          </Button>
        )}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookMarked className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <h3 className="text-lg font-semibold">No subjects yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Add subjects for each class to enable timetables and grade books</p>
          <Button onClick={openBulk} className="gap-2">
            <Plus className="h-4 w-4" /> Add Subjects
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([classId, { className, subjects }]) => (
            <Card key={classId} className="overflow-hidden">
              <CardHeader className="py-4 px-5 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base font-semibold">{className}</CardTitle>
                  </div>
                  <Badge variant="secondary">
                    {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {subjects.map((s: any) => {
                    const cfg = TYPE_CONFIG[s.type] || TYPE_CONFIG.compulsory;
                    return (
                      <div
                        key={s.id || s._id}
                        className="group relative flex items-center gap-3 border rounded-xl p-3 hover:border-primary hover:shadow-md bg-card transition-all"
                      >
                        <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border', cfg.bg, cfg.border)}>
                          <span className={cn('font-bold text-sm', cfg.text)}>
                            {(s.code || s.name.slice(0, 3)).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{s.name}</p>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] h-4 mt-0.5 border px-1.5', cfg.bg, cfg.text, cfg.border)}
                          >
                            {cfg.label}
                          </Badge>
                        </div>
                        {/* Hover actions */}
                        <div className="absolute top-1.5 right-1 hidden group-hover:flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(s)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{s.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Exam marks and timetable slots for this subject will also be affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive"
                                  onClick={() =>
                                    deleteSubject(s.id || s._id).unwrap()
                                      .then(() => toast.success('Deleted'))
                                      .catch(() => toast.error('Failed'))
                                  }
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─────────────────────── BULK ADD DIALOG ──────────────────────────── */}
      <Dialog open={dialogMode === 'bulk'} onOpenChange={(v) => !v && setDialogMode(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-indigo-500" />
              <h2 className="text-base font-bold">Quick Add Subjects</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick from the library or type custom subjects — then assign to a class in one click.
            </p>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: library */}
            <div className="w-52 shrink-0 border-r overflow-y-auto p-3 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
                Subject Library
              </p>
              {SUBJECT_LIBRARY.map((s) => {
                const already = bulkRows.some((r) => r.name === s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    disabled={already}
                    onClick={() => addLibrarySubject(s)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2',
                      already
                        ? 'bg-muted/40 text-muted-foreground/40 cursor-default'
                        : 'hover:bg-primary/5 hover:text-primary cursor-pointer',
                      TYPE_CONFIG[s.type]?.text,
                    )}
                  >
                    <span className={cn('inline-block w-8 text-[10px] font-bold rounded px-1 py-0 border shrink-0', TYPE_CONFIG[s.type]?.bg, TYPE_CONFIG[s.type]?.border)}>
                      {s.code}
                    </span>
                    <span className="truncate">{s.name}</span>
                    {already && <CheckCircle2 className="h-3 w-3 ml-auto shrink-0 text-emerald-500" />}
                  </button>
                );
              })}
            </div>

            {/* Right: editable rows */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Column labels */}
              <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="w-4 shrink-0" /> {/* GripVertical spacer */}
                <span className="min-w-[130px] flex-[2]">Name</span>
                <span className="w-[70px] shrink-0">Code</span>
                <span className="w-[110px] shrink-0">Type</span>
                <span className="w-4 shrink-0" />
              </div>
              {bulkRows.map((row, idx) => (
                <BulkRow
                  key={idx}
                  subject={row}
                  onChange={(patch) => updateRow(idx, patch)}
                  onRemove={() => removeRow(idx)}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs gap-1.5 border-dashed"
                onClick={addEmptyRow}
              >
                <Plus className="h-3.5 w-3.5" /> Add custom subject
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 shrink-0 bg-muted/20 space-y-3">
            {/* Class selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <Label className="text-xs font-semibold whitespace-nowrap">
                Assign to Class <span className="text-destructive">*</span>
              </Label>
              <Select value={bulkClassId} onValueChange={setBulkClassId}>
                <SelectTrigger className="w-48 h-8">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c: any) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {bulkRows.filter((r) => r.name.trim()).length} subject
                {bulkRows.filter((r) => r.name.trim()).length !== 1 ? 's' : ''} ready
              </span>
            </div>

            {/* Results */}
            {submitResults.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {submitResults.map((r) => (
                  <span
                    key={r.name}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border',
                      r.ok
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200',
                    )}
                  >
                    {r.ok ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {r.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogMode(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBulkSubmit}
                disabled={!bulkClassId || bulkRows.filter((r) => r.name.trim()).length === 0 || isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isSubmitting ? 'Creating…' : 'Create All Subjects'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────── EDIT DIALOG ─────────────────────────────── */}
      <Dialog open={dialogMode === 'edit'} onOpenChange={(v) => !v && setDialogMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Class <span className="text-destructive">*</span></Label>
              <Select value={editForm.classId} onValueChange={(v) => setEditForm((p) => ({ ...p, classId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c: any) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject Name <span className="text-destructive">*</span></Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  value={editForm.code}
                  onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  maxLength={6}
                  className="uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm((p) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compulsory">Compulsory</SelectItem>
                    <SelectItem value="elective">Elective</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button onClick={handleEditSubmit} disabled={!editForm.name || !editForm.classId}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
