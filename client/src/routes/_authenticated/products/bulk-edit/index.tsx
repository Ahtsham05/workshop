import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/products/bulk-edit/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/products/bulk-edit/"!</div>
}
