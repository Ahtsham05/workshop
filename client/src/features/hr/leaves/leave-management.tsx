import { useMemo, useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetLeavesQuery,
  useCreateLeaveMutation,
  useApproveLeaveMutation,
  useRejectLeaveMutation,
  useUpdateLeaveMutation,
  useDeleteLeaveMutation,
  useGetAttendancesQuery,
  useGetEmployeesQuery,
} from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  Plus,
  Check,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth } from 'date-fns';

export default function LeaveManagement() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [editingLeave, setEditingLeave] = useState<any>(null);
  const [leaveToDelete, setLeaveToDelete] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reportEmployeeId, setReportEmployeeId] = useState('');
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const { data, isLoading, refetch } = useGetLeavesQuery({
    page,
    limit: 10,
    search: search || undefined,
    status: statusFilter || undefined,
  });

  const { data: employeesData } = useGetEmployeesQuery({
    limit: 100,
    employmentStatus: 'Active',
  });

  const [createLeave, { isLoading: isCreating }] = useCreateLeaveMutation();
  const [approveLeave, { isLoading: isApproving }] = useApproveLeaveMutation();
  const [rejectLeave, { isLoading: isRejecting }] = useRejectLeaveMutation();
  const [updateLeave, { isLoading: isUpdating }] = useUpdateLeaveMutation();
  const [deleteLeave, { isLoading: isDeleting }] = useDeleteLeaveMutation();

  const [formData, setFormData] = useState({
    employee: '',
    leaveType: 'Sick',
    startDate: '',
    endDate: '',
    reason: '',
    isHalfDay: false,
  });

  const reportStartDate = useMemo(
    () => format(startOfMonth(new Date(reportYear, reportMonth - 1, 1)), 'yyyy-MM-dd'),
    [reportMonth, reportYear]
  );
  const reportEndDate = useMemo(
    () => format(endOfMonth(new Date(reportYear, reportMonth - 1, 1)), 'yyyy-MM-dd'),
    [reportMonth, reportYear]
  );

  const { data: monthlyAttendanceData } = useGetAttendancesQuery(
    {
      employee: reportEmployeeId || undefined,
      startDate: reportStartDate,
      endDate: reportEndDate,
      limit: 1000,
      sortBy: 'date:asc',
    },
    { skip: !reportEmployeeId }
  );

  const { data: monthlyLeavesData } = useGetLeavesQuery(
    {
      employee: reportEmployeeId || undefined,
      startDate: reportStartDate,
      endDate: reportEndDate,
      limit: 1000,
      sortBy: 'startDate:asc',
    },
    { skip: !reportEmployeeId }
  );

  const handleApplyLeave = async () => {
    try {
      await createLeave({ ...formData, reason: formData.reason.trim() }).unwrap();
      toast.success(t('Leave application submitted'));
      setShowApplyDialog(false);
      setFormData({
        employee: '',
        leaveType: 'Sick',
        startDate: '',
        endDate: '',
        reason: '',
        isHalfDay: false,
      });
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to apply leave'));
    }
  };

  const handleApprove = async (leaveId: string) => {
    try {
      await approveLeave({ id: leaveId }).unwrap();
      toast.success(t('Leave approved'));
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to approve leave'));
    }
  };

  const handleReject = async (leaveId: string, reason: string) => {
    try {
      await rejectLeave({ id: leaveId, rejectionReason: reason.trim() }).unwrap();
      toast.success(t('Leave rejected'));
      setSelectedLeave(null);
      setRejectionReason('');
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to reject leave'));
    }
  };

  const handleUpdateLeave = async () => {
    if (!editingLeave) return;
    try {
      await updateLeave({
        id: editingLeave.id,
        leaveType: formData.leaveType,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason.trim(),
        isHalfDay: formData.isHalfDay,
      }).unwrap();
      toast.success(t('Leave updated'));
      setShowEditDialog(false);
      setEditingLeave(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to update leave'));
    }
  };

  const handleDeleteLeave = async () => {
    if (!leaveToDelete) return;
    try {
      await deleteLeave(leaveToDelete.id).unwrap();
      toast.success(t('Leave deleted'));
      setShowDeleteDialog(false);
      setLeaveToDelete(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to delete leave'));
    }
  };

  const monthlyProgress = useMemo(() => {
    const attendances = monthlyAttendanceData?.results || [];
    const leaves = monthlyLeavesData?.results || [];
    const presentDays = attendances.filter((a: any) => a.status === 'Present').length;
    const lateDays = attendances.filter((a: any) => a.status === 'Late').length;
    const absentDays = attendances.filter((a: any) => a.status === 'Absent').length;
    const leaveDays = attendances.filter((a: any) => a.status === 'On Leave').length;
    const halfDays = attendances.filter((a: any) => a.status === 'Half-Day').length;
    const workingHours = attendances.reduce((sum: number, a: any) => sum + Number(a.workingHours || 0), 0);
    const overtimeHours = attendances.reduce((sum: number, a: any) => sum + Number(a.overtime || 0), 0);
    const approvedLeaves = leaves.filter((l: any) => l.status === 'Approved').length;
    const rejectedLeaves = leaves.filter((l: any) => l.status === 'Rejected').length;
    return {
      attendanceCount: attendances.length,
      presentDays,
      lateDays,
      absentDays,
      leaveDays,
      halfDays,
      workingHours,
      overtimeHours,
      approvedLeaves,
      rejectedLeaves,
    };
  }, [monthlyAttendanceData?.results, monthlyLeavesData?.results]);

  const dateWiseProgressRows = useMemo(() => {
    const rowsByDate = new Map<string, any>();
    const attendances = monthlyAttendanceData?.results || [];
    const leaves = monthlyLeavesData?.results || [];

    attendances.forEach((attendance: any) => {
      const dateKey = format(new Date(attendance.date), 'yyyy-MM-dd');
      rowsByDate.set(dateKey, {
        date: dateKey,
        status: attendance.status || '-',
        checkIn: attendance.checkIn ? format(new Date(attendance.checkIn), 'p') : '-',
        checkOut: attendance.checkOut ? format(new Date(attendance.checkOut), 'p') : '-',
        workingHours: Number(attendance.workingHours || 0),
        overtime: Number(attendance.overtime || 0),
        leaveType: '-',
        leaveStatus: '-',
      });
    });

    leaves.forEach((leave: any) => {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      const cursor = new Date(start);
      while (cursor <= end) {
        const dateKey = format(cursor, 'yyyy-MM-dd');
        const existing = rowsByDate.get(dateKey) || {
          date: dateKey,
          status: '-',
          checkIn: '-',
          checkOut: '-',
          workingHours: 0,
          overtime: 0,
          leaveType: '-',
          leaveStatus: '-',
        };
        existing.leaveType = leave.leaveType || '-';
        existing.leaveStatus = leave.status || '-';
        if (leave.status === 'Approved' && (existing.status === '-' || existing.status === 'Absent')) {
          existing.status = 'On Leave';
        }
        rowsByDate.set(dateKey, existing);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    return Array.from(rowsByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [monthlyAttendanceData?.results, monthlyLeavesData?.results]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      Pending: { className: 'bg-yellow-100 text-yellow-700' },
      Approved: { className: 'bg-green-100 text-green-700' },
      Rejected: { className: 'bg-red-100 text-red-700' },
      Cancelled: { className: 'bg-gray-100 text-gray-700' },
    };
    return variants[status] || variants.Pending;
  };

  const leaveTypes = [
    { value: 'Casual', label: 'Casual Leave' },
    { value: 'Sick', label: 'Sick Leave' },
    { value: 'Annual', label: 'Annual Leave' },
    { value: 'Maternity', label: 'Maternity Leave' },
    { value: 'Paternity', label: 'Paternity Leave' },
    { value: 'Unpaid', label: 'Unpaid Leave' },
    { value: 'Emergency', label: 'Emergency Leave' },
  ];

  const getLeaveTypeLabel = (value: string) => {
    return leaveTypes.find(type => type.value === value)?.label || value;
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Pending')}</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {data?.results?.filter((l: any) => l.status === 'Pending').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-yellow-50">
                <Calendar className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Approved')}</p>
                <p className="text-3xl font-bold text-green-600">
                  {data?.results?.filter((l: any) => l.status === 'Approved').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Rejected')}</p>
                <p className="text-3xl font-bold text-red-600">
                  {data?.results?.filter((l: any) => l.status === 'Rejected').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-red-50">
                <Calendar className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Total Leaves')}</p>
                <p className="text-3xl font-bold">{data?.totalResults || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leave List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Leave Requests')}</CardTitle>
            <Button onClick={() => setShowApplyDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('Apply Leave')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search employees...')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value === 'all' ? '' : value);
              setPage(1);
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('All Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All Status')}</SelectItem>
                <SelectItem value="Pending">{t('Pending')}</SelectItem>
                <SelectItem value="Approved">{t('Approved')}</SelectItem>
                <SelectItem value="Rejected">{t('Rejected')}</SelectItem>
                <SelectItem value="Cancelled">{t('Cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Employee')}</TableHead>
                  <TableHead>{t('Leave Type')}</TableHead>
                  <TableHead>{t('Start Date')}</TableHead>
                  <TableHead>{t('End Date')}</TableHead>
                  <TableHead>{t('Days')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('Loading...')}
                    </TableCell>
                  </TableRow>
                ) : data?.results?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('No leave requests found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.results?.map((leave: any) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium">
                        {leave.employee?.firstName} {leave.employee?.lastName}
                      </TableCell>
                      <TableCell>{getLeaveTypeLabel(leave.leaveType)}</TableCell>
                      <TableCell>{format(new Date(leave.startDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{format(new Date(leave.endDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        {leave.totalDays} {leave.isHalfDay ? '(Half Day)' : ''}
                      </TableCell>
                      <TableCell>
                        <Badge {...getStatusBadge(leave.status)}>{leave.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {leave.status === 'Pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600"
                                onClick={() => handleApprove(leave.id)}
                                disabled={isApproving}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                {t('Approve')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedLeave(leave);
                                  setRejectionReason('');
                                }}
                                disabled={isRejecting}
                              >
                                <X className="h-4 w-4 mr-1" />
                                {t('Reject')}
                              </Button>
                            </>
                          )}
                          {(leave.status === 'Pending' || leave.status === 'Rejected') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingLeave(leave);
                                setFormData({
                                  employee: leave.employee?.id || leave.employee?._id || '',
                                  leaveType: leave.leaveType,
                                  startDate: format(new Date(leave.startDate), 'yyyy-MM-dd'),
                                  endDate: format(new Date(leave.endDate), 'yyyy-MM-dd'),
                                  reason: leave.reason || '',
                                  isHalfDay: !!leave.isHalfDay,
                                });
                                setShowEditDialog(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              {t('Edit')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600"
                            onClick={() => {
                              setLeaveToDelete(leave);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            {t('Delete')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t('Showing')} {((page - 1) * 10) + 1} {t('to')} {Math.min(page * 10, data.totalResults)} {t('of')} {data.totalResults} {t('leaves')}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {t('Page')} {page} {t('of')} {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Progress Report */}
      <Card>
        <CardHeader>
          <CardTitle>{t('Employee Monthly Progress Report')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>{t('Employee')}</Label>
              <Select value={reportEmployeeId} onValueChange={setReportEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('Select employee')} />
                </SelectTrigger>
                <SelectContent>
                  {employeesData?.results?.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('Month')}</Label>
              <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <SelectItem key={month} value={String(month)}>
                      {format(new Date(2026, month - 1, 1), 'MMMM')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('Year')}</Label>
              <Select value={String(reportYear)} onValueChange={(v) => setReportYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {reportEmployeeId && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 rounded bg-blue-50"><p className="text-xs text-muted-foreground">{t('Present')}</p><p className="font-semibold">{monthlyProgress.presentDays}</p></div>
                <div className="p-3 rounded bg-yellow-50"><p className="text-xs text-muted-foreground">{t('Late')}</p><p className="font-semibold">{monthlyProgress.lateDays}</p></div>
                <div className="p-3 rounded bg-red-50"><p className="text-xs text-muted-foreground">{t('Absent')}</p><p className="font-semibold">{monthlyProgress.absentDays}</p></div>
                <div className="p-3 rounded bg-gray-100"><p className="text-xs text-muted-foreground">{t('On Leave')}</p><p className="font-semibold">{monthlyProgress.leaveDays}</p></div>
                <div className="p-3 rounded bg-purple-50"><p className="text-xs text-muted-foreground">{t('Half Day')}</p><p className="font-semibold">{monthlyProgress.halfDays}</p></div>
                <div className="p-3 rounded bg-green-50"><p className="text-xs text-muted-foreground">{t('Working Hours')}</p><p className="font-semibold">{monthlyProgress.workingHours.toFixed(2)}</p></div>
                <div className="p-3 rounded bg-orange-50"><p className="text-xs text-muted-foreground">{t('Overtime Hours')}</p><p className="font-semibold">{monthlyProgress.overtimeHours.toFixed(2)}</p></div>
                <div className="p-3 rounded bg-emerald-50"><p className="text-xs text-muted-foreground">{t('Approved Leaves')}</p><p className="font-semibold">{monthlyProgress.approvedLeaves}</p></div>
                <div className="p-3 rounded bg-rose-50"><p className="text-xs text-muted-foreground">{t('Rejected Leaves')}</p><p className="font-semibold">{monthlyProgress.rejectedLeaves}</p></div>
                <div className="p-3 rounded bg-slate-100"><p className="text-xs text-muted-foreground">{t('Attendance Records')}</p><p className="font-semibold">{monthlyProgress.attendanceCount}</p></div>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Date')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead>{t('Check In')}</TableHead>
                      <TableHead>{t('Check Out')}</TableHead>
                      <TableHead>{t('Working Hours')}</TableHead>
                      <TableHead>{t('Overtime')}</TableHead>
                      <TableHead>{t('Leave Type')}</TableHead>
                      <TableHead>{t('Leave Status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dateWiseProgressRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                          {t('No monthly records found')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      dateWiseProgressRows.map((row: any) => (
                        <TableRow key={row.date}>
                          <TableCell>{format(new Date(row.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{row.status}</TableCell>
                          <TableCell>{row.checkIn}</TableCell>
                          <TableCell>{row.checkOut}</TableCell>
                          <TableCell>{Number(row.workingHours || 0).toFixed(2)}</TableCell>
                          <TableCell>{Number(row.overtime || 0).toFixed(2)}</TableCell>
                          <TableCell>{row.leaveType}</TableCell>
                          <TableCell>{row.leaveStatus}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Apply Leave Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Apply for Leave')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Employee')}</Label>
              <Select
                value={formData.employee}
                onValueChange={(value) => setFormData({ ...formData, employee: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select employee')} />
                </SelectTrigger>
                <SelectContent>
                  {employeesData?.results?.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('Leave Type')}</Label>
              <Select
                value={formData.leaveType}
                onValueChange={(value) => setFormData({ ...formData, leaveType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {t(type.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('Start Date')}</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('End Date')}</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('Reason')}</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder={t('Reason for leave...')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button 
              onClick={handleApplyLeave} 
              disabled={
                isCreating ||
                !formData.employee ||
                !formData.startDate ||
                !formData.endDate ||
                !formData.reason.trim()
              }
            >
              {isCreating ? t('Submitting...') : t('Submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Leave Dialog */}
      <Dialog open={!!selectedLeave} onOpenChange={(open) => !open && setSelectedLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Reject Leave Request')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('Are you sure you want to reject this leave request?')}
            </p>
            <div className="space-y-2">
              <Label>{t('Rejection Reason')}</Label>
              <Textarea
                placeholder={t('Reason for rejection...')}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLeave(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedLeave && handleReject(selectedLeave.id, rejectionReason)}
              disabled={isRejecting || !rejectionReason.trim()}
            >
              {isRejecting ? t('Rejecting...') : t('Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Leave Dialog */}
      <Dialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setEditingLeave(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Edit Leave')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Leave Type')}</Label>
              <Select
                value={formData.leaveType}
                onValueChange={(value) => setFormData({ ...formData, leaveType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {t(type.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('Start Date')}</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('End Date')}</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('Reason')}</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleUpdateLeave} disabled={isUpdating || !formData.reason.trim()}>
              {isUpdating ? t('Saving...') : t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Leave Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete Leave')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('Are you sure you want to delete this leave request?')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteLeave} disabled={isDeleting}>
              {isDeleting ? t('Deleting...') : t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
