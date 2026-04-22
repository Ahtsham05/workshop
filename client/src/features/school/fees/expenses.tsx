import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  TrendingDown,
  CalendarDays,
  Zap,
  Search,
  Pencil,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  ArrowDownCircle,
} from 'lucide-react';
import {
  useGetSchoolTransactionsQuery,
  useCreateSchoolTransactionMutation,
  useUpdateSchoolTransactionMutation,
  useDeleteSchoolTransactionMutation,
  useGetExpenseCategoriesQuery,
  useCreateFeeCategoryMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  bank_transfer: 'bg-blue-100 text-blue-700',
  cheque: 'bg-purple-100 text-purple-700',
  online: 'bg-teal-100 text-teal-700',
  other: 'bg-gray-100 text-gray-700',
};

const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const emptyForm = () => ({
  categoryId: '',
  amount: '',
  date: today(),
  paymentMethod: 'cash',
  description: '',
});

export default function Expenses() {
  const todayStr = today();
  const foMonth = firstOfMonth();

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [from, setFrom] = useState(foMonth);
  const [to, setTo] = useState(todayStr);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [expenseDialog, setExpenseDialog] = useState<'create' | 'edit' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form, setForm] = useState(emptyForm());
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // ── API hooks ─────────────────────────────────────────────────────────────
  const queryParams: any = {
    type: 'EXPENSE',
    page,
    limit: PAGE_SIZE,
    from,
    to,
    sortBy: 'date:desc',
  };
  if (categoryFilter !== 'all') queryParams.categoryId = categoryFilter;

  const { data: txnData, isLoading } = useGetSchoolTransactionsQuery(queryParams);
  const { data: catData } = useGetExpenseCategoriesQuery(undefined);
  const [createTxn, { isLoading: creating }] = useCreateSchoolTransactionMutation();
  const [updateTxn, { isLoading: updating }] = useUpdateSchoolTransactionMutation();
  const [deleteTxn, { isLoading: deleting }] = useDeleteSchoolTransactionMutation();
  const [createCat, { isLoading: creatingCat }] = useCreateFeeCategoryMutation();

  const expenses: any[] = txnData?.results || [];
  const totalResults = txnData?.totalResults || 0;
  const totalPages = txnData?.totalPages || 1;
  const categories: any[] = catData || [];

  // ── Client-side search filter (description / category name) ──────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return expenses.filter((e) => {
      if (methodFilter !== 'all' && e.paymentMethod !== methodFilter) return false;
      if (!q) return true;
      const desc = (e.description || '').toLowerCase();
      const cat = (e.categoryId?.name || '').toLowerCase();
      return desc.includes(q) || cat.includes(q);
    });
  }, [expenses, search, methodFilter]);

  // ── Summary stats from current page (full month totals comes from the page set) ─
  const monthTotal = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
  const todayTotal = expenses
    .filter((e: any) => new Date(e.date).toISOString().slice(0, 10) === todayStr)
    .reduce((s: number, e: any) => s + (e.amount || 0), 0);

  // ── Category breakdown (this page) ──────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    expenses.forEach((e) => {
      const key = e.categoryId?._id || e.categoryId || 'uncategorized';
      const name = e.categoryId?.name || 'Uncategorized';
      if (!map[key]) map[key] = { name, total: 0, count: 0 };
      map[key].total += e.amount || 0;
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setExpenseDialog('create');
  };
  const openEdit = (exp: any) => {
    setEditTarget(exp);
    setForm({
      categoryId: exp.categoryId?._id || exp.categoryId || '',
      amount: String(exp.amount || ''),
      date: new Date(exp.date).toISOString().slice(0, 10),
      paymentMethod: exp.paymentMethod || 'cash',
      description: exp.description || '',
    });
    setExpenseDialog('edit');
  };
  const closeExpenseDialog = () => { setExpenseDialog(null); setEditTarget(null); setForm(emptyForm()); };

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Amount must be greater than 0');
    if (!form.date) return toast.error('Date is required');
    try {
      const body: any = {
        type: 'EXPENSE',
        amount: Number(form.amount),
        date: form.date,
        paymentMethod: form.paymentMethod,
        description: form.description || undefined,
      };
      if (form.categoryId) body.categoryId = form.categoryId;

      if (expenseDialog === 'create') {
        await createTxn(body).unwrap();
        toast.success('Expense recorded');
      } else {
        await updateTxn({ id: editTarget.id || editTarget._id, ...body }).unwrap();
        toast.success('Expense updated');
      }
      closeExpenseDialog();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save expense');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTxn(deleteTarget.id || deleteTarget._id).unwrap();
      toast.success('Expense deleted');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to delete');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return toast.error('Category name is required');
    try {
      await createCat({ name: newCatName.trim(), type: 'EXPENSE', description: newCatDesc.trim() || undefined }).unwrap();
      toast.success('Expense category created');
      setNewCatName('');
      setNewCatDesc('');
      setCategoryDialog(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create category');
    }
  };

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setMethodFilter('all');
    setFrom(foMonth);
    setTo(todayStr);
    setPage(1);
  };

  return (
    <div className="h-full w-full p-4 space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track and manage all school expenses</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setCategoryDialog(true)}>
            <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Add Category
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Expense
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              {isLoading ? (
                <div className="h-7 w-24 bg-muted animate-pulse rounded mt-0.5" />
              ) : (
                <p className="text-xl font-bold text-rose-600">PKR {todayTotal.toLocaleString()}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Period Total</p>
              {isLoading ? (
                <div className="h-7 w-24 bg-muted animate-pulse rounded mt-0.5" />
              ) : (
                <p className="text-xl font-bold text-orange-600">PKR {monthTotal.toLocaleString()}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <LayoutGrid className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Categories Used</p>
              {isLoading ? (
                <div className="h-7 w-12 bg-muted animate-pulse rounded mt-0.5" />
              ) : (
                <p className="text-xl font-bold">{categoryBreakdown.length}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transactions</p>
              {isLoading ? (
                <div className="h-7 w-12 bg-muted animate-pulse rounded mt-0.5" />
              ) : (
                <p className="text-xl font-bold">{totalResults}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Main Table ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[160px]">
                  <Label className="text-xs mb-1 block">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-9 text-sm"
                      placeholder="Description or category…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="w-36">
                  <Label className="text-xs mb-1 block">Category</Label>
                  <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((c: any) => (
                        <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36">
                  <Label className="text-xs mb-1 block">Payment Method</Label>
                  <Select value={methodFilter} onValueChange={setMethodFilter}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Methods</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36">
                  <Label className="text-xs mb-1 block">From</Label>
                  <Input type="date" className="h-9 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
                </div>
                <div className="w-36">
                  <Label className="text-xs mb-1 block">To</Label>
                  <Input type="date" className="h-9 text-sm" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={resetFilters} title="Reset filters">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right pr-4">Amount</TableHead>
                    <TableHead className="w-20 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <ArrowDownCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No expenses found</p>
                        <Button size="sm" className="mt-3" onClick={openCreate}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add First Expense
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((exp: any) => (
                      <TableRow key={exp.id || exp._id} className="hover:bg-muted/30 text-sm">
                        <TableCell className="pl-4 text-muted-foreground whitespace-nowrap">
                          {new Date(exp.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="truncate font-medium">{exp.description || '—'}</p>
                        </TableCell>
                        <TableCell>
                          {exp.categoryId?.name ? (
                            <Badge variant="outline" className="text-[11px]">{exp.categoryId.name}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${PAYMENT_METHOD_COLORS[exp.paymentMethod] || 'bg-gray-100 text-gray-700'}`}>
                            {exp.paymentMethod?.replace('_', ' ') || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4 font-semibold text-red-600">
                          PKR {(exp.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(exp)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(exp)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                  <span>Page {page} of {totalPages} ({totalResults} total)</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar: Category Breakdown ──────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-purple-500" /> By Category
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))
              ) : categoryBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No data</p>
              ) : (
                <>
                  {categoryBreakdown.map((cat, idx) => {
                    const pct = monthTotal > 0 ? Math.round((cat.total / monthTotal) * 100) : 0;
                    const colors = [
                      'bg-red-500', 'bg-orange-500', 'bg-amber-500',
                      'bg-yellow-500', 'bg-purple-500', 'bg-pink-500',
                    ];
                    const bar = colors[idx % colors.length];
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium truncate max-w-[120px]">{cat.name}</span>
                          <span className="text-muted-foreground ml-2 shrink-0">{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-0.5">
                          <div className={`h-1.5 ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{cat.count} txn{cat.count !== 1 ? 's' : ''}</span>
                          <span className="font-medium text-foreground">PKR {cat.total.toLocaleString()}</span>
                        </div>
                        {idx < categoryBreakdown.length - 1 && <Separator className="mt-2" />}
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t flex justify-between text-xs font-semibold">
                    <span>Total</span>
                    <span className="text-red-600">PKR {monthTotal.toLocaleString()}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick-add Category */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Expense Categories</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-1.5">
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground">No expense categories yet.</p>
              ) : (
                categories.slice(0, 8).map((c: any) => (
                  <div key={c.id || c._id} className="flex items-center justify-between text-xs py-0.5">
                    <span className="font-medium">{c.name}</span>
                    {c.description && <span className="text-muted-foreground truncate ml-2 max-w-[80px]">{c.description}</span>}
                  </div>
                ))
              )}
              <Button variant="outline" size="sm" className="w-full mt-2 text-xs h-7" onClick={() => setCategoryDialog(true)}>
                <Plus className="mr-1.5 h-3 w-3" /> Add Category
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Add/Edit Expense Dialog ──────────────────────────────────────────── */}
      <Dialog open={expenseDialog !== null} onOpenChange={(open) => { if (!open) closeExpenseDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{expenseDialog === 'create' ? 'Add Expense' : 'Edit Expense'}</DialogTitle>
            <DialogDescription>
              {expenseDialog === 'create' ? 'Record a new school expense.' : 'Update the expense details.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Amount (PKR) *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  className="mt-1"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  autoFocus
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Category</Label>
                <Select value={form.categoryId || 'none'} onValueChange={(v) => setForm({ ...form, categoryId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No Category —</SelectItem>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  className="mt-1 resize-none"
                  rows={2}
                  placeholder="What was this expense for?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeExpenseDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={creating || updating}>
              {(creating || updating) ? 'Saving…' : expenseDialog === 'create' ? 'Add Expense' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Category Dialog ──────────────────────────────────────────────── */}
      <Dialog open={categoryDialog} onOpenChange={(open) => { if (!open) { setCategoryDialog(false); setNewCatName(''); setNewCatDesc(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Expense Category</DialogTitle>
            <DialogDescription>Create a category to organise your expenses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input className="mt-1" placeholder="e.g. Utilities, Staff Salary…" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1" placeholder="Optional" value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCategoryDialog(false); setNewCatName(''); setNewCatDesc(''); }}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={creatingCat}>
              {creatingCat ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <strong>PKR {(deleteTarget?.amount || 0).toLocaleString()}</strong>
              {deleteTarget?.description ? ` — "${deleteTarget.description}"` : ''}.
              This action cannot be undone and will affect dashboard totals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
