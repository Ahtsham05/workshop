import { createFileRoute } from '@tanstack/react-router';
import FeeVouchers from '@/features/school/fees/fee-vouchers';

export const Route = createFileRoute('/_authenticated/school/fees/')({
  // Voucher-based fee system (single source of truth for fee amounts)
  component: FeeVouchers,
});
