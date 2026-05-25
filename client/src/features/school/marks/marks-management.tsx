import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearch } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  useGetExamsQuery,
  useGetMarksByExamQuery,
  useGetSchoolClassesQuery,
  useGetSubjectsQuery,
  useGetStudentsByClassQuery,
  useCreateBulkMarksMutation,
  useUpdateExamMutation,
} from '@/stores/school.api';
import { toast } from 'sonner';
import { Save, BookOpen, Grid3X3, Keyboard, CloudOff } from 'lucide-react';

type CellValue = { obtainedMarks: string; isAbsent: boolean };
type SubjectConfig = { totalMarks: string; passingMarks: string };
type SubjectCol = { id: string; name: string; totalMarks: number; passingMarks: number };
type MarksDraft = {
  marksGrid: Record<string, CellValue>;
  subjectConfigs: Record<string, SubjectConfig>;
  savedAt: string;
};

const cellKey = (studentId: string, subjectId: string) => `${studentId}:${subjectId}`;
const draftKey = (classId: string, examId: string) => `school-marks-draft:${classId}:${examId}`;

function readDraft(classId: string, examId: string): MarksDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(classId, examId));
    if (!raw) return null;
    return JSON.parse(raw) as MarksDraft;
  } catch {
    return null;
  }
}

function writeDraft(classId: string, examId: string, draft: MarksDraft) {
  localStorage.setItem(draftKey(classId, examId), JSON.stringify(draft));
}

function clearDraft(classId: string, examId: string) {
  localStorage.removeItem(draftKey(classId, examId));
}

