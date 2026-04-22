import { createFileRoute } from '@tanstack/react-router';
import TimetableManagement from '@/features/school/timetable/timetable-management';

export const Route = createFileRoute('/_authenticated/school/timetable/')({
  component: TimetableManagement,
});
