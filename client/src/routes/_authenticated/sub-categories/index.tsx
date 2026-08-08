import { createFileRoute } from '@tanstack/react-router'
import SubCategoriesIndex from '@/features/subcategories'

export const Route = createFileRoute('/_authenticated/sub-categories/')({
  component: () => <SubCategoriesIndex />,
})
