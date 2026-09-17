import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Wallet,
  Clock,
  RefreshCw,
  Layers,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import {
  useGetSchoolTransactionsQuery,
  useLazyGetSchoolTransactionsQuery,
  useCreateSchoolTransactionMutation,
  useUpdateSchoolTransactionMutation,
  useDeleteSchoolTransactionMutation,
  usePaySchoolTransactionMutation,
  usePaySchoolTransactionsBulkMutation,
  useGetExpenseCategoriesQuery,
  useCreateFeeCategoryMutation,
  useUpdateFeeCategoryMutation,
  useDeleteFeeCategoryMutation,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { useBranchPaperSize, useBranchPrintOrientation } from '@/features/invoice/utils/paper-format';
import { toast } from 'sonner';
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money';
import { SchoolRecurringExpenseManager } from './recurring-expenses';
import { CategoryCombobox, nextCategoryColor } from './category-combobox';
import { CategoryBreakdown } from './category-breakdown';
import { BulkCategoriesDialog } from './bulk-categories-dialog';
import { ExpenseCategoryImportDialog } from './expense-category-import-dialog';
import { BulkExpensesDialog } from './bulk-expenses-dialog';
import { printExpenseVoucher } from './print-expense-voucher';

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

const DEFAULT_CATEGORY_COLOR = '#6366f1';

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
  vendor: '',
  reference: '',
});

