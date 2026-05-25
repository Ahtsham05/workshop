import { createFileRoute } from '@tanstack/react-router';
import MarksManagement from '@/features/school/marks/marks-management';

export const Route = createFileRoute('/_authenticated/school/marks/')({
  component: MarksManagement,
  validateSearch: (search: Record<string, unknown>) => ({
    examId: typeof search.examId === 'string' ? search.examId : '',
    classId: typeof search.classId === 'string' ? search.classId : '',
  }),
});
