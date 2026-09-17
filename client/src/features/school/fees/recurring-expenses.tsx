import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Play, Wallet, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useFormatMoney } from '@/lib/format-money';
import {
  useGetSchoolRecurringExpensesQuery,
  useCreateSchoolRecurringExpenseMutation,
  useUpdateSchoolRecurringExpenseMutation,
  useDeleteSchoolRecurringExpenseMutation,
  useRunSchoolRecurringExpensesNowMutation,
  usePaySchoolRecurringExpenseRuleMutation,
  usePayAllSchoolRecurringExpensesMutation,
  useGetSchoolTransactionsQuery,
  usePaySchoolTransactionMutation,
  useGetExpenseCategoriesQuery,
} from '@/stores/school.api';
import { CategoryCombobox } from './category-combobox';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const today = () => new Date().toISOString().slice(0, 10);

type FormState = {
  name: string;
  categoryId: string;
  amount: string;
  description: string;
  vendor: string;
  paymentMethod: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek: string;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
};

const emptyForm = (): FormState => ({
  name: '',
  categoryId: '',
  amount: '',
  description: '',
  vendor: '',
  paymentMethod: 'cash',
  frequency: 'monthly',
  dayOfWeek: '1',
  dayOfMonth: '1',
  startDate: today(),
  endDate: '',
});

function describeSchedule(rule: any) {
  if (rule.frequency === 'daily') return 'Daily';
  if (rule.frequency === 'weekly') return `Weekly — ${DAYS_OF_WEEK[rule.dayOfWeek ?? 0]?.label}`;
  return `Monthly — day ${rule.dayOfMonth ?? 1}`;
}

