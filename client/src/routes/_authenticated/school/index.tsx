import { createFileRoute, redirect } from '@tanstack/react-router';
import SchoolDashboard from '@/features/school/dashboard';
import { getSchoolRole } from '@/lib/school-role-guard';

export const Route = createFileRoute('/_authenticated/school/')({
  beforeLoad: () => {
    if (getSchoolRole() === 'teacher') {
      throw redirect({ to: '/school/portals/teacher' })
    }
  },
  component: SchoolDashboard,
});
