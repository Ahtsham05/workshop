import { createFileRoute } from '@tanstack/react-router';
import AttendanceTracking from '@/features/hr/attendance/attendance-tracking';

export const Route = createFileRoute('/_authenticated/hr/attendance/')({
  component: AttendanceTracking,
});