export function SchoolRecurringExpenseManager() {
  const formatMoney = useFormatMoney();

  const { data, isLoading } = useGetSchoolRecurringExpensesQuery({ limit: 100 });
  const { data: catData } = useGetExpenseCategoriesQuery(undefined);
  const categories: any[] = catData || [];
  const rules: any[] = data?.results || [];
  const monthSummary = data?.monthSummary;

  const [createRule, { isLoading: isCreating }] = useCreateSchoolRecurringExpenseMutation();
  const [updateRule, { isLoading: isUpdating }] = useUpdateSchoolRecurringExpenseMutation();
  const [deleteRule] = useDeleteSchoolRecurringExpenseMutation();
  const [runNow, { isLoading: isRunning }] = useRunSchoolRecurringExpensesNowMutation();
  const [payRule, { isLoading: isPayingRule }] = usePaySchoolRecurringExpenseRuleMutation();
  const [payAll, { isLoading: isPayingAll }] = usePayAllSchoolRecurringExpensesMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [ruleToDelete, setRuleToDelete] = useState<any>(null);
  const [payAllDialogOpen, setPayAllDialogOpen] = useState(false);
  const [payRuleDialogOpen, setPayRuleDialogOpen] = useState(false);
  const [ruleToPay, setRuleToPay] = useState<any>(null);

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const totalUnpaid = useMemo(
    () => rules.reduce((sum, r) => sum + (r.unpaidAmount || 0), 0),
    [rules],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (rule: any) => {
    setEditingId(rule.id || rule._id);
    setForm({
      name: rule.name || '',
      categoryId: rule.categoryId?.id || rule.categoryId?._id || '',
      amount: String(rule.amount ?? ''),
      description: rule.description || '',
      vendor: rule.vendor || '',
      paymentMethod: rule.paymentMethod || 'cash',
      frequency: rule.frequency || 'monthly',
      dayOfWeek: String(rule.dayOfWeek ?? 1),
      dayOfMonth: String(rule.dayOfMonth ?? 1),
      startDate: rule.startDate ? new Date(rule.startDate).toISOString().slice(0, 10) : today(),
      endDate: rule.endDate ? new Date(rule.endDate).toISOString().slice(0, 10) : '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Rule name is required');
    if (!form.categoryId) return toast.error('Category is required');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Amount must be greater than 0');
    if (!form.description.trim()) return toast.error('Description is required');
    if (!form.startDate) return toast.error('Start date is required');

    const body: any = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      amount: Number(form.amount),
      description: form.description.trim(),
      vendor: form.vendor.trim() || undefined,
      paymentMethod: form.paymentMethod,
      frequency: form.frequency,
      startDate: form.startDate,
      endDate: form.endDate || null,
    };
    if (form.frequency === 'weekly') body.dayOfWeek = Number(form.dayOfWeek);
    if (form.frequency === 'monthly') body.dayOfMonth = Number(form.dayOfMonth);

    try {
      if (editingId) {
        await updateRule({ id: editingId, ...body }).unwrap();
        toast.success('Recurring expense updated');
      } else {
        await createRule(body).unwrap();
        toast.success('Recurring expense created');
      }
      setFormOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save recurring expense');
    }
  };

  const handleToggleActive = async (rule: any, isActive: boolean) => {
    try {
      await updateRule({ id: rule.id || rule._id, isActive }).unwrap();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to update rule');
    }
  };

  const handleDelete = async () => {
    if (!ruleToDelete) return;
    try {
      await deleteRule(ruleToDelete.id || ruleToDelete._id).unwrap();
      toast.success('Recurring expense deleted');
      setRuleToDelete(null);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to delete');
    }
  };

  const handleRunNow = async () => {
    try {
      const result = await runNow(undefined).unwrap();
      if (result.created > 0) toast.success(`Generated ${result.created} expense${result.created !== 1 ? 's' : ''}`);
      else toast.info('Nothing due right now — all rules are up to date');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to run recurring expenses');
    }
  };

  const handlePayAll = async () => {
    try {
      const result = await payAll(undefined).unwrap();
      toast.success(`Paid ${result.paidCount} expense${result.paidCount !== 1 ? 's' : ''} (${formatMoney(result.totalAmount)})`);
      setPayAllDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to pay pending expenses');
    }
  };

  const openPayRuleDialog = (rule: any) => {
    setRuleToPay(rule);
    setPayRuleDialogOpen(true);
  };

  const handlePayRule = async () => {
    if (!ruleToPay) return;
    try {
      const result = await payRule(ruleToPay.id || ruleToPay._id).unwrap();
      toast.success(`Paid ${result.paidCount} expense${result.paidCount !== 1 ? 's' : ''} (${formatMoney(result.totalAmount)})`);
      setPayRuleDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to pay pending expenses');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recurring Expenses</h2>
          <p className="text-sm text-muted-foreground">
            Automate bills that repeat on a schedule — rent, salaries, utilities.
            {monthSummary ? ` Generated ${formatMoney(monthSummary.amount)} this month across ${monthSummary.days} day${monthSummary.days !== 1 ? 's' : ''}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleRunNow} disabled={isRunning}>
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> {isRunning ? 'Running…' : 'Run Now'}
          </Button>
          {totalUnpaid > 0 && (
            <Button variant="outline" size="sm" className="border-green-500 text-green-700 hover:bg-green-50" onClick={() => setPayAllDialogOpen(true)}>
              <Wallet className="mr-1.5 h-3.5 w-3.5" /> Pay All Pending ({formatMoney(totalUnpaid)})
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> New Recurring Expense
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead className="text-center">Generated</TableHead>
                <TableHead>Unpaid</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    <p className="text-sm">No recurring expenses set up yet.</p>
                    <Button size="sm" className="mt-3" onClick={openCreate}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Create your first rule
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => {
                  const cat = rule.categoryId;
                  const color = cat?.color || '#6366f1';
                  return (
                    <TableRow key={rule.id || rule._id} className="text-sm">
                      <TableCell className="pl-4">
                        <p className="font-medium">{rule.name}</p>
                        {rule.vendor && <p className="text-xs text-muted-foreground">{rule.vendor}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[11px]"
                          style={{ backgroundColor: `${color}1a`, color, borderColor: `${color}55` }}
                        >
                          {cat?.name || 'Uncategorized'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{formatMoney(rule.amount)}</TableCell>
                      <TableCell className="text-muted-foreground">{describeSchedule(rule)}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {rule.nextRunDate ? new Date(rule.nextRunDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        {rule.pendingCount > 0 && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-400 text-amber-600 bg-amber-50">
                            {rule.pendingCount} due
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">{rule.totalGenerated || 0}</TableCell>
                      <TableCell>
                        {rule.unpaidCount > 0 ? (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-700 hover:text-amber-800" onClick={() => openPayRuleDialog(rule)}>
                            {rule.unpaidCount} · {formatMoney(rule.unpaidAmount)}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={rule.isActive} onCheckedChange={(v) => handleToggleActive(rule, v)} />
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rule)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRuleToDelete(rule)} title="Delete">
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
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Recurring Expense' : 'New Recurring Expense'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the rule — future cycles use the new values.' : 'Automatically record this expense on a repeating schedule.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Rule Name *</Label>
              <Input className="mt-1" placeholder="e.g. Staff Salary, Building Rent, Electricity Bill" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <CategoryCombobox
                  className="mt-1"
                  categories={categories}
                  value={form.categoryId}
                  onChange={(id) => set('categoryId', id)}
                  placeholder="Select or create category"
                />
              </div>
              <div>
                <Label>Amount *</Label>
                <Input type="number" min="0" step="0.01" className="mt-1" placeholder="0.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea className="mt-1 resize-none" rows={2} placeholder="Brief description" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vendor (optional)</Label>
                <Input className="mt-1" placeholder="Vendor name" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => set('paymentMethod', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Frequency *</Label>
              <Select value={form.frequency} onValueChange={(v: any) => set('frequency', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily — every day (auto catch-up missed days)</SelectItem>
                  <SelectItem value="weekly">Weekly — specific day of week</SelectItem>
                  <SelectItem value="monthly">Monthly — specific day of month (handles 30/31 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.frequency === 'weekly' && (
              <div>
                <Label>Day of Week</Label>
                <Select value={form.dayOfWeek} onValueChange={(v) => set('dayOfWeek', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <div>
                <Label>Day of Month (1–28 recommended)</Label>
                <Input type="number" min="1" max="31" className="mt-1" placeholder="1" value={form.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date *</Label>
                <Input type="date" className="mt-1" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Input type="date" className="mt-1" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isCreating || isUpdating}>
              {(isCreating || isUpdating) ? 'Saving…' : editingId ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay All Confirmation */}
      <AlertDialog open={payAllDialogOpen} onOpenChange={setPayAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pay All Pending Expenses</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark every unpaid auto-generated cycle across all rules as paid ({formatMoney(totalUnpaid)} total) and post them to the accounting ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPayingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-green-600 hover:bg-green-700" onClick={handlePayAll} disabled={isPayingAll}>
              {isPayingAll ? 'Paying…' : 'Pay All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay-for-one-rule Dialog */}
      <Dialog open={payRuleDialogOpen} onOpenChange={setPayRuleDialogOpen}>
        <DialogContent className="max-w-lg sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pending payments — {ruleToPay?.name}</DialogTitle>
            <DialogDescription>Each cycle can be paid individually, or all at once below.</DialogDescription>
          </DialogHeader>
          {ruleToPay && (
            <PayRuleDialogBody
              rule={ruleToPay}
              onPayAll={handlePayRule}
              isPayingAll={isPayingRule}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!ruleToDelete} onOpenChange={(open) => { if (!open) setRuleToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops <strong>{ruleToDelete?.name}</strong> from generating future cycles. Expenses already generated are not removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PayRuleDialogBody({ rule, onPayAll, isPayingAll }: { rule: any; onPayAll: () => void; isPayingAll: boolean }) {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useGetSchoolTransactionsQuery({
    referenceId: rule.id || rule._id,
    referenceModel: 'SchoolRecurringExpense',
    isPaid: false,
    sortBy: 'date:asc',
    limit: 100,
  });
  const [payExpense, { isLoading: isPayingSingle }] = usePaySchoolTransactionMutation();
  const [payingId, setPayingId] = useState<string | null>(null);

  const pending: any[] = data?.results || [];

  const handlePaySingle = async (id: string) => {
    setPayingId(id);
    try {
      await payExpense(id).unwrap();
      toast.success('Marked as paid');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to mark as paid');
    } finally {
      setPayingId(null);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (pending.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Nothing pending for this rule.</div>;
  }

  const total = pending.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-3 py-2">
      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
        {pending.map((txn) => (
          <div key={txn.id || txn._id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{new Date(txn.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
              <p className="text-xs text-muted-foreground">{formatMoney(txn.amount)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={isPayingSingle && payingId === (txn.id || txn._id)}
              onClick={() => handlePaySingle(txn.id || txn._id)}
            >
              {isPayingSingle && payingId === (txn.id || txn._id) ? 'Paying…' : 'Pay'}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="text-sm font-medium">Total: {formatMoney(total)}</span>
        <Button size="sm" onClick={onPayAll} disabled={isPayingAll} className="bg-green-600 hover:bg-green-700">
          {isPayingAll ? 'Paying…' : <><Play className="mr-1.5 h-3.5 w-3.5" /> Pay All ({pending.length})</>}
        </Button>
      </div>
    </div>
  );
}
