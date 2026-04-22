import { createFileRoute } from '@tanstack/react-router';
import AttendanceManagement from '@/features/school/attendance/attendance-management';

export const Route = createFileRoute('/_authenticated/school/attendance/')({
  component: AttendanceManagement,
});
