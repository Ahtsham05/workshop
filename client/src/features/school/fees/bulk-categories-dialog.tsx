import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateFeeCategoriesBulkMutation } from '@/stores/school.api';
import { nextCategoryColor } from './category-combobox';
import { onEnterAdvance, afterPaint, focusField } from '@/lib/invoice-form-keyboard';

type Row = { id: string; name: string; color: string };

let rowSeq = 0;
const makeRow = (existingCount: number): Row => ({ id: `row-${++rowSeq}`, name: '', color: nextCategoryColor(existingCount) });

export function BulkCategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rows, setRows] = useState<Row[]>(() => [makeRow(0), makeRow(1), makeRow(2)]);
  const [createBulk, { isLoading }] = useCreateFeeCategoriesBulkMutation();
  const nameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setRow = (id: string, patch: Partial<Row>) => {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeRow = (id: string) => setRows((r) => r.filter((row) => row.id !== id));

  const reset = () => { setRows([makeRow(0), makeRow(1), makeRow(2)]); };

  const addRowAndFocus = () => {
    const newRow = makeRow(rows.length);
    setRows((r) => [...r, newRow]);
    // The new row's input ref doesn't exist yet at this point in the same tick —
    // defer the ref lookup itself (not just the .focus() call) until after it mounts.
    afterPaint(() => focusField(nameInputRefs.current[newRow.id]));
  };

  const handleNameEnter = (rowId: string) => {
    const idx = rows.findIndex((r) => r.id === rowId);
    if (idx === rows.length - 1) {
      addRowAndFocus();
    } else {
      focusField(nameInputRefs.current[rows[idx + 1].id]);
    }
  };

  const handleSave = async () => {
    const categories = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), type: 'EXPENSE' as const, color: r.color }));

    if (categories.length === 0) return toast.error('Add at least one category name');

    try {
      const result = await createBulk({ categories }).unwrap();
      const parts: string[] = [];
      if (result.created?.length) parts.push(`${result.created.length} created`);
      if (result.skipped?.length) parts.push(`${result.skipped.length} already existed`);
      toast.success(parts.join(', ') || 'Done');
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create categories');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Multiple Categories</DialogTitle>
          <DialogDescription>Pick a color and name for each — press Enter to add the next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {rows.map((row, idx) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-9 shrink-0 rounded border cursor-pointer"
                value={row.color}
                onChange={(e) => setRow(row.id, { color: e.target.value })}
              />
              <Input
                ref={(el) => { nameInputRefs.current[row.id] = el; }}
                autoFocus={idx === 0}
                placeholder={`Category ${idx + 1} name`}
                value={row.name}
                onChange={(e) => setRow(row.id, { name: e.target.value })}
                onKeyDown={(e) => onEnterAdvance(e, () => handleNameEnter(row.id))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRowAndFocus}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Row
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create All'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
