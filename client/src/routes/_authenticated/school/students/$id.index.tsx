import { createFileRoute } from '@tanstack/react-router';
import StudentProfile from '@/features/school/students/student-profile';

export const Route = createFileRoute('/_authenticated/school/students/$id/')({
  component: StudentProfilePage,
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === 'true',
  }),
});

function StudentProfilePage() {
  const { id } = Route.useParams();
  const { edit } = Route.useSearch();
  return <StudentProfile id={id} defaultEdit={edit} />;
}
