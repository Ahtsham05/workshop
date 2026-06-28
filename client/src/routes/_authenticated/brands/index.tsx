import { createFileRoute } from '@tanstack/react-router'
import BrandsIndex from '@/features/brands'

export const Route = createFileRoute('/_authenticated/brands/')({
  component: () => <BrandsIndex />,
})
