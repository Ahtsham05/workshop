import { createFileRoute } from '@tanstack/react-router';
import StudentPromotion from '@/features/school/students/student-promotion';

export const Route = createFileRoute('/_authenticated/school/students/promotion')({
  component: StudentPromotion,
});
