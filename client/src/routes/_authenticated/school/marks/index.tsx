import { createFileRoute } from '@tanstack/react-router';
import MarksManagement from '@/features/school/marks/marks-management';

export const Route = createFileRoute('/_authenticated/school/marks/')({
  component: MarksManagement,
});
