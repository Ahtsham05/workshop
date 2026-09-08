import { createFileRoute, redirect } from '@tanstack/react-router'

// Sub-Categories are now managed inline on the Categories page (master-detail view —
// select a category, its sub-categories show below) instead of this separate page.
// Redirected rather than removed so old bookmarks/links still land somewhere valid.
export const Route = createFileRoute('/_authenticated/sub-categories/')({
  beforeLoad: () => {
    throw redirect({ to: '/categories' })
  },
})
