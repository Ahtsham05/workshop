/**
 * Student Progress Report — printable A4 report card
 * /school/reports/progress
 */
import { useState, useRef, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Printer, User, BookOpen, CreditCard,
  CheckCircle2, ChevronsUpDown, Check, Search,
} from 'lucide-react';
import {
  useGetStudentsQuery,
  useGetExamsQuery,
  useGetStudentProgressReportQuery,
  useGetSchoolClassesQuery,
} from '@/stores/school.api';
import StudentAvatar from '../components/student-avatar';

// ─── Grade colours ───────────────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  'A':  'bg-green-100 text-green-800',
  'B':  'bg-blue-100 text-blue-800',
  'C':  'bg-yellow-100 text-yellow-800',
  'D':  'bg-orange-100 text-orange-800',
  'E':  'bg-gray-100 text-gray-700',
  'F':  'bg-red-100 text-red-800',
  'AB': 'bg-slate-100 text-slate-500',
};

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLOR[grade] || 'bg-gray-100 text-gray-600'}`}>
      {grade}
    </span>
  );
}

// ─── Printable Report Card ───────────────────────────────────────────────────

function ReportCard({ data, printRef }: { data: any; printRef: React.RefObject<HTMLDivElement | null> }) {
  if (!data) return null;
  const { student, attendance, fees, exams, overall } = data;
  const fullName = `${student.firstName} ${student.lastName || ''}`.trim();

  return (
    <div
      ref={printRef}
      className="bg-white text-gray-900"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '12mm 14mm',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontSize: '12px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '6mm', borderBottom: '1.5px solid #1e3a8a', paddingBottom: '4mm' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#1e3a8a', margin: 0 }}>STUDENT PROGRESS REPORT</h1>
        <p style={{ fontSize: '11px', color: '#64748b', margin: '1mm 0 0' }}>Academic Progress Card</p>
      </div>

      {/* Student Info */}
      <div style={{ display: 'flex', gap: '6mm', marginBottom: '6mm', alignItems: 'flex-start' }}>
        <StudentAvatar
          photoUrl={student.photoUrl}
          gender={student.gender}
          style={{ width: '22mm', height: '28mm', borderRadius: '2mm', border: '0.5mm solid #cbd5e1', flexShrink: 0 }}
        />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5mm 4mm' }}>
          <InfoRow label="Student Name" value={fullName} />
          <InfoRow label="Admission No." value={student.admissionNumber} />
          <InfoRow label="Roll No." value={student.rollNumber || '—'} />
          <InfoRow label="Class" value={`${student.className}${student.sectionName ? ' - ' + student.sectionName : ''}`} />
          <InfoRow label="Gender" value={student.gender?.charAt(0).toUpperCase() + student.gender?.slice(1) || '—'} />
          <InfoRow label="Father's Name" value={student.parent?.fatherName || '—'} />
          <InfoRow label="Contact" value={student.parent?.phone || '—'} />
        </div>
      </div>

      {/* Attendance & Fees Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm', marginBottom: '6mm' }}>
        <SummaryBox
          title="Attendance"
          rows={[
            ['Total Days', String(attendance.total)],
            ['Present', String(attendance.present)],
            ['Absent', String(attendance.absent)],
            ['Percentage', attendance.percentage !== null ? `${attendance.percentage}%` : 'N/A'],
          ]}
          accent="#0ea5e9"
        />
        <SummaryBox
          title="Fee Status"
          rows={[
            ['Total Due', fees.voucherCount === 0 ? 'N/A' : `Rs. ${fees.totalDue.toLocaleString()}`],
            ['Total Paid', fees.voucherCount === 0 ? 'N/A' : `Rs. ${fees.totalPaid.toLocaleString()}`],
            ['Balance', fees.voucherCount === 0 ? 'N/A' : `Rs. ${fees.balance.toLocaleString()}`],
            ['Status', fees.voucherCount === 0 ? 'NO RECORDS' : fees.balance <= 0 ? 'CLEARED' : `${fees.unpaidCount} UNPAID`],
          ]}
          accent={fees.voucherCount === 0 ? '#94a3b8' : fees.balance <= 0 ? '#10b981' : '#f59e0b'}
        />
      </div>

      {/* Exam Results */}
      {exams.map((exam: any, i: number) => (
        <div key={i} style={{ marginBottom: '5mm' }}>
          <div style={{
            background: '#eff6ff',
            padding: '2mm 4mm',
            borderLeft: '3px solid #2563eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2mm',
          }}>
            <span style={{ fontWeight: 700, fontSize: '11px', color: '#1e40af' }}>
              {exam.exam?.name || 'Exam'} — {exam.exam?.type?.replace('_', ' ').toUpperCase()}
            </span>
            <span style={{ fontSize: '11px', color: '#1e40af', fontWeight: 600 }}>
              {exam.percentage}% &nbsp;
              <span style={{ background: '#1e40af', color: 'white', padding: '1px 6px', borderRadius: '3px', fontSize: '10px' }}>
                {exam.grade}
              </span>
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...TH, textAlign: 'left' }}>Subject</th>
                <th style={{ ...TH }}>Total</th>
                <th style={{ ...TH }}>Obtained</th>
                <th style={{ ...TH }}>%</th>
                <th style={{ ...TH }}>Grade</th>
                <th style={{ ...TH, textAlign: 'left' }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {exam.subjects.map((sub: any, j: number) => (
                <tr key={j} style={{ background: j % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                  <td style={{ ...TD, fontWeight: 500 }}>{sub.subjectName}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>{sub.totalMarks}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>{sub.isAbsent ? 'ABS' : sub.obtainedMarks ?? '—'}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>{sub.isAbsent || sub.percentage === null ? '—' : `${sub.percentage}%`}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>{sub.grade}</td>
                  <td style={{ ...TD }}>{sub.remarks || ''}</td>
                </tr>
              ))}
              <tr style={{ background: '#eff6ff', fontWeight: 700 }}>
                <td style={{ ...TD }}>Total</td>
                <td style={{ ...TD, textAlign: 'center' }}>{exam.totalMax}</td>
                <td style={{ ...TD, textAlign: 'center' }}>{exam.totalObtained}</td>
                <td style={{ ...TD, textAlign: 'center' }}>{exam.percentage}%</td>
                <td style={{ ...TD, textAlign: 'center' }}>{exam.grade}</td>
                <td style={{ ...TD }}>{exam.label}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {/* Overall */}
      <div style={{
        background: overall.grade === 'F' ? '#fef2f2' : '#f0fdf4',
        border: `1.5px solid ${overall.grade === 'F' ? '#fca5a5' : '#86efac'}`,
        borderRadius: '3mm',
        padding: '3mm 5mm',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '4mm',
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#111827' }}>Overall Result</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            Combined: {overall.totalObtained} / {overall.totalMax}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: overall.grade === 'F' ? '#dc2626' : '#16a34a' }}>
            {overall.percentage}%
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>
            Grade — {overall.grade} &nbsp; ({overall.label})
          </div>
        </div>
      </div>

      {/* Signature strip */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '16mm', borderTop: '1px dashed #d1d5db', paddingTop: '4mm' }}>
        {['Class Teacher', 'Principal', 'Parent / Guardian'].map((lbl) => (
          <div key={lbl} style={{ textAlign: 'center', minWidth: '40mm' }}>
            <div style={{ borderTop: '1px solid #374151', paddingTop: '2mm', fontSize: '10px', color: '#6b7280' }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const TH: React.CSSProperties = { padding: '4px 8px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.3px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' };
const TD: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #f1f5f9' };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px dashed #e5e7eb', padding: '2px 0' }}>
      <span style={{ fontSize: '10px', color: '#6b7280', flexShrink: 0, minWidth: '24mm' }}>{label}:</span>
      <span style={{ fontSize: '10px', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SummaryBox({ title, rows, accent }: { title: string; rows: [string, string][]; accent: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '2mm', overflow: 'hidden' }}>
      <div style={{ background: accent, color: 'white', padding: '2mm 4mm', fontSize: '11px', fontWeight: 700 }}>{title}</div>
      <div style={{ padding: '2mm 4mm' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0', borderBottom: '1px dashed #f1f5f9', fontSize: '11px' }}>
            <span style={{ color: '#6b7280' }}>{k}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProgressReportPage() {
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedExam, setSelectedExam] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [studentOpen, setStudentOpen] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);

  const { data: studentsData, isLoading: studentsLoading } = useGetStudentsQuery({ limit: 100, status: 'active' });
  const { data: examsData } = useGetExamsQuery({ limit: 100 });
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });

  const skip = !selectedStudent;
  const { data: reportData, isLoading: reportLoading, isFetching } = useGetStudentProgressReportQuery(
    { studentId: selectedStudent, examId: selectedExam !== 'all' ? selectedExam : undefined },
    { skip }
  );

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Progress Report',
    pageStyle: `
      @page { size: A4; margin: 0; }
      @media print {
        body { margin: 0; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
  });

  const allStudents = studentsData?.results ?? [];
  const exams = examsData?.results ?? [];
  const classes = classesData?.results ?? [];

  // Filter students by class
  const filteredStudents = useMemo(() => {
    if (classFilter === 'all') return allStudents;
    return allStudents.filter((s: any) => {
      const cId = s.classId?._id || s.classId?.id || s.classId;
      return cId === classFilter;
    });
  }, [allStudents, classFilter]);

  // Find selected student object for display
  const selectedStudentObj = allStudents.find((s: any) => (s.id || s._id) === selectedStudent);
  const selectedStudentLabel = selectedStudentObj
    ? `${selectedStudentObj.firstName} ${selectedStudentObj.lastName || ''} — ${selectedStudentObj.admissionNumber}`.trim()
    : '';

  const loading = reportLoading || isFetching;

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progress Reports</h1>
          <p className="text-sm text-muted-foreground">Generate and print student progress report cards</p>
        </div>
        {reportData && (
          <Button onClick={() => handlePrint()} size="sm" className="gap-2 bg-blue-700 hover:bg-blue-800">
            <Printer className="h-4 w-4" /> Print Report
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Searchable Student Picker */}
            <div className="sm:col-span-6 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">Student *</p>
              <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={studentOpen}
                    title={selectedStudentLabel || (studentsLoading ? 'Loading…' : 'Search student…')}
                    className="w-full min-w-0 justify-between gap-2 font-normal h-9 text-sm"
                  >
                    <span className="truncate text-left">
                      {selectedStudentLabel || (studentsLoading ? 'Loading…' : 'Search student…')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[340px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name, admission no…" />
                    {/* Class filter inside the picker */}
                    {classes.length > 1 && (
                      <div className="px-2 py-1.5 border-b">
                        <Select value={classFilter} onValueChange={setClassFilter}>
                          <SelectTrigger className="h-8 text-xs [&>span]:truncate">
                            <SelectValue placeholder="All Classes" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Classes</SelectItem>
                          {classes.map((c: any) => (
                            <SelectItem key={c.id || c._id} value={c.id || c._id}>
                              {c.name}
                            </SelectItem>
                          ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <CommandList>
                      <CommandEmpty>No student found.</CommandEmpty>
                      <CommandGroup>
                        {filteredStudents.map((s: any) => {
                          const sid = s.id || s._id;
                          const label = `${s.firstName} ${s.lastName || ''}`.trim();
                          return (
                            <CommandItem
                              key={sid}
                              value={`${label} ${s.admissionNumber} ${s.classId?.name || ''}`}
                              onSelect={() => {
                                setSelectedStudent(sid);
                                setSelectedExam('all');
                                setStudentOpen(false);
                              }}
                            >
                              <div className="flex items-center gap-2 w-full">
                                <StudentAvatar
                                  photoUrl={s.photoUrl?.url}
                                  gender={s.gender}
                                  className="h-6 w-6 rounded-full shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{label}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {s.admissionNumber} · {s.classId?.name || ''}
                                  </div>
                                </div>
                                {sid === selectedStudent && (
                                  <Check className="h-4 w-4 text-blue-600 shrink-0" />
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Exam filter */}
            <div className="sm:col-span-4 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">Exam (optional)</p>
              <Select value={selectedExam} onValueChange={setSelectedExam} disabled={!selectedStudent}>
                <SelectTrigger className="h-9 w-full min-w-0 [&>span]:truncate">
                  <SelectValue placeholder="All Exams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Exams</SelectItem>
                  {exams.map((e: any) => (
                    <SelectItem key={e.id || e._id} value={e.id || e._id}>
                      {e.name} {e.classId?.name ? `(${e.classId.name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 min-w-0 flex items-end">
              {loading && <p className="text-sm text-muted-foreground animate-pulse">Generating report…</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {!selectedStudent && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <Search className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">Search and select a student to generate their progress report</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      {reportData && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={<User className="h-5 w-5 text-blue-500" />}
              label="Student"
              value={`${reportData.student.firstName} ${reportData.student.lastName || ''}`}
              sub={`${reportData.student.className}${reportData.student.sectionName ? ' — ' + reportData.student.sectionName : ''}`}
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
              label="Attendance"
              value={reportData.attendance.percentage !== null ? `${reportData.attendance.percentage}%` : 'N/A'}
              sub={`${reportData.attendance.present} / ${reportData.attendance.total} days`}
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5 text-violet-500" />}
              label="Overall Grade"
              value={reportData.overall.grade}
              sub={`${reportData.overall.percentage}% — ${reportData.overall.label}`}
            />
            <StatCard
              icon={<CreditCard className="h-5 w-5 text-amber-500" />}
              label="Fee Balance"
              value={
                reportData.fees.voucherCount === 0
                  ? 'No Records'
                  : `Rs. ${reportData.fees.balance.toLocaleString()}`
              }
              sub={
                reportData.fees.voucherCount === 0
                  ? 'No fee vouchers'
                  : reportData.fees.balance <= 0
                  ? 'Cleared'
                  : `Rs. ${reportData.fees.balance.toLocaleString()} pending`
              }
            />
          </div>

          {/* No exams */}
          {reportData.exams.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                No exam results found for this student.
              </CardContent>
            </Card>
          )}

          {/* Exam results */}
          {reportData.exams.map((exam: any, i: number) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                    {exam.exam?.name || 'Exam'}
                    <Badge variant="outline" className="text-[10px]">{exam.exam?.type?.replace('_', ' ')}</Badge>
                  </span>
                  <span className="flex items-center gap-2 text-sm font-normal">
                    <span className="text-muted-foreground">{exam.totalObtained}/{exam.totalMax}</span>
                    <span className="font-bold">{exam.percentage}%</span>
                    <GradeBadge grade={exam.grade} />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Subject</th>
                        <th className="text-center py-2 px-3 font-medium">Total</th>
                        <th className="text-center py-2 px-3 font-medium">Obtained</th>
                        <th className="text-center py-2 px-3 font-medium">%</th>
                        <th className="text-center py-2 px-3 font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exam.subjects.map((sub: any, j: number) => (
                        <tr key={j} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium">{sub.subjectName}</td>
                          <td className="text-center py-2 px-3 text-muted-foreground">{sub.totalMarks}</td>
                          <td className="text-center py-2 px-3">
                            {sub.isAbsent
                              ? <span className="text-red-400 text-xs font-medium">Absent</span>
                              : <span className="font-semibold">{sub.obtainedMarks ?? '—'}</span>
                            }
                          </td>
                          <td className="text-center py-2 px-3">{sub.isAbsent || sub.percentage === null ? '—' : `${sub.percentage}%`}</td>
                          <td className="text-center py-2 px-3"><GradeBadge grade={sub.grade} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* Off-screen printable */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <ReportCard data={reportData} printRef={printRef} />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className="shrink-0 p-2 rounded-lg bg-muted/50">{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="text-sm font-bold leading-tight truncate">{value}</p>
          <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}
