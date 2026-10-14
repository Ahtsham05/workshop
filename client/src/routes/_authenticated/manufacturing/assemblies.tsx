import { createFileRoute } from '@tanstack/react-router'
import AssembliesPage from '@/features/manufacturing/pages/assemblies'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/assemblies'
)({
  component: AssembliesPage,
})
