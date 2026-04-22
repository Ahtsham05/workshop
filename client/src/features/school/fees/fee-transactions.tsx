import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import {
  useGetSchoolTransactionsQuery,
  useCreateSchoolTransactionMutation,
  useDeleteSchoolTransactionMutation,
  useGetFeeCategoriesQuery,
} from '@/stores/school.api';
import { toast } from 'sonner';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'online', 'other'];

export default function FeeTransactions() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    type: 'all',
    categoryId: 'all',
    startDate: firstOfMonth,
    endDate: today.toISOString().slice(0, 10),
    page: 1,
  });
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({
    type: 'INCOME',
    categoryId: '',
    amount: '',
    date: today.toISOString().slice(0, 10),
    paymentMethod: 'cash',
    description: '',
  });

  const queryParams: any = { page: filters.page, limit: 25, startDate: filters.startDate, endDate: filters.endDate };
  if (filters.type !== 'all') queryParams.type = filters.type;
  if (filters.categoryId !== 'all') queryParams.categoryId = filters.categoryId;

  const { data: txnData, isLoading } = useGetSchoolTransactionsQuery(queryParams);
  const { data: categoriesData } = useGetFeeCategoriesQuery({});
  const [createTxn, { isLoading: creating }] = useCreateSchoolTransactionMutation();
  const [deleteTxn] = useDeleteSchoolTransactionMutation();

  const transactions = txnData?.results || [];
  const categories = categoriesData?.results || [];
  const filteredCategories = form.type === 'all' ? categories : categories.filter((c: any) => c.type === form.type);

  const handleCreate = async () => {
    if (!form.amount || !form.date) return toast.error('Fill all required fields');
    try {
      const body: any = { type: form.type, amount: Number(form.amount), date: form.date, paymentMethod: form.paymentMethod };
      if (form.categoryId) body.categoryId = form.categoryId;
      if (form.description) body.description = form.description;
      await createTxn(body).unwrap();
      toast.success('Transaction recorded');
      setDialog(false);
      setForm({ type: 'INCOME', categoryId: '', amount: '', date: today.toISOString().slice(0, 10), paymentMethod: 'cash', description: '' });
    } catch (err: any) { toast.error(err?.data?.message || 'Failed to save'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    try {
      await deleteTxn(id).unwrap();
      toast.success('Deleted');
    } catch (err: any) { toast.error(err?.data?.message || 'Delete failed'); }
  };

  const incomeTotal = transactions.filter((t: any) => t.type === 'INCOME').reduce((s: number, t: any) => s + t.amount, 0);
  const expenseTotal = transactions.filter((t: any) => t.type === 'EXPENSE').reduce((s: number, t: any) => s + t.amount, 0);

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Income and expense ledger</p>
        </div>
        <Button onClick={() => setDialog(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Transaction
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2"><TrendingUp className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Income</p>
              <p className="text-xl font-bold text-green-600">PKR {incomeTotal.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2"><TrendingDown className="h-5 w-5 text-red-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="text-xl font-bold text-red-600">PKR {expenseTotal.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className={`rounded-full p-2 ${incomeTotal - expenseTotal >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
              <TrendingUp className={`h-5 w-5 ${incomeTotal - expenseTotal >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Balance</p>
              <p className={`text-xl font-bold ${incomeTotal - expenseTotal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                PKR {(incomeTotal - expenseTotal).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v, page: 1 })}>
          <SelectTrigger className="w-28"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.categoryId} onValueChange={(v) => setFilters({ ...filters, categoryId: v, page: 1 })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" className="w-36 h-9" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 1 })} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" className="w-36 h-9" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 1 })} />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No transactions found for this period.</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-left px-4 py-2 font-medium">Method</th>
                <th className="text-right px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t: any) => (
                <tr key={t.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(t.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs">{t.categoryId?.name || '—'}</span>
                  </td>
                  <td className="px-4 py-2 max-w-xs truncate">{t.description || '—'}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-xs capitalize">{(t.paymentMethod || '').replace('_', ' ')}</Badge>
                  </td>
                  <td className={`px-4 py-2 text-right font-semibold ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'INCOME' ? '+' : '-'} PKR {t.amount?.toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {txnData && txnData.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Prev</Button>
          <span className="text-sm py-1.5">Page {filters.page} / {txnData.totalPages}</span>
          <Button variant="outline" size="sm" disabled={filters.page >= txnData.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, categoryId: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Income</SelectItem>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (PKR) <span className="text-destructive">*</span></Label>
                <Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Saving…' : 'Save Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
