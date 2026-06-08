import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import StudentAvatar from '../components/student-avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useGetStudentsQuery,
  useGetSchoolAttendancesQuery,
  useMarkBulkAttendanceMutation,
  useGetSchoolClassesQuery,
} from '@/stores/school.api';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Barcode,
  Users,
  RefreshCw,
  Volume2,
  VolumeX,
  Save,
  AlertTriangle,
  Circle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanStatus = 'present' | 'already_marked' | 'invalid';
type StudentRowStatus = 'pending' | 'scanned' | 'saved';

interface ScanEntry {
  id: string;
  barcode: string;
  status: ScanStatus;
  studentName?: string;
  className?: string;
  rollNumber?: string;
  photoUrl?: string;
  gender?: string;
  timestamp: Date;
}

interface LocalMark {
  barcode: string;
  studentId: string;
  classId: string;
  sectionId?: string;
  studentName: string;
  className: string;
  rollNumber?: string;
  photoUrl?: string;
  gender?: string;
  timestamp: string;
}

interface ClassGroup {
  classId: string;
  className: string;
  order: number;
  students: Array<{
    student: any;
    status: StudentRowStatus;
  }>;
}

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const storageKey = (date: string) => `barcode-attendance-pending-${date}`;

function loadPendingMarks(date: string): Map<string, LocalMark> {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as LocalMark[];
    return new Map(parsed.map((m) => [m.barcode, m]));
  } catch {
    return new Map();
  }
}

function savePendingMarks(date: string, marks: Map<string, LocalMark>) {
  localStorage.setItem(storageKey(date), JSON.stringify([...marks.values()]));
}

// ─── Sound feedback using Web Audio API ──────────────────────────────────────

function playTone(type: 'success' | 'warning' | 'error') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    if (type === 'success') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    } else if (type === 'warning') {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
    }

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // AudioContext not available (SSR / restricted context)
  }
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