export default function Expenses() {
  const [tab, setTab] = useState<'expenses' | 'recurring'>('expenses');

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track and manage all school expenses</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'expenses' | 'recurring')}>
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="recurring">Recurring Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab />
        </TabsContent>
        <TabsContent value="recurring" className="mt-4">
          <SchoolRecurringExpenseManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExpensesTab() {
  const formatMoney = useFormatMoney();
  const currencyMeta = useCurrencyMeta();
  const { symbol: currencySymbol } = currencyMeta;
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
  const [newCatColor, setNewCatColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [categoryEditTarget, setCategoryEditTarget] = useState<any>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [editCatColor, setEditCatColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);
  const [payAllDialogOpen, setPayAllDialogOpen] = useState(false);
  const [bulkCategoriesOpen, setBulkCategoriesOpen] = useState(false);
  const [categoryImportOpen, setCategoryImportOpen] = useState(false);
  const [bulkExpensesOpen, setBulkExpensesOpen] = useState(false);

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
  const { data: unpaidData } = useGetSchoolTransactionsQuery({ type: 'EXPENSE', isPaid: false, limit: 1 });
  const [createTxn, { isLoading: creating }] = useCreateSchoolTransactionMutation();
  const [updateTxn, { isLoading: updating }] = useUpdateSchoolTransactionMutation();
  const [deleteTxn, { isLoading: deleting }] = useDeleteSchoolTransactionMutation();
  const [payTxn, { isLoading: paying }] = usePaySchoolTransactionMutation();
  const [payAllTxns, { isLoading: payingAll }] = usePaySchoolTransactionsBulkMutation();
  const [createCat, { isLoading: creatingCat }] = useCreateFeeCategoryMutation();
  const [updateCat, { isLoading: savingCat }] = useUpdateFeeCategoryMutation();
  const [deleteCat, { isLoading: deletingCat }] = useDeleteFeeCategoryMutation();
  const [fetchVoucherLines] = useLazyGetSchoolTransactionsQuery();
  const { data: org } = useGetMyOrganizationQuery();
  const paperSize = useBranchPaperSize();
  const orientation = useBranchPrintOrientation();

  const expenses: any[] = txnData?.results || [];
  const totalResults = txnData?.totalResults || 0;
  const totalPages = txnData?.totalPages || 1;
  const categories: any[] = catData || [];
  const unpaidCount = unpaidData?.totalResults || 0;

  // ── Client-side search filter (description / category name / vendor / #) ─
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return expenses.filter((e) => {
      if (methodFilter !== 'all' && e.paymentMethod !== methodFilter) return false;
      if (!q) return true;
      const desc = (e.description || '').toLowerCase();
      const cat = (e.categoryId?.name || '').toLowerCase();
      const vendor = (e.vendor || '').toLowerCase();
      const num = (e.expenseNumber || '').toLowerCase();
      return desc.includes(q) || cat.includes(q) || vendor.includes(q) || num.includes(q);
    });
  }, [expenses, search, methodFilter]);

  // ── Summary stats from current page (full month totals comes from the page set) ─
  const monthTotal = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
  const todayTotal = expenses
    .filter((e: any) => new Date(e.date).toISOString().slice(0, 10) === todayStr)
    .reduce((s: number, e: any) => s + (e.amount || 0), 0);

  // ── Category breakdown (this page) ──────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number; color: string }> = {};
    expenses.forEach((e) => {
      const key = e.categoryId?.id || e.categoryId?._id || 'uncategorized';
      const name = e.categoryId?.name || 'Uncategorized';
      const color = e.categoryId?.color || DEFAULT_CATEGORY_COLOR;
      if (!map[key]) map[key] = { name, total: 0, count: 0, color };
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
      categoryId: exp.categoryId?.id || exp.categoryId?._id || '',
      amount: String(exp.amount || ''),
      date: new Date(exp.date).toISOString().slice(0, 10),
      paymentMethod: exp.paymentMethod || 'cash',
      description: exp.description || '',
      vendor: exp.vendor || '',
      reference: exp.reference || '',
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
        vendor: form.vendor || undefined,
        reference: form.reference || undefined,
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

  const handleMarkPaid = async (exp: any) => {
    try {
      await payTxn(exp.id || exp._id).unwrap();
      toast.success('Marked as paid');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to mark as paid');
    }
  };

  const handlePayAll = async () => {
    try {
      const result = await payAllTxns({ all: true }).unwrap();
      toast.success(`Paid ${result.paidCount} expense${result.paidCount !== 1 ? 's' : ''} (${formatMoney(result.totalAmount)})`);
      setPayAllDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to pay pending expenses');
    }
  };

  /**
   * Two distinct print options for an expense, matching a real paper workflow:
   * "print this entry" (always just the one line, even if it happens to be
   * part of a bulk voucher) vs "print the full voucher" (every line sharing
   * that voucherNumber, like an invoice with several line items).
   */
  const printLines = (voucherNumber: string, exp: any, lines: any[]) => {
    try {
      printExpenseVoucher(
        voucherNumber,
        exp.date,
        exp.paymentMethod,
        lines.map((l: any) => ({ categoryName: l.categoryId?.name, vendor: l.vendor, description: l.description, amount: l.amount })),
        { name: org?.name || 'School', address: org?.address, phone: org?.phone, currencyMeta },
        paperSize,
        orientation,
      );
    } catch (err: any) {
      toast.error(err?.message || 'Unable to open the print window — check your popup blocker');
    }
  };

  const handlePrintSingle = (exp: any) => {
    printLines(exp.expenseNumber || 'EXPENSE', exp, [exp]);
  };

  const handlePrintVoucher = async (exp: any) => {
    if (!exp.voucherNumber) return handlePrintSingle(exp);
    try {
      const result = await fetchVoucherLines({ type: 'EXPENSE', voucherNumber: exp.voucherNumber, limit: 100 }).unwrap();
      printLines(exp.voucherNumber, exp, result?.results || []);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to load voucher');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return toast.error('Category name is required');
    try {
      await createCat({
        name: newCatName.trim(),
        type: 'EXPENSE',
        description: newCatDesc.trim() || undefined,
        color: newCatColor,
      }).unwrap();
      toast.success('Expense category created');
      setNewCatName('');
      setNewCatDesc('');
      setNewCatColor(DEFAULT_CATEGORY_COLOR);
      setCategoryDialog(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create category');
    }
  };

  const openEditCategory = (cat: any) => {
    setCategoryEditTarget(cat);
    setEditCatName(cat.name || '');
    setEditCatDesc(cat.description || '');
    setEditCatColor(cat.color || DEFAULT_CATEGORY_COLOR);
  };

  const handleUpdateCategory = async () => {
    if (!categoryEditTarget) return;
    if (!editCatName.trim()) return toast.error('Category name is required');
    try {
      await updateCat({
        id: categoryEditTarget.id || categoryEditTarget._id,
        name: editCatName.trim(),
        description: editCatDesc.trim(),
        color: editCatColor,
      }).unwrap();
      toast.success('Category updated');
      setCategoryEditTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteCat(categoryToDelete.id || categoryToDelete._id).unwrap();
      toast.success('Category deleted');
      setCategoryToDelete(null);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to delete category');
    }
  };

  const openCategoryDialog = () => {
    setNewCatColor(nextCategoryColor(categories.length));
    setCategoryDialog(true);
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
    <div className="space-y-5">
      {/* ── Header actions ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 flex-wrap -mt-1">
        {unpaidCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="border-amber-400 text-amber-700 hover:bg-amber-50"
            onClick={() => setPayAllDialogOpen(true)}
          >
            <Wallet className="mr-1.5 h-3.5 w-3.5" /> Pay Pending ({unpaidCount})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={openCategoryDialog}>
          <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Add Category
        </Button>
        <Button variant="outline" size="sm" onClick={() => setBulkCategoriesOpen(true)}>
          <Layers className="mr-1.5 h-3.5 w-3.5" /> Add Multiple Categories
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCategoryImportOpen(true)}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Import Categories
        </Button>
        <Button variant="outline" size="sm" onClick={() => setBulkExpensesOpen(true)}>
          <Layers className="mr-1.5 h-3.5 w-3.5" /> Bulk Add Expenses
        </Button>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Expense
        </Button>
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
                <p className="text-xl font-bold text-rose-600">{formatMoney(todayTotal)}</p>
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
                <p className="text-xl font-bold text-orange-600">{formatMoney(monthTotal)}</p>
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

      <CategoryBreakdown
        categories={categories}
        onAddExpense={(categoryId) => { setEditTarget(null); setForm({ ...emptyForm(), categoryId }); setExpenseDialog('create'); }}
        onEditCategory={openEditCategory}
        onDeleteCategory={setCategoryToDelete}
        onPrintExpense={handlePrintSingle}
      />

      <div className="space-y-4">
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
                      placeholder="Description, category, vendor, #…"
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
                    <TableHead className="w-28 text-center">Actions</TableHead>
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
                    filtered.map((exp: any) => {
                      const catColor = exp.categoryId?.color || DEFAULT_CATEGORY_COLOR;
                      return (
                        <TableRow key={exp.id || exp._id} className="hover:bg-muted/30 text-sm">
                          <TableCell className="pl-4 text-muted-foreground whitespace-nowrap">
                            {new Date(exp.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-medium">{exp.description || '—'}</p>
                              {exp.isPaid === false && (
                                <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 bg-amber-50 shrink-0">
                                  <Clock className="mr-1 h-2.5 w-2.5" /> Pending
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              {exp.expenseNumber && <span className="font-mono">{exp.expenseNumber}</span>}
                              {exp.vendor && <span className="truncate">· {exp.vendor}</span>}
                              {exp.voucherNumber && (
                                <button
                                  type="button"
                                  className="font-mono text-indigo-600 hover:underline shrink-0"
                                  title="Part of a bulk voucher — click to print the full voucher"
                                  onClick={() => handlePrintVoucher(exp)}
                                >
                                  · {exp.voucherNumber}
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {exp.categoryId?.name ? (
                              <Badge
                                variant="outline"
                                className="text-[11px]"
                                style={{ backgroundColor: `${catColor}1a`, color: catColor, borderColor: `${catColor}55` }}
                              >
                                {exp.categoryId.name}
                              </Badge>
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
                            {formatMoney(exp.amount || 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {exp.isPaid === false && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-green-600 hover:text-green-700"
                                  title="Mark as paid"
                                  disabled={paying}
                                  onClick={() => handleMarkPaid(exp)}
                                >
                                  <Wallet className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-indigo-600 hover:text-indigo-700"
                                title={`Print this entry (${exp.expenseNumber || 'expense'})`}
                                onClick={() => handlePrintSingle(exp)}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(exp)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(exp)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
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

      {/* ── Add/Edit Expense Dialog ──────────────────────────────────────────── */}
      <Dialog open={expenseDialog !== null} onOpenChange={(open) => { if (!open) closeExpenseDialog(); }}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{expenseDialog === 'create' ? 'Add Expense' : 'Edit Expense'}</DialogTitle>
            <DialogDescription>
              {expenseDialog === 'create' ? 'Record a new school expense.' : 'Update the expense details.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Amount ({currencySymbol}) *</Label>
                <Input
                  type="number"
                  min="0"
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
                <CategoryCombobox
                  className="mt-1"
                  categories={categories}
                  value={form.categoryId}
                  onChange={(id) => setForm({ ...form, categoryId: id })}
                  placeholder="Select or create category"
                />
              </div>
              <div>
                <Label>Vendor</Label>
                <Input
                  className="mt-1"
                  placeholder="Vendor name"
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                />
              </div>
              <div>
                <Label>Reference</Label>
                <Input
                  className="mt-1"
                  placeholder="Invoice/Receipt #"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
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
      <Dialog open={categoryDialog} onOpenChange={(open) => { if (!open) { setCategoryDialog(false); setNewCatName(''); setNewCatDesc(''); setNewCatColor(DEFAULT_CATEGORY_COLOR); } }}>
        <DialogContent className="max-w-sm sm:max-w-sm">
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
            <div>
              <Label>Color</Label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" className="h-9 w-12 rounded border cursor-pointer" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} />
                <Input className="flex-1" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCategoryDialog(false); setNewCatName(''); setNewCatDesc(''); setNewCatColor(DEFAULT_CATEGORY_COLOR); }}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={creatingCat}>
              {creatingCat ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Category Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!categoryEditTarget} onOpenChange={(open) => { if (!open) setCategoryEditTarget(null); }}>
        <DialogContent className="max-w-sm sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input className="mt-1" value={editCatName} onChange={(e) => setEditCatName(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1" value={editCatDesc} onChange={(e) => setEditCatDesc(e.target.value)} />
            </div>
            <div>
              <Label>Color</Label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" className="h-9 w-12 rounded border cursor-pointer" value={editCatColor} onChange={(e) => setEditCatColor(e.target.value)} />
                <Input className="flex-1" value={editCatColor} onChange={(e) => setEditCatColor(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryEditTarget(null)}>Cancel</Button>
            <Button onClick={handleUpdateCategory} disabled={savingCat}>
              {savingCat ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Category Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => { if (!open) setCategoryToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{categoryToDelete?.name}</strong>. Expenses already recorded under it keep their history but show as uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCategory}
              disabled={deletingCat}
            >
              {deletingCat ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Expense Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <strong>{formatMoney(deleteTarget?.amount || 0)}</strong>
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

      {/* ── Pay All Pending Confirmation ───────────────────────────────────────── */}
      <AlertDialog open={payAllDialogOpen} onOpenChange={setPayAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pay All Pending Expenses</AlertDialogTitle>
            <AlertDialogDescription>
              This marks every unpaid expense (including auto-generated recurring cycles) as paid and posts them to the accounting ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={payingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-green-600 hover:bg-green-700" onClick={handlePayAll} disabled={payingAll}>
              {payingAll ? (<><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Paying…</>) : 'Pay All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkCategoriesDialog open={bulkCategoriesOpen} onOpenChange={setBulkCategoriesOpen} />
      <ExpenseCategoryImportDialog open={categoryImportOpen} onOpenChange={setCategoryImportOpen} existingCount={categories.length} />
      <BulkExpensesDialog open={bulkExpensesOpen} onOpenChange={setBulkExpensesOpen} categories={categories} />
    </div>
  );
}
