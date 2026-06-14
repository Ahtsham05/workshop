import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/mobile-shop/cash-book')({
  beforeLoad: () => {
    throw redirect({ to: '/cash-book' })
  },
})
