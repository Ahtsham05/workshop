import { createFileRoute } from '@tanstack/react-router'
import WalletPage from '@/features/mobile-shop/wallet'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/wallet')({
  component: () => (
    <MobileShopGuard>
      <WalletPage />
    </MobileShopGuard>
  ),
})