import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import SimSalePage from '@/features/mobile-shop/sim-sale'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

const simSaleSearchSchema = z.object({
  customerId: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/mobile-shop/sim-sale')({
  validateSearch: simSaleSearchSchema,
  component: () => {
    const { customerId } = Route.useSearch()
    return (
      <MobileShopGuard>
        <SimSalePage initialCustomerId={customerId} />
      </MobileShopGuard>
    )
  },
})
