import type { RollSlipStudent, RollSlipSubjectLine } from './roll-slip-print';

export function mapStudentToRollSlip(s: any, className?: string): RollSlipStudent {
  return {
    id: s.id || s._id,
    firstName: s.firstName,
    lastName: s.lastName,
    rollNumber: s.rollNumber,
    admissionNumber: s.admissionNumber,
    gender: s.gender,
    photoUrl: s.photoUrl,
    className: s.classId?.name || className,
    sectionName: s.sectionId?.name,
    fatherName: s.parent?.fatherName || s.parent?.guardianName,
  };
}

function formatSlipDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/** Build date-sheet rows from exam subjects (falls back to class subjects). */
export function getExamSubjectLines(exam: any, classSubjects?: any[]): RollSlipSubjectLine[] {
  const examSubjects = exam?.subjects || [];
  let names: string[] = [];

  if (examSubjects.length) {
    names = examSubjects.map((sub: any, idx: number) =>
      sub.subjectId?.name || sub.subjectId?.code || `Subject ${idx + 1}`,
    );
  } else if (classSubjects?.length) {
    names = classSubjects.map((s: any, idx: number) => s.name || s.code || `Subject ${idx + 1}`);
  }

  const start = exam?.startDate ? new Date(exam.startDate) : null;
  const end = exam?.endDate ? new Date(exam.endDate) : null;

  return names.map((name, idx) => {
    let date = 'As per timetable';
    if (start) {
      if (end && names.length > 1) {
        const span = end.getTime() - start.getTime();
        date = formatSlipDate(new Date(start.getTime() + (span / (names.length - 1)) * idx));
      } else {
        const d = new Date(start);
        d.setDate(d.getDate() + idx * 2);
        date = formatSlipDate(d);
      }
    }
    return { sr: idx + 1, name, date };
  });
}
