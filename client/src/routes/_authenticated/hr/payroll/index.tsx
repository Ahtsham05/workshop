import { createFileRoute } from '@tanstack/react-router';
import PayrollManagement from '@/features/hr/payroll/payroll-management';

export const Route = createFileRoute('/_authenticated/hr/payroll/')({
  component: PayrollManagement,
});
