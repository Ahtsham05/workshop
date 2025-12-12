import { useLanguage } from '@/context/language-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Calendar, FileText, DollarSign, UserPlus, Clock, AlertCircle } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

type NavigateOptions = Parameters<ReturnType<typeof useNavigate>>[0];
import { useGetEmployeesQuery, useGetLeavesQuery, useGetAttendancesQuery, useGetPayrollsQuery } from '@/stores/hr.api';

export default function HRDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Fetch dashboard data
  const { data: employeesData } = useGetEmployeesQuery({ limit: 1 });
  const { data: leavesData } = useGetLeavesQuery({ status: 'Pending', limit: 10 });
  const { data: attendanceData } = useGetAttendancesQuery({ 
    startDate: new Date().toISOString().split('T')[0],
    limit: 100 
  });
  const { data: payrollData } = useGetPayrollsQuery({ 
    status: 'Pending',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    limit: 10
  });

  const totalEmployees = employeesData?.totalResults || 0;
  const pendingLeaves = leavesData?.totalResults || 0;
  const todayPresent = attendanceData?.results?.filter((a: any) => a.status === 'Present').length || 0;
  const pendingPayrolls = payrollData?.totalResults || 0;

  const stats = [
    {
      title: t('Total Employees'),
      value: totalEmployees,
      icon: <Users className="h-6 w-6 text-blue-600" />,
      color: 'bg-blue-50',
      textColor: 'text-blue-600',
      onClick: () => navigate({ to: '/hr/employees' } as NavigateOptions),
    },
    {
      title: t('Pending Leaves'),
      value: pendingLeaves,
      icon: <FileText className="h-6 w-6 text-orange-600" />,
      color: 'bg-orange-50',
      textColor: 'text-orange-600',
      onClick: () => navigate({ to: '/hr/leaves' } as NavigateOptions),
    },
    {
      title: t('Present Today'),
      value: todayPresent,
      icon: <Calendar className="h-6 w-6 text-green-600" />,
      color: 'bg-green-50',
      textColor: 'text-green-600',
      onClick: () => navigate({ to: '/hr/attendance' } as NavigateOptions),
    },
    {
      title: t('Pending Payroll'),
      value: pendingPayrolls,
      icon: <DollarSign className="h-6 w-6 text-purple-600" />,
      color: 'bg-purple-50',
      textColor: 'text-purple-600',
      onClick: () => navigate({ to: '/hr/payroll' } as NavigateOptions),
    },
  ];

  const quickActions = [
    {
      title: t('Add Employee'),
      icon: <UserPlus className="h-5 w-5" />,
      color: 'bg-blue-500 hover:bg-blue-600',
      onClick: () => navigate({ to: '/hr/employees' } as NavigateOptions),
    },
    {
      title: t('Mark Attendance'),
      icon: <Clock className="h-5 w-5" />,
      color: 'bg-green-500 hover:bg-green-600',
      onClick: () => navigate({ to: '/hr/attendance' } as NavigateOptions),
    },
    {
      title: t('Process Payroll'),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'bg-purple-500 hover:bg-purple-600',
      onClick: () => navigate({ to: '/hr/payroll' } as NavigateOptions),
    },
    {
      title: t('Approve Leaves'),
      icon: <FileText className="h-5 w-5" />,
      color: 'bg-orange-500 hover:bg-orange-600',
      onClick: () => navigate({ to: '/hr/leaves' } as NavigateOptions),
    },
  ];

  return (
    <div className="h-full w-full p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('HR Dashboard')}</h1>
          <p className="text-muted-foreground mt-2">{t('Overview of human resources management')}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card 
            key={index} 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={stat.onClick}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className={`text-3xl font-bold mt-2 ${stat.textColor}`}>{stat.value}</p>
                </div>
                <div className={`p-3 rounded-full ${stat.color}`}>
                  {stat.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('Quick Actions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                onClick={action.onClick}
                className={`h-24 flex-col gap-2 text-white ${action.color}`}
              >
                {action.icon}
                <span className="text-sm font-medium">{action.title}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending Leaves Alert */}
      {pendingLeaves > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-orange-600" />
              <div className="flex-1">
                <p className="font-semibold text-orange-900">
                  {t('You have')} {pendingLeaves} {t('pending leave requests')}
                </p>
                <p className="text-sm text-orange-700 mt-1">
                  {t('Review and approve leave requests to keep employees informed')}
                </p>
              </div>
              <Button
                variant="outline"
                className="border-orange-600 text-orange-600 hover:bg-orange-100"
                onClick={() => navigate({ to: '/hr/leaves' } as NavigateOptions)}
              >
                {t('Review Now')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Leaves */}
        <Card>
          <CardHeader>
            <CardTitle>{t('Recent Leave Requests')}</CardTitle>
          </CardHeader>
          <CardContent>
            {leavesData?.results?.length > 0 ? (
              <div className="space-y-3">
                {leavesData.results.slice(0, 5).map((leave: any) => (
                  <div key={leave.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{leave.employee?.firstName} {leave.employee?.lastName}</p>
                      <p className="text-sm text-muted-foreground">{leave.leaveType} - {leave.totalDays} days</p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">
                      {leave.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">{t('No pending leave requests')}</p>
            )}
          </CardContent>
        </Card>

        {/* Today's Attendance Summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t('Today\'s Attendance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('Present')}</span>
                <span className="text-2xl font-bold text-green-600">{todayPresent}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('Total Employees')}</span>
                <span className="text-2xl font-bold">{totalEmployees}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-green-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${totalEmployees > 0 ? (todayPresent / totalEmployees) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                {totalEmployees > 0 ? Math.round((todayPresent / totalEmployees) * 100) : 0}% {t('Attendance Rate')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
