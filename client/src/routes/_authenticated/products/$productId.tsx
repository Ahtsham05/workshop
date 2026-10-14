import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import ProductDetailsPage from '@/features/products/details'

export const Route = createFileRoute('/_authenticated/products/$productId')({
  // ?tab= opens a tab; ?from=manufacturing when opened from Manufacturing → Products.
  validateSearch: z.object({
    tab: z.string().optional().catch(undefined),
    from: z.enum(['manufacturing']).optional().catch(undefined),
  }),
  component: ProductDetailsRoute,
})

function ProductDetailsRoute() {
  const { productId } = Route.useParams()
  const { tab, from } = Route.useSearch()
  // Keyed by id so tab/dialog state never carries over from one product to the next.
  return <ProductDetailsPage key={productId} productId={productId} initialTab={tab} from={from} />
}