function statusConfig(status: ScanStatus) {
  switch (status) {
    case 'present':
      return { icon: CheckCircle2, label: 'Present', color: 'text-green-600', bg: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-700' };
    case 'already_marked':
      return { icon: AlertCircle, label: 'Already Marked', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-700' };
    case 'invalid':
      return { icon: XCircle, label: 'Invalid Barcode', color: 'text-red-600', bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700' };
  }
}

function rowStatusConfig(status: StudentRowStatus) {
  switch (status) {
    case 'saved':
      return { label: 'Saved', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50/60 border-green-100', badge: 'bg-green-100 text-green-700' };
    case 'scanned':
      return { label: 'Scanned', icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-50/60 border-blue-100', badge: 'bg-blue-100 text-blue-700' };
    case 'pending':
      return { label: 'Pending', icon: Circle, color: 'text-slate-400', bg: 'bg-white border-slate-100', badge: 'bg-slate-100 text-slate-500' };
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AttendanceScanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScan, setLastScan] = useState<ScanEntry | null>(null);
  const [history, setHistory] = useState<ScanEntry[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scannedCount, setScannedCount] = useState(0);
  const [alreadyCount, setAlreadyCount] = useState(0);

  const todayStr = localDateStr();
  const [studentMap, setStudentMap] = useState<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [pendingMarks, setPendingMarks] = useState<Map<string, LocalMark>>(() => loadPendingMarks(todayStr));
  const dbMarkedSet = useRef<Set<string>>(new Set());
  const lastBarcodeRef = useRef<{ barcode: string; time: number } | null>(null);

  const { data: studentsData } = useGetStudentsQuery({ limit: 1000, status: 'active' });
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: todayAttendanceData } = useGetSchoolAttendancesQuery({ date: todayStr, status: 'present', limit: 1000 });
  const [markBulk, { isLoading: isSaving }] = useMarkBulkAttendanceMutation();

  useEffect(() => {
    if (todayAttendanceData?.results) {
      for (const a of todayAttendanceData.results) {
        const admNo = a.studentId?.admissionNumber;
        if (admNo) dbMarkedSet.current.add(admNo.trim());
      }
    }
  }, [todayAttendanceData]);

  useEffect(() => {
    if (studentsData?.results) {
      const map = new Map<string, any>();
      for (const s of studentsData.results) {
        if (s.admissionNumber) map.set(s.admissionNumber.trim(), s);
      }
      setStudentMap(map);
      setMapLoaded(true);
    }
  }, [studentsData]);

  useEffect(() => {
    setScannedCount(pendingMarks.size);
  }, [pendingMarks]);

  const refocus = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const getStudentRowStatus = useCallback(
    (student: any): StudentRowStatus => {
      const barcode = student.admissionNumber?.trim();
      if (!barcode) return 'pending';
      if (dbMarkedSet.current.has(barcode)) return 'saved';
      if (pendingMarks.has(barcode)) return 'scanned';
      return 'pending';
    },
    [pendingMarks]
  );

  const classGroups = useMemo((): ClassGroup[] => {
    if (!studentsData?.results?.length) return [];

    const classOrderMap = new Map<string, number>();
    classesData?.results?.forEach((c: any, idx: number) => {
      classOrderMap.set(c.id || c._id, c.order ?? idx);
    });

    const groups = new Map<string, ClassGroup>();

    for (const student of studentsData.results) {
      const classId = student.classId?.id || student.classId?._id || student.classId || 'unknown';
      const className = student.classId?.name || 'Unassigned';
      const order = classOrderMap.get(classId) ?? 999;

      if (!groups.has(classId)) {
        groups.set(classId, { classId, className, order, students: [] });
      }

      groups.get(classId)!.students.push({
        student,
        status: getStudentRowStatus(student),
      });
    }

    return [...groups.values()]
      .sort((a, b) => a.order - b.order || a.className.localeCompare(b.className))
      .map((g) => ({
        ...g,
        students: g.students.sort((a, b) => {
          const rollA = Number(a.student.rollNumber) || 0;
          const rollB = Number(b.student.rollNumber) || 0;
          if (rollA !== rollB) return rollA - rollB;
          return `${a.student.firstName} ${a.student.lastName || ''}`.localeCompare(
            `${b.student.firstName} ${b.student.lastName || ''}`
          );
        }),
      }));
  }, [studentsData, classesData, getStudentRowStatus]);

  const summary = useMemo(() => {
    let saved = 0;
    let scanned = 0;
    let pending = 0;
    for (const group of classGroups) {
      for (const row of group.students) {
        if (row.status === 'saved') saved++;
        else if (row.status === 'scanned') scanned++;
        else pending++;
      }
    }
    return { saved, scanned, pending, total: saved + scanned + pending };
  }, [classGroups]);

  const processBarcode = useCallback(
    (raw: string) => {
      const barcode = raw.trim();
      if (!barcode) return;

      const now = Date.now();
      if (
        lastBarcodeRef.current &&
        lastBarcodeRef.current.barcode === barcode &&
        now - lastBarcodeRef.current.time < 1500
      ) {
        setBarcodeInput('');
        refocus();
        return;
      }
      lastBarcodeRef.current = { barcode, time: now };

      const student = studentMap.get(barcode);
      let status: ScanStatus = 'invalid';

      if (!student) {
        status = 'invalid';
      } else if (pendingMarks.has(barcode) || dbMarkedSet.current.has(barcode)) {
        status = 'already_marked';
      } else {
        status = 'present';
        const mark: LocalMark = {
          barcode,
          studentId: student.id || student._id,
          classId: student.classId?.id || student.classId?._id || student.classId,
          sectionId: student.sectionId?.id || student.sectionId?._id || student.sectionId,
          studentName: `${student.firstName} ${student.lastName || ''}`.trim(),
          className: student.classId?.name || '',
          rollNumber: student.rollNumber,
          photoUrl: student.photoUrl?.url,
          gender: student.gender,
          timestamp: new Date().toISOString(),
        };
        setPendingMarks((prev) => {
          const next = new Map(prev);
          next.set(barcode, mark);
          savePendingMarks(todayStr, next);
          return next;
        });
      }

      const entry: ScanEntry = {
        id: `${barcode}-${now}`,
        barcode,
        status,
        studentName: student
          ? `${student.firstName} ${student.lastName || ''}`.trim()
          : undefined,
        className: student?.classId?.name,
        rollNumber: student?.rollNumber,
        photoUrl: student?.photoUrl?.url,
        gender: student?.gender,
        timestamp: new Date(),
      };

      setLastScan(entry);
      setHistory((prev) => [entry, ...prev].slice(0, 10));
      if (status === 'already_marked') setAlreadyCount((n) => n + 1);
      if (soundEnabled) {
        if (status === 'present') playTone('success');
        else if (status === 'already_marked') playTone('warning');
        else playTone('error');
      }

      setBarcodeInput('');
      refocus();
    },
    [studentMap, pendingMarks, soundEnabled, refocus, todayStr]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processBarcode(barcodeInput);
    }
  };

  const handleSave = async () => {
    if (!pendingMarks.size) {
      toast.info('No scanned attendance to save.');
      return;
    }
    try {
      const records = [...pendingMarks.values()].map((m) => ({
        studentId: m.studentId,
        classId: m.classId,
        sectionId: m.sectionId,
        date: todayStr,
        status: 'present',
        checkInTime: m.timestamp,
      }));
      await markBulk({ records }).unwrap();

      for (const m of pendingMarks.values()) {
        dbMarkedSet.current.add(m.barcode);
      }
      setPendingMarks(new Map());
      localStorage.removeItem(storageKey(todayStr));
      toast.success(`Attendance saved — ${records.length} student${records.length !== 1 ? 's' : ''} marked present`);
      refocus();
    } catch {
      toast.error('Failed to save attendance. Please check network and try again.');
    }
  };

  const clearSession = () => {
    setHistory([]);
    setLastScan(null);
    setAlreadyCount(0);
    setPendingMarks(new Map());
    localStorage.removeItem(storageKey(todayStr));
    lastBarcodeRef.current = null;
    refocus();
  };

  const cfg = lastScan ? statusConfig(lastScan.status) : null;
  const hasPendingSave = pendingMarks.size > 0;

  return (
    <div className="h-full w-full p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Barcode className="h-6 w-6 text-blue-600" /> Barcode Attendance
          </h1>
          <p className="text-sm text-muted-foreground">
            Scan student ID barcode — stored locally until you save
            {mapLoaded && (
              <span className="ml-2 text-green-600 font-medium">
                · {studentMap.size} students loaded
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => { setSoundEnabled((v) => !v); refocus(); }}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={clearSession} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Reset Session
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !hasPendingSave}
            className={`gap-1 ${hasPendingSave ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : `Save (${pendingMarks.size})`}
          </Button>
        </div>
      </div>

      {hasPendingSave && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{pendingMarks.size} scan{pendingMarks.size !== 1 ? 's' : ''} pending</strong> — stored in browser only.
            Click <strong>Save</strong> to record attendance.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-none border">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{scannedCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Scanned (Unsaved)</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{summary.saved}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Saved Today</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">{alreadyCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Duplicate Scans</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-slate-600 flex items-center justify-center gap-1">
              <Users className="h-6 w-6" />{summary.total}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Students</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Card className="shadow-none border-2 border-blue-100 focus-within:border-blue-400 transition-colors duration-200">
            <CardContent className="p-4 space-y-3">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Barcode className="h-4 w-4 text-blue-600" /> Scan Barcode
              </label>
              <Input
                ref={inputRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan or type barcode, press Enter…"
                className="text-base font-mono tracking-wider h-12"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onBlur={() => setTimeout(() => inputRef.current?.focus(), 100)}
              />
              <p className="text-xs text-muted-foreground">
                Scans are stored locally. No network request per scan.
              </p>
            </CardContent>
          </Card>

          {lastScan && cfg && (
            <Card className={`shadow-none border-2 ${cfg.bg} transition-all duration-300`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <StudentAvatar
                    photoUrl={lastScan.photoUrl}
                    gender={lastScan.gender}
                    className="h-14 w-14 rounded-lg flex-shrink-0 border border-white shadow"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`${cfg.badge} text-xs`}>
                        <cfg.icon className="h-3 w-3 mr-1" /> {cfg.label}
                      </Badge>
                    </div>
                    {lastScan.studentName ? (
                      <>
                        <p className="font-bold text-slate-800 text-base leading-tight">{lastScan.studentName}</p>
                        {lastScan.className && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {lastScan.className}
                            {lastScan.rollNumber && ` · Roll: ${lastScan.rollNumber}`}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Barcode: {lastScan.barcode}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {lastScan.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card className="shadow-none border h-full">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="text-sm font-semibold">Last 10 Scans</span>
                <span className="text-xs text-muted-foreground">{history.length} scan{history.length !== 1 ? 's' : ''}</span>
              </div>
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">No scans yet</div>
              ) : (
                <div className="divide-y overflow-y-auto max-h-[380px]">
                  {history.map((entry) => {
                    const c = statusConfig(entry.status);
                    return (
                      <div key={entry.id} className={`flex items-center gap-3 px-4 py-2.5 ${c.bg}`}>
                        <c.icon className={`h-4 w-4 flex-shrink-0 ${c.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.studentName ?? entry.barcode}</p>
                          {entry.className && (
                            <p className="text-xs text-muted-foreground">{entry.className}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <Badge className={`${c.badge} text-[10px]`}>{c.label}</Badge>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{entry.timestamp.toLocaleTimeString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Students by Class</h2>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Saved</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Scanned</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Pending</span>
          </div>
        </div>

        {!mapLoaded ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading students…</div>
        ) : (
          <div className="space-y-4">
            {classGroups.map((group) => {
              const groupSaved = group.students.filter((s) => s.status === 'saved').length;
              const groupScanned = group.students.filter((s) => s.status === 'scanned').length;
              const groupPending = group.students.filter((s) => s.status === 'pending').length;

              return (
                <Card key={group.classId} className="shadow-none border">
                  <CardContent className="p-0">
                    <div className="px-4 py-3 border-b bg-slate-50/80 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-semibold text-sm">{group.className}</p>
                        <p className="text-xs text-muted-foreground">{group.students.length} students</p>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{groupSaved} saved</Badge>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{groupScanned} scanned</Badge>
                        <Badge variant="outline" className="bg-slate-50 text-slate-600">{groupPending} pending</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0">
                      {group.students.map(({ student, status }) => {
                        const rowCfg = rowStatusConfig(status);
                        const name = `${student.firstName} ${student.lastName || ''}`.trim();
                        return (
                          <div
                            key={student.id || student._id}
                            className={`flex items-center gap-3 px-4 py-2.5 border-b sm:border-r ${rowCfg.bg}`}
                          >
                            <StudentAvatar
                              photoUrl={student.photoUrl?.url}
                              gender={student.gender}
                              className="h-9 w-9 rounded-md flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{name}</p>
                              <p className="text-xs text-muted-foreground">
                                Roll {student.rollNumber || '—'}
                                {student.admissionNumber && ` · ${student.admissionNumber}`}
                              </p>
                            </div>
                            <Badge className={`${rowCfg.badge} text-[10px] shrink-0`}>
                              <rowCfg.icon className="h-3 w-3 mr-0.5" />
                              {rowCfg.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
