import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetAttendancesQuery,
  useMarkBulkAttendanceMutation,
  useMarkCheckInMutation,
  useMarkCheckOutMutation,
  useGetEmployeesQuery,
  useGetDailyAttendanceSummaryQuery,
  useGetLeavesQuery,
} from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  Calendar,
  Search,
  LogIn,
  LogOut,
  Users,
  Save,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getEntityId } from '@/lib/entity-id';
import { resolveDayStatus } from '@/lib/hr-attendance-utils';

const STATUS_OPTIONS = [
  { value: 'Present', label: 'Present', className: 'bg-green-100 text-green-700' },
  { value: 'Absent', label: 'Absent', className: 'bg-red-100 text-red-700' },
  { value: 'Late', label: 'Late', className: 'bg-yellow-100 text-yellow-700' },
  { value: 'Half-Day', label: 'Half Day', className: 'bg-orange-100 text-orange-700' },
  { value: 'On Leave', label: 'On Leave', className: 'bg-blue-100 text-blue-700' },
  { value: 'Holiday', label: 'Holiday', className: 'bg-purple-100 text-purple-700' },
];

const getLocalDateString = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
};

export default function AttendanceTracking() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  const { data: employeesData, isLoading: employeesLoading } = useGetEmployeesQuery({
    limit: 500,
    employmentStatus: 'Active',
  });

  const { data, isLoading, refetch } = useGetAttendancesQuery(
    {
      startDate: selectedDate,
      endDate: selectedDate,
      limit: 1000,
    },
    { refetchOnMountOrArgChange: true },
  );

  const { data: leavesData } = useGetLeavesQuery(
    {
      startDate: selectedDate,
      endDate: selectedDate,
      status: 'Approved',
      limit: 1000,
    },
    { skip: !selectedDate },
  );

  const { data: dailySummary, refetch: refetchSummary } = useGetDailyAttendanceSummaryQuery(
    { date: selectedDate },
    { skip: !selectedDate },
  );

  const [markBulk, { isLoading: isSaving }] = useMarkBulkAttendanceMutation();
  const [checkIn, { isLoading: isCheckingIn }] = useMarkCheckInMutation();
  const [checkOut, { isLoading: isCheckingOut }] = useMarkCheckOutMutation();

  useEffect(() => {
    setStatusOverrides({});
  }, [selectedDate]);

  const attendanceByEmployeeId = useMemo(() => {
    const map = new Map<string, any>();
    data?.results?.forEach((attendance: any) => {
      const employeeId = getEntityId(attendance.employee);
      if (employeeId) map.set(employeeId, attendance);
    });
    return map;
  }, [data?.results]);

  const leaveByEmployeeId = useMemo(() => {
    const map = new Map<string, any>();
    (leavesData?.results || []).forEach((leave: any) => {
      const employeeId = getEntityId(leave.employee);
      if (employeeId) map.set(employeeId, leave);
    });
    return map;
  }, [leavesData?.results]);

  const resolveEffectiveStatus = (employeeId: string, overrideStatus?: string) => {
    const attendance = attendanceByEmployeeId.get(employeeId);
    const leave = leaveByEmployeeId.get(employeeId);
    if (overrideStatus) {
      return resolveDayStatus({ status: overrideStatus }, leave);
    }
    return resolveDayStatus(attendance, leave);
  };

  const filteredEmployees = useMemo(() => {
    return (employeesData?.results || []).filter((emp: any) => {
      if (!search) return true;
      const haystack = `${emp.firstName} ${emp.lastName} ${emp.employeeId}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [employeesData?.results, search]);

  const getEffectiveStatus = (employeeId: string) => {
    const override = statusOverrides[employeeId];
    return resolveEffectiveStatus(employeeId, override);
  };

  const pendingChanges = Object.keys(statusOverrides).length;

  const handleStatusChange = (employeeId: string, status: string) => {
    const resolved = resolveDayStatus({ status }, leaveByEmployeeId.get(employeeId));
    const existingResolved = resolveEffectiveStatus(employeeId);

    if (resolved === existingResolved) {
      setStatusOverrides((prev) => {
        const next = { ...prev };
        delete next[employeeId];
        return next;
      });
      return;
    }
    setStatusOverrides((prev) => ({ ...prev, [employeeId]: status }));
  };

  const handleSaveAll = async () => {
    const records = filteredEmployees
      .map((employee: any) => {
        const employeeId = getEntityId(employee);
        const effectiveStatus = getEffectiveStatus(employeeId || '');
        const existing = employeeId ? attendanceByEmployeeId.get(employeeId) : undefined;
        if (!employeeId) return null;

        // Default present days need no database record
        if (effectiveStatus === 'Present' && !existing && !statusOverrides[employeeId]) {
          return null;
        }

        return {
          employee: employeeId,
          date: selectedDate,
          status: effectiveStatus,
        };
      })
      .filter(
        (
          record: { employee: string; date: string; status: string } | null
        ): record is { employee: string; date: string; status: string } => Boolean(record)
      );

    if (records.length === 0) {
      toast.success(t('Attendance is already up to date'));
      return;
    }

    try {
      await markBulk({ records }).unwrap();
      toast.success(t('Attendance saved successfully'));
      setStatusOverrides({});
      refetch();
      refetchSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to save attendance'));
    }
  };

  const handleSaveChanges = async () => {
    const records = Object.entries(statusOverrides).map(([employeeId, status]) => ({
      employee: employeeId,
      date: selectedDate,
      status: resolveDayStatus({ status }, leaveByEmployeeId.get(employeeId)),
    }));

    if (records.length === 0) return;

    try {
      await markBulk({ records }).unwrap();
      toast.success(t('Attendance updated successfully'));
      setStatusOverrides({});
      refetch();
      refetchSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to save attendance'));
    }
  };

  const handleCheckIn = async (employeeId: string) => {
    try {
      await checkIn({ employee: employeeId }).unwrap();
      toast.success(t('Check-in successful'));
      refetch();
      refetchSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to check-in'));
    }
  };

  const handleCheckOut = async (employeeId: string) => {
    try {
      await checkOut({ employee: employeeId }).unwrap();
      toast.success(t('Check-out successful'));
      refetch();
      refetchSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to check-out'));
    }
  };

  const getStatusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find((item) => item.value === status) || STATUS_OPTIONS[0];
    return option;
  };

  const calculateWorkingHours = (checkIn: string, checkOut: string) => {
    if (!checkIn || !checkOut) return '-';
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return diff.toFixed(2) + ' hrs';
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('Attendance Records')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('Employees are marked Present by default. Mark Absent or On Leave only when needed.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto"
          />
          {pendingChanges > 0 && (
            <Button onClick={handleSaveChanges} disabled={isSaving}>
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? t('Saving...') : `${t('Save')} ${pendingChanges}`}
            </Button>
          )}
          <Button variant="outline" onClick={handleSaveAll} disabled={isSaving || filteredEmployees.length === 0}>
            <Save className="h-4 w-4 mr-1" />
            {t('Save All')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Present')}</p>
                <p className="text-3xl font-bold text-green-600">{dailySummary?.present ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Absent')}</p>
                <p className="text-3xl font-bold text-red-600">{dailySummary?.absent ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-red-50">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Late')}</p>
                <p className="text-3xl font-bold text-yellow-600">{dailySummary?.late ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-yellow-50">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('On Leave')}</p>
                <p className="text-3xl font-bold text-blue-600">{dailySummary?.onLeave ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('Daily Attendance')} — {format(new Date(selectedDate), 'MMM dd, yyyy')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {filteredEmployees.length} {t('employees')}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search employees...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Employee')}</TableHead>
                  <TableHead>{t('Check In')}</TableHead>
                  <TableHead>{t('Check Out')}</TableHead>
                  <TableHead>{t('Working Hours')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeesLoading || isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      {t('Loading...')}
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t('No employees found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee: any) => {
                    const employeeId = getEntityId(employee) || '';
                    const attendance = attendanceByEmployeeId.get(employeeId);
                    const effectiveStatus = getEffectiveStatus(employeeId);
                    const statusBadge = getStatusBadge(effectiveStatus);
                    const hasPendingChange = Boolean(statusOverrides[employeeId]);

                    return (
                      <TableRow key={employeeId || employee.employeeId}>
                        <TableCell className="font-medium">
                          {employee.firstName} {employee.lastName}
                          <p className="text-xs text-muted-foreground">{employee.employeeId}</p>
                        </TableCell>
                        <TableCell>
                          {attendance?.checkIn
                            ? format(new Date(attendance.checkIn), 'hh:mm a')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {attendance?.checkOut
                            ? format(new Date(attendance.checkOut), 'hh:mm a')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {attendance?.workingHours
                            ? attendance.workingHours.toFixed(2) + ' hrs'
                            : attendance?.checkIn && attendance?.checkOut
                              ? calculateWorkingHours(attendance.checkIn, attendance.checkOut)
                              : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={effectiveStatus}
                              onValueChange={(value) => handleStatusChange(employeeId, value)}
                            >
                              <SelectTrigger className="w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {t(option.label)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Badge className={statusBadge.className}>
                              {hasPendingChange ? t('Unsaved') : t(statusBadge.label)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {!attendance?.checkIn && effectiveStatus === 'Present' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCheckIn(employeeId)}
                                disabled={isCheckingIn || !employeeId}
                              >
                                <LogIn className="h-4 w-4 mr-1" />
                                {t('Check In')}
                              </Button>
                            )}
                            {attendance?.checkIn && !attendance?.checkOut && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCheckOut(employeeId)}
                                disabled={isCheckingOut || !employeeId}
                              >
                                <LogOut className="h-4 w-4 mr-1" />
                                {t('Check Out')}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
