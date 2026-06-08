import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useGetSchoolClassesQuery,
  useGetStudentsByClassQuery,
  useGetAttendanceByClassQuery,
  useMarkBulkAttendanceMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Umbrella,
  CalendarX2,
  CheckSquare,
  Save,
  Users,
  AlertTriangle,
} from 'lucide-react';
import StudentAvatar from '../components/student-avatar';

const STATUS_CONFIG = [
  { key: 'present', label: 'Present', short: 'P', icon: CheckCircle2, activeClass: 'bg-green-500 text-white', rowBg: 'bg-green-50/40', dotClass: 'bg-green-500' },
  { key: 'absent', label: 'Absent', short: 'A', icon: XCircle, activeClass: 'bg-red-500 text-white', rowBg: 'bg-red-50/40', dotClass: 'bg-red-500' },
  { key: 'late', label: 'Late', short: 'L', icon: Clock, activeClass: 'bg-yellow-500 text-white', rowBg: 'bg-yellow-50/40', dotClass: 'bg-yellow-500' },
  { key: 'leave', label: 'Leave', short: 'Lv', icon: Umbrella, activeClass: 'bg-blue-500 text-white', rowBg: 'bg-blue-50/40', dotClass: 'bg-blue-500' },
  { key: 'half_day', label: 'Half Day', short: 'H', icon: CalendarX2, activeClass: 'bg-orange-500 text-white', rowBg: 'bg-orange-50/40', dotClass: 'bg-orange-500' },
];

