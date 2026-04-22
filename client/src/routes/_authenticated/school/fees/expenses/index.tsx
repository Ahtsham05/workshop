import { createFileRoute } from '@tanstack/react-router';
import Expenses from '@/features/school/fees/expenses';

export const Route = createFileRoute('/_authenticated/school/fees/expenses/')({
  component: Expenses,
});
