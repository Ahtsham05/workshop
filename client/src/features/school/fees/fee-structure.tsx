import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react';
import {
  useGetFeeStructuresQuery,
  useGetSchoolClassesQuery,
  useCreateFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDeleteFeeStructureMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';

type FeeItem = { name: string; amount: number | string; categoryId?: string };
const emptyForm = {
  classId: '',
  name: 'Standard Fee Structure',
  academicYear: '',
  frequency: 'monthly' as const,
  dueDay: 10,
  feeItems: [{ name: 'Tuition Fee', amount: '', categoryId: '' }] as FeeItem[],
};

export default function FeeStructures() {
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: structuresData, isLoading } = useGetFeeStructuresQuery({});
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const [createStructure] = useCreateFeeStructureMutation();
  const [updateStructure] = useUpdateFeeStructureMutation();
  const [deleteStructure] = useDeleteFeeStructureMutation();

  const structures = structuresData?.results || [];
  const classes = classesData?.results || [];

  const openCreate = () => { setForm({ ...emptyForm }); setDialog('create'); };
  const openEdit = (s: any) => {
    setSelected(s);
    setForm({
      classId: s.classId?.id || s.classId,
      name: s.name,
      academicYear: s.academicYear || '',
      frequency: s.frequency,
      dueDay: s.dueDay,
      feeItems: s.feeItems?.map((fi: any) => ({
        name: fi.name,
        amount: fi.amount,
        categoryId: fi.categoryId?.id || fi.categoryId || '',
      })) || [],
    });
    setDialog('edit');
  };

  const addItem = () => setForm({ ...form, feeItems: [...form.feeItems, { name: '', amount: '', categoryId: '' }] });
  const removeItem = (i: number) => setForm({ ...form, feeItems: form.feeItems.filter((_, idx) => idx !== i) });
  const updateItem = (i: number, field: string, value: any) => {
    const items = form.feeItems.map((fi, idx) => idx === i ? { ...fi, [field]: value } : fi);
    setForm({ ...form, feeItems: items });
  };

  const totalAmount = form.feeItems.reduce((s, fi) => s + (Number(fi.amount) || 0), 0);

  const handleSave = async () => {
    if (!form.classId) return toast.error('Please select a class');
    const payload = {
      ...form,
      feeItems: form.feeItems
        .filter((fi) => fi.name && Number(fi.amount) > 0)
        .map((fi) => ({
          name: fi.name,
          amount: Number(fi.amount),
          ...(fi.categoryId ? { categoryId: fi.categoryId } : {}),
        })),
    };
    if (!payload.feeItems.length) return toast.error('Add at least one fee item');
    try {
      if (dialog === 'create') {
        await createStructure(payload).unwrap();
        toast.success('Fee structure created');
      } else {
        await updateStructure({ id: selected.id, ...payload }).unwrap();
        toast.success('Fee structure updated');
      }
      setDialog(null);
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this fee structure?')) return;
    try {
      await deleteStructure(id).unwrap();
      toast.success('Deleted');
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fee Structures</h1>
          <p className="text-muted-foreground">Define class-wise fee templates</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Structure</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading…</div>
      ) : structures.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No fee structures yet. Create one to generate vouchers.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {structures.map((s: any) => (
            <Card key={s.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">{s.name}</CardTitle>
                  </div>
                  <Badge variant="outline">{s.classId?.name || 'Unknown Class'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-4 space-y-2">
                <div className="space-y-1">
                  {s.feeItems?.map((fi: any) => (
                    <div key={fi._id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{fi.name}</span>
                      <span className="font-medium">PKR {fi.amount?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2 border-t font-semibold text-sm">
                  <span>Total</span>
                  <span className="text-primary">PKR {s.totalAmount?.toLocaleString()}</span>
                </div>
                <div className="flex gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="capitalize">{s.frequency}</span>
                  <span>· Due day {s.dueDay}</span>
                </div>
              </CardContent>
              <div className="absolute top-3 right-3 hidden group-hover:flex gap-1">
                <button className="p-1.5 rounded hover:bg-muted" onClick={() => openEdit(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button className="p-1.5 rounded hover:bg-destructive/10 text-destructive" onClick={() => handleDelete(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog === 'create' ? 'New Fee Structure' : 'Edit Fee Structure'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Class <span className="text-destructive">*</span></Label>
                <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                    <SelectItem value="one-time">One-Time</SelectItem>
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
            </div>

            {/* Fee Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fee Items</Label>
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Add Item</Button>
              </div>
              {form.feeItems.map((fi, i) => (
                <div key={i} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
                  <Input
                    placeholder="Item name (e.g. Tuition Fee)"
                    value={fi.name}
                    onChange={(e) => updateItem(i, 'name', e.target.value)}
                  />
                  <Input
                    type="number" min={0} className="w-28"
                    placeholder="Amount"
                    value={fi.amount}
                    onChange={(e) => updateItem(i, 'amount', e.target.value)}
                  />
                  <button
                    className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                    onClick={() => removeItem(i)}
                    disabled={form.feeItems.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex justify-end text-sm font-semibold">
                Total: PKR {totalAmount.toLocaleString()}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save Structure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
