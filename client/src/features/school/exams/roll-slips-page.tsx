import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useSelector } from 'react-redux';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useGetExamsQuery,
  useGetSchoolClassesQuery,
  useGetStudentsByClassQuery,
  useGetStudentQuery,
  useGetSubjectsQuery,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import {
  Printer,
  CheckSquare,
  Square,
  Users,
  ClipboardList,
  ChevronLeft,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RootState } from '@/stores/store';
import RollSlipCard from './roll-slip-card';
import { mapStudentToRollSlip, getExamSubjectLines } from './roll-slip-utils';
import type { RollSlipStudent, RollSlipSubjectLine } from './roll-slip-print';
import StudentSearchPicker from '../components/student-search-picker';

interface RollSlipsPageProps {
  initialExamId?: string;
  initialClassId?: string;
}

interface SlipPreviewProps {
  student: RollSlipStudent;
  schoolName: string;
  schoolLogo?: string;
  examName: string;
  className?: string;
  branchName?: string;
  customNote: string;
  subjects: RollSlipSubjectLine[];
  selected: boolean;
  onToggle: () => void;
  onPrintSingle: () => void;
}

function SlipPreview({
  student,
  schoolName,
  schoolLogo,
  examName,
  className,
  branchName,
  customNote,
  subjects,
  selected,
  onToggle,
  onPrintSingle,
}: SlipPreviewProps) {
  return (
    <div className="relative group w-full max-w-3xl mx-auto">
      <div className={`absolute top-3 left-3 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <Checkbox checked={selected} onCheckedChange={onToggle} className="bg-white border-blue-400 shadow" />
      </div>
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow"
          title="Print this slip"
          onClick={(e) => {
            e.stopPropagation();
            onPrintSingle();
          }}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>
      <div
        onClick={onToggle}
        className={`cursor-pointer transition-all duration-150 rounded-sm ${
          selected ? 'ring-2 ring-blue-500 ring-offset-2' : 'hover:ring-1 hover:ring-blue-300 hover:ring-offset-1'
        }`}
      >
        <RollSlipCard
          student={student}
          schoolName={schoolName}
          schoolLogo={schoolLogo}
          examName={examName}
          className={className}
          branchName={branchName}
          customNote={customNote}
          subjects={subjects}
          variant="preview"
        />
      </div>
      <p className="text-center text-xs text-muted-foreground mt-2">
        {student.rollNumber || '—'} · {student.firstName} {student.lastName || ''}
      </p>
    </div>
  );
}

function PrintSlipGrid({
  students,
  schoolName,
  schoolLogo,
  examName,
  branchName,
  customNote,
  subjects,
}: {
  students: RollSlipStudent[];
  schoolName: string;
  schoolLogo?: string;
  examName: string;
  branchName?: string;
  customNote: string;
  subjects: RollSlipSubjectLine[];
}) {
  return (
    <div style={{ background: 'white' }}>
      {students.map((student) => (
        <RollSlipCard
          key={student.id}
          student={student}
          schoolName={schoolName}
          schoolLogo={schoolLogo}
          examName={examName}
          className={student.className}
          branchName={branchName}
          customNote={customNote}
          subjects={subjects}
          variant="print"
        />
      ))}
    </div>
  );
}

export default function RollSlipsPage({ initialExamId = '', initialClassId = '' }: RollSlipsPageProps) {
  const user = useSelector((state: RootState) => state.auth.data?.user);
  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName);
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const schoolName = org?.name || 'School';
  const schoolLogo = org?.logo?.url;
  const branchName = activeBranchName || undefined;

  const [examId, setExamId] = useState(initialExamId);
  const [classFilter, setClassFilter] = useState(initialClassId || 'all');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printQueue, setPrintQueue] = useState<RollSlipStudent[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  const { data: examsData, isLoading: examsLoading } = useGetExamsQuery({ limit: 200, sortBy: 'startDate:desc' });
  const { data: classesData, isLoading: classesLoading } = useGetSchoolClassesQuery({ limit: 100 });

  const exams = examsData?.results || [];
  const classes = classesData?.results || [];

  const filteredExams = useMemo(() => {
    if (classFilter === 'all') return exams;
    return exams.filter((e: any) => {
      const cId = e.classId?._id || e.classId?.id || e.classId;
      return String(cId) === classFilter;
    });
  }, [exams, classFilter]);

  const selectedExam = useMemo(
    () => filteredExams.find((e: any) => (e.id || e._id) === examId) || exams.find((e: any) => (e.id || e._id) === examId),
    [filteredExams, exams, examId],
  );

  const examClassId = selectedExam
    ? String(selectedExam.classId?._id || selectedExam.classId?.id || selectedExam.classId || '')
    : '';

  const rosterClassId = classFilter !== 'all' ? classFilter : examClassId;

  const { data: classStudents, isLoading: rosterLoading } = useGetStudentsByClassQuery(
    rosterClassId,
    { skip: !examId || !rosterClassId },
  );

  const { data: pickedStudent, isLoading: pickedLoading } = useGetStudentQuery(selectedStudentId, { skip: !selectedStudentId });

  const { data: classSubjectsData } = useGetSubjectsQuery(
    examClassId ? { classId: examClassId } : undefined,
    { skip: !examClassId },
  );

  const examSubjectLines = useMemo(
    () => getExamSubjectLines(selectedExam, classSubjectsData?.results),
    [selectedExam, classSubjectsData],
  );

  const classNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c: any) => {
      map[c.id || c._id] = c.name;
    });
    return map;
  }, [classes]);

  const slipStudents: RollSlipStudent[] = useMemo(() => {
    const rosterRows = Array.isArray(classStudents) ? classStudents : [];

    if (selectedStudentId) {
      const picked = pickedStudent && (pickedStudent.id || pickedStudent._id) === selectedStudentId
        ? pickedStudent
        : null;
      const rows = picked
        ? [picked]
        : rosterRows.filter((s: any) => (s.id || s._id) === selectedStudentId);
      return rows.map((s: any) => {
        const cId = s.classId?._id || s.classId?.id || s.classId;
        const classLabel = s.classId?.name || classNameMap[cId] || '';
        return mapStudentToRollSlip(s, classLabel);
      });
    }

    return rosterRows.map((s: any) => {
      const cId = s.classId?._id || s.classId?.id || s.classId;
      const classLabel = s.classId?.name || classNameMap[cId] || selectedExam?.classId?.name || '';
      return mapStudentToRollSlip(s, classLabel);
    });
  }, [classStudents, selectedStudentId, pickedStudent, classNameMap, selectedExam]);

  const filtered = slipStudents;

  const pickedInRoster = useMemo(() => {
    if (!selectedStudentId || !Array.isArray(classStudents)) return false;
    return classStudents.some((s: any) => (s.id || s._id) === selectedStudentId);
  }, [classStudents, selectedStudentId]);

  useEffect(() => {
    if (initialExamId) setExamId(initialExamId);
    if (initialClassId) setClassFilter(initialClassId);
  }, [initialExamId, initialClassId]);

  useEffect(() => {
    if (!examId && filteredExams.length === 1) {
      setExamId(filteredExams[0].id || filteredExams[0]._id);
    }
  }, [examId, filteredExams]);

  useEffect(() => {
    setSelected(new Set());
    setSelectedStudentId('');
  }, [examId, classFilter]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Roll Slips — ${selectedExam?.name || 'Exam'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 10mm; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
  });

  const enqueuePrint = useCallback((students: RollSlipStudent[]) => {
    if (!students.length) {
      toast.error('No slips to print');
      return;
    }
    if (!selectedExam) {
      toast.error('Select an exam first');
      return;
    }
    setPrintQueue(students);
  }, [selectedExam]);

  useEffect(() => {
    if (printQueue.length > 0) {
      const t = setTimeout(() => {
        handlePrint();
        setPrintQueue([]);
      }, 100);
      return () => clearTimeout(t);
    }
  }, [printQueue, handlePrint]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((s) => s.id)));

  const allChecked = filtered.length > 0 && selected.size === filtered.length;
  const examName = selectedExam?.name || '—';
  const isLoading =
    examsLoading ||
    classesLoading ||
    (examId && !selectedStudentId && rosterLoading) ||
    (examId && selectedStudentId && !pickedInRoster && pickedLoading);

  return (
    <div className="h-full w-full p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/school/exams" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4 inline" /> Exams
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-600" /> Roll Number Slips
          </h1>
          <p className="text-sm text-muted-foreground">
            Board-style roll slips with date sheet — print all, selected, or search one student
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && (
            <Button
              onClick={() => enqueuePrint(filtered.filter((s) => selected.has(s.id)))}
              className="gap-2 bg-blue-700 hover:bg-blue-800"
              disabled={!examId}
            >
              <Printer className="h-4 w-4" /> Print Selected ({selected.size})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => enqueuePrint(filtered)}
            disabled={!examId || !filtered.length}
            className="gap-2"
          >
            <Printer className="h-4 w-4" /> Print All ({filtered.length})
          </Button>
        </div>
      </div>

      <Card className="shadow-none border">
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Class</Label>
              <Select
                value={classFilter}
                onValueChange={(v) => {
                  setClassFilter(v);
                  setExamId('');
                }}
                disabled={classesLoading}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={classesLoading ? 'Loading…' : 'All Classes'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((c: any) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Exam</Label>
              <Select
                value={examId || 'none'}
                onValueChange={(v) => setExamId(v === 'none' ? '' : v)}
                disabled={examsLoading}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={examsLoading ? 'Loading…' : 'Select exam'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select exam…</SelectItem>
                  {filteredExams.map((e: any) => (
                    <SelectItem key={e.id || e._id} value={e.id || e._id}>
                      {e.name} — {e.classId?.name || classNameMap[e.classId?._id || e.classId] || 'Class'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-2">
              <div className="flex items-end gap-2">
                <StudentSearchPicker
                  label="Search student"
                  value={selectedStudentId}
                  onChange={setSelectedStudentId}
                  disabled={!examId}
                  placeholder="Search student…"
                  className="flex-1 min-w-0"
                />
                {selectedStudentId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Show all students"
                    onClick={() => setSelectedStudentId('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Extra note (optional)</Label>
            <Textarea
              className="mt-1"
              rows={2}
              placeholder="Add extra instructions above the standard rules (e.g. Reporting time 8:00 AM)"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              disabled={!examId}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Standard exam rules (i–vi) are always printed at the bottom of every slip.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={!filtered.length} className="gap-2">
              {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allChecked ? 'Deselect All' : 'Select All'}
            </Button>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {examId ? `${filtered.length} student${filtered.length !== 1 ? 's' : ''}` : 'Select an exam'}
              {examId && examSubjectLines.length > 0 && (
                <Badge variant="outline" className="ml-1">{examSubjectLines.length} subjects</Badge>
              )}
              {selected.size > 0 && <Badge variant="secondary" className="ml-1">{selected.size} selected</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {!examId ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          Select a class and exam to preview roll slips
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading students…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No students found</div>
      ) : (
        <div className="flex flex-col gap-10 py-2">
          {filtered.map((student) => (
            <SlipPreview
              key={student.id}
              student={student}
              schoolName={schoolName}
              schoolLogo={schoolLogo}
              examName={examName}
              className={student.className}
              branchName={branchName}
              customNote={customNote}
              subjects={examSubjectLines}
              selected={selected.has(student.id)}
              onToggle={() => toggleOne(student.id)}
              onPrintSingle={() => enqueuePrint([student])}
            />
          ))}
        </div>
      )}

      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
        <div ref={printRef}>
          {printQueue.length > 0 && selectedExam && (
            <PrintSlipGrid
              students={printQueue}
              schoolName={schoolName}
              schoolLogo={schoolLogo}
              examName={examName}
              branchName={branchName}
              customNote={customNote}
              subjects={examSubjectLines}
            />
          )}
        </div>
      </div>
    </div>
  );
}
