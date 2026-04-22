import { createFileRoute } from '@tanstack/react-router';
import FeeStructure from '@/features/school/fees/fee-structure';

export const Route = createFileRoute('/_authenticated/school/fees/structures/')({
  component: FeeStructure,
});
