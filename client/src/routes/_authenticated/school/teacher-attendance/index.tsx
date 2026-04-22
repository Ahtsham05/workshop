import { createFileRoute } from '@tanstack/react-router';
import TeacherAttendancePage from '@/features/school/teacher-attendance/teacher-attendance-page';

export const Route = createFileRoute('/_authenticated/school/teacher-attendance/')({
  component: TeacherAttendancePage,
});
