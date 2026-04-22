import { createFileRoute } from '@tanstack/react-router';
import SubjectManagement from '@/features/school/subjects/subject-management';

export const Route = createFileRoute('/_authenticated/school/subjects/')({
  component: SubjectManagement,
});
