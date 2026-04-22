import { createFileRoute } from '@tanstack/react-router';
import FeeCategories from '@/features/school/fees/fee-categories';

export const Route = createFileRoute('/_authenticated/school/fees/categories/')({
  component: FeeCategories,
});
