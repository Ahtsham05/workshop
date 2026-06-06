import { z } from 'zod';

/** Valid `?tab=` values for the teacher portal — keep in sync with TabsTrigger values. */
export const TEACHER_PORTAL_TABS = [
  'dashboard',
  'students',
  'attendance',
  'diary',
  'marks',
  'my-attendance',
  'exams',
  'timetable',
  'subjects',
  'notifications',
] as const;

export type TeacherPortalTab = (typeof TEACHER_PORTAL_TABS)[number];

export const teacherPortalSearchSchema = z.object({
  tab: z.enum(TEACHER_PORTAL_TABS).optional().default('dashboard'),
});
