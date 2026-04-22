import { createFileRoute } from '@tanstack/react-router';
import ProgressReportPage from '@/features/school/reports/progress-report-page';

export const Route = createFileRoute('/_authenticated/school/reports/')({
  component: ProgressReportPage,
});
