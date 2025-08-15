import { createFileRoute } from '@tanstack/react-router';
import PurchaseAdd from '@/features/purchase/add';

// Correct the dynamic segment by using ':id' instead of '[id]'
export const Route = createFileRoute('/_authenticated/purchase-add/')({
  component: PurchaseAdd,
});