import { createFileRoute } from '@tanstack/react-router';
import FeeAccountingDashboard from '@/features/school/fees/fee-accounting-dashboard';

export const Route = createFileRoute('/_authenticated/school/fees/dashboard/')({
  component: FeeAccountingDashboard,
});
