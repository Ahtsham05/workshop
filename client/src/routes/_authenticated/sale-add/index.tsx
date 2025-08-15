import { createFileRoute } from '@tanstack/react-router';
import SaleAdd from '@/features/sale/add';

// Correct the dynamic segment by using ':id' instead of '[id]'
export const Route = createFileRoute('/_authenticated/sale-add/')({
  component: SaleAdd,
});