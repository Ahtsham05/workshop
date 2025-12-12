import { createFileRoute } from '@tanstack/react-router';
import HRDashboard from '@/features/hr/dashboard';

export const Route = createFileRoute('/_authenticated/hr/')({
  component: HRDashboard,
});
