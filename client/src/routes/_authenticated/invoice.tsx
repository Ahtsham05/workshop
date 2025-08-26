import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/invoice')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/invoice"!</div>
}
