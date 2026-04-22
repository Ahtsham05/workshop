import { createFileRoute } from '@tanstack/react-router';
import TeacherPayrollPage from '@/features/school/teacher-payroll/teacher-payroll-page';

export const Route = createFileRoute('/_authenticated/school/teacher-payroll/')({
  component: TeacherPayrollPage,
});
