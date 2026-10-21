import { createFileRoute, redirect } from '@tanstack/react-router'

// Staff Management was merged into Users & Staff; old links and bookmarks land there.
export const Route = createFileRoute('/_authenticated/staff/')({
  beforeLoad: () => {
    throw redirect({ to: '/users-management' })
  },
})
