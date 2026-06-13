import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import ServicesPage from '@/features/mobile-shop/services'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

const servicesSearchSchema = z.object({
  customerId: z.string().optional(),
  tab: z.enum(['catalog', 'invoices']).optional(),
})

export const Route = createFileRoute('/_authenticated/mobile-shop/services')({
  validateSearch: servicesSearchSchema,
  component: () => {
    const { customerId, tab } = Route.useSearch()
    return (
      <MobileShopGuard>
        <ServicesPage initialCustomerId={customerId} initialTab={tab} />
      </MobileShopGuard>
    )
  },
})
