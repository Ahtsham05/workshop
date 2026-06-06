import { createFileRoute } from '@tanstack/react-router';
import PaymentApprovals from '@/features/school/fees/payment-approvals';

export const Route = createFileRoute('/_authenticated/school/fees/payment-approvals/')({
  component: PaymentApprovals,
});
