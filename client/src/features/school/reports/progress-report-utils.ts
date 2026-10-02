import type { ProgressReportPrintInput, ProgressReportPrintStyle } from './progress-report-print-html';

/** Campus label after "School Name - Campus Name" branch naming. */
export function parseCampusFromBranchName(branchName?: string | null): string | null {
  if (!branchName?.trim()) return null;
  const sep = ' - ';
  const idx = branchName.indexOf(sep);
  if (idx === -1) return null;
  return branchName.slice(idx + sep.length).trim() || null;
}

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
  examTitle: string,
  schoolLogo?: string | null,
  campusName?: string | null,
  printStyle: ProgressReportPrintStyle = 'bw',
): ProgressReportPrintInput | null {
  const printExam = report.exams?.[0];
  if (!printExam) return null;

  return {
    printStyle,
    schoolName,
    campusName: campusName ?? null,
    examTitle,
    schoolLogo: schoolLogo ?? null,
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

const PRINT_STYLE_KEY = 'progressReport.printStyle';

/** Remembered per browser; defaults to black & white (most schools print mono). */
export function readPrintStyle(): ProgressReportPrintStyle {
  try {
    return localStorage.getItem(PRINT_STYLE_KEY) === 'color' ? 'color' : 'bw';
  } catch {
    return 'bw';
  }
}

export function savePrintStyle(style: ProgressReportPrintStyle): void {
  try {
    localStorage.setItem(PRINT_STYLE_KEY, style);
  } catch {
    /* storage blocked — choice just isn't remembered */
  }
}