export default function MarksManagement() {
  const search = useSearch({ from: '/_authenticated/school/marks/' });
  const [selectedExam, setSelectedExam] = useState(search.examId || '');
  const [selectedClass, setSelectedClass] = useState(search.classId || '');
  const [marksGrid, setMarksGrid] = useState<Record<string, CellValue>>({});
  const [subjectConfigs, setSubjectConfigs] = useState<Record<string, SubjectConfig>>({});
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const restoredRef = useRef<string | null>(null);

  const { data: classesData, isLoading: classesLoading } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: examsData, isLoading: examsLoading } = useGetExamsQuery(
    selectedClass ? { classId: selectedClass, limit: 50 } : undefined,
    { skip: !selectedClass },
  );
  const { data: subjectsData, isLoading: subjectsLoading } = useGetSubjectsQuery(
    selectedClass ? { classId: selectedClass, limit: 100, sortBy: 'name:asc' } : undefined,
    { skip: !selectedClass },
  );
  const { data: students, isLoading: studentsLoading } = useGetStudentsByClassQuery(selectedClass, { skip: !selectedClass });
  const { data: existingMarks, refetch: refetchMarks } = useGetMarksByExamQuery(selectedExam, { skip: !selectedExam });
  const [createBulkMarks, { isLoading }] = useCreateBulkMarksMutation();
  const [updateExam, { isLoading: updatingExam }] = useUpdateExamMutation();

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (search.examId) setSelectedExam(search.examId);
    if (search.classId) setSelectedClass(search.classId);
  }, [search.examId, search.classId]);

  const selectedExamData = examsData?.results?.find((e: any) => (e.id || e._id) === selectedExam);

  const baseSubjectColumns: SubjectCol[] = useMemo(() => {
    if (selectedExamData?.subjects?.length) {
      return selectedExamData.subjects.map((s: any) => {
        const id = s.subjectId?._id || s.subjectId?.id || s.subjectId;
        const fromClass = (subjectsData?.results || []).find((sub: any) => (sub.id || sub._id) === id);
        return {
          id,
          name: s.subjectId?.name || fromClass?.name || 'Subject',
          totalMarks: s.totalMarks ?? 100,
          passingMarks: s.passingMarks ?? 40,
        };
      });
    }
    return (subjectsData?.results || []).map((s: any) => ({
      id: s.id || s._id,
      name: s.name,
      totalMarks: 100,
      passingMarks: 40,
    }));
  }, [selectedExamData, subjectsData]);

  const subjectColumns: SubjectCol[] = useMemo(() => {
    return baseSubjectColumns.map((sub) => {
      const cfg = subjectConfigs[sub.id];
      const totalMarks = cfg?.totalMarks ? Number(cfg.totalMarks) : sub.totalMarks;
      const passingMarks = cfg?.passingMarks ? Number(cfg.passingMarks) : sub.passingMarks;
      return {
        ...sub,
        totalMarks: Number.isFinite(totalMarks) && totalMarks > 0 ? totalMarks : sub.totalMarks,
        passingMarks: Number.isFinite(passingMarks) && passingMarks >= 0 ? passingMarks : sub.passingMarks,
      };
    });
  }, [baseSubjectColumns, subjectConfigs]);

  // Restore draft or reset when class/exam changes
  useEffect(() => {
    if (!selectedClass || !selectedExam) {
      setMarksGrid({});
      setSubjectConfigs({});
      setHasLocalDraft(false);
      return;
    }

    const key = `${selectedClass}:${selectedExam}`;
    const draft = readDraft(selectedClass, selectedExam);

    if (draft) {
      setMarksGrid(draft.marksGrid || {});
      setSubjectConfigs(draft.subjectConfigs || {});
      setHasLocalDraft(true);
      if (restoredRef.current !== key) {
        restoredRef.current = key;
        toast.info('Unsaved draft restored — your previous entries were loaded automatically');
      }
      return;
    }

    setMarksGrid({});
    setSubjectConfigs({});
    setHasLocalDraft(false);
    restoredRef.current = key;
  }, [selectedClass, selectedExam]);

  // Fill default subject configs when exam subjects load and no draft configs exist
  useEffect(() => {
    if (!baseSubjectColumns.length) return;
    setSubjectConfigs((prev) => {
      const next = { ...prev };
      let changed = false;
      baseSubjectColumns.forEach((sub) => {
        if (!next[sub.id]) {
          next[sub.id] = {
            totalMarks: String(sub.totalMarks),
            passingMarks: String(sub.passingMarks),
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [baseSubjectColumns]);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (!selectedClass || !selectedExam) return;

    const timer = setTimeout(() => {
      const hasMarks = Object.keys(marksGrid).length > 0;
      const hasConfigs = Object.keys(subjectConfigs).length > 0;

      if (!hasMarks && !hasConfigs) {
        clearDraft(selectedClass, selectedExam);
        setHasLocalDraft(false);
        return;
      }

      writeDraft(selectedClass, selectedExam, {
        marksGrid,
        subjectConfigs,
        savedAt: new Date().toISOString(),
      });
      setHasLocalDraft(true);
    }, 400);

    return () => clearTimeout(timer);
  }, [marksGrid, subjectConfigs, selectedClass, selectedExam]);

  const getCell = useCallback(
    (studentId: string, subjectId: string): CellValue => {
      const key = cellKey(studentId, subjectId);
      if (marksGrid[key]) return marksGrid[key];
      const existing = existingMarks?.find?.((m: any) => {
        const sid = m.studentId?._id || m.studentId?.id || m.studentId;
        const subId = m.subjectId?._id || m.subjectId?.id || m.subjectId;
        return sid === studentId && subId === subjectId;
      });
      if (existing) {
        return { obtainedMarks: String(existing.obtainedMarks ?? ''), isAbsent: !!existing.isAbsent };
      }
      return { obtainedMarks: '', isAbsent: false };
    },
    [marksGrid, existingMarks]
  );

  const setCell = (studentId: string, subjectId: string, value: Partial<CellValue>) => {
    const key = cellKey(studentId, subjectId);
    setMarksGrid((prev) => ({
      ...prev,
      [key]: { ...getCell(studentId, subjectId), ...value },
    }));
  };

  const updateSubjectConfig = (subjectId: string, field: keyof SubjectConfig, value: string) => {
    setSubjectConfigs((prev) => {
      const base = baseSubjectColumns.find((s) => s.id === subjectId);
      const current = prev[subjectId] || {
        totalMarks: String(base?.totalMarks ?? 100),
        passingMarks: String(base?.passingMarks ?? 40),
      };
      return { ...prev, [subjectId]: { ...current, [field]: value } };
    });
  };

  const focusNextCell = (studentIdx: number, subjectIdx: number) => {
    const studentList = students || [];
    const subjectList = subjectColumns;
    let nextStudent = studentIdx;
    let nextSubject = subjectIdx + 1;
    if (nextSubject >= subjectList.length) {
      nextSubject = 0;
      nextStudent += 1;
    }
    if (nextStudent >= studentList.length) return;
    const sid = studentList[nextStudent].id || studentList[nextStudent]._id;
    const subId = subjectList[nextSubject].id;
    inputRefs.current[cellKey(sid, subId)]?.focus();
  };

  const handleSubmit = async () => {
    if (!selectedExam || !selectedClass || !students?.length || !subjectColumns.length) return;

    const invalidSubject = subjectColumns.find(
      (sub) => !sub.totalMarks || sub.totalMarks < 1 || sub.passingMarks < 0 || sub.passingMarks > sub.totalMarks
    );
    if (invalidSubject) {
      toast.error(`Check total/pass marks for ${invalidSubject.name}`);
      return;
    }

    try {
      await updateExam({
        id: selectedExam,
        subjects: subjectColumns.map((sub) => ({
          subjectId: sub.id,
          totalMarks: sub.totalMarks,
          passingMarks: sub.passingMarks,
        })),
      }).unwrap();

      const records: any[] = [];
      students.forEach((s: any) => {
        const sid = s.id || s._id;
        subjectColumns.forEach((sub) => {
          const cell = getCell(sid, sub.id);
          if (cell.obtainedMarks === '' && !cell.isAbsent) return;
          const obtained = Number(cell.obtainedMarks) || 0;
          if (!cell.isAbsent && obtained > sub.totalMarks) {
            throw new Error(`Mark for ${sub.name} cannot exceed ${sub.totalMarks}`);
          }
          records.push({
            examId: selectedExam,
            studentId: sid,
            subjectId: sub.id,
            classId: selectedClass,
            obtainedMarks: obtained,
            totalMarks: sub.totalMarks,
            isAbsent: cell.isAbsent,
          });
        });
      });

      if (!records.length) {
        toast.error('Enter at least one mark before saving');
        return;
      }

      const result = await createBulkMarks({ records }).unwrap();
      clearDraft(selectedClass, selectedExam);
      setHasLocalDraft(false);
      setMarksGrid({});
      toast.success(`${result.saved ?? records.length} marks saved to server`);
      refetchMarks();
    } catch (err: any) {
      toast.error(err?.message || err?.data?.message || 'Failed to save marks');
    }
  };

  const stats = useMemo(() => {
    if (!students?.length || !subjectColumns.length) return null;
    const totalCells = students.length * subjectColumns.length;
    let filled = 0;
    let absent = 0;
    students.forEach((s: any) => {
      const sid = s.id || s._id;
      subjectColumns.forEach((sub) => {
        const cell = getCell(sid, sub.id);
        if (cell.isAbsent) absent++;
        else if (cell.obtainedMarks !== '') filled++;
      });
    });
    return { students: students.length, subjects: subjectColumns.length, filled, absent, totalCells };
  }, [students, subjectColumns, marksGrid, existingMarks, getCell]);

  const ready = !!(selectedClass && selectedExam && subjectColumns.length);
  const filtersLoading = classesLoading || (selectedClass && (examsLoading || subjectsLoading || studentsLoading));
  const saving = isLoading || updatingExam;

  return (
    <div className="h-full w-full p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Grid3X3 className="h-7 w-7 text-primary" />
            Marks Entry
          </h1>
          <p className="text-muted-foreground">Set subject totals, enter all marks, auto-saved locally until you save to server</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasLocalDraft && (
            <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
              <CloudOff className="h-3 w-3" /> Draft saved locally
            </Badge>
          )}
          <Button onClick={handleSubmit} disabled={saving || !ready || !students?.length} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save All Marks'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Class</p>
              <Select
                value={selectedClass}
                onValueChange={(v) => {
                  setSelectedClass(v);
                  setSelectedExam('');
                }}
                disabled={classesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={classesLoading ? 'Loading…' : 'Select class'} />
                </SelectTrigger>
                <SelectContent>
                  {classesData?.results?.map((c: any) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Exam</p>
              <Select
                value={selectedExam}
                onValueChange={setSelectedExam}
                disabled={!selectedClass || examsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={examsLoading ? 'Loading…' : 'Select exam'} />
                </SelectTrigger>
                <SelectContent>
                  {examsData?.results?.map((e: any) => (
                    <SelectItem key={e.id || e._id} value={e.id || e._id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {ready && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t text-xs text-muted-foreground">
              <Keyboard className="h-3.5 w-3.5" />
              <span>Enter = next cell · Double-click mark cell = absent · Edit Total/Pass in column headers · Draft auto-saves locally every few seconds</span>
            </div>
          )}
        </CardContent>
      </Card>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Students', value: stats.students },
            { label: 'Subjects', value: stats.subjects },
            { label: 'Marks Entered', value: stats.filled, color: 'text-green-600' },
            { label: 'Absent', value: stats.absent, color: 'text-gray-600' },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="py-3 px-4">
                <p className={`text-xl font-bold ${color || ''}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!ready ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <BookOpen className="h-12 w-12 mb-4 opacity-30" />
          <p>{filtersLoading ? 'Loading class data…' : 'Select a class and exam to open the marks spreadsheet'}</p>
        </div>
      ) : filtersLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <p>Loading students and subjects…</p>
        </div>
      ) : !students?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <p>No students found in this class</p>
        </div>
      ) : (
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-medium">
              {selectedExamData?.name} — {stats?.students} students × {stats?.subjects} subjects
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="min-w-max">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="sticky left-0 z-20 bg-muted/95 text-left px-3 py-2 font-medium w-10">#</th>
                      <th className="sticky left-10 z-20 bg-muted/95 text-left px-3 py-2 font-medium min-w-[140px]">Student</th>
                      <th className="sticky left-[180px] z-20 bg-muted/95 text-left px-2 py-2 font-medium w-16">Roll</th>
                      {subjectColumns.map((sub) => {
                        const cfg = subjectConfigs[sub.id] || {
                          totalMarks: String(sub.totalMarks),
                          passingMarks: String(sub.passingMarks),
                        };
                        return (
                          <th key={sub.id} className="text-center px-1.5 py-2 font-medium min-w-[100px] border-l align-top">
                            <div className="truncate max-w-[100px] mx-auto" title={sub.name}>{sub.name}</div>
                            <div className="flex items-center justify-center gap-1 mt-1.5">
                              <div className="text-[10px] text-muted-foreground shrink-0">T</div>
                              <Input
                                type="number"
                                min={1}
                                value={cfg.totalMarks}
                                onChange={(e) => updateSubjectConfig(sub.id, 'totalMarks', e.target.value)}
                                className="h-6 w-11 text-[10px] text-center px-0.5"
                                title="Total marks"
                              />
                              <div className="text-[10px] text-muted-foreground shrink-0">P</div>
                              <Input
                                type="number"
                                min={0}
                                value={cfg.passingMarks}
                                onChange={(e) => updateSubjectConfig(sub.id, 'passingMarks', e.target.value)}
                                className="h-6 w-11 text-[10px] text-center px-0.5"
                                title="Passing marks"
                              />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student: any, rowIdx: number) => {
                      const sid = student.id || student._id;
                      return (
                        <tr key={sid} className="border-b hover:bg-muted/20">
                          <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-xs text-muted-foreground">{rowIdx + 1}</td>
                          <td className="sticky left-10 z-10 bg-background px-3 py-1.5 font-medium whitespace-nowrap">
                            {student.firstName} {student.lastName}
                          </td>
                          <td className="sticky left-[180px] z-10 bg-background px-2 py-1.5 text-xs text-muted-foreground">
                            {student.rollNumber || '—'}
                          </td>
                          {subjectColumns.map((sub, colIdx) => {
                            const cell = getCell(sid, sub.id);
                            const obtained = Number(cell.obtainedMarks);
                            const exceeds = !cell.isAbsent && cell.obtainedMarks !== '' && obtained > sub.totalMarks;
                            const passed = !cell.isAbsent && cell.obtainedMarks !== '' && !exceeds && obtained >= sub.passingMarks;
                            const failed = !cell.isAbsent && cell.obtainedMarks !== '' && !exceeds && obtained < sub.passingMarks;
                            const refKey = cellKey(sid, sub.id);
                            return (
                              <td key={sub.id} className={`px-1.5 py-1 border-l text-center ${cell.isAbsent ? 'bg-gray-50' : ''}`}>
                                {cell.isAbsent ? (
                                  <button
                                    type="button"
                                    className="text-[10px] text-muted-foreground hover:text-foreground"
                                    onClick={() => setCell(sid, sub.id, { isAbsent: false })}
                                    title="Click to unmark absent"
                                  >
                                    ABS
                                  </button>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    max={sub.totalMarks}
                                    className={`h-7 w-[72px] mx-auto text-center text-xs px-1 ${
                                      exceeds ? 'border-orange-500 bg-orange-50' : passed ? 'border-green-300' : failed ? 'border-red-300' : ''
                                    }`}
                                    placeholder="—"
                                    value={cell.obtainedMarks}
                                    ref={(el) => { inputRefs.current[refKey] = el; }}
                                    onChange={(e) => setCell(sid, sub.id, { obtainedMarks: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        focusNextCell(rowIdx, colIdx);
                                      }
                                    }}
                                    onDoubleClick={() => setCell(sid, sub.id, { isAbsent: true, obtainedMarks: '' })}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
