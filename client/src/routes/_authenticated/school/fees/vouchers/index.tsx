import { createFileRoute } from '@tanstack/react-router';
import FeeVouchers from '@/features/school/fees/fee-vouchers';

export const Route = createFileRoute('/_authenticated/school/fees/vouchers/')({
  component: FeeVouchers,
});
