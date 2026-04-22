import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, DollarSign, AlertCircle, Search, CreditCard, Clock, CheckCircle, TrendingDown } from 'lucide-react';
import { useGetSchoolFeesQuery, useCreateSchoolFeeMutation, usePaySchoolFeeMutation, useGetOverdueFeesQuery, useGetSchoolClassesQuery, useGetStudentsQuery } from '@/stores/school.api';
import { toast } from 'sonner';

const FEE_TYPES = ['tuition', 'admission', 'exam', 'transport', 'library', 'laboratory', 'sports', 'computer', 'miscellaneous', 'other'];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'online', 'other'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:  { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  partial:  { label: 'Partial', color: 'bg-orange-100 text-orange-700', icon: TrendingDown },
  paid:     { label: 'Paid', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  overdue:  { label: 'Overdue', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  waived:   { label: 'Waived', color: 'bg-gray-100 text-gray-500', icon: CheckCircle },
};

export default function FeeManagement() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<any>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('');

  // Debounce student search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedStudentSearch(studentSearch), 400);
    return () => clearTimeout(timer);
  }, [studentSearch]);

  const params: any = { page, limit: 20, sortBy: 'createdAt:desc' };
  if (statusFilter !== 'all') params.status = statusFilter;
  if (classFilter !== 'all') params.classId = classFilter;

  const { data: feesData, isLoading } = useGetSchoolFeesQuery(params);
  const { data: overdueData } = useGetOverdueFeesQuery({});
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: studentsData } = useGetStudentsQuery(debouncedStudentSearch.length >= 2 ? { firstName: debouncedStudentSearch, limit: 10 } : { limit: 0 }, { skip: debouncedStudentSearch.length < 2 });

  const [createFee] = useCreateSchoolFeeMutation();
  const [payFee] = usePaySchoolFeeMutation();

  const [form, setForm] = useState({ studentId: '', studentLabel: '', classId: '', feeType: 'tuition', amount: '', discount: '0', fine: '0', dueDate: new Date(new Date().setDate(10)).toISOString().split('T')[0], month: MONTHS[new Date().getMonth()], year: String(new Date().getFullYear()) });
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash' });

  // Summary stats
  const feeSummary = useMemo(() => {
    const all = feesData?.results || [];
    const pending = all.filter((f: any) => f.status === 'pending' || f.status === 'overdue');
    const totalPending = pending.reduce((sum: number, f: any) => sum + ((f.netAmount || 0) - (f.paidAmount || 0)), 0);
    const totalCollected = all.reduce((sum: number, f: any) => sum + (f.paidAmount || 0), 0);
    return { totalPending, totalCollected, overdueCount: overdueData?.length || 0 };
  }, [feesData, overdueData]);

  const handleCreateFee = async () => {
    try {
      await createFee({
        studentId: form.studentId, classId: form.classId, feeType: form.feeType,
        amount: Number(form.amount), discount: Number(form.discount), fine: Number(form.fine),
        dueDate: form.dueDate, month: form.month, year: Number(form.year),
      }).unwrap();
      toast.success('Fee created');
      setCreateDialogOpen(false);
      setForm({ studentId: '', studentLabel: '', classId: '', feeType: 'tuition', amount: '', discount: '0', fine: '0', dueDate: new Date(new Date().setDate(10)).toISOString().split('T')[0], month: MONTHS[new Date().getMonth()], year: String(new Date().getFullYear()) });
      setStudentSearch('');
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  const handlePayFee = async () => {
    if (!selectedFee) return;
    try {
      await payFee({ id: selectedFee.id || selectedFee._id, amount: Number(payForm.amount), paymentMethod: payForm.paymentMethod }).unwrap();
      toast.success('Payment recorded');
      setPayDialogOpen(false); setSelectedFee(null);
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fee Management</h1>
          <p className="text-muted-foreground">Manage student fees and payments</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Fee
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-red-200">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-red-700">{feeSummary.overdueCount}</p>
                <p className="text-xs text-muted-foreground">Overdue Fees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xl font-bold">Rs. {feeSummary.totalPending.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-green-700">Rs. {feeSummary.totalCollected.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Collected (this page)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classesData?.results?.map((c: any) => <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Fees list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : !feesData?.results?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No fees found</p>
            </div>
          ) : (
            <div className="divide-y">
              {feesData.results.map((fee: any) => {
                const cfg = STATUS_CONFIG[fee.status] || STATUS_CONFIG.pending;
                const remaining = (fee.netAmount || 0) - (fee.paidAmount || 0);
                const isOverdue = fee.status === 'overdue';
                return (
                  <div key={fee.id || fee._id} className={`flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors ${isOverdue ? 'bg-red-50/60' : ''}`}>
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {fee.studentId?.firstName} {fee.studentId?.lastName}
                        {fee.month && <span className="text-muted-foreground font-normal"> — {fee.month} {fee.year}</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground capitalize">{fee.feeType}</span>
                        {fee.classId?.name && <span className="text-xs text-muted-foreground">· {fee.classId.name}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-sm font-semibold">Rs. {(fee.netAmount || 0).toLocaleString()}</p>
                      {fee.paidAmount > 0 && <p className="text-xs text-muted-foreground">Paid: Rs. {fee.paidAmount.toLocaleString()}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Due {new Date(fee.dueDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <Badge className={`${cfg.color} shrink-0 text-xs`}>{cfg.label}</Badge>
                    {fee.status !== 'paid' && fee.status !== 'waived' && (
                      <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => {
                        setSelectedFee(fee);
                        setPayForm({ amount: String(remaining), paymentMethod: 'cash' });
                        setPayDialogOpen(true);
                      }}>
                        <CreditCard className="h-3 w-3" /> Pay
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {feesData?.totalPages > 1 && (
            <div className="flex justify-center gap-2 py-4 border-t">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page} of {feesData.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= feesData.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Fee Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Fee Record</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Student search */}
            <div>
              <Label>Student <span className="text-destructive">*</span></Label>
              {form.studentId ? (
                <div className="flex items-center gap-2 mt-1 p-2 border rounded-md bg-muted/30">
                  <span className="flex-1 text-sm">{form.studentLabel}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setForm(p => ({...p, studentId: '', studentLabel: '', classId: ''}))}>Change</Button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by first name (min 2 chars)..." className="pl-10" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                  {studentsData?.results?.length > 0 && (
                    <div className="absolute z-10 w-full bg-popover border rounded-md shadow-md mt-1 max-h-48 overflow-y-auto">
                      {studentsData.results.map((s: any) => (
                        <button key={s.id || s._id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => {
                          setForm(p => ({ ...p, studentId: s.id || s._id, studentLabel: `${s.firstName} ${s.lastName} — ${s.classId?.name || ''}`, classId: s.classId?._id || s.classId?.id || s.classId || p.classId }));
                          setStudentSearch('');
                        }}>
                          {s.firstName} {s.lastName} <span className="text-muted-foreground text-xs ml-1">{s.classId?.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Class <span className="text-destructive">*</span></Label>
                <Select value={form.classId} onValueChange={(v) => setForm(p => ({...p, classId: v}))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{classesData?.results?.map((c: any) => <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fee Type</Label>
                <Select value={form.feeType} onValueChange={(v) => setForm(p => ({...p, feeType: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FEE_TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input type="number" min={1} value={form.amount} onChange={(e) => setForm(p => ({...p, amount: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label>Discount</Label>
                <Input type="number" min={0} value={form.discount} onChange={(e) => setForm(p => ({...p, discount: e.target.value}))} />
              </div>
              <div>
                <Label>Fine</Label>
                <Input type="number" min={0} value={form.fine} onChange={(e) => setForm(p => ({...p, fine: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Month</Label>
                <Select value={form.month} onValueChange={(v) => setForm(p => ({...p, month: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Input type="number" value={form.year} onChange={(e) => setForm(p => ({...p, year: e.target.value}))} />
              </div>
              <div>
                <Label>Due Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm(p => ({...p, dueDate: e.target.value}))} />
              </div>
            </div>
            {form.amount && (
              <div className="flex justify-between text-sm p-2 bg-muted/40 rounded">
                <span>Net Amount:</span>
                <span className="font-semibold">Rs. {(Number(form.amount) - Number(form.discount) + Number(form.fine)).toLocaleString()}</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFee} disabled={!form.studentId || !form.classId || !form.amount || !form.dueDate}>Create Fee</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {selectedFee && (
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1 mb-2">
              <p className="font-medium">{selectedFee.studentId?.firstName} {selectedFee.studentId?.lastName}</p>
              <p className="text-muted-foreground capitalize">{selectedFee.feeType} — {selectedFee.month} {selectedFee.year}</p>
              <div className="flex justify-between text-xs">
                <span>Total: Rs. {(selectedFee.netAmount || 0).toLocaleString()}</span>
                <span>Remaining: Rs. {((selectedFee.netAmount || 0) - (selectedFee.paidAmount || 0)).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label>Payment Amount <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} value={payForm.amount} onChange={(e) => setPayForm(p => ({...p, amount: e.target.value}))} />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm(p => ({...p, paymentMethod: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePayFee} disabled={!payForm.amount} className="gap-1"><CreditCard className="h-4 w-4" /> Record Payment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
