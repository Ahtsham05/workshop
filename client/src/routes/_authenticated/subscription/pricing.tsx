import { createFileRoute, redirect } from '@tanstack/react-router'

// Superseded by Settings → Billing & Plan; kept so old links and bookmarks still land somewhere useful.
export const Route = createFileRoute('/_authenticated/subscription/pricing')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/billing' })
  },
})
