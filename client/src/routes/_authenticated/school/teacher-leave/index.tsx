import { createFileRoute } from '@tanstack/react-router';
import TeacherLeavePage from '@/features/school/teacher-leave/teacher-leave-page';

export const Route = createFileRoute('/_authenticated/school/teacher-leave/')({
  component: TeacherLeavePage,
});
