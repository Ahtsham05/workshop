import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, BookOpen, Users } from 'lucide-react';
import { useGetSchoolClassesQuery, useCreateSchoolClassMutation, useUpdateSchoolClassMutation, useDeleteSchoolClassMutation, useGetAllSectionsQuery } from '@/stores/school.api';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const CLASS_COLORS = [
  'from-blue-500 to-blue-600', 'from-emerald-500 to-emerald-600',
  'from-purple-500 to-purple-600', 'from-orange-500 to-orange-600',
  'from-rose-500 to-rose-600', 'from-cyan-500 to-cyan-600',
  'from-amber-500 to-amber-600', 'from-indigo-500 to-indigo-600',
];

export default function ClassManagement() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', order: '' });

  const { data, isLoading } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: allSections } = useGetAllSectionsQuery({});
  const [createClass] = useCreateSchoolClassMutation();
  const [updateClass] = useUpdateSchoolClassMutation();
  const [deleteClass] = useDeleteSchoolClassMutation();

  const resetForm = () => { setForm({ name: '', code: '', description: '', order: '' }); setEditing(null); };

  const openAdd = () => {
    resetForm();
    // Auto-set order to next number
    const maxOrder = data?.results?.reduce((max: number, c: any) => Math.max(max, c.order || 0), 0) || 0;
    setForm(p => ({ ...p, order: String(maxOrder + 1) }));
    setDialogOpen(true);
  };

  const openEdit = (c: any) => {
    setEditing(c);
    setForm({ name: c.name, code: c.code || '', description: c.description || '', order: String(c.order || '') });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const body: any = { name: form.name };
      if (form.code) body.code = form.code;
      if (form.description) body.description = form.description;
      if (form.order) body.order = Number(form.order);

      if (editing) {
        await updateClass({ id: editing.id || editing._id, ...body }).unwrap();
        toast.success(`Class "${form.name}" updated`);
      } else {
        await createClass(body).unwrap();
        toast.success(`Class "${form.name}" created`);
      }
      setDialogOpen(false); resetForm();
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const getSectionCount = (classId: string) =>
    allSections?.results?.filter((s: any) => (s.classId?._id || s.classId?.id || s.classId) === classId)?.length || 0;

  return (
    <div className="h-full w-full p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
          <p className="text-muted-foreground">{data?.results?.length || 0} classes configured</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Class
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data?.results?.map((c: any, idx: number) => {
            const sectionCount = getSectionCount(c.id || c._id);
            const colorClass = CLASS_COLORS[idx % CLASS_COLORS.length];
            return (
              <Card key={c.id || c._id} className="overflow-hidden hover:shadow-lg transition-all">
                <div className={`bg-gradient-to-br ${colorClass} p-5 text-white relative`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white/70 text-xs font-medium uppercase tracking-wider">
                        {c.code || `Class ${c.order || idx + 1}`}
                      </p>
                      <h3 className="text-2xl font-bold mt-1">{c.name}</h3>
                    </div>
                    <BookOpen className="h-8 w-8 text-white/30" />
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-white/80 text-sm">
                    <Users className="h-3.5 w-3.5" />
                    <span>{sectionCount} section{sectionCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground truncate">{c.description || 'No description'}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
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
                          <AlertDialogTitle>Delete "{c.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This will affect all sections, students, subjects, and exams assigned to this class.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive" onClick={() => deleteClass(c.id || c._id).unwrap().then(() => toast.success('Class deleted')).catch(() => toast.error('Failed'))}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Empty state */}
          {(!data?.results || data.results.length === 0) && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No classes yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Create your first class to get started</p>
              <Button className="mt-4" onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add First Class</Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit — ${editing.name}` : 'Add New Class'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Class Name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} placeholder="e.g. Class 1, Grade 5, KG-A" autoFocus />
              </div>
              <div>
                <Label>Short Code</Label>
                <Input value={form.code} onChange={(e) => setForm(p => ({...p, code: e.target.value}))} placeholder="e.g. C1, G5" />
              </div>
              <div>
                <Label>Display Order</Label>
                <Input type="number" min="1" value={form.order} onChange={(e) => setForm(p => ({...p, order: e.target.value}))} placeholder="1" />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm(p => ({...p, description: e.target.value}))} placeholder="Optional description" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name}>{editing ? 'Save Changes' : 'Create Class'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
