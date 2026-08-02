import { createFileRoute } from '@tanstack/react-router'
import UsedPhonesHubPage from '@/features/mobile-shop/used-phones'

export const Route = createFileRoute('/_authenticated/mobile-shop/used-phones/')({
  component: UsedPhonesHubPage,
})
