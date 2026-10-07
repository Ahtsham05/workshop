import { createFileRoute } from '@tanstack/react-router'
import QualityPage from '@/features/manufacturing/pages/quality'

export const Route = createFileRoute('/_authenticated/manufacturing/quality')({
  component: QualityPage,
})
