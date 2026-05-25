import { createFileRoute } from '@tanstack/react-router';
import RollSlipsPage from '@/features/school/exams/roll-slips-page';

export const Route = createFileRoute('/_authenticated/school/exams/roll-slips/')({
  component: RollSlipsRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    examId: typeof search.examId === 'string' ? search.examId : '',
    classId: typeof search.classId === 'string' ? search.classId : '',
  }),
});

function RollSlipsRoute() {
  const { examId, classId } = Route.useSearch();
  return <RollSlipsPage initialExamId={examId} initialClassId={classId} />;
}
