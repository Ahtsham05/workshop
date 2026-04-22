import { createFileRoute } from '@tanstack/react-router';
import FeeTransactions from '@/features/school/fees/fee-transactions';

export const Route = createFileRoute('/_authenticated/school/fees/transactions/')({
  component: FeeTransactions,
});
