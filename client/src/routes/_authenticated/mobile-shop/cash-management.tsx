import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import LoadManagementPage from '@/features/mobile-shop/load'
import { MobileShopGuard } from '@/components/mobile-shop-guard'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'

const cashManagementSearchSchema = z.object({
  walletId: z.string().optional(),
  walletType: z.string().optional(),
  action: z.enum(['withdrawal', 'deposit']).optional(),
})

function CashManagementRoute() {
  const { walletId, walletType, action } = Route.useSearch()
  useGetWalletsQuery()
  return (
    <MobileShopGuard>
      <LoadManagementPage
        mode='cash-management'
        initialWalletId={walletId}
        initialWalletType={walletType}
        initialAction={action}
      />
    </MobileShopGuard>
  )
}

export const Route = createFileRoute('/_authenticated/mobile-shop/cash-management')({
  validateSearch: cashManagementSearchSchema,
  component: CashManagementRoute,
})
