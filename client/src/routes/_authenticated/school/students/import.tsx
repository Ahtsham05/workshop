import { createFileRoute } from '@tanstack/react-router';
import StudentImportPage from '@/features/school/students/student-import';

export const Route = createFileRoute('/_authenticated/school/students/import')({
  component: StudentImportPage,
});
