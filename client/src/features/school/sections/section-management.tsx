import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, LayoutList, Users, Wand2, X, CheckCircle2, Loader2, LayoutGrid } from 'lucide-react';
import { useGetSectionsQuery, useCreateSectionMutation, useUpdateSectionMutation, useDeleteSectionMutation, useGetSchoolClassesQuery } from '@/stores/school.api';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// ── Quick pattern presets ────────────────────────────────────────────────────
const PRESETS = [
  { label: 'A – C', names: ['A', 'B', 'C'] },
  { label: 'A – F', names: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { label: '1 – 3', names: ['1', '2', '3'] },
  { label: 'Morning / Evening', names: ['Morning', 'Evening'] },
  { label: 'Blue / Green / Red', names: ['Blue', 'Green', 'Red'] },
];

// ── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ s, onEdit, onDelete }: { s: any; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group relative border rounded-xl p-4 bg-card hover:border-primary hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-primary font-bold text-lg">{s.name?.charAt(0)?.toUpperCase()}</span>
        </div>
        <Badge
          variant={s.isActive !== false ? 'default' : 'secondary'}
          className="text-[10px] h-5 shrink-0"
        >
          {s.isActive !== false ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <p className="font-semibold text-base">Section {s.name}</p>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
        <Users className="h-3 w-3" />
        <span>Capacity: {s.capacity || 40}</span>
      </div>
      {/* Hover actions */}
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Section {s.name}?</AlertDialogTitle>
              <AlertDialogDescription>Students in this section will lose their section assignment.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive" onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SectionManagement() {
  // Dialog modes: 'bulk' | 'edit' | null
  const [dialogMode, setDialogMode] = useState<'bulk' | 'edit' | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [classFilter, setClassFilter] = useState('all');

  // Bulk-add state
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkCapacity, setBulkCapacity] = useState('40');
  const [sectionNames, setSectionNames] = useState<string[]>(['A', 'B', 'C']);
  const [customName, setCustomName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState<{ name: string; ok: boolean }[]>([]);

  // Edit state
  const [editForm, setEditForm] = useState({ name: '', classId: '', capacity: '40' });

  const { data, isLoading } = useGetSectionsQuery({ limit: 200 });
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const [createSection] = useCreateSectionMutation();
  const [updateSection] = useUpdateSectionMutation();
  const [deleteSection] = useDeleteSectionMutation();

  const classes: any[] = (classesData as any)?.results || [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openBulk = () => {
    setBulkClassId('');
    setBulkCapacity('40');
    setSectionNames(['A', 'B', 'C']);
    setCustomName('');
    setSubmitResults([]);
    setDialogMode('bulk');
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setEditForm({
      name: s.name,
      classId: s.classId?._id || s.classId?.id || s.classId || '',
      capacity: String(s.capacity || 40),
    });
    setDialogMode('edit');
  };

  const applyPreset = (names: string[]) => setSectionNames(names);

  const addCustomName = () => {
    const trimmed = customName.trim();
    if (!trimmed || sectionNames.includes(trimmed)) return;
    setSectionNames((prev) => [...prev, trimmed]);
    setCustomName('');
  };

  const removeName = (name: string) => setSectionNames((prev) => prev.filter((n) => n !== name));

  const handleBulkSubmit = async () => {
    if (!bulkClassId || sectionNames.length === 0) return;
    setIsSubmitting(true);
    const results: { name: string; ok: boolean }[] = [];
    for (const name of sectionNames) {
      try {
        await createSection({ name, classId: bulkClassId, capacity: Number(bulkCapacity) || 40 }).unwrap();
        results.push({ name, ok: true });
      } catch {
        results.push({ name, ok: false });
      }
    }
    setSubmitResults(results);
    setIsSubmitting(false);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    if (fail === 0) toast.success(`${ok} section${ok !== 1 ? 's' : ''} created`);
    else toast.warning(`${ok} created, ${fail} failed`);
    if (ok > 0) setDialogMode(null);
  };

  const handleEditSubmit = async () => {
    if (!editForm.name || !editForm.classId) return;
    try {
      await updateSection({
        id: editing.id || editing._id,
        name: editForm.name,
        classId: editForm.classId,
        capacity: Number(editForm.capacity) || 40,
      }).unwrap();
      toast.success(`Section ${editForm.name} updated`);
      setDialogMode(null);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Update failed');
    }
  };

  // ── Grouped view ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const sections: any[] = (data as any)?.results || [];
    const filtered = classFilter !== 'all'
      ? sections.filter((s) => (s.classId?._id || s.classId?.id || s.classId) === classFilter)
      : sections;
    const map: Record<string, { className: string; sections: any[] }> = {};
    filtered.forEach((s) => {
      const cId = s.classId?._id || s.classId?.id || s.classId || 'unknown';
      const cName = s.classId?.name || 'Unknown Class';
      if (!map[cId]) map[cId] = { className: cName, sections: [] };
      map[cId].sections.push(s);
    });
    return Object.entries(map);
  }, [data, classFilter]);

  const totalSections = (data as any)?.results?.length || 0;

  return (
    <div className="h-full w-full p-4 md:p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sections</h1>
          <p className="text-muted-foreground text-sm">
            {totalSections} section{totalSections !== 1 ? 's' : ''} across all classes
          </p>
        </div>
        <Button onClick={openBulk} className="gap-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white border-0">
          <Wand2 className="h-4 w-4" />
          Quick Add Sections
        </Button>
      </div>

      {/* ── Filter bar ── */}
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
          {[1, 2].map((i) => <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <LayoutList className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <h3 className="text-lg font-semibold">No sections yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Add sections to organise students by class group
          </p>
          <Button onClick={openBulk} className="gap-2">
            <Plus className="h-4 w-4" /> Add First Sections
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([classId, { className, sections }]) => (
            <Card key={classId} className="overflow-hidden">
              <CardHeader className="py-4 px-5 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base font-semibold">{className}</CardTitle>
                  </div>
                  <Badge variant="secondary">
                    {sections.length} section{sections.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {sections.map((s: any) => (
                    <SectionCard
                      key={s.id || s._id}
                      s={s}
                      onEdit={() => openEdit(s)}
                      onDelete={() =>
                        deleteSection(s.id || s._id)
                          .unwrap()
                          .then(() => toast.success('Section deleted'))
                          .catch(() => toast.error('Delete failed'))
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ────────────────────── BULK ADD DIALOG ────────────────────────────── */}
      <Dialog open={dialogMode === 'bulk'} onOpenChange={(v) => !v && setDialogMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-indigo-500" />
              Quick Add Sections
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Pick a class, choose a pattern or type custom names, and create all sections at once.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Class selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Class <span className="text-destructive">*</span>
              </Label>
              <Select value={bulkClassId} onValueChange={setBulkClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c: any) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick presets */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Quick Patterns</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.names)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                      JSON.stringify(sectionNames) === JSON.stringify(p.names)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary hover:text-primary bg-background',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section name tags */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Sections to create{' '}
                <span className="text-muted-foreground font-normal">({sectionNames.length})</span>
              </Label>
              <div className="flex flex-wrap gap-2 min-h-[40px] p-3 border rounded-lg bg-muted/20">
                {sectionNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md px-2.5 py-0.5 text-sm font-semibold"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeName(name)}
                      className="text-indigo-400 hover:text-indigo-700 -mr-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {sectionNames.length === 0 && (
                  <span className="text-xs text-muted-foreground/60">No sections — add from pattern or type below</span>
                )}
              </div>
              {/* Custom name input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Custom name e.g. Red, Noon…"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomName(); } }}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={addCustomName}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Capacity */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Default Student Capacity</Label>
              <Input
                type="number"
                min="1"
                max="200"
                value={bulkCapacity}
                onChange={(e) => setBulkCapacity(e.target.value)}
                className="h-9 w-28"
              />
            </div>

            {/* Results preview after submit */}
            {submitResults.length > 0 && (
              <div className="rounded-lg border p-3 space-y-1.5 max-h-32 overflow-y-auto">
                {submitResults.map((r) => (
                  <div key={r.name} className={cn('flex items-center gap-2 text-xs', r.ok ? 'text-emerald-700' : 'text-destructive')}>
                    {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                    Section {r.name} — {r.ok ? 'Created' : 'Failed (already exists?)'}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              {sectionNames.length} section{sectionNames.length !== 1 ? 's' : ''} will be created
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
              <Button
                onClick={handleBulkSubmit}
                disabled={!bulkClassId || sectionNames.length === 0 || isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isSubmitting ? 'Creating…' : `Create ${sectionNames.length} Section${sectionNames.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────── EDIT DIALOG ─────────────────────────────── */}
      <Dialog open={dialogMode === 'edit'} onOpenChange={(v) => !v && setDialogMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
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
              <Label>Section Name <span className="text-destructive">*</span></Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. A, Blue, Morning"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Student Capacity</Label>
              <Input
                type="number"
                min="1"
                max="200"
                value={editForm.capacity}
                onChange={(e) => setEditForm((p) => ({ ...p, capacity: e.target.value }))}
              />
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
