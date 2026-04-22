/**
 * Exam Result Sheet — spreadsheet-style class result table
 * /school/reports/result-sheet
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BookOpen, TrendingUp } from 'lucide-react';
import { useGetExamsQuery, useGetExamResultSheetQuery } from '@/stores/school.api';

const GRADE_COLOR: Record<string, string> = {
  'A+': 'text-emerald-700 font-bold',
  'A':  'text-green-700 font-bold',
  'B':  'text-blue-700 font-bold',
  'C':  'text-yellow-700 font-bold',
  'D':  'text-orange-700 font-bold',
  'E':  'text-gray-600',
  'F':  'text-red-700 font-bold',
  'AB': 'text-slate-400',
  '—': 'text-slate-300',
};

export default function ResultSheetPage() {
  const [selectedExam, setSelectedExam] = useState('');

  const { data: examsData } = useGetExamsQuery({ limit: 100, sortBy: 'startDate:desc' });
  const { data: sheet, isLoading, isFetching } = useGetExamResultSheetQuery(selectedExam, { skip: !selectedExam });

  const exams = examsData?.results ?? [];
  const loading = isLoading || isFetching;

  return (
    <div className="h-full w-full p-4 space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-7 w-7 text-violet-600" /> Exam Result Sheet
        </h1>
        <p className="text-muted-foreground">Full class-wide result spreadsheet</p>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="max-w-sm">
            <p className="text-xs font-medium text-muted-foreground mb-1">Select Exam</p>
            <Select value={selectedExam} onValueChange={setSelectedExam}>
              <SelectTrigger><SelectValue placeholder="Choose an exam…" /></SelectTrigger>
              <SelectContent>
                {exams.map((e: any) => (
                  <SelectItem key={e.id || e._id} value={e.id || e._id}>
                    {e.name} — {e.classId?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedExam && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground">Select an exam to view the result sheet</p>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground animate-pulse p-4">Loading result sheet…</p>}

      {sheet && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <BookOpen className="h-5 w-5 text-violet-500" />
              {sheet.exam.name}
              <Badge variant="outline">{sheet.exam.type?.replace('_', ' ')}</Badge>
              <Badge variant="secondary">{sheet.exam.className}</Badge>
              <span className="text-sm font-normal text-muted-foreground ml-auto">
                Total Marks: {sheet.exam.totalMarks} | Pass: {sheet.exam.passingMarks}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Roll No.</th>
                    <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Student</th>
                    {sheet.subjects.map((sub: any) => (
                      <th key={sub.id} className="text-center px-2 py-2 font-semibold whitespace-nowrap min-w-[60px]">
                        <div>{sub.name}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">/{sheet.exam.totalMarks}</div>
                      </th>
                    ))}
                    <th className="text-center px-2 py-2 font-semibold whitespace-nowrap">Total</th>
                    <th className="text-center px-2 py-2 font-semibold whitespace-nowrap">%</th>
                    <th className="text-center px-2 py-2 font-semibold whitespace-nowrap">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((row: any, i: number) => (
                    <tr key={row.studentId} className={`border-b hover:bg-muted/30 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{row.rollNumber}</td>
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{row.name}</td>
                      {row.subjectMarks.map((sm: any, j: number) => (
                        <td key={j} className="text-center px-2 py-1.5">
                          {sm.isAbsent ? (
                            <span className="text-slate-400 text-xs">ABS</span>
                          ) : sm.obtained !== null ? (
                            <span>{sm.obtained}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="text-center px-2 py-1.5 font-semibold">{row.totalObtained}</td>
                      <td className="text-center px-2 py-1.5">{row.percentage}%</td>
                      <td className={`text-center px-2 py-1.5 ${GRADE_COLOR[row.grade] || ''}`}>{row.grade}</td>
                    </tr>
                  ))}
                </tbody>
                {sheet.rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-blue-50 font-semibold border-t-2 border-blue-200">
                      <td colSpan={2} className="px-3 py-1.5 text-blue-800">Class Average</td>
                      {sheet.subjects.map((_: any, j: number) => {
                        const vals = sheet.rows.map((r: any) => r.subjectMarks[j]?.obtained).filter((v: any) => v !== null && v !== undefined);
                        const avg = vals.length ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : '—';
                        return <td key={j} className="text-center px-2 py-1.5 text-blue-700">{avg}</td>;
                      })}
                      <td className="text-center px-2 py-1.5 text-blue-700">
                        {Math.round(sheet.rows.reduce((a: number, r: any) => a + r.totalObtained, 0) / sheet.rows.length)}
                      </td>
                      <td className="text-center px-2 py-1.5 text-blue-700">
                        {Math.round(sheet.rows.reduce((a: number, r: any) => a + r.percentage, 0) / sheet.rows.length)}%
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pass/Fail stats */}
            <div className="flex items-center gap-4 mt-4 flex-wrap">
              {[
                { label: 'Total Students', val: sheet.rows.length, color: 'text-slate-700' },
                { label: 'Passed', val: sheet.rows.filter((r: any) => r.grade !== 'F' && r.grade !== 'AB').length, color: 'text-green-600' },
                { label: 'Failed', val: sheet.rows.filter((r: any) => r.grade === 'F').length, color: 'text-red-600' },
                { label: 'Pass Rate', val: `${sheet.rows.length > 0 ? Math.round(sheet.rows.filter((r: any) => r.grade !== 'F').length / sheet.rows.length * 100) : 0}%`, color: 'text-blue-600' },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center px-4 py-2 bg-muted/40 rounded-lg">
                  <div className={`text-xl font-bold ${color}`}>{val}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
