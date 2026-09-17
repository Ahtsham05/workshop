import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import FeeReports from '@/features/school/fees/fee-reports';

const feeReportsSearchSchema = z.object({
  tab: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/school/fees/reports/')({
  component: FeeReports,
  validateSearch: feeReportsSearchSchema,
});
