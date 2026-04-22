import { useState, useEffect, useRef, useCallback } from 'react';
import StudentAvatar from '../components/student-avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScanBarcodeMutation, useGetStudentsQuery, useGetSchoolAttendancesQuery } from '@/stores/school.api';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, AlertCircle, Barcode, Users, RefreshCw, Volume2, VolumeX } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanStatus = 'present' | 'already_marked' | 'invalid';

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
  attendanceStatus?: string;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AttendanceScanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScan, setLastScan] = useState<ScanEntry | null>(null);
  const [history, setHistory] = useState<ScanEntry[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [alreadyCount, setAlreadyCount] = useState(0);

  // In-memory student map: admissionNumber → student
  const [studentMap, setStudentMap] = useState<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  // Session-local set of barcodes already marked present (avoids duplicate UI counts)
  const markedSet = useRef<Set<string>>(new Set());

  // Debounce: ignore same barcode within 1.5 s (scanner double-fire protection)
  const lastBarcodeRef = useRef<{ barcode: string; time: number } | null>(null);

  const { data: studentsData } = useGetStudentsQuery({ limit: 1000, status: 'active' });
  const [scanBarcode] = useScanBarcodeMutation();

  // Load today's already-present count from DB so counter is accurate even after page reload
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: todayAttendanceData } = useGetSchoolAttendancesQuery({ date: todayStr, status: 'present', limit: 1000 });
  useEffect(() => {
    if (todayAttendanceData?.results) {
      setTodayCount(todayAttendanceData.results.length);
      // Also seed markedSet so re-scans are detected correctly
      for (const a of todayAttendanceData.results) {
        const admNo = a.studentId?.admissionNumber;
        if (admNo) markedSet.current.add(admNo.trim());
      }
    }
  // Only run once on mount when data arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayAttendanceData]);

  // Build in-memory map when students load
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

  // Keep input focused
  const refocus = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const processBarcode = useCallback(
    async (raw: string) => {
      const barcode = raw.trim();
      if (!barcode) return;

      // ── Debounce: ignore same barcode within 1.5 s ─────────────────
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

      // ── 1. Resolve locally (< 1 ms) for display fallback ───────────
      const student = studentMap.get(barcode);

      let status: ScanStatus = 'invalid';
      let serverStudent: any = null;
      let attendanceStatus: string | undefined;

      // ── 2. Persist first, then reflect final status in UI ───────────
      try {
        const result = await scanBarcode({ barcode }).unwrap();
        status = result?.status || 'invalid';
        serverStudent = result?.student;
        attendanceStatus = result?.attendanceStatus;
      } catch {
        setBarcodeInput('');
        refocus();
        toast.error('Failed to save attendance. Please check network and try again.');
        if (soundEnabled) playTone('error');
        return;
      }

      if (status === 'present') {
        markedSet.current.add(barcode);
      }

      const fullName = student
        ? `${student.firstName} ${student.lastName || ''}`.trim()
        : undefined;

      const entry: ScanEntry = {
        id: `${barcode}-${now}`,
        barcode,
        status,
        studentName: fullName || `${serverStudent?.firstName || ''} ${serverStudent?.lastName || ''}`.trim() || undefined,
        className: student?.classId?.name || serverStudent?.classId?.name,
        rollNumber: student?.rollNumber || serverStudent?.rollNumber,
        photoUrl: student?.photoUrl?.url || serverStudent?.photoUrl?.url,
        gender: student?.gender || serverStudent?.gender,
        timestamp: new Date(),
        attendanceStatus,
      };

      // ── 2. Update UI immediately (synchronous) ─────────────────────
      setLastScan(entry);
      setHistory((prev) => [entry, ...prev].slice(0, 10));
      if (status === 'present') setTodayCount((n) => n + 1);
      if (status === 'already_marked') setAlreadyCount((n) => n + 1);
      if (soundEnabled) {
        if (status === 'present') playTone('success');
        else if (status === 'already_marked') playTone('warning');
        else playTone('error');
      }

      // ── 3. Clear input and refocus instantly ───────────────────────
      setBarcodeInput('');
      refocus();

      // Server already persisted above; no fire-and-forget call here.
    },
    [studentMap, scanBarcode, soundEnabled, refocus]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processBarcode(barcodeInput);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcodeInput(val);

    // Most USB barcode scanners append \n — detect if the value ends with it
    // Alternatively: if length > 4 and no keystrokes, it's a scanner (handled by Enter)
  };

  const clearHistory = () => {
    setHistory([]);
    setLastScan(null);
    setTodayCount(0);
    setAlreadyCount(0);
    markedSet.current.clear();
    lastBarcodeRef.current = null;
    refocus();
  };

  const cfg = lastScan ? statusConfig(lastScan.status) : null;

  return (
    <div className="h-full w-full p-4 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Barcode className="h-6 w-6 text-blue-600" /> Barcode Attendance
          </h1>
          <p className="text-sm text-muted-foreground">
            Scan student ID barcode to mark attendance
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
          <Button variant="outline" size="sm" onClick={clearHistory} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-none border">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{todayCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Marked Present</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">{alreadyCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Already Marked</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600 flex items-center justify-center gap-1">
              <Users className="h-6 w-6" />{studentMap.size}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">In-Memory</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scanner Input + Last result */}
        <div className="space-y-3">
          {/* Scanner input */}
          <Card className="shadow-none border-2 border-blue-100 focus-within:border-blue-400 transition-colors duration-200">
            <CardContent className="p-4 space-y-3">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Barcode className="h-4 w-4 text-blue-600" /> Scan Barcode
              </label>
              <Input
                ref={inputRef}
                value={barcodeInput}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Scan or type barcode, press Enter…"
                className="text-base font-mono tracking-wider h-12"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onBlur={() => setTimeout(() => inputRef.current?.focus(), 100)}
              />
              <p className="text-xs text-muted-foreground">
                Input auto-refocuses. USB scanner sends Enter automatically.
              </p>
            </CardContent>
          </Card>

          {/* Last scan result */}
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

        {/* Scan history */}
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
    </div>
  );
}
