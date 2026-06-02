/**
 * Class-wise bulk progress report printing with student selection.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  useGetExamsQuery,
  useGetSchoolClassesQuery,
  useGetStudentsByClassQuery,
  useGetSectionsQuery,
  schoolApi,
} from '@/stores/school.api';
import { Printer, Users, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { AppDispatch } from '@/stores/store';
import {
  buildBulkProgressReportPrintHtml,
  openProgressReportPrint,
} from './progress-report-print-html';
import { mapReportToPrintInput, studentRowId } from './progress-report-utils';

type Props = {
  schoolName: string;
};

export default function ClassBatchProgressReports({ schoolName }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const [classId, setClassId] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [examId, setExamId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  const { data: classesData, isLoading: classesLoading } = useGetSchoolClassesQuery({ limit: 100 });
  const { data: examsData, isLoading: examsLoading } = useGetExamsQuery({ limit: 100, sortBy: 'startDate:desc' });
  const { data: sectionsData } = useGetSectionsQuery(
    classId ? { classId, limit: 100 } : undefined,
    { skip: !classId }
  );

  const classes = classesData?.results ?? [];
  const exams = examsData?.results ?? [];

  const filteredExams = useMemo(() => {
    if (!classId) return [];
    return exams.filter((e: { classId?: { _id?: string; id?: string } | string }) => {
      const cId = typeof e.classId === 'object' ? e.classId?._id || e.classId?.id : e.classId;
      return String(cId) === classId;
    });
  }, [exams, classId]);

  const selectedExam = useMemo(
    () => filteredExams.find((e: { id?: string; _id?: string }) => (e.id || e._id) === examId),
    [filteredExams, examId]
  );

  const examTitle = selectedExam?.name || 'Progress Report';

  const { data: classStudents, isLoading: studentsLoading } = useGetStudentsByClassQuery(classId, {
    skip: !classId,
  });

  const roster = useMemo(() => {
    const rows = Array.isArray(classStudents) ? classStudents : [];
    if (sectionFilter === 'all') return rows;
    return rows.filter((s: { sectionId?: { _id?: string; id?: string } | string }) => {
      const sid = typeof s.sectionId === 'object' ? s.sectionId?._id || s.sectionId?.id : s.sectionId;
      return String(sid) === sectionFilter;
    });
  }, [classStudents, sectionFilter]);

  const sections = sectionsData?.results ?? [];

  useEffect(() => {
    setExamId('');
    setSelected(new Set());
    setSectionFilter('all');
  }, [classId]);

  useEffect(() => {
    setSelected(new Set());
  }, [examId, sectionFilter]);

  useEffect(() => {
    if (!examId && filteredExams.length === 1) {
      setExamId(filteredExams[0].id || filteredExams[0]._id);
    }
  }, [examId, filteredExams]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    const ids = roster.map((s: { id?: string; _id?: string }) => studentRowId(s));
    setSelected(selected.size === ids.length ? new Set() : new Set(ids));
  };

  const allChecked = roster.length > 0 && selected.size === roster.length;

  const printStudents = useCallback(
    async (studentIds: string[]) => {
      if (!examId) {
        toast.error('Select an exam first');
        return;
      }
      if (!studentIds.length) {
        toast.error('Select at least one student');
        return;
      }

      setPrinting(true);
      const toastId = toast.loading(`Preparing ${studentIds.length} report card(s)…`);

      try {
        const bulk = await dispatch(
          schoolApi.endpoints.getClassProgressReportsBulk.initiate({
            classId,
            examId,
            sectionId: sectionFilter !== 'all' ? sectionFilter : undefined,
            studentIds,
          })
        ).unwrap();

        const inputs = (bulk.reports ?? [])
          .map((report) => mapReportToPrintInput(report, schoolName, examTitle))
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (!inputs.length) {
          toast.error('No exam results found for selected students');
          return;
        }

        const withResults = bulk.meta?.withResults ?? inputs.length;
        const requested = bulk.meta?.requested ?? studentIds.length;
        if (withResults < requested) {
          toast.warning(`${withResults} of ${requested} students have results for this exam`);
        }

        openProgressReportPrint(buildBulkProgressReportPrintHtml(inputs));
        toast.success(`Printing ${inputs.length} report card(s)`);
      } catch {
        toast.error('Failed to load reports');
      } finally {
        toast.dismiss(toastId);
        setPrinting(false);
      }
    },
    [dispatch, classId, examId, sectionFilter, schoolName, examTitle]
  );

  const selectedIds = roster
    .map((s: { id?: string; _id?: string }) => studentRowId(s))
    .filter((id) => selected.has(id));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Class *</Label>
              <Select
                value={classId || 'none'}
                onValueChange={(v) => setClassId(v === 'none' ? '' : v)}
                disabled={classesLoading}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select class…</SelectItem>
                  {classes.map((c: { id?: string; _id?: string; name: string }) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id!}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Section</Label>
              <Select
                value={sectionFilter}
                onValueChange={setSectionFilter}
                disabled={!classId}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sections</SelectItem>
                  {sections.map((sec: { id?: string; _id?: string; name: string }) => (
                    <SelectItem key={sec.id || sec._id} value={sec.id || sec._id!}>
                      {sec.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Exam *</Label>
              <Select
                value={examId || 'none'}
                onValueChange={(v) => setExamId(v === 'none' ? '' : v)}
                disabled={!classId || examsLoading}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder={classId ? 'Select exam' : 'Select class first'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select exam…</SelectItem>
                  {filteredExams.map((e: { id?: string; _id?: string; name: string }) => (
                    <SelectItem key={e.id || e._id} value={e.id || e._id!}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAll}
              disabled={!roster.length}
              className="gap-2"
            >
              {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allChecked ? 'Deselect all' : 'Select all'}
            </Button>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="h-4 w-4" />
              {classId
                ? `${roster.length} student${roster.length !== 1 ? 's' : ''}`
                : 'Select a class'}
              {selected.size > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selected.size} selected
                </Badge>
              )}
            </span>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!examId || !roster.length || printing}
              onClick={() => printStudents(roster.map((s: { id?: string; _id?: string }) => studentRowId(s)))}
            >
              <Printer className="h-4 w-4" />
              Print all ({roster.length})
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-emerald-700 hover:bg-emerald-800"
              disabled={!examId || selected.size === 0 || printing}
              onClick={() => printStudents(selectedIds)}
            >
              <Printer className="h-4 w-4" />
              Print selected ({selected.size})
            </Button>
          </div>
        </CardContent>
      </Card>

      {!classId ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a class to see students and print report cards in bulk.
          </CardContent>
        </Card>
      ) : studentsLoading ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground animate-pulse">
            Loading students…
          </CardContent>
        </Card>
      ) : !roster.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            No students in this class{sectionFilter !== 'all' ? ' / section' : ''}.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="w-10 py-2 px-3" />
                    <th className="text-left py-2 px-3 font-medium">Roll No.</th>
                    <th className="text-left py-2 px-3 font-medium">Name</th>
                    <th className="text-left py-2 px-3 font-medium">Admission</th>
                    <th className="text-left py-2 px-3 font-medium">Section</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s: {
                    id?: string;
                    _id?: string;
                    firstName: string;
                    lastName?: string;
                    rollNumber?: string;
                    admissionNumber?: string;
                    sectionId?: { name?: string };
                  }) => {
                    const id = studentRowId(s);
                    const name = `${s.firstName} ${s.lastName || ''}`.trim();
                    const checked = selected.has(id);
                    return (
                      <tr
                        key={id}
                        className={`border-b last:border-0 cursor-pointer hover:bg-muted/30 ${checked ? 'bg-emerald-50/50' : ''}`}
                        onClick={() => toggleOne(id)}
                      >
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleOne(id)} />
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{s.rollNumber || '—'}</td>
                        <td className="py-2 px-3 font-medium">{name}</td>
                        <td className="py-2 px-3 text-muted-foreground">{s.admissionNumber || '—'}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {s.sectionId?.name || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
