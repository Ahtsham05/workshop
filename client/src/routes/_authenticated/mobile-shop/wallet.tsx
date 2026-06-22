import { createFileRoute } from '@tanstack/react-router'
import WalletPage from '@/features/mobile-shop/wallet'

// Wallets (bank accounts / cash-in-hand) are available to every business
// type, not just mobile shops — no business-type guard here. Access is
// still gated server-side by subscription plan.
export const Route = createFileRoute('/_authenticated/mobile-shop/wallet')({
  component: () => <WalletPage />,
})