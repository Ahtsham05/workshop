import type { ProgressReportPrintInput } from './progress-report-print-html';

export type ProgressReportExamResult = {
  exam?: { name?: string; type?: string };
  subjects: NonNullable<ProgressReportPrintInput['exam']>['subjects'];
  totalMax: number;
  totalObtained: number;
  percentage: number;
  grade: string;
  highestPercentageInClass?: number | null;
};

export type ProgressReportApi = {
  student: ProgressReportPrintInput['student'];
  attendance: ProgressReportPrintInput['attendance'];
  classStrength?: number;
  exams: ProgressReportExamResult[];
};

export function mapReportToPrintInput(
  report: ProgressReportApi,
  schoolName: string,
  examTitle: string
): ProgressReportPrintInput | null {
  const printExam = report.exams?.[0];
  if (!printExam) return null;

  return {
    schoolName,
    examTitle,
    student: report.student,
    attendance: report.attendance,
    classStrength: report.classStrength,
    exam: {
      subjects: printExam.subjects,
      totalMax: printExam.totalMax,
      totalObtained: printExam.totalObtained,
      percentage: printExam.percentage,
      grade: printExam.grade,
      highestPercentageInClass: printExam.highestPercentageInClass ?? null,
    },
  };
}

export function studentRowId(s: { id?: string; _id?: string }): string {
  return String(s.id || s._id || '');
}
