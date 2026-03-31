import { createFileRoute } from '@tanstack/react-router'
import WalletPage from '@/features/mobile-shop/wallet'

export const Route = createFileRoute('/_authenticated/mobile-shop/wallet')({
  component: WalletPage,
})