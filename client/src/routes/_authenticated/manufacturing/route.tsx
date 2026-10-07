import { createFileRoute } from '@tanstack/react-router'
import ManufacturingShell from '@/features/manufacturing/components/manufacturing-shell'

export const Route = createFileRoute('/_authenticated/manufacturing')({
  component: ManufacturingShell,
})
