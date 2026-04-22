import { createFileRoute } from '@tanstack/react-router';
import TeacherAssignmentsPage from '@/features/school/teacher-assignments/teacher-assignments-page';

export const Route = createFileRoute('/_authenticated/school/teacher-assignments/')({
  component: TeacherAssignmentsPage,
});
