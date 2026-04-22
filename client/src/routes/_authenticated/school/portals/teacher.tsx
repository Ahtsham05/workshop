import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import TeacherPortalPage from '@/features/school/portals/teacher-portal-page';

const teacherPortalSearch = z.object({
  tab: z
    .enum(['dashboard', 'students', 'attendance', 'marks', 'exams', 'timetable', 'subjects'])
    .optional()
    .default('dashboard'),
});

export const Route = createFileRoute('/_authenticated/school/portals/teacher')({
  validateSearch: teacherPortalSearch,
  component: TeacherPortalPage,
});
