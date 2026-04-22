import { createFileRoute } from '@tanstack/react-router';
import ExamManagement from '@/features/school/exams/exam-management';

export const Route = createFileRoute('/_authenticated/school/exams/')({
  component: ExamManagement,
});
