import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, Clock, Calendar, Users, AlertCircle } from 'lucide-react';
import {
  useGetTeachersQuery,
  useGetTeacherAttendancesQuery,
  useMarkBulkTeacherAttendanceMutation,
  useMarkTeacherAttendanceMutation,
  useGetTeacherAttendanceTodayStatsQuery,
} from '@/stores/school.api';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  { value: 'absent', label: 'Absent', color: 'bg-red-100 text-red-700', icon: XCircle },
  { value: 'late', label: 'Late', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  { value: 'on_leave', label: 'On Leave', color: 'bg-blue-100 text-blue-700', icon: Calendar },
  { value: 'holiday', label: 'Holiday', color: 'bg-purple-100 text-purple-700', icon: AlertCircle },
];

const localDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function TeacherAttendancePage() {
  const [selectedDate, setSelectedDate] = useState(localDateStr());
  const [bulkStatuses, setBulkStatuses] = useState<Record<string, string>>({});
  const [editDialog, setEditDialog] = useState<{ open: boolean; teacherId: string; teacherName: string; status: string } | null>(null);

  const { data: teachersData, isLoading: teachersLoading } = useGetTeachersQuery({ limit: 200, status: 'active' });
  const teachers = teachersData?.results ?? [];

  const { data: todayStats } = useGetTeacherAttendanceTodayStatsQuery(undefined);

  const { data: attendanceData, refetch } = useGetTeacherAttendancesQuery({ date: selectedDate, limit: 500 });

  // Reset local overrides when date changes
  useEffect(() => {
    setBulkStatuses({});
  }, [selectedDate]);

  const existingRecords: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of attendanceData?.results ?? []) {
      // toJSON plugin removes _id and adds id — use id first, fallback to raw value
      const key = r.teacherId?.id ?? r.teacherId?._id ?? String(r.teacherId);
      if (key) map[key] = r;
    }
    return map;
  }, [attendanceData]);

  const [markBulk, { isLoading: bulkLoading }] = useMarkBulkTeacherAttendanceMutation();
  const [markSingle] = useMarkTeacherAttendanceMutation();

  const getStatus = (teacherId: string) => {
    const override = bulkStatuses[teacherId];
    if (override) return override;
    return existingRecords[teacherId]?.status ?? '';
  };

  const handleBulkMark = async () => {
    const records = teachers.map((t: any) => ({
      teacherId: t.id ?? t._id,
      date: selectedDate,
      status: bulkStatuses[t.id ?? t._id] ?? existingRecords[t.id ?? t._id]?.status ?? 'present',
      method: 'admin',
    }));
    try {
      await markBulk({ records }).unwrap();
      toast.success('Attendance saved for all teachers');
      setBulkStatuses({});
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed to save attendance');
    }
  };

  const handleSingleEdit = async () => {
    if (!editDialog) return;
    try {
      await markSingle({ teacherId: editDialog.teacherId, date: selectedDate, status: editDialog.status, method: 'admin' }).unwrap();
      toast.success('Attendance updated');
      setEditDialog(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed');
    }
  };

  const pendingChanges = Object.keys(bulkStatuses).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teacher Attendance</h1>
          <p className="text-muted-foreground text-sm">Mark and manage daily teacher attendance</p>
        </div>
        <div className="flex items-center gap-3">
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-44" />
          {pendingChanges > 0 && (
            <Button onClick={handleBulkMark} disabled={bulkLoading} className="bg-green-600 hover:bg-green-700">
              {bulkLoading ? 'Saving...' : `Save ${pendingChanges} change${pendingChanges > 1 ? 's' : ''}`}
            </Button>
          )}
          <Button onClick={handleBulkMark} disabled={bulkLoading} variant="outline">
            Save All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {todayStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Present', value: todayStats.present, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Absent', value: todayStats.absent, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Late', value: todayStats.late, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: 'On Leave', value: todayStats.on_leave, color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map((s) => (
            <Card key={s.label} className={`${s.bg} border-0`}>
              <CardContent className="p-4">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Attendance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Teachers — {selectedDate}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teachersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading teachers...</div>
          ) : teachers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No active teachers found</div>
          ) : (
            <div className="space-y-2">
              {/* Mark All Buttons */}
              <div className="flex gap-2 flex-wrap pb-3 border-b">
                <span className="text-sm text-muted-foreground self-center">Mark all as:</span>
                {STATUS_OPTIONS.map((s) => (
                  <Button
                    key={s.value}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const all: Record<string, string> = {};
                      teachers.forEach((t: any) => { all[t.id ?? t._id] = s.value; });
                      setBulkStatuses(all);
                    }}
                    className={s.color}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
              {teachers.map((teacher: any, idx: number) => {
              const tid = teacher.id ?? teacher._id;
                const currentStatus = getStatus(tid);
                const statusConfig = STATUS_OPTIONS.find((s) => s.value === currentStatus);
                return (
                  <div key={tid} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{teacher.firstName} {teacher.lastName}</div>
                        <div className="text-xs text-muted-foreground">{teacher.employeeId} · {teacher.specialization || teacher.qualification || '—'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentStatus && (
                        <Badge className={`${statusConfig?.color ?? ''} border-0 text-xs`}>
                          {statusConfig?.label ?? currentStatus}
                        </Badge>
                      )}
                      <Select
                        value={bulkStatuses[tid] ?? existingRecords[tid]?.status ?? ''}
                        onValueChange={(val) => setBulkStatuses((prev) => ({ ...prev, [tid]: val }))}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue placeholder="Set status" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single Edit Dialog */}
      {editDialog && (
        <Dialog open={editDialog.open} onOpenChange={() => setEditDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Attendance — {editDialog.teacherName}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>Status</Label>
              <Select value={editDialog.status} onValueChange={(v) => setEditDialog((d) => d && ({ ...d, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSingleEdit} className="flex-1">Save</Button>
                <Button variant="outline" onClick={() => setEditDialog(null)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
