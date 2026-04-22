import { createFileRoute } from '@tanstack/react-router';
import FeeReports from '@/features/school/fees/fee-reports';

export const Route = createFileRoute('/_authenticated/school/fees/reports/')({
  component: FeeReports,
});
