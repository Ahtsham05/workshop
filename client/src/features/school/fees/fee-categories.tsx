import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import {
  useGetFeeCategoriesQuery,
  useCreateFeeCategoryMutation,
  useUpdateFeeCategoryMutation,
  useDeleteFeeCategoryMutation,
  useSeedFeeCategoriesMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';

const emptyForm = { name: '', type: 'INCOME' as 'INCOME' | 'EXPENSE', description: '' };

export default function FeeCategories() {
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [typeFilter, setTypeFilter] = useState('all');

  const params: any = {};
  if (typeFilter !== 'all') params.type = typeFilter;

  const { data, isLoading } = useGetFeeCategoriesQuery(params);
  const [createCategory] = useCreateFeeCategoryMutation();
  const [updateCategory] = useUpdateFeeCategoryMutation();
  const [deleteCategory] = useDeleteFeeCategoryMutation();
  const [seedCategories] = useSeedFeeCategoriesMutation();

  const openCreate = () => { setForm({ ...emptyForm }); setDialog('create'); };
  const openEdit = (cat: any) => { setSelected(cat); setForm({ name: cat.name, type: cat.type, description: cat.description || '' }); setDialog('edit'); };

  const handleSave = async () => {
    try {
      if (dialog === 'create') {
        await createCategory(form).unwrap();
        toast.success('Category created');
      } else {
        await updateCategory({ id: selected.id, ...form }).unwrap();
        toast.success('Category updated');
      }
      setDialog(null);
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try {
      await deleteCategory(id).unwrap();
      toast.success('Deleted');
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const handleSeed = async () => {
    try {
      await seedCategories({}).unwrap();
      toast.success('Default categories seeded');
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const categories = data?.results || [];

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fee Categories</h1>
          <p className="text-muted-foreground">Manage income and expense categories</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSeed}>
            <RefreshCw className="mr-2 h-4 w-4" /> Seed Defaults
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Category
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        {['all', 'INCOME', 'EXPENSE'].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === t
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      {/* Categories */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          No categories found.{' '}
          <button className="text-primary underline" onClick={handleSeed}>Seed defaults</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat: any) => (
            <Card key={cat.id} className="relative group">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {cat.type === 'INCOME' ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <CardTitle className="text-sm font-semibold">{cat.name}</CardTitle>
                  </div>
                  <Badge
                    className={
                      cat.type === 'INCOME'
                        ? 'bg-green-100 text-green-700 text-xs'
                        : 'bg-red-100 text-red-700 text-xs'
                    }
                  >
                    {cat.type}
                  </Badge>
                </div>
              </CardHeader>
              {cat.description && (
                <CardContent className="px-4 pb-3 pt-0">
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </CardContent>
              )}
              <div className="absolute top-3 right-3 hidden group-hover:flex gap-1">
                <button
                  className="p-1.5 rounded hover:bg-muted"
                  onClick={() => openEdit(cat)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                  onClick={() => handleDelete(cat.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === 'create' ? 'Add Category' : 'Edit Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Tuition Fee"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">INCOME</SelectItem>
                  <SelectItem value="EXPENSE">EXPENSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.type}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
