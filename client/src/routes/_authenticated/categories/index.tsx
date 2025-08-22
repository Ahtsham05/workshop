import { createFileRoute } from '@tanstack/react-router'
import CategoriesIndex from '@/features/categories'

export const Route = createFileRoute('/_authenticated/categories/')({
  component: () => <CategoriesIndex />,
})
