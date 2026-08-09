import { createFileRoute } from '@tanstack/react-router'
import BranchOverviewPage from '@/features/branch-overview'

export const Route = createFileRoute('/_authenticated/branch-overview')({
  component: BranchOverviewPage,
})
