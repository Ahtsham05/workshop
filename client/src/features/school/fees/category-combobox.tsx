import { forwardRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCreateFeeCategoryMutation } from '@/stores/school.api';

export const ROTATING_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
export const nextCategoryColor = (existingCount: number) => ROTATING_COLORS[existingCount % ROTATING_COLORS.length];

interface CategoryComboboxProps {
  categories: any[];
  value: string;
  onChange: (categoryId: string, category?: any) => void;
  onCreated?: (category: any) => void;
  placeholder?: string;
  className?: string;
  /** Controlled open state — lets a parent row-list auto-open the next row's picker (mirrors the invoice item grid). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Category picker that doubles as an inline "create category" form — typing a
 * name that doesn't match anything shows a "Create '<name>'" row so a user
 * recording an expense never has to leave the form to set up a category
 * first. Mirrors the accounting module's expense-form.tsx combobox pattern.
 * Each row shows only a color dot + name — no extra clutter.
 */
export const CategoryCombobox = forwardRef<HTMLButtonElement, CategoryComboboxProps>(function CategoryCombobox(
  { categories, value, onChange, onCreated, placeholder, className, open: openProp, onOpenChange },
  ref,
) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [search, setSearch] = useState('');
  const [createCategory, { isLoading: creating }] = useCreateFeeCategoryMutation();

  const selected = categories.find((c) => (c.id || c._id) === value);
  const query = search.trim();
  const hasExactMatch = categories.some((c) => c.name.toLowerCase() === query.toLowerCase());

  const handleCreate = async () => {
    if (!query) return;
    try {
      const color = nextCategoryColor(categories.length);
      const created = await createCategory({ name: query, type: 'EXPENSE', color }).unwrap();
      onChange(created.id || created._id, created);
      onCreated?.(created);
      setSearch('');
      setOpen(false);
      toast.success(`Category "${query}" created`);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create category');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
          onKeyDown={(e) => {
            // A focused <button> treats Enter as a click by default, which would
            // open this popover as a side effect of Enter-to-advance landing
            // focus here — then a highlighted item (e.g. the first category)
            // could get selected by the very next stray Enter. Require a
            // deliberate Space/click/ArrowDown to open it instead.
            if (e.key === 'Enter') e.preventDefault();
          }}
        >
          {selected ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color || '#6366f1' }} />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder || 'Select category'}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search or create category…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-56 overflow-y-auto">
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">No categories found</CommandEmpty>
            <CommandGroup>
              {categories
                .filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()))
                .map((cat) => {
                  const id = cat.id || cat._id;
                  return (
                    <CommandItem key={id} value={`${cat.name} ${id}`} onSelect={() => { onChange(id, cat); setSearch(''); setOpen(false); }}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full mr-2" style={{ backgroundColor: cat.color || '#6366f1' }} />
                      <span className="flex-1 truncate">{cat.name}</span>
                      {value === id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
            {query && !hasExactMatch && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Create new">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Input
                      value={query}
                      readOnly
                      className="h-7 text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                    />
                    <Button type="button" size="sm" className="h-7 px-2 shrink-0" onClick={handleCreate} disabled={creating}>
                      {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
