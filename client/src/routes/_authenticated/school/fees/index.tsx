import { createFileRoute } from '@tanstack/react-router';
import FeeManagement from '@/features/school/fees/fee-management';

export const Route = createFileRoute('/_authenticated/school/fees/')({
  component: FeeManagement,
});
