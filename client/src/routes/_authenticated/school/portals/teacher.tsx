import { createFileRoute } from '@tanstack/react-router';
import TeacherPortalPage from '@/features/school/portals/teacher-portal-page';
import { teacherPortalSearchSchema } from '@/features/school/portals/teacher-portal-tabs';

export const Route = createFileRoute('/_authenticated/school/portals/teacher')({
  validateSearch: teacherPortalSearchSchema,
  component: TeacherPortalPage,
});
