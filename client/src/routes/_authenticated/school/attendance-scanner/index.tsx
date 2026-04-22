import { createFileRoute } from '@tanstack/react-router';
import AttendanceScanner from '@/features/school/attendance/attendance-scanner';

export const Route = createFileRoute('/_authenticated/school/attendance-scanner/')({
  component: AttendanceScanner,
});
