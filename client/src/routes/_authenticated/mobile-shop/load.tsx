import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LoadManagementPage } from '@/features/mobile-shop/load/index'
import { MobileShopGuard } from '@/components/mobile-shop-guard'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'

const loadSearchSchema = z.object({
  walletId: z.string().optional(),
  walletType: z.string().optional(),
  tab: z.enum(['purchase', 'sell']).optional(),
})

function LoadRoute() {
  const { walletId, walletType, tab } = Route.useSearch()
  useGetWalletsQuery()
  return (
    <MobileShopGuard>
      <LoadManagementPage
        initialWalletId={walletId}
        initialWalletType={walletType}
        initialTab={tab}
      />
    </MobileShopGuard>
  )
}

export const Route = createFileRoute('/_authenticated/mobile-shop/load')({
  validateSearch: loadSearchSchema,
  component: LoadRoute,
})
