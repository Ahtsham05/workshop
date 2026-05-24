import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import BillPaymentsPage from '@/features/mobile-shop/bill-payments'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

const billPaymentsSearchSchema = z.object({
  filter: z.enum(['due-today', 'overdue']).optional(),
})

export const Route = createFileRoute('/_authenticated/mobile-shop/bill-payments')({
  validateSearch: billPaymentsSearchSchema,
  component: () => (
    <MobileShopGuard>
      <BillPaymentsPage />
    </MobileShopGuard>
  ),
})
