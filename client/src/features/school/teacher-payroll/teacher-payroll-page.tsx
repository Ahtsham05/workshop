import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DollarSign, Plus, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import {
  useGetTeachersQuery,
  useGetTeacherPayrollsQuery,
  useGenerateTeacherPayrollMutation,
  useMarkTeacherPayrollPaidMutation,
  useDeleteTeacherPayrollMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

const now = new Date();

const fmt = (n: number) => n?.toLocaleString('en-PK') ?? '0';

export default function TeacherPayrollPage() {
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailPayroll, setDetailPayroll] = useState<any>(null);

  const [form, setForm] = useState({
    teacherId: '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    basicSalary: '',
    allowances: { transport: 0, medical: 0, other: 0 },
    deductions: { absent: 0, late: 0, tax: 0, other: 0 },
    bonus: 0,
    notes: '',
  });

  const { data: teachersData } = useGetTeachersQuery({ limit: 200, status: 'active' });
  const teachers = teachersData?.results ?? [];

  const { data: payrollData, isLoading, refetch } = useGetTeacherPayrollsQuery({
    month: filterMonth, year: filterYear, limit: 200,
  });
  const payrolls = payrollData?.results ?? [];

  const [generatePayroll, { isLoading: generating }] = useGenerateTeacherPayrollMutation();
  const [markPaid] = useMarkTeacherPayrollPaidMutation();
  const [deletePayroll] = useDeleteTeacherPayrollMutation();

  const totalNetSalary = payrolls.reduce((s: number, p: any) => s + (p.netSalary ?? 0), 0);
  const paidCount = payrolls.filter((p: any) => p.status === 'paid').length;

  const handleGenerateBulk = async () => {
    if (teachers.length === 0) { toast.error('No active teachers found'); return; }
    let success = 0;
    for (const t of teachers) {
      try {
        await generatePayroll({ teacherId: t._id ?? t.id, month: filterMonth, year: filterYear }).unwrap();
        success++;
      } catch {
        // skip on duplicate
      }
    }
    toast.success(`Generated payroll for ${success} teacher(s)`);
    refetch();
  };

  const handleGenerate = async () => {
    if (!form.teacherId) { toast.error('Select a teacher'); return; }
    try {
      await generatePayroll({
        ...form,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : undefined,
      }).unwrap();
      toast.success('Payroll generated/updated');
      setGenerateOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed');
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await markPaid(id).unwrap();
      toast.success('Marked as paid');
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePayroll(id).unwrap();
      toast.success('Payroll deleted');
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teacher Payroll</h1>
          <p className="text-muted-foreground text-sm">Generate and manage monthly teacher salaries</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(filterMonth)} onValueChange={(v) => setFilterMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="w-24" />
          <Button variant="outline" onClick={handleGenerateBulk} disabled={generating}>
            <RefreshCw className="h-4 w-4 mr-2" /> {generating ? 'Generating...' : 'Generate All'}
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Single Entry
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="bg-blue-50 border-0">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{payrolls.length}</div>
            <div className="text-sm text-muted-foreground">Total Records</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-0">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{paidCount}</div>
            <div className="text-sm text-muted-foreground">Paid</div>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-0">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">PKR {fmt(totalNetSalary)}</div>
            <div className="text-sm text-muted-foreground">Total Payable</div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {MONTHS.find((m) => m.value === filterMonth)?.label} {filterYear} Payroll
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : payrolls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-3">No payroll records for this period.</p>
              <Button variant="outline" onClick={handleGenerateBulk} disabled={generating}>
                {generating ? 'Generating...' : 'Generate for All Teachers'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Teacher</th>
                    <th className="text-right py-2 font-medium">Basic</th>
                    <th className="text-right py-2 font-medium">Allowances</th>
                    <th className="text-right py-2 font-medium">Deductions</th>
                    <th className="text-right py-2 font-medium">Net Salary</th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.map((p: any) => {
                    const teacher = p.teacherId;
                    const name = typeof teacher === 'object' ? `${teacher.firstName} ${teacher.lastName}` : teacher;
                    return (
                      <tr key={p._id ?? p.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setDetailPayroll(p)}>
                        <td className="py-3">
                          <div className="font-medium">{name}</div>
                          <div className="text-xs text-muted-foreground">{typeof teacher === 'object' ? teacher.employeeId : ''}</div>
                        </td>
                        <td className="text-right py-3">PKR {fmt(p.basicSalary)}</td>
                        <td className="text-right py-3 text-green-600">+PKR {fmt(p.totalAllowances)}</td>
                        <td className="text-right py-3 text-red-600">-PKR {fmt(p.totalDeductions)}</td>
                        <td className="text-right py-3 font-bold">PKR {fmt(p.netSalary)}</td>
                        <td className="text-center py-3">
                          <Badge className={p.status === 'paid' ? 'bg-green-100 text-green-700 border-0' : 'bg-yellow-100 text-yellow-700 border-0'}>
                            {p.status === 'paid' ? 'Paid' : 'Draft'}
                          </Badge>
                        </td>
                        <td className="text-right py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {p.status !== 'paid' && (
                              <Button size="sm" variant="outline" className="text-green-600 border-green-300 h-7 px-2" onClick={() => handleMarkPaid(p._id ?? p.id)}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Pay
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-red-500 h-7 px-2">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete payroll?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(p._id ?? p.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Single Payroll Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate Payroll Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Teacher *</Label>
              <Select value={form.teacherId} onValueChange={(v) => {
                const t = teachers.find((t: any) => (t._id ?? t.id) === v);
                setForm((f) => ({ ...f, teacherId: v, basicSalary: String(t?.salary?.basicSalary ?? '') }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>{teachers.map((t: any) => <SelectItem key={t._id ?? t.id} value={t._id ?? t.id}>{t.firstName} {t.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Month *</Label>
                <Select value={String(form.month)} onValueChange={(v) => setForm((f) => ({ ...f, month: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Year *</Label>
                <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Basic Salary (PKR)</Label>
              <Input type="number" value={form.basicSalary} onChange={(e) => setForm((f) => ({ ...f, basicSalary: e.target.value }))} placeholder="Auto from teacher profile" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Transport</Label>
                <Input type="number" value={form.allowances.transport} onChange={(e) => setForm((f) => ({ ...f, allowances: { ...f.allowances, transport: Number(e.target.value) } }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Medical</Label>
                <Input type="number" value={form.allowances.medical} onChange={(e) => setForm((f) => ({ ...f, allowances: { ...f.allowances, medical: Number(e.target.value) } }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bonus</Label>
                <Input type="number" value={form.bonus} onChange={(e) => setForm((f) => ({ ...f, bonus: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGenerate} disabled={generating} className="flex-1">{generating ? 'Generating...' : 'Generate'}</Button>
              <Button variant="outline" onClick={() => setGenerateOpen(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {detailPayroll && (
        <Dialog open={!!detailPayroll} onOpenChange={() => setDetailPayroll(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Payroll Detail — {typeof detailPayroll.teacherId === 'object'
                  ? `${detailPayroll.teacherId.firstName} ${detailPayroll.teacherId.lastName}`
                  : detailPayroll.teacherId}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Month/Year', `${MONTHS.find(m => m.value === detailPayroll.month)?.label} ${detailPayroll.year}`],
                  ['Working Days', detailPayroll.workingDays],
                  ['Present Days', detailPayroll.presentDays],
                  ['Absent Days', detailPayroll.absentDays],
                  ['Late Days', detailPayroll.lateDays],
                  ['Leave Days', detailPayroll.leaveDays],
                  ['Basic Salary', `PKR ${fmt(detailPayroll.basicSalary)}`],
                  ['Transport', `PKR ${fmt(detailPayroll.allowances?.transport)}`],
                  ['Medical', `PKR ${fmt(detailPayroll.allowances?.medical)}`],
                  ['Bonus', `PKR ${fmt(detailPayroll.bonus)}`],
                  ['Absent Deduction', `-PKR ${fmt(detailPayroll.deductions?.absent)}`],
                  ['Tax', `-PKR ${fmt(detailPayroll.deductions?.tax)}`],
                  ['Total Allowances', `PKR ${fmt(detailPayroll.totalAllowances)}`],
                  ['Total Deductions', `-PKR ${fmt(detailPayroll.totalDeductions)}`],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between p-3 bg-primary/10 rounded-lg font-bold">
                <span>Net Salary</span>
                <span className="text-green-600">PKR {fmt(detailPayroll.netSalary)}</span>
              </div>
              {detailPayroll.notes && <div className="text-muted-foreground text-xs">{detailPayroll.notes}</div>}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
