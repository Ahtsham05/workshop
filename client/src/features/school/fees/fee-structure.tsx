import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent as AlertDialogBody,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, Trash2, Copy, Search, Layers, GraduationCap, CheckCircle2, Wallet, X,
} from 'lucide-react';
import {
  useGetFeeStructuresQuery,
  useGetSchoolClassesQuery,
  useGetIncomeCategoriesQuery,
  useCreateFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDeleteFeeStructureMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';
import { useFormatMoney } from '@/lib/format-money';

type FeeItem = { name: string; amount: number | string; categoryId?: string };
type FormState = {
  classIds: string[];
  name: string;
  academicYear: string;
  frequency: 'monthly' | 'quarterly' | 'annually' | 'one-time';
  dueDay: number;
  isActive: boolean;
  feeItems: FeeItem[];
};

const emptyForm: FormState = {
  classIds: [],
  name: 'Standard Fee Structure',
  academicYear: '',
  frequency: 'monthly',
  dueDay: 10,
  isActive: true,
  feeItems: [{ name: 'Tuition Fee', amount: '', categoryId: '' }],
};

const FREQUENCY_CONFIG: Record<string, { label: string; badge: string }> = {
  monthly: { label: 'Monthly', badge: 'bg-sky-50 border-sky-200 text-sky-700' },
  quarterly: { label: 'Quarterly', badge: 'bg-violet-50 border-violet-200 text-violet-700' },
  annually: { label: 'Annually', badge: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  'one-time': { label: 'One-Time', badge: 'bg-slate-50 border-slate-200 text-slate-700' },
};

const id = (v: any): string => v?.id || v?._id || v || '';

export default function FeeStructures() {
  const formatMoney = useFormatMoney();
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: structuresData, isLoading } = useGetFeeStructuresQuery({ limit: 100 });
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: incomeCategories } = useGetIncomeCategoriesQuery(undefined);
  const [createStructure] = useCreateFeeStructureMutation();
  const [updateStructure] = useUpdateFeeStructureMutation();
  const [deleteStructure] = useDeleteFeeStructureMutation();

  const structures = structuresData?.results || [];
  const classes = classesData?.results || [];
  const categories: any[] = incomeCategories || [];

  const classNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c: any) => { map[id(c)] = c.name; });
    return map;
  }, [classes]);

  const categoryNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c: any) => { map[id(c)] = c.name; });
    return map;
  }, [categories]);

  // ---- KPIs (over the full unfiltered set) ----
  const totalStructures = structures.length;
  const activeCount = structures.filter((s: any) => s.isActive).length;
  const classesCovered = new Set(structures.map((s: any) => id(s.classId))).size;
  const monthlyRevenue = structures
    .filter((s: any) => s.isActive && s.frequency === 'monthly')
    .reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);

  // ---- Filtering ----
  const filteredStructures = useMemo(() => {
    const q = search.trim().toLowerCase();
    return structures.filter((s: any) => {
      const className = s.classId?.name || '';
      const matchesSearch = !q || s.name?.toLowerCase().includes(q) || className.toLowerCase().includes(q);
      const matchesClass = classFilter === 'all' || id(s.classId) === classFilter;
      const matchesFrequency = frequencyFilter === 'all' || s.frequency === frequencyFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? s.isActive : !s.isActive);
      return matchesSearch && matchesClass && matchesFrequency && matchesStatus;
    });
  }, [structures, search, classFilter, frequencyFilter, statusFilter]);

  const hasFilters = !!search || classFilter !== 'all' || frequencyFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setClassFilter('all'); setFrequencyFilter('all'); setStatusFilter('all'); };

  // ---- Dialog open helpers ----
  const openCreate = () => { setSelected(null); setForm({ ...emptyForm, feeItems: [{ ...emptyForm.feeItems[0] }] }); setDialog('create'); };

  const openEdit = (s: any) => {
    setSelected(s);
    setForm({
      classIds: [id(s.classId)],
      name: s.name,
      academicYear: s.academicYear || '',
      frequency: s.frequency,
      dueDay: s.dueDay,
      isActive: s.isActive ?? true,
      feeItems: s.feeItems?.map((fi: any) => ({
        name: fi.name,
        amount: fi.amount,
        categoryId: id(fi.categoryId),
      })) || [],
    });
    setDialog('edit');
  };

  const openDuplicate = (s: any) => {
    setSelected(null);
    setForm({
      classIds: [],
      name: s.name,
      academicYear: s.academicYear || '',
      frequency: s.frequency,
      dueDay: s.dueDay,
      isActive: true,
      feeItems: s.feeItems?.map((fi: any) => ({
        name: fi.name,
        amount: fi.amount,
        categoryId: id(fi.categoryId),
      })) || [{ name: '', amount: '', categoryId: '' }],
    });
    setDialog('create');
  };

  // ---- Class multi-select (create mode only) ----
  const toggleClassSelection = (classId: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      classIds: checked
        ? prev.classIds.includes(classId) ? prev.classIds : [...prev.classIds, classId]
        : prev.classIds.filter((cid) => cid !== classId),
    }));
  };
  const selectAllClasses = (checked: boolean) => {
    setForm((prev) => ({ ...prev, classIds: checked ? classes.map((c: any) => id(c)) : [] }));
  };

  // ---- Fee items ----
  const addItem = () => setForm((f) => ({ ...f, feeItems: [...f.feeItems, { name: '', amount: '', categoryId: '' }] }));
  const removeItem = (i: number) => setForm((f) => ({ ...f, feeItems: f.feeItems.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, field: string, value: any) => {
    setForm((f) => ({ ...f, feeItems: f.feeItems.map((fi, idx) => idx === i ? { ...fi, [field]: value } : fi) }));
  };
  const quickAddCategory = (cat: any) => {
    setForm((f) => ({ ...f, feeItems: [...f.feeItems, { name: cat.name, amount: '', categoryId: id(cat) }] }));
  };

  const totalAmount = form.feeItems.reduce((s, fi) => s + (Number(fi.amount) || 0), 0);

  const classCount = form.classIds.length;
  const submitLabel = dialog === 'edit'
    ? 'Save Changes'
    : classCount > 1
      ? (classCount === classes.length ? `Apply to All ${classCount} Classes` : `Create for ${classCount} Classes`)
      : 'Save Structure';

  const handleSave = async () => {
    if (!form.classIds.length) return toast.error(dialog === 'edit' ? 'Please select a class' : 'Please select at least one class');
    const feeItems = form.feeItems
      .filter((fi) => fi.name && Number(fi.amount) > 0)
      .map((fi) => ({
        name: fi.name,
        amount: Number(fi.amount),
        ...(fi.categoryId ? { categoryId: fi.categoryId } : {}),
      }));
    if (!feeItems.length) return toast.error('Add at least one fee item');

    const base = {
      name: form.name,
      academicYear: form.academicYear,
      frequency: form.frequency,
      dueDay: form.dueDay,
      isActive: form.isActive,
      feeItems,
    };

    try {
      if (dialog === 'create') {
        const payload: any = classCount > 1 ? { ...base, classIds: form.classIds } : { ...base, classId: form.classIds[0] };
        const result: any = await createStructure(payload).unwrap();
        if (result && typeof result.total === 'number') {
          const skipped = result.skippedCount || 0;
          toast.success(
            `Created ${result.total} fee structure${result.total > 1 ? 's' : ''}` +
            (skipped ? ` — ${skipped} class${skipped > 1 ? 'es' : ''} already had an active "${form.name}" structure and were skipped.` : '')
          );
        } else {
          toast.success('Fee structure created');
        }
      } else {
        await updateStructure({ id: selected.id, ...base, classId: form.classIds[0] }).unwrap();
        toast.success('Fee structure updated');
      }
      setDialog(null);
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const handleToggleActive = async (s: any, checked: boolean) => {
    try {
      await updateStructure({ id: s.id, isActive: checked }).unwrap();
      toast.success(checked ? 'Structure activated' : 'Structure deactivated');
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const handleDelete = async (structureId: string) => {
    if (!confirm('Delete this fee structure?')) return;
    try {
      await deleteStructure(structureId).unwrap();
      toast.success('Deleted');
      setSelectedIds((prev) => prev.filter((sid) => sid !== structureId));
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  // ---- Bulk selection ----
  const toggleSelect = (structureId: string) => {
    setSelectedIds((prev) => prev.includes(structureId) ? prev.filter((sid) => sid !== structureId) : [...prev, structureId]);
  };
  const toggleSelectAllVisible = () => {
    const visibleIds = filteredStructures.map((s: any) => s.id);
    setSelectedIds((prev) => visibleIds.every((vid: string) => prev.includes(vid)) ? [] : visibleIds);
  };
  const deleteTargetIds = selectedIds.length ? selectedIds : filteredStructures.map((s: any) => s.id);
  const handleBulkDelete = async () => {
    if (!deleteTargetIds.length) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(deleteTargetIds.map((sid: string) => deleteStructure(sid).unwrap()));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (succeeded) toast.success(`Deleted ${succeeded} fee structure${succeeded !== 1 ? 's' : ''}`);
      if (failed) toast.error(`Failed to delete ${failed} structure${failed !== 1 ? 's' : ''}`);
      setSelectedIds([]);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fee Structures</h1>
          <p className="text-muted-foreground">Define class-wise fee templates for every type of fund you collect</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Structure</Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Total Structures', value: totalStructures, icon: Layers, color: 'text-foreground' },
          { label: 'Classes Covered', value: `${classesCovered} of ${classes.length}`, icon: GraduationCap, color: 'text-sky-600' },
          { label: 'Active', value: `${activeCount} of ${totalStructures}`, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Monthly Revenue Potential', value: formatMoney(monthlyRevenue), icon: Wallet, color: 'text-violet-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2">
            <Icon className={`h-4 w-4 shrink-0 ${color}`} />
            <div className="min-w-0">
              <p className={`text-lg font-bold leading-none truncate ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or class…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c: any) => <SelectItem key={id(c)} value={id(c)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
          <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="All Frequencies" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Frequencies</SelectItem>
            {Object.entries(FREQUENCY_CONFIG).map(([v, cfg]) => <SelectItem key={v} value={v}>{cfg.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-52 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filteredStructures.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="rounded-full bg-muted p-4"><Layers className="h-6 w-6 text-muted-foreground" /></div>
          {structures.length === 0 ? (
            <>
              <div>
                <p className="font-medium">No fee structures yet</p>
                <p className="text-sm text-muted-foreground">Create one to start generating vouchers — apply it to a single class or every class at once.</p>
              </div>
              <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Structure</Button>
            </>
          ) : (
            <>
              <div>
                <p className="font-medium">No structures match your filters</p>
                <p className="text-sm text-muted-foreground">Try adjusting the search or filters above.</p>
              </div>
              <Button size="sm" variant="outline" onClick={clearFilters}>Clear Filters</Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={filteredStructures.length > 0 && filteredStructures.every((s: any) => selectedIds.includes(s.id))}
                onCheckedChange={toggleSelectAllVisible}
              />
              <span className="font-medium">{selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}</span>
            </label>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={bulkDeleting}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {selectedIds.length > 0 ? `Delete Selected (${selectedIds.length})` : `Delete All (${filteredStructures.length})`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogBody>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selectedIds.length > 0 ? `${selectedIds.length} selected structure${selectedIds.length !== 1 ? 's' : ''}` : `all ${filteredStructures.length} structure${filteredStructures.length !== 1 ? 's' : ''}`}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the {selectedIds.length > 0 ? 'selected' : 'listed'} fee structure{(selectedIds.length || filteredStructures.length) !== 1 ? 's' : ''}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? 'Deleting…' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogBody>
            </AlertDialog>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStructures.map((s: any) => {
            const freq = FREQUENCY_CONFIG[s.frequency] || FREQUENCY_CONFIG.monthly;
            const isChecked = selectedIds.includes(s.id);
            return (
              <Card key={s.id} className={`relative group ${!s.isActive ? 'opacity-60' : ''} ${isChecked ? 'ring-2 ring-primary/50' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleSelect(s.id)} className="shrink-0" />
                      <Layers className="h-4 w-4 text-primary shrink-0" />
                      <CardTitle className="text-sm truncate">{s.name}</CardTitle>
                    </div>
                    <div className="relative h-6 shrink-0">
                      <Badge variant="outline" className="transition-opacity group-hover:opacity-0">{s.classId?.name || 'Unknown Class'}</Badge>
                      <div className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 rounded hover:bg-muted" title="Duplicate to other classes" onClick={() => openDuplicate(s)}>
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-muted" title="Edit" onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Delete" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4 space-y-2">
                  <div className="space-y-1">
                    {s.feeItems?.map((fi: any) => {
                      const catName = categoryNameMap[id(fi.categoryId)];
                      return (
                        <div key={fi._id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground truncate flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{fi.name}</span>
                            {catName && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal shrink-0">{catName}</Badge>}
                          </span>
                          <span className="font-medium shrink-0">{formatMoney(fi.amount ?? 0)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between pt-2 border-t font-semibold text-sm">
                    <span>Total</span>
                    <span className="text-primary">{formatMoney(s.totalAmount ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${freq.badge}`}>{freq.label}</span>
                      <span>Due day {s.dueDay}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{s.isActive ? 'Active' : 'Inactive'}</span>
                      <Switch checked={!!s.isActive} onCheckedChange={(checked) => handleToggleActive(s, checked)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </div>
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog === 'create' ? 'New Fee Structure' : 'Edit Fee Structure'}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {dialog === 'create' ? 'Pick one class, several, or all — and define every fund this structure collects.' : 'Update the fee items and settings for this class.'}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 md:col-span-4 space-y-1.5">
                <Label>{dialog === 'edit' ? 'Class' : 'Classes'} <span className="text-destructive">*</span></Label>
                {dialog === 'edit' ? (
                  <Select value={form.classIds[0] || ''} onValueChange={(v) => setForm({ ...form, classIds: [v] })}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c: any) => <SelectItem key={id(c)} value={id(c)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg border shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-muted/40">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={classes.length > 0 && form.classIds.length === classes.length}
                            onCheckedChange={(checked) => selectAllClasses(!!checked)}
                          />
                          <span className="text-sm font-semibold">Select All Classes</span>
                        </label>
                        <span className="text-xs font-medium text-muted-foreground">{form.classIds.length} of {classes.length} selected</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 p-2.5">
                        {classes.map((c: any) => {
                          const cid = id(c);
                          const isSelected = form.classIds.includes(cid);
                          return (
                            <label
                              key={cid}
                              className={`flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer transition-colors ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}
                            >
                              <Checkbox checked={isSelected} onCheckedChange={(checked) => toggleClassSelection(cid, !!checked)} />
                              <span className="text-sm truncate">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {form.classIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {form.classIds.map((cid) => (
                          <Badge key={cid} variant="secondary" className="text-xs gap-1 pr-1">
                            {classNameMap[cid] || cid}
                            <button type="button" className="rounded-full hover:bg-muted p-0.5" onClick={() => toggleClassSelection(cid, false)}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {form.classIds.length > 1 && (
                      <p className="text-xs text-muted-foreground">One fee structure will be created for each selected class.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v: any) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_CONFIG).map(([v, cfg]) => <SelectItem key={v} value={v}>{cfg.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Day of Month</Label>
                <Input
                  type="number" min={1} max={31}
                  value={form.dueDay}
                  onChange={(e) => setForm({ ...form, dueDay: parseInt(e.target.value) || 10 })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label className="text-sm">Active</Label>
                  <p className="text-[11px] text-muted-foreground">Only active structures are used to generate vouchers</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>

            {/* Fee Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fee Items — every fund you collect</Label>
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Add Item</Button>
              </div>

              {categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pb-1">
                  <span className="text-xs font-medium text-muted-foreground mr-0.5">Quick add:</span>
                  {categories.map((cat: any) => (
                    <button
                      key={id(cat)}
                      type="button"
                      onClick={() => quickAddCategory(cat)}
                      className="text-xs px-2.5 py-1 rounded-full border border-dashed text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      + {cat.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                {form.feeItems.map((fi, i) => (
                <div key={i} className="grid grid-cols-[1fr_11rem_8rem_auto] gap-2 items-center">
                  <Input
                    placeholder="Item name (e.g. Tuition Fee)"
                    value={fi.name}
                    onChange={(e) => updateItem(i, 'name', e.target.value)}
                    className="bg-background"
                  />
                  <Select value={fi.categoryId || 'none'} onValueChange={(v) => updateItem(i, 'categoryId', v === 'none' ? '' : v)}>
                    <SelectTrigger className="text-xs bg-background"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No Category —</SelectItem>
                      {categories.map((cat: any) => <SelectItem key={id(cat)} value={id(cat)}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min={0}
                    placeholder="Amount"
                    value={fi.amount}
                    onChange={(e) => updateItem(i, 'amount', e.target.value)}
                    className="bg-background"
                  />
                  <button
                    className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                    onClick={() => removeItem(i)}
                    disabled={form.feeItems.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                <span className="text-sm font-medium">Total Amount</span>
                <span className="text-lg font-bold text-primary">{formatMoney(totalAmount)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave}>{submitLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
