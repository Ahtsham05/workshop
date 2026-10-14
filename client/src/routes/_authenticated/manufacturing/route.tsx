import { createFileRoute } from '@tanstack/react-router'
import ManufacturingGate from '@/features/manufacturing/components/manufacturing-gate'

export const Route = createFileRoute('/_authenticated/manufacturing')({
  component: ManufacturingGate,
})
