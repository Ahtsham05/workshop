import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useGetExamsQuery, useGetMarksByExamQuery, useGetSchoolClassesQuery, useGetSubjectsQuery, useGetStudentsByClassQuery, useCreateBulkMarksMutation } from '@/stores/school.api';
import { toast } from 'sonner';
import { Save, BookOpen } from 'lucide-react';

export default function MarksManagement() {
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [marksMap, setMarksMap] = useState<Record<string, { obtainedMarks: string; isAbsent: boolean }>>({});

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const { data: examsData } = useGetExamsQuery(selectedClass ? { classId: selectedClass, limit: 50 } : { limit: 0 }, { skip: !selectedClass });
  const { data: subjectsData } = useGetSubjectsQuery(selectedClass ? { classId: selectedClass, limit: 100 } : { limit: 0 }, { skip: !selectedClass });
  const { data: students } = useGetStudentsByClassQuery(selectedClass, { skip: !selectedClass });
  const { data: existingMarks } = useGetMarksByExamQuery(selectedExam, { skip: !selectedExam });
  const [createBulkMarks, { isLoading }] = useCreateBulkMarksMutation();

  const selectedExamData = examsData?.results?.find((e: any) => (e.id || e._id) === selectedExam);

  // Per-subject marks config from the exam's subjects array
  const subjectConfig = useMemo(() => {
    if (!selectedExamData?.subjects?.length || !selectedSubject) return null;
    return selectedExamData.subjects.find(
      (s: any) => (s.subjectId?._id || s.subjectId?.id || s.subjectId) === selectedSubject
    ) || null;
  }, [selectedExamData, selectedSubject]);
  const subjectTotalMarks = subjectConfig?.totalMarks ?? selectedExamData?.totalMarks ?? 100;
  const subjectPassingMarks = subjectConfig?.passingMarks ?? selectedExamData?.passingMarks ?? 50;

  // Only show subjects that belong to this exam (when exam has subjects array)
  const examSubjectIds = useMemo(() => {
    if (!selectedExamData?.subjects?.length) return null;
    return new Set(
      selectedExamData.subjects.map((s: any) => s.subjectId?._id || s.subjectId?.id || s.subjectId)
    );
  }, [selectedExamData]);
  const filteredSubjects = useMemo(() => {
    const all = subjectsData?.results || [];
    if (!examSubjectIds) return all;
    return all.filter((s: any) => examSubjectIds.has(s.id || s._id));
  }, [subjectsData, examSubjectIds]);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const getMarks = (studentId: string) => {
    if (marksMap[studentId]) return marksMap[studentId];
    const existing = existingMarks?.find?.((m: any) =>
      (m.studentId?._id || m.studentId?.id || m.studentId) === studentId &&
      (m.subjectId?._id || m.subjectId?.id || m.subjectId) === selectedSubject
    );
    return existing ? { obtainedMarks: String(existing.obtainedMarks), isAbsent: existing.isAbsent } : { obtainedMarks: '', isAbsent: false };
  };

  const handleSubmit = async () => {
    if (!selectedExam || !selectedClass || !selectedSubject || !students?.length) return;
    try {
      const records = students.map((s: any) => {
        const sid = s.id || s._id;
        const m = getMarks(sid);
        return {
          examId: selectedExam, studentId: sid, subjectId: selectedSubject, classId: selectedClass,
          obtainedMarks: Number(m.obtainedMarks) || 0, totalMarks: subjectTotalMarks,
          isAbsent: m.isAbsent,
        };
      });
      await createBulkMarks({ records }).unwrap();
      toast.success('Marks saved successfully');
      setMarksMap({});
    } catch (err: any) { toast.error(err?.data?.message || 'Failed'); }
  };

  // Compute stats
  const stats = useMemo(() => {
    if (!students?.length || !selectedExam || !selectedSubject) return null;
    const total = students.length;
    const totalMarks = subjectTotalMarks;
    const passingMarks = subjectPassingMarks;
    let pass = 0, fail = 0, absent = 0, totalObtained = 0, filled = 0;
    students.forEach((s: any) => {
      const m = getMarks(s.id || s._id);
      if (m.isAbsent) { absent++; return; }
      if (m.obtainedMarks !== '') {
        filled++;
        const obt = Number(m.obtainedMarks);
        totalObtained += obt;
        if (obt >= passingMarks) pass++; else fail++;
      }
    });
    const avg = filled > 0 ? Math.round(totalObtained / filled) : 0;
    return { total, pass, fail, absent, filled, avg, totalMarks };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, marksMap, existingMarks, selectedExam, selectedSubject, subjectTotalMarks, subjectPassingMarks]);

  const ready = !!(selectedClass && selectedExam && selectedSubject);

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Results & Marks</h1>
          <p className="text-muted-foreground">Enter and manage exam marks</p>
        </div>
        <Button onClick={handleSubmit} disabled={isLoading || !ready || !students?.length} className="gap-2">
          <Save className="h-4 w-4" /> {isLoading ? 'Saving...' : 'Save Marks'}
        </Button>
      </div>

      {/* Selectors */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Class</p>
              <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedExam(''); setSelectedSubject(''); setMarksMap({}); }}>
                <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
                <SelectContent>{classesData?.results?.map((c: any) => <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Exam</p>
              <Select value={selectedExam} onValueChange={(v) => { setSelectedExam(v); setMarksMap({}); }} disabled={!selectedClass}>
                <SelectTrigger><SelectValue placeholder="Select Exam" /></SelectTrigger>
                <SelectContent>{examsData?.results?.map((e: any) => <SelectItem key={e.id || e._id} value={e.id || e._id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
              <Select value={selectedSubject} onValueChange={(v) => { setSelectedSubject(v); setMarksMap({}); }} disabled={!selectedClass}>
                <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                <SelectContent>{filteredSubjects.map((s: any) => <SelectItem key={s.id || s._id} value={s.id || s._id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Students', value: stats.total, color: 'text-foreground' },
            { label: 'Passed', value: stats.pass, color: 'text-green-600' },
            { label: 'Failed', value: stats.fail, color: 'text-red-600' },
            { label: 'Class Average', value: `${stats.avg}/${stats.totalMarks}`, color: 'text-blue-600' },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="py-3 px-4">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Marks table */}
      {!ready ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <BookOpen className="h-12 w-12 mb-4 opacity-30" />
          <p>Select class, exam, and subject to enter marks</p>
        </div>
      ) : !students?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <p>No students found in this class</p>
        </div>
      ) : (
        <Card>
          <CardHeader className="py-3 px-5 border-b">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {students.length} students — Total marks: {subjectTotalMarks} — Pass: {subjectPassingMarks}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {students.map((student: any, idx: number) => {
                const sid = student.id || student._id;
                const m = getMarks(sid);
                const totalM = subjectTotalMarks;
                const passM = subjectPassingMarks;
                const obtained = Number(m.obtainedMarks);
                const passed = !m.isAbsent && m.obtainedMarks !== '' && obtained >= passM;
                const failed = !m.isAbsent && m.obtainedMarks !== '' && obtained < passM;
                const pct = m.obtainedMarks !== '' && !m.isAbsent ? Math.round((obtained / totalM) * 100) : null;

                return (
                  <div key={sid} className={`flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors ${m.isAbsent ? 'bg-gray-50' : ''}`}>
                    <span className="text-xs text-muted-foreground w-6 shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{student.firstName} {student.lastName}</p>
                      <p className="text-xs text-muted-foreground">Roll #{student.rollNumber || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number" min={0} max={totalM}
                        className="w-24 h-8 text-sm"
                        placeholder={`/ ${totalM}`}
                        value={m.obtainedMarks}
                        disabled={m.isAbsent}
                        ref={(el) => { inputRefs.current[idx] = el; }}
                        onChange={(e) => setMarksMap(prev => ({ ...prev, [sid]: { ...m, obtainedMarks: e.target.value } }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const next = inputRefs.current[idx + 1];
                            if (next) next.focus();
                          }
                        }}
                      />
                      {pct !== null && (
                        <span className="text-xs text-muted-foreground w-12 text-right">{pct}%</span>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground">
                        <input
                          type="checkbox" checked={m.isAbsent}
                          className="h-4 w-4"
                          onChange={(e) => setMarksMap(prev => ({ ...prev, [sid]: { ...m, isAbsent: e.target.checked, obtainedMarks: e.target.checked ? '' : m.obtainedMarks } }))}
                        />
                        Absent
                      </label>
                      <div className="w-14 text-right">
                        {m.isAbsent ? <Badge className="bg-gray-100 text-gray-600 text-[10px]">Absent</Badge>
                          : passed ? <Badge className="bg-green-100 text-green-700 text-[10px]">Pass</Badge>
                          : failed ? <Badge className="bg-red-100 text-red-700 text-[10px]">Fail</Badge>
                          : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
