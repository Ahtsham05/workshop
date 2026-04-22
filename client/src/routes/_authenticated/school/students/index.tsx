import { createFileRoute } from '@tanstack/react-router';
import StudentList from '@/features/school/students/student-list';

export const Route = createFileRoute('/_authenticated/school/students/')({
  component: StudentList,
});
