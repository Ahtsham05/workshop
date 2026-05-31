import { createFileRoute } from '@tanstack/react-router';
import StudentPortalPage from '@/features/school/portals/student-portal-page';

export const Route = createFileRoute('/_authenticated/school/portals/student')({
  component: StudentPortalPage,
});
