import { createFileRoute } from '@tanstack/react-router'
import ProductDetailsPage from '@/features/products/details'

export const Route = createFileRoute('/_authenticated/products/$productId')({
  component: ProductDetailsRoute,
})

function ProductDetailsRoute() {
  const { productId } = Route.useParams()
  // Keyed by id so tab/dialog state never carries over from one product to the next.
  return <ProductDetailsPage key={productId} productId={productId} />
}