const ROW_BG: Record<string, string> = Object.fromEntries(STATUS_CONFIG.map((s) => [s.key, s.rowBg]));

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AttendanceManagement() {
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(localDateStr());
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState('');

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: students } = useGetStudentsByClassQuery(selectedClass, { skip: !selectedClass });
  const { data: existingAttendance, isFetching: attFetching } = useGetAttendanceByClassQuery(
    { classId: selectedClass, date },
    { skip: !selectedClass || !date }
  );
  const [markBulk, { isLoading }] = useMarkBulkAttendanceMutation();

  const selectedClassName = classesData?.results?.find(
    (c: any) => (c.id || c._id) === selectedClass
  )?.name;

  useEffect(() => {
    if (!selectedClass && classesData?.results?.length) {
      setSelectedClass(classesData.results[0].id || classesData.results[0]._id);
    }
  }, [classesData, selectedClass]);

  useEffect(() => {
    setAttendanceMap({});
  }, [selectedClass, date]);

  const sortedStudents = useMemo(() => {
    if (!students?.length) return [];
    return [...students].sort((a: any, b: any) => {
      const rollA = Number(a.rollNumber) || 0;
      const rollB = Number(b.rollNumber) || 0;
      if (rollA !== rollB) return rollA - rollB;
      return `${a.firstName} ${a.lastName || ''}`.localeCompare(`${b.firstName} ${b.lastName || ''}`);
    });
  }, [students]);

  const isSaved = savedKey === `${selectedClass}|${date}` || (existingAttendance?.length ?? 0) > 0;
  const hasLocalChanges = Object.keys(attendanceMap).length > 0;

  const getExisting = (studentId: string) =>
    existingAttendance?.find?.(
      (a: any) => (a.studentId?._id || a.studentId?.id || a.studentId) === studentId
    );

  const getStatus = (studentId: string) => {
    if (attendanceMap[studentId]) return attendanceMap[studentId];
    return getExisting(studentId)?.status || 'present';
  };

  const getCheckInTime = (studentId: string) => {
    const existing = getExisting(studentId);
    if (!existing) return null;
    return existing.checkInTime || ((existing.status === 'present' || existing.status === 'late') ? existing.createdAt : null);
  };

  const setStatus = (studentId: string, status: string) => {
    setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status: string) => {
    const map: Record<string, string> = {};
    sortedStudents.forEach((s: any) => {
      map[s.id || s._id] = status;
    });
    setAttendanceMap(map);
  };

  const summary = useMemo(() => {
    const counts: Record<string, number> = { present: 0, absent: 0, late: 0, leave: 0, half_day: 0 };
    sortedStudents.forEach((s: any) => {
      const status = getStatus(s.id || s._id);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedStudents, attendanceMap, existingAttendance]);

  const handleSubmit = async () => {
    if (!selectedClass || !date || !sortedStudents.length) return;
    try {
      const records = sortedStudents.map((s: any) => ({
        studentId: s.id || s._id,
        classId: selectedClass,
        sectionId: s.sectionId?.id || s.sectionId?._id || s.sectionId,
        date,
        status: getStatus(s.id || s._id),
        checkInTime: getCheckInTime(s.id || s._id) || undefined,
      }));
      await markBulk({ records }).unwrap();
      setSavedKey(`${selectedClass}|${date}`);
      toast.success(`Attendance saved — ${summary.present} present, ${summary.absent} absent`);
      setAttendanceMap({});
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save attendance. Please try again.');
    }
  };

  const total = sortedStudents.length;
  const presentPct = total > 0 ? Math.round((summary.present / total) * 100) : 0;

  return (
    <div className="h-full w-full p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">Mark daily student attendance by class</p>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !selectedClass || !total}
          className={`gap-2 ${hasLocalChanges || (!isSaved && total > 0) ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
        >
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving…' : 'Save Attendance'}
        </Button>
      </div>

      {selectedClass && !attFetching && total > 0 && !isSaved && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Attendance not saved yet</strong> — statuses below are defaults. Click <strong>Save Attendance</strong> to record.
          </span>
        </div>
      )}
      {selectedClass && hasLocalChanges && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-50 border border-orange-300 text-orange-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>You have <strong>unsaved changes</strong>. Click <strong>Save Attendance</strong> to apply them.</span>
        </div>
      )}

      <Card className="shadow-none border">
        <CardContent className="py-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Select Class" />
              </SelectTrigger>
              <SelectContent>
                {classesData?.results?.map((c: any) => (
                  <SelectItem key={c.id || c._id} value={c.id || c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm h-10 bg-background"
            />
            {total > 0 && (
              <div className="flex gap-2 ml-auto flex-wrap">
                <Button size="sm" variant="outline" className="text-green-600 border-green-300" onClick={() => markAll('present')}>
                  <CheckSquare className="h-4 w-4 mr-1" /> All Present
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={() => markAll('absent')}>
                  <XCircle className="h-4 w-4 mr-1" /> All Absent
                </Button>
              </div>
            )}
          </div>

          {total > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {STATUS_CONFIG.map(({ key, label, dotClass }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => markAll(key)}
                    className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold">{summary[key] || 0}</span>
                  </button>
                ))}
                <span className="text-muted-foreground mx-1">·</span>
                <span className="text-sm text-muted-foreground">
                  Total <strong className="text-foreground">{total}</strong>
                </span>
                <span className="text-sm text-muted-foreground">
                  Rate <strong className="text-green-600">{presentPct}%</strong>
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-1.5 bg-green-500 rounded-full transition-all" style={{ width: `${presentPct}%` }} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!selectedClass ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Users className="h-12 w-12 mb-4 opacity-30" />
          <p>Select a class to mark attendance</p>
        </div>
      ) : attFetching ? (
        <div className="py-16 text-center text-muted-foreground text-sm animate-pulse">Loading students…</div>
      ) : !total ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Users className="h-12 w-12 mb-4 opacity-30" />
          <p>No students found in this class</p>
        </div>
      ) : (
        <Card className="shadow-none border overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50/80 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-semibold text-sm">{selectedClassName || 'Class'}</p>
              <p className="text-xs text-muted-foreground">{total} students · {new Date(date).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
            <div className="flex gap-1.5 text-xs flex-wrap">
              {STATUS_CONFIG.map(({ key, label, dotClass }) => (
                <Badge key={key} variant="outline" className="gap-1 font-normal">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                  {summary[key] || 0} {label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground text-xs">
                  <th className="text-left py-2.5 px-3 font-medium w-10">#</th>
                  <th className="text-left py-2.5 px-3 font-medium min-w-[180px]">Student</th>
                  <th className="text-left py-2.5 px-3 font-medium w-20 hidden sm:table-cell">Roll</th>
                  <th className="text-left py-2.5 px-3 font-medium w-24 hidden md:table-cell">Section</th>
                  <th className="text-left py-2.5 px-3 font-medium w-24 hidden lg:table-cell">Entry</th>
                  <th className="text-left py-2.5 px-3 font-medium min-w-[220px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((student: any, idx: number) => {
                  const sid = student.id || student._id;
                  const currentStatus = getStatus(sid);
                  const checkIn = getCheckInTime(sid);
                  const name = `${student.firstName} ${student.lastName || ''}`.trim();
                  const sectionName = student.sectionId?.name || '—';

                  return (
                    <tr
                      key={sid}
                      className={`border-b transition-colors ${ROW_BG[currentStatus] || ''} hover:bg-muted/20`}
                    >
                      <td className="py-2 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <StudentAvatar
                            photoUrl={student.photoUrl?.url}
                            gender={student.gender}
                            className="h-8 w-8 rounded-md shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-medium leading-tight truncate">{name}</p>
                            <p className="text-xs text-muted-foreground sm:hidden">
                              Roll {student.rollNumber || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">
                        {student.rollNumber || '—'}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">
                        {sectionName}
                      </td>
                      <td className="py-2 px-3 hidden lg:table-cell">
                        {checkIn ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="inline-flex rounded-md border bg-background overflow-hidden">
                          {STATUS_CONFIG.map(({ key, label, short, icon: Icon, activeClass }) => (
                            <button
                              key={key}
                              type="button"
                              title={label}
                              onClick={() => setStatus(sid, key)}
                              className={`flex items-center justify-center gap-1 px-2 py-1.5 text-xs border-r last:border-r-0 transition-colors ${
                                currentStatus === key
                                  ? activeClass
                                  : 'text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">{short}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
