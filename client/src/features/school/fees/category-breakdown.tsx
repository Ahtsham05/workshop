import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Receipt, Plus, X, Pencil, Trash2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFormatMoney } from '@/lib/format-money';
import { useGetTransactionCategoryReportQuery, useLazyGetSchoolTransactionsQuery } from '@/stores/school.api';

const DEFAULT_CATEGORY_COLOR = '#6366f1';

function getLast30DaysRange() {
  const now = new Date();
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
    endDate: now,
  };
}

interface CategoryBreakdownProps {
  categories: any[];
  onAddExpense: (categoryId: string) => void;
  onEditCategory: (category: any) => void;
  onDeleteCategory: (category: any) => void;
  onPrintExpense: (expense: any) => void;
}

export function CategoryBreakdown({ categories, onAddExpense, onEditCategory, onDeleteCategory, onPrintExpense }: CategoryBreakdownProps) {
  const formatMoney = useFormatMoney();
  const [range, setRange] = useState(getLast30DaysRange);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [fetchDetail, { data: detailResult, isFetching: detailLoading }] = useLazyGetSchoolTransactionsQuery();

  const startDate = format(range.startDate, 'yyyy-MM-dd');
  const endDate = format(range.endDate, 'yyyy-MM-dd');

  const { data: reportData, isFetching: isLoading } = useGetTransactionCategoryReportQuery({
    startDate,
    endDate,
    type: 'EXPENSE',
  });

  const categoryById = useMemo(() => {
    const map: Record<string, any> = {};
    categories.forEach((c) => { map[c.id || c._id] = c; });
    return map;
  }, [categories]);

  const rows: any[] = reportData || [];
  const totalExpenses = rows.reduce((s, r) => s + (r.total || 0), 0);

  const activeCategory = activeCategoryId ? categoryById[activeCategoryId] : null;
  const detailData: any[] = detailResult?.results || [];
  const detailTotal = detailData.reduce((s, e) => s + (e.amount || 0), 0);

  const applyLast30Days = () => setRange(getLast30DaysRange());

  const openCategoryDetail = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    setSheetOpen(true);
    fetchDetail({ type: 'EXPENSE', categoryId, from: startDate, to: endDate, limit: 200 });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Expense by Category</CardTitle>
            <p className="text-sm text-muted-foreground">Click a category to view its details</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <Label className="text-xs mb-1 block">Start Date</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={format(range.startDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  setRange((prev) => ({ ...prev, startDate: new Date(y, m - 1, d) }));
                }}
              />
            </div>
            <div className="w-36">
              <Label className="text-xs mb-1 block">End Date</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={format(range.endDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  setRange((prev) => ({ ...prev, endDate: new Date(y, m - 1, d) }));
                }}
              />
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={applyLast30Days}>Last 30 Days</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl border bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Receipt className="h-10 w-10 mb-2 opacity-30" />
            <p>No expense data for this period</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {rows.map((cat) => {
              const categoryId = String(cat._id || '');
              const category = categoryById[categoryId];
              const color = category?.color || DEFAULT_CATEGORY_COLOR;
              const name = cat.categoryName || category?.name || 'Uncategorized';
              const share = totalExpenses ? ((cat.total / totalExpenses) * 100).toFixed(1) : '0';
              const avg = cat.count ? cat.total / cat.count : 0;

              return (
                <div
                  key={categoryId || 'uncategorized'}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCategoryDetail(categoryId)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openCategoryDetail(categoryId); }}
                  className="group relative text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
                >
                  {category && (
                    <div
                      className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="ghost" size="icon" className="h-6 w-6 bg-background/80" onClick={() => onEditCategory(category)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 bg-background/80 text-destructive hover:text-destructive" onClick={() => onDeleteCategory(category)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                    <Badge variant="secondary" className="text-xs">{share}%</Badge>
                  </div>
                  <p className="font-semibold text-sm leading-tight mb-0.5 truncate">{name}</p>
                  <p className="text-xl font-bold" style={{ color }}>{formatMoney(cat.total)}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{cat.count} entries</span>
                    <span>avg {formatMoney(avg)}</span>
                  </div>
                  <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: color }} />
                  </div>
                  <p className="mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to view details →
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Category Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl lg:max-w-5xl p-0 flex flex-col" showCloseButton={false}>
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-lg">{activeCategory?.name || 'Uncategorized'} — Expense Details</SheetTitle>
              <div className="flex items-center gap-1">
                {activeCategoryId && (
                  <Button size="sm" className="h-8 gap-1" onClick={() => { setSheetOpen(false); onAddExpense(activeCategoryId); }}>
                    <Plus className="h-3.5 w-3.5" /> Add Expense
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSheetOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {!detailLoading && (
              <p className="text-sm text-muted-foreground mt-2">
                {detailData.length} entries · {formatMoney(detailTotal)} total
              </p>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {detailLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 w-full rounded bg-muted animate-pulse" />)}
              </div>
            ) : detailData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Receipt className="h-10 w-10 mb-2 opacity-30" />
                <p>No expenses found for this category</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailData.map((exp: any) => (
                    <TableRow key={exp.id || exp._id}>
                      <TableCell className="py-2 text-sm font-mono text-muted-foreground whitespace-nowrap">{exp.expenseNumber || '—'}</TableCell>
                      <TableCell className="py-2 text-sm whitespace-nowrap">{format(new Date(exp.date), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="py-2 text-sm font-medium">{exp.description || '—'}</TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">{exp.reference || '—'}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-xs capitalize">{exp.paymentMethod?.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right font-semibold text-sm whitespace-nowrap">{formatMoney(exp.amount)}</TableCell>
                      <TableCell className="py-2 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-600 hover:text-indigo-700" onClick={() => onPrintExpense(exp)}>
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-bold text-base" colSpan={2}>{formatMoney(detailTotal)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </div>

          {!detailLoading && detailData.length > 0 && (
            <div className={cn('border-t px-6 py-4 shrink-0')}>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{format(range.startDate, 'dd MMM yyyy')} — {format(range.endDate, 'dd MMM yyyy')}</span>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total Expense</p>
                  <p className="font-bold text-lg">{formatMoney(detailTotal)}</p>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
