import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useGetSchoolClassesQuery, useGetStudentsByClassQuery, useGetAttendanceByClassQuery, useMarkBulkAttendanceMutation } from '@/stores/school.api';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, Umbrella, CalendarX2, CheckSquare, Save, Users, AlertTriangle } from 'lucide-react';

const STATUS_CONFIG = [
  { key: 'present', label: 'Present', icon: CheckCircle2, activeClass: 'bg-green-500 hover:bg-green-600 text-white border-green-500', dotClass: 'bg-green-500' },
  { key: 'absent', label: 'Absent', icon: XCircle, activeClass: 'bg-red-500 hover:bg-red-600 text-white border-red-500', dotClass: 'bg-red-500' },
  { key: 'late', label: 'Late', icon: Clock, activeClass: 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500', dotClass: 'bg-yellow-500' },
  { key: 'leave', label: 'Leave', icon: Umbrella, activeClass: 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500', dotClass: 'bg-blue-500' },
  { key: 'half_day', label: 'Half Day', icon: CalendarX2, activeClass: 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500', dotClass: 'bg-orange-500' },
];

/** Returns LOCAL date as YYYY-MM-DD (not UTC) — avoids off-by-one at night */
const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AttendanceManagement() {
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(localDateStr());          // ← LOCAL date, not UTC
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState('');              // "classId|date" after successful save

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: students } = useGetStudentsByClassQuery(selectedClass, { skip: !selectedClass });
  const { data: existingAttendance, isFetching: attFetching } = useGetAttendanceByClassQuery(
    { classId: selectedClass, date },
    { skip: !selectedClass || !date }
  );
  const [markBulk, { isLoading }] = useMarkBulkAttendanceMutation();

  // Auto-select first class on load
  useEffect(() => {
    if (!selectedClass && classesData?.results?.length) {
      setSelectedClass(classesData.results[0].id || classesData.results[0]._id);
    }
  }, [classesData, selectedClass]);

  // Reset local map when class/date changes
  useEffect(() => { setAttendanceMap({}); }, [selectedClass, date]);

  /** True when this class+date has saved records in DB */
  const isSaved = savedKey === `${selectedClass}|${date}` || (existingAttendance?.length ?? 0) > 0;
  /** True when user has unsaved local changes */
  const hasLocalChanges = Object.keys(attendanceMap).length > 0;

  const getStatus = (studentId: string) => {
    if (attendanceMap[studentId]) return attendanceMap[studentId];
    const existing = existingAttendance?.find?.((a: any) => (a.studentId?._id || a.studentId?.id || a.studentId) === studentId);
    return existing?.status || 'present';
  };

  const setStatus = (studentId: string, status: string) => {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status: string) => {
    const map: Record<string, string> = {};
    students?.forEach((s: any) => { map[s.id || s._id] = status; });
    setAttendanceMap(map);
  };

  const summary = useMemo(() => {
    const counts: Record<string, number> = { present: 0, absent: 0, late: 0, leave: 0, half_day: 0 };
    students?.forEach((s: any) => {
      const status = getStatus(s.id || s._id);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, attendanceMap, existingAttendance]);

  const handleSubmit = async () => {
    if (!selectedClass || !date || !students?.length) return;
    try {
      const records = students.map((s: any) => ({
        studentId: s.id || s._id,
        classId: selectedClass,
        date,
        status: getStatus(s.id || s._id),
      }));
      await markBulk({ records }).unwrap();
      setSavedKey(`${selectedClass}|${date}`);
      toast.success(`Attendance saved — ${summary.present} present, ${summary.absent} absent`);
      setAttendanceMap({});
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save attendance. Please try again.');
    }
  };

  const total = students?.length || 0;
  const presentPct = total > 0 ? Math.round((summary.present / total) * 100) : 0;

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground">Mark daily student attendance</p>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !selectedClass || !total}
          className={`gap-2 ${hasLocalChanges || (!isSaved && total > 0) ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
        >
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving...' : 'Save Attendance'}
        </Button>
      </div>

      {/* Unsaved state banner */}
      {selectedClass && !attFetching && total > 0 && !isSaved && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>Attendance not saved yet</strong> — the statuses below are defaults. Click <strong>Save Attendance</strong> to record them.</span>
        </div>
      )}
      {selectedClass && hasLocalChanges && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-50 border border-orange-300 text-orange-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>You have <strong>unsaved changes</strong>. Click <strong>Save Attendance</strong> to apply them.</span>
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select Class" /></SelectTrigger>
              <SelectContent>
                {classesData?.results?.map((c: any) => (
                  <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
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
        </CardContent>
      </Card>

      {/* Summary bar */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="lg:col-span-1">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xl font-bold">{total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {STATUS_CONFIG.map(({ key, label, dotClass }) => (
            <Card key={key} className="cursor-pointer hover:shadow-sm" onClick={() => markAll(key)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${dotClass}`} />
                  <div>
                    <p className="text-xl font-bold">{summary[key] || 0}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Attendance rate bar */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Attendance Rate</span>
            <span className="font-semibold">{presentPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-green-500 rounded-full transition-all" style={{ width: `${presentPct}%` }} />
          </div>
        </div>
      )}

      {/* Student list */}
      {!selectedClass ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Users className="h-12 w-12 mb-4 opacity-30" />
          <p>Select a class to mark attendance</p>
        </div>
      ) : !total ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Users className="h-12 w-12 mb-4 opacity-30" />
          <p>No students found in this class</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {students?.map((student: any, idx: number) => {
            const sid = student.id || student._id;
            const currentStatus = getStatus(sid);
            return (
              <Card key={sid} className={`transition-all ${currentStatus === 'absent' ? 'border-red-200 bg-red-50/50' : currentStatus === 'present' ? 'border-green-200 bg-green-50/50' : ''}`}>
                <CardContent className="flex items-center gap-4 py-3 px-4">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{student.firstName} {student.lastName}</p>
                    <p className="text-xs text-muted-foreground">Roll #{student.rollNumber || '—'}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {STATUS_CONFIG.map(({ key, label, activeClass, icon: Icon }) => (
                      <Button
                        key={key}
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs px-2 ${currentStatus === key ? activeClass : 'hover:bg-muted'}`}
                        onClick={() => setStatus(sid, key)}
                      >
                        <Icon className="h-3 w-3 mr-1" />
                        {key === 'half_day' ? 'Half' : label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
