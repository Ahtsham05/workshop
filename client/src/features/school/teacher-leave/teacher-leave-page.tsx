import { useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/stores/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle, XCircle, FileText, Trash2, CalendarCheck, Clock, CheckCircle2, X } from 'lucide-react';
import {
  useGetTeacherLeavesQuery,
  useGetTeachersQuery,
  useApplyTeacherLeaveMutation,
  useApproveTeacherLeaveMutation,
  useRejectTeacherLeaveMutation,
  useDeleteTeacherLeaveMutation,
  useCancelTeacherLeaveMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';

const LEAVE_TYPES = ['sick', 'casual', 'annual', 'emergency', 'unpaid', 'maternity', 'paternity'];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function calcDays(from: string, to: string) {
  if (!from || !to) return 0;
  const diff = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}
function todayStr() { return new Date().toISOString().split('T')[0]; }

// ── Teacher Self-Service Leave View ───────────────────────────────────────────
function MyLeaveView() {
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({ leaveType: 'sick', fromDate: todayStr(), toDate: todayStr(), reason: '' });
  const { data: leavesData, isLoading } = useGetTeacherLeavesQuery({ limit: 200 });
  const [applyLeave, { isLoading: applying }] = useApplyTeacherLeaveMutation();
  const [cancelLeave, { isLoading: cancelling }] = useCancelTeacherLeaveMutation();
  const leaves: any[] = (leavesData as any)?.results ?? (Array.isArray(leavesData) ? leavesData : []);
  const days = calcDays(form.fromDate, form.toDate);

  const handleApply = async () => {
    if (!form.leaveType || !form.reason.trim()) { toast.error('Please fill all fields'); return; }
    if (days <= 0) { toast.error('Invalid date range'); return; }
    try {
      await applyLeave({ ...form, totalDays: days }).unwrap();
      toast.success('Leave application submitted');
      setApplyOpen(false);
      setForm({ leaveType: 'sick', fromDate: todayStr(), toDate: todayStr(), reason: '' });
    } catch (err: any) { toast.error(err?.data?.message ?? 'Failed to submit'); }
  };

  const handleCancel = async (id: string) => {
    try { await cancelLeave(id).unwrap(); toast.success('Leave cancelled'); }
    catch (err: any) { toast.error(err?.data?.message ?? 'Failed to cancel'); }
  };

  const pending = leaves.filter((l) => l.status === 'pending').length;
  const approved = leaves.filter((l) => l.status === 'approved').length;
  const approvedDays = leaves.filter((l) => l.status === 'approved').reduce((s: number, l: any) => s + (l.totalDays || 0), 0);

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarCheck className="h-6 w-6 text-blue-500" />My Leave</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Apply for leave and track your requests</p>
        </div>
        <Button className="gap-2" onClick={() => setApplyOpen(true)}><Plus className="h-4 w-4" />Apply for Leave</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Pending', count: pending, bg: 'bg-yellow-100 text-yellow-600', Icon: Clock },
          { label: 'Approved', count: approved, bg: 'bg-green-100 text-green-600', Icon: CheckCircle2 },
          { label: 'Approved Days', count: approvedDays, bg: 'bg-blue-100 text-blue-600', Icon: CalendarCheck },
        ].map(({ label, count, bg, Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}><Icon className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold leading-none">{count}</p><p className="text-xs text-muted-foreground mt-0.5">{label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leave history table */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Leave History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading…</div>
          ) : leaves.length === 0 ? (
            <div className="p-10 text-center"><CalendarCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" /><p className="text-sm text-muted-foreground">No leave applications yet</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Days</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((leave: any) => {
                    const cfg = STATUS_CONFIG[leave.status] ?? STATUS_CONFIG.pending;
                    return (
                      <TableRow key={leave._id ?? leave.id}>
                        <TableCell className="capitalize font-medium">{leave.leaveType}</TableCell>
                        <TableCell>{fmtDate(leave.fromDate)}</TableCell>
                        <TableCell>{fmtDate(leave.toDate)}</TableCell>
                        <TableCell>{leave.totalDays}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{leave.reason}</TableCell>
                        <TableCell><Badge className={`${cfg.color} border-0 gap-1 text-xs`}>{cfg.label}</Badge></TableCell>
                        <TableCell>
                          {leave.status === 'pending' && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-700" disabled={cancelling} onClick={() => handleCancel(leave._id ?? leave.id)}>Cancel</Button>
                          )}
                          {leave.status === 'rejected' && leave.rejectionReason && (
                            <span className="text-xs text-muted-foreground">{leave.rejectionReason}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apply dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Select value={form.leaveType} onValueChange={(v) => setForm((f) => ({ ...f, leaveType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map((lt) => <SelectItem key={lt} value={lt} className="capitalize">{lt}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>From Date</Label><Input type="date" value={form.fromDate} min={todayStr()} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>To Date</Label><Input type="date" value={form.toDate} min={form.fromDate || todayStr()} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} /></div>
            </div>
            {days > 0 && <p className="text-sm text-muted-foreground">Duration: <span className="font-semibold text-foreground">{days} {days === 1 ? 'day' : 'days'}</span></p>}
            <div className="space-y-1.5"><Label>Reason</Label><Textarea rows={3} placeholder="Briefly describe the reason…" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={handleApply} disabled={applying}>{applying ? 'Submitting…' : 'Submit Application'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Admin Leave Management View (original) ────────────────────────────────────
function AdminLeaveView() {
  const [filterStatus, setFilterStatus] = useState('all');
  const [applyOpen, setApplyOpen] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; id: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [form, setForm] = useState({
    teacherId: '', leaveType: 'sick', fromDate: '', toDate: '', reason: '',
  });

  const { data: leavesData, isLoading, refetch } = useGetTeacherLeavesQuery(
    filterStatus !== 'all' ? { status: filterStatus, limit: 200 } : { limit: 200 },
  );
  const leaves: any[] = (leavesData as any)?.results ?? [];

  const { data: teachersData } = useGetTeachersQuery({ limit: 200, status: 'active' });
  const teachers: any[] = (teachersData as any)?.results ?? [];

  const [applyLeave, { isLoading: applying }] = useApplyTeacherLeaveMutation();
  const [approveLeave] = useApproveTeacherLeaveMutation();
  const [rejectLeave] = useRejectTeacherLeaveMutation();
  const [deleteLeave] = useDeleteTeacherLeaveMutation();

  const pendingCount = leaves.filter((l: any) => l.status === 'pending').length;

  const handleApply = async () => {
    if (!form.teacherId || !form.fromDate || !form.toDate || !form.reason) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await applyLeave(form).unwrap();
      toast.success('Leave application submitted');
      setApplyOpen(false);
      setForm({ teacherId: '', leaveType: 'sick', fromDate: '', toDate: '', reason: '' });
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed to submit leave');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveLeave(id).unwrap();
      toast.success('Leave approved');
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed');
    }
  };

  const handleReject = async () => {
    if (!rejectDialog || !rejectionReason.trim()) { toast.error('Reason required'); return; }
    try {
      await rejectLeave({ id: rejectDialog.id, rejectionReason }).unwrap();
      toast.success('Leave rejected');
      setRejectDialog(null);
      setRejectionReason('');
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLeave(id).unwrap();
      toast.success('Leave deleted');
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teacher Leave Management</h1>
          <p className="text-muted-foreground text-sm">Review, approve and manage teacher leave requests</p>
        </div>
        <Button onClick={() => setApplyOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Apply Leave
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['pending', 'approved', 'rejected', 'cancelled'].map((status) => {
          const count = leaves.filter((l: any) => l.status === status).length;
          return (
            <Card key={status} className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm text-muted-foreground capitalize">{status}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filterStatus === s ? 'default' : 'outline'}
            onClick={() => setFilterStatus(s)}
            className="capitalize"
          >
            {s}{s === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
          </Button>
        ))}
      </div>

      {/* Leave List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Leave Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : leaves.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No leave applications found</div>
          ) : (
            <div className="space-y-3">
              {leaves.map((leave: any) => {
                const cfg = STATUS_CONFIG[leave.status] ?? { label: leave.status, color: 'bg-gray-100 text-gray-500' };
                const teacher = leave.teacherId;
                return (
                  <div key={leave._id ?? leave.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          {typeof teacher === 'object' ? `${teacher.firstName} ${teacher.lastName}` : teacher}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">{leave.leaveType} leave · {leave.totalDays} day{leave.totalDays > 1 ? 's' : ''}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(leave.fromDate)} – {fmtDate(leave.toDate)}</div>
                        <div className="text-sm mt-1">{leave.reason}</div>
                        {leave.rejectionReason && (
                          <div className="text-xs text-red-600 mt-1">Reason: {leave.rejectionReason}</div>
                        )}
                      </div>
                      <Badge className={`${cfg.color} border-0 shrink-0`}>{cfg.label}</Badge>
                    </div>
                    {leave.status === 'pending' && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50" onClick={() => handleApprove(leave._id ?? leave.id)}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setRejectDialog({ open: true, id: leave._id ?? leave.id })}>
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-muted-foreground ml-auto">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete leave?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(leave._id ?? leave.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apply Leave Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Leave</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Teacher *</Label>
              <Select value={form.teacherId} onValueChange={(v) => setForm((f) => ({ ...f, teacherId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t: any) => (
                    <SelectItem key={t._id ?? t.id} value={t._id ?? t.id}>{t.firstName} {t.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Leave Type *</Label>
              <Select value={form.leaveType} onValueChange={(v) => setForm((f) => ({ ...f, leaveType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((lt) => <SelectItem key={lt} value={lt} className="capitalize">{lt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From Date *</Label>
                <Input type="date" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>To Date *</Label>
                <Input type="date" value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason *</Label>
              <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Reason for leave..." rows={3} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApply} disabled={applying} className="flex-1">{applying ? 'Submitting...' : 'Submit'}</Button>
              <Button variant="outline" onClick={() => setApplyOpen(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      {rejectDialog && (
        <Dialog open={rejectDialog.open} onOpenChange={() => setRejectDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject Leave</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>Rejection Reason *</Label>
              <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Provide a reason..." rows={3} />
              <div className="flex gap-2">
                <Button onClick={handleReject} className="flex-1 bg-red-600 hover:bg-red-700">Reject</Button>
                <Button variant="outline" onClick={() => setRejectDialog(null)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Smart router: teacher sees their own portal, admin sees management ─────────
export default function TeacherLeavePage() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const isTeacher = user?.schoolRole === 'teacher' || !!user?.linkedTeacherId
  return isTeacher ? <MyLeaveView /> : <AdminLeaveView />
}
