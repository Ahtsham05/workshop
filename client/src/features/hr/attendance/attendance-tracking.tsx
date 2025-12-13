import { useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetAttendancesQuery,
  useMarkCheckInMutation,
  useMarkCheckOutMutation,
  useGetEmployeesQuery,
} from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AttendanceTracking() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading, refetch } = useGetAttendancesQuery(
    {
      page,
      limit: 10,
      startDate: selectedDate,
      endDate: selectedDate,
      search: search || undefined,
    },
    {
      refetchOnMountOrArgChange: true,
    }
  );

  const { data: employeesData } = useGetEmployeesQuery({
    limit: 100,
    employmentStatus: 'Active',
  });

  const [checkIn, { isLoading: isCheckingIn }] = useMarkCheckInMutation();
  const [checkOut, { isLoading: isCheckingOut }] = useMarkCheckOutMutation();

  const handleCheckIn = async (employeeId: string) => {
    try {
      const result = await checkIn({ employee: employeeId }).unwrap();
      toast.success(t('Check-in successful'));
      // Small delay to ensure backend has processed, then force refetch
      setTimeout(() => {
        refetch();
      }, 100);
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to check-in'));
    }
  };

  const handleCheckOut = async (employeeId: string) => {
    try {
      const result = await checkOut({ employee: employeeId }).unwrap();
      toast.success(t('Check-out successful'));
      // Small delay to ensure backend has processed, then force refetch
      setTimeout(() => {
        refetch();
      }, 100);
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to check-out'));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      Present: { className: 'bg-green-100 text-green-700' },
      Absent: { className: 'bg-red-100 text-red-700' },
      Late: { className: 'bg-yellow-100 text-yellow-700' },
      'Half-Day': { className: 'bg-orange-100 text-orange-700' },
      'On Leave': { className: 'bg-blue-100 text-blue-700' },
      Holiday: { className: 'bg-purple-100 text-purple-700' },
    };
    return variants[status] || variants.Present;
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Present')}</p>
                <p className="text-3xl font-bold text-green-600">
                  {data?.results?.filter((a: any) => a.status === 'Present').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <Clock className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Absent')}</p>
                <p className="text-3xl font-bold text-red-600">
                  {data?.results?.filter((a: any) => a.status === 'Absent').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-red-50">
                <Clock className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Late')}</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {data?.results?.filter((a: any) => a.status === 'Late').length || 0}
                </p>
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
                <p className="text-3xl font-bold text-blue-600">
                  {data?.results?.filter((a: any) => a.status === 'On Leave').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Attendance Records')}</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="w-auto"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
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
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Employee')}</TableHead>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Check In')}</TableHead>
                  <TableHead>{t('Check Out')}</TableHead>
                  <TableHead>{t('Working Hours')}</TableHead>
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
                ) : !employeesData?.results?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('No employees found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  employeesData?.results
                    ?.filter((emp: any) => 
                      !search || 
                      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
                      emp.employeeId?.toLowerCase().includes(search.toLowerCase())
                    )
                    .map((employee: any) => {
                      // Match attendance by comparing employee IDs (handle both string and populated object)
                      const attendance = data?.results?.find((a: any) => {
                        const attendanceEmpId = typeof a.employee === 'string' ? a.employee : a.employee?.id;
                        return attendanceEmpId === employee.id;
                      });
                      
                      return (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium">
                            {employee.firstName} {employee.lastName}
                            <p className="text-xs text-muted-foreground">{employee.employeeId}</p>
                          </TableCell>
                          <TableCell>{format(new Date(selectedDate), 'MMM dd, yyyy')}</TableCell>
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
                            {attendance ? (
                              <Badge {...getStatusBadge(attendance.status)}>
                                {attendance.status}
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-700">
                                {t('Not Marked')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {!attendance?.checkIn && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCheckIn(employee.id)}
                                  disabled={isCheckingIn}
                                >
                                  <LogIn className="h-4 w-4 mr-1" />
                                  {t('Check In')}
                                </Button>
                              )}
                              {attendance?.checkIn && !attendance?.checkOut && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCheckOut(employee.id)}
                                  disabled={isCheckingOut}
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

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t('Showing')} {((page - 1) * 10) + 1} {t('to')} {Math.min(page * 10, data.totalResults)} {t('of')} {data.totalResults} {t('records')}
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
    </div>
  );
}
