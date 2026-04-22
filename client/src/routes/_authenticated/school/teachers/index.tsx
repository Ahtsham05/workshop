import { createFileRoute } from '@tanstack/react-router';
import TeacherList from '@/features/school/teachers/teacher-list';

export const Route = createFileRoute('/_authenticated/school/teachers/')({
  component: TeacherList,
});
