import { createFileRoute } from '@tanstack/react-router'
import ScrapPage from '@/features/manufacturing/pages/scrap'

export const Route = createFileRoute('/_authenticated/manufacturing/scrap')({
  component: ScrapPage,
})
