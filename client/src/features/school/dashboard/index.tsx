import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, GraduationCap, BookOpen, Calendar, DollarSign, Clock, UserPlus, ClipboardCheck, ArrowRight, CheckCircle2, XCircle, Timer, Umbrella, CalendarMinus, LayoutList, Layers, UserCheck, TrendingUp, AlertCircle, Banknote, Wallet, FileText } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useGetSchoolDashboardQuery, useGetSchoolAccountingDashboardQuery, useGetStudentsQuery } from '@/stores/school.api';

type NavigateOptions = Parameters<ReturnType<typeof useNavigate>>[0];

const QUICK_ACTIONS = [
  { title: 'New Admission', icon: UserPlus, color: 'from-blue-500 to-indigo-600', to: '/school/students/create' },
  { title: 'Mark Attendance', icon: ClipboardCheck, color: 'from-green-500 to-emerald-600', to: '/school/attendance' },
  { title: 'Manage Fees', icon: DollarSign, color: 'from-purple-500 to-violet-600', to: '/school/fees' },
  { title: 'View Timetable', icon: Clock, color: 'from-orange-500 to-amber-600', to: '/school/timetable' },
];

export default function SchoolDashboard() {
  const navigate = useNavigate();
  const [classStrengthOpen, setClassStrengthOpen] = useState(false);
  const { data: stats, isLoading } = useGetSchoolDashboardQuery({});
  const { data: allStudentsData, isLoading: studentsLoading } = useGetStudentsQuery({ limit: 5000, status: 'active' });

  const now = new Date();
  const currentMonth = now.toLocaleString('default', { month: 'long' });
  const currentYear = now.getFullYear();
  const { data: acctDashboard, isLoading: isLoadingAcct } = useGetSchoolAccountingDashboardQuery({ month: currentMonth, year: currentYear });
  const fc = acctDashboard?.feeCollection;
  const allStudents: any[] = allStudentsData?.results || [];

  const classWiseStrength = useMemo(() => {
    const grouped = new Map<string, { className: string; students: any[] }>();
    allStudents.forEach((student) => {
      const className = String(student?.classId?.name || student?.class?.name || 'Unassigned');
      if (!grouped.has(className)) grouped.set(className, { className, students: [] });
      grouped.get(className)!.students.push(student);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        className: group.className,
        total: group.students.length,
        students: group.students.sort((a, b) =>
          `${a?.firstName || ''} ${a?.lastName || ''}`.localeCompare(`${b?.firstName || ''} ${b?.lastName || ''}`)
        ),
      }))
      .sort((a, b) => b.total - a.total || a.className.localeCompare(b.className));
  }, [allStudents]);

  // total = all enrolled students; marked = those with any attendance record today
  const totalStudents = stats?.todayAttendance?.total || 0;
  const markedCount = stats?.todayAttendance?.marked || 0;
  const presentCount = stats?.todayAttendance?.present || 0;
  const attendancePct = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  const mainStats = [
    {
      title: 'Total Students',
      value: stats?.totalStudents || 0,
      icon: GraduationCap,
      gradient: 'from-blue-500 to-indigo-600',
      bg: 'bg-blue-50',
      to: '/school/students',
    },
    {
      title: 'Teachers',
      value: stats?.totalTeachers || 0,
      icon: Users,
      gradient: 'from-emerald-500 to-teal-600',
      bg: 'bg-emerald-50',
      to: '/school/teachers',
    },
    {
      title: 'Classes',
      value: stats?.totalClasses || 0,
      icon: BookOpen,
      gradient: 'from-violet-500 to-purple-600',
      bg: 'bg-violet-50',
      to: '/school/classes',
    },
    {
      title: 'Pending Fees',
      value: stats?.pendingFees?.count || 0,
      icon: DollarSign,
      gradient: 'from-rose-500 to-red-600',
      bg: 'bg-rose-50',
      to: '/school/fees',
    },
  ];

  return (
    <div className="h-full w-full p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">School Dashboard</h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Button onClick={() => navigate({ to: '/school/students/create' } as NavigateOptions)} className="gap-2">
          <UserPlus className="h-4 w-4" /> New Admission
        </Button>
      </div>

      {/* Main stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mainStats.map((stat) => (
          <Card
            key={stat.title}
            className="cursor-pointer hover:shadow-md transition-all group overflow-hidden"
            onClick={() => {
              if (stat.title === 'Total Students') {
                setClassStrengthOpen(true);
                return;
              }
              navigate({ to: stat.to } as NavigateOptions);
            }}
          >
            <CardContent className="p-5 relative">
              <div className={`absolute top-0 right-0 h-16 w-16 opacity-5 rounded-bl-3xl bg-gradient-to-br ${stat.gradient}`} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                  {isLoading ? (
                    <div className="h-9 w-16 bg-muted animate-pulse rounded mt-1" />
                  ) : (
                    <p className="text-4xl font-bold mt-1">{stat.value}</p>
                  )}
                </div>
                <div className={`h-11 w-11 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className="h-6 w-6 text-current opacity-70" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span>View all</span> <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={classStrengthOpen} onOpenChange={setClassStrengthOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Class-wise Student Strength</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-1 space-y-3 max-h-[70vh]">
            {studentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded" />)}
              </div>
            ) : classWiseStrength.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students found.</p>
            ) : (
              classWiseStrength.map((group) => (
                <Card key={group.className}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{group.className}</CardTitle>
                      <Badge variant="secondary">{group.total} students</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {group.students.map((student: any) => {
                        const name = `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Unnamed Student';
                        return (
                          <div key={student?._id || student?.id || `${group.className}-${name}`} className="rounded-md border px-2.5 py-2 text-xs">
                            <p className="font-medium text-sm truncate">{name}</p>
                            <p className="text-muted-foreground truncate">Adm: {student?.admissionNo || '-'}</p>
                            <p className="text-muted-foreground truncate">Parent: {student?.parent?.fatherName || '-'}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(({ title, icon: Icon, color, to }) => (
            <button
              key={title}
              onClick={() => navigate({ to } as NavigateOptions)}
              className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl bg-gradient-to-br ${color} text-white font-medium text-sm hover:shadow-lg hover:scale-[1.02] transition-all`}
            >
              <Icon className="h-6 w-6" />
              {title}
            </button>
          ))}
        </div>
      </div>

      {/* Fee Overview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fee Overview — {currentMonth} {currentYear}</h2>
          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate({ to: '/school/fees/dashboard' } as NavigateOptions)}>
            Full Report <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Collected Today */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                  <Banknote className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Collected Today</p>
                  {isLoading ? <div className="h-6 w-20 bg-muted animate-pulse rounded mt-0.5" /> : (
                    <>
                      <p className="text-lg font-bold text-teal-600">PKR {(stats?.todayCollection?.amount || 0).toLocaleString()}</p>
                      {(stats?.todayCollection?.count || 0) > 0 && <p className="text-[10px] text-muted-foreground">{stats.todayCollection.count} payment{stats.todayCollection.count !== 1 ? 's' : ''}</p>}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Total Expected */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Expected</p>
                  {isLoadingAcct ? <div className="h-6 w-20 bg-muted animate-pulse rounded mt-0.5" /> : <p className="text-lg font-bold">PKR {(fc?.totalExpected || 0).toLocaleString()}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Collected */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Collected</p>
                  {isLoadingAcct ? <div className="h-6 w-20 bg-muted animate-pulse rounded mt-0.5" /> : <p className="text-lg font-bold text-green-600">PKR {(fc?.totalCollected || 0).toLocaleString()}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Pending */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                  {isLoadingAcct ? <div className="h-6 w-20 bg-muted animate-pulse rounded mt-0.5" /> : <p className="text-lg font-bold text-red-500">PKR {(fc?.totalPending || 0).toLocaleString()}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Collection Rate + voucher breakdown */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Collection Rate</p>
                  {isLoadingAcct ? <div className="h-6 w-14 bg-muted animate-pulse rounded mt-0.5" /> : <p className="text-lg font-bold text-purple-600">{fc?.collectionRate || 0}%</p>}
                </div>
              </div>
              {!isLoadingAcct && (
                <>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-1.5 bg-purple-500 rounded-full transition-all" style={{ width: `${fc?.collectionRate || 0}%` }} />
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[
                      { label: 'Paid', value: fc?.paid || 0, cls: 'bg-green-100 text-green-700' },
                      { label: 'Unpaid', value: fc?.unpaid || 0, cls: 'bg-yellow-100 text-yellow-700' },
                      { label: 'Partial', value: fc?.partial || 0, cls: 'bg-orange-100 text-orange-700' },
                      { label: 'Overdue', value: fc?.overdue || 0, cls: 'bg-red-100 text-red-700' },
                    ].filter(s => s.value > 0).map(s => (
                      <span key={s.label} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.cls}`}>{s.label}: {s.value}</span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payroll Overview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Payroll — {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}
          </h2>
          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate({ to: '/school/teacher-payroll' } as NavigateOptions)}>
            Manage <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Total Payable */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                  <Wallet className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Payable</p>
                  {isLoading ? <div className="h-6 w-24 bg-muted animate-pulse rounded mt-0.5" /> : (
                    <>
                      <p className="text-lg font-bold">PKR {(stats?.payroll?.totalPayable || 0).toLocaleString()}</p>
                      {(stats?.payroll?.totalRecords || 0) > 0 && (
                        <p className="text-[10px] text-muted-foreground">{stats.payroll.totalRecords} record{stats.payroll.totalRecords !== 1 ? 's' : ''}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Paid */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  {isLoading ? <div className="h-6 w-24 bg-muted animate-pulse rounded mt-0.5" /> : (
                    <>
                      <p className="text-lg font-bold text-green-600">PKR {(stats?.payroll?.totalPaid || 0).toLocaleString()}</p>
                      {(stats?.payroll?.paid || 0) > 0 && (
                        <p className="text-[10px] text-muted-foreground">{stats.payroll.paid} teacher{stats.payroll.paid !== 1 ? 's' : ''}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Pending / Draft */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                  {isLoading ? <div className="h-6 w-24 bg-muted animate-pulse rounded mt-0.5" /> : (
                    <>
                      <p className="text-lg font-bold text-amber-600">PKR {(stats?.payroll?.totalPending || 0).toLocaleString()}</p>
                      {(stats?.payroll?.draft || 0) > 0 && (
                        <p className="text-[10px] text-muted-foreground">{stats.payroll.draft} draft{stats.payroll.draft !== 1 ? 's' : ''}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Payout rate */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payout Rate</p>
                  {isLoading ? <div className="h-6 w-14 bg-muted animate-pulse rounded mt-0.5" /> : (
                    <p className="text-lg font-bold text-blue-600">
                      {stats?.payroll?.totalRecords
                        ? Math.round((stats.payroll.paid / stats.payroll.totalRecords) * 100)
                        : 0}%
                    </p>
                  )}
                </div>
              </div>
              {!isLoading && (stats?.payroll?.totalRecords || 0) > 0 && (
                <>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-1.5 bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.round((stats!.payroll.paid / stats!.payroll.totalRecords) * 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {stats!.payroll.paid > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Paid: {stats!.payroll.paid}</span>
                    )}
                    {stats!.payroll.draft > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Draft: {stats!.payroll.draft}</span>
                    )}
                  </div>
                </>
              )}
              {!isLoading && (stats?.payroll?.totalRecords || 0) === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">No payroll generated yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's attendance */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Today's Attendance</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate({ to: '/school/attendance' } as NavigateOptions)}>
                Mark <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-20 bg-muted animate-pulse rounded" />
            ) : markedCount > 0 ? (
              <>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Attendance Rate</span>
                  <span className="font-semibold">{attendancePct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-green-500 rounded-full transition-all" style={{ width: `${attendancePct}%` }} />
                </div>
                <div className="text-xs text-muted-foreground text-right -mt-2">
                  {markedCount} of {totalStudents} marked
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { label: 'Present', count: stats?.todayAttendance?.present || 0, color: 'text-green-600', icon: CheckCircle2 },
                    { label: 'Absent', count: stats?.todayAttendance?.absent || 0, color: 'text-red-600', icon: XCircle },
                    { label: 'Total', count: totalStudents, color: 'text-foreground', icon: Users },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="text-center">
                      <p className={`text-xl font-bold ${color}`}>{count}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                {/* Extra statuses row */}
                {((stats?.todayAttendance?.late || 0) + (stats?.todayAttendance?.leave || 0) + (stats?.todayAttendance?.half_day || 0)) > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                    {stats?.todayAttendance?.late > 0 && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-400 gap-1 text-[11px]">
                        <Timer className="h-3 w-3" /> Late: {stats.todayAttendance.late}
                      </Badge>
                    )}
                    {stats?.todayAttendance?.leave > 0 && (
                      <Badge variant="outline" className="text-blue-600 border-blue-400 gap-1 text-[11px]">
                        <Umbrella className="h-3 w-3" /> Leave: {stats.todayAttendance.leave}
                      </Badge>
                    )}
                    {stats?.todayAttendance?.half_day > 0 && (
                      <Badge variant="outline" className="text-orange-600 border-orange-400 gap-1 text-[11px]">
                        <CalendarMinus className="h-3 w-3" /> Half: {stats.todayAttendance.half_day}
                      </Badge>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No attendance marked today</p>
                <p className="text-xs mt-0.5">{totalStudents} students enrolled</p>
                <Button size="sm" className="mt-2" onClick={() => navigate({ to: '/school/attendance' } as NavigateOptions)}>Mark Now</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming exams */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Upcoming Exams</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate({ to: '/school/exams' } as NavigateOptions)}>
                All <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>
            ) : stats?.upcomingExams?.length > 0 ? (
              <div className="space-y-2">
                {stats.upcomingExams.slice(0, 4).map((exam: any) => (
                  <div key={exam._id || exam.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-blue-700 leading-none">{new Date(exam.startDate).getDate()}</span>
                      <span className="text-[8px] text-blue-600">{new Date(exam.startDate).toLocaleString('default', { month: 'short' })}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{exam.name}</p>
                      <p className="text-[10px] text-muted-foreground">{exam.classId?.name || ''} · {exam.type?.replace('_', ' ')}</p>
                    </div>
                    <Badge className="text-[10px] bg-blue-100 text-blue-700 shrink-0">{exam.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <Calendar className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No upcoming exams</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent admissions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Admissions</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate({ to: '/school/students' } as NavigateOptions)}>
                All <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>
            ) : stats?.recentAdmissions?.length > 0 ? (
              <div className="space-y-2">
                {stats.recentAdmissions.slice(0, 5).map((student: any) => {
                  const initials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();
                  return (
                    <div key={student._id || student.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{student.firstName} {student.lastName}</p>
                        <p className="text-[10px] text-muted-foreground">{student.admissionNumber || student.classId?.name}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(student.admissionDate || student.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <GraduationCap className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No recent admissions</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Class-wise Attendance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-violet-500" /> Class-wise Attendance Today
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate({ to: '/school/attendance' } as NavigateOptions)}>
              Mark <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
          ) : (stats?.classWiseAttendance?.length || 0) > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 font-medium pr-4">Class</th>
                    <th className="pb-2 font-medium text-center text-green-600">Present</th>
                    <th className="pb-2 font-medium text-center text-red-600">Absent</th>
                    <th className="pb-2 font-medium text-center text-yellow-600">Late</th>
                    <th className="pb-2 font-medium text-center text-blue-600">Leave</th>
                    <th className="pb-2 font-medium text-center text-orange-600">Half</th>
                    <th className="pb-2 font-medium text-center">Marked</th>
                    <th className="pb-2 font-medium text-center">Enrolled</th>
                    <th className="pb-2 font-medium text-center">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.classWiseAttendance.map((c: any) => {
                    const rate = c.enrolled > 0 ? Math.round((c.present / c.enrolled) * 100) : 0;
                    return (
                      <tr key={String(c.classId)} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-4 font-medium">{c.className || '—'}</td>
                        <td className="py-2 text-center font-semibold text-green-600">{c.present}</td>
                        <td className="py-2 text-center font-semibold text-red-600">{c.absent}</td>
                        <td className="py-2 text-center font-semibold text-yellow-600">{c.late}</td>
                        <td className="py-2 text-center font-semibold text-blue-600">{c.leave}</td>
                        <td className="py-2 text-center font-semibold text-orange-600">{c.half_day}</td>
                        <td className="py-2 text-center text-muted-foreground">{c.marked}</td>
                        <td className="py-2 text-center text-muted-foreground">{c.enrolled}</td>
                        <td className="py-2 text-center">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${rate >= 75 ? 'bg-green-100 text-green-700' : rate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {rate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm">No attendance marked today</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section-wise Attendance */}
      {(stats?.sectionWiseAttendance?.length || 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal-500" /> Section-wise Attendance Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="pb-2 font-medium pr-4">Class</th>
                      <th className="pb-2 font-medium pr-4">Section</th>
                      <th className="pb-2 font-medium text-center text-green-600">Present</th>
                      <th className="pb-2 font-medium text-center text-red-600">Absent</th>
                      <th className="pb-2 font-medium text-center text-yellow-600">Late</th>
                      <th className="pb-2 font-medium text-center text-blue-600">Leave</th>
                      <th className="pb-2 font-medium text-center text-orange-600">Half</th>
                      <th className="pb-2 font-medium text-center">Marked</th>
                      <th className="pb-2 font-medium text-center">Enrolled</th>
                      <th className="pb-2 font-medium text-center">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stats.sectionWiseAttendance.map((s: any) => {
                      const rate = s.enrolled > 0 ? Math.round((s.present / s.enrolled) * 100) : 0;
                      return (
                        <tr key={String(s.sectionId)} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 text-muted-foreground">{s.className || '—'}</td>
                          <td className="py-2 pr-4 font-medium">{s.sectionName || '—'}</td>
                          <td className="py-2 text-center font-semibold text-green-600">{s.present}</td>
                          <td className="py-2 text-center font-semibold text-red-600">{s.absent}</td>
                          <td className="py-2 text-center font-semibold text-yellow-600">{s.late}</td>
                          <td className="py-2 text-center font-semibold text-blue-600">{s.leave}</td>
                          <td className="py-2 text-center font-semibold text-orange-600">{s.half_day}</td>
                          <td className="py-2 text-center text-muted-foreground">{s.marked}</td>
                          <td className="py-2 text-center text-muted-foreground">{s.enrolled}</td>
                          <td className="py-2 text-center">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${rate >= 75 ? 'bg-green-100 text-green-700' : rate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {rate}%
                            </span>
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
      )}

      {/* Teacher Attendance Today */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-500" /> Teacher Attendance Today
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate({ to: '/school/teacher-attendance' } as NavigateOptions)}>
              Mark <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-20 bg-muted animate-pulse rounded" />
          ) : (stats?.teacherAttendance?.marked || 0) > 0 ? (
            <div className="space-y-3">
              {(() => {
                const ta = stats.teacherAttendance;
                const pct = ta.total > 0 ? Math.round((ta.present / ta.total) * 100) : 0;
                return (
                  <>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Present Rate</span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-2 bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-muted-foreground text-right -mt-2">
                      {ta.marked} of {ta.total} marked
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {[
                        { label: 'Present', count: ta.present, color: 'text-green-600' },
                        { label: 'Absent', count: ta.absent, color: 'text-red-600' },
                        { label: 'Late', count: ta.late, color: 'text-yellow-600' },
                        { label: 'On Leave', count: ta.on_leave, color: 'text-blue-600' },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="text-center">
                          <p className={`text-xl font-bold ${color}`}>{count}</p>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
              <UserCheck className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No teacher attendance marked today</p>
              <p className="text-xs mt-0.5">{stats?.totalTeachers || 0} teachers total</p>
              <Button size="sm" className="mt-2" onClick={() => navigate({ to: '/school/teacher-attendance' } as NavigateOptions)}>
                Mark Now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
