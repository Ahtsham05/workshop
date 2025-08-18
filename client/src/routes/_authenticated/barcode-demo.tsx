import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/barcode-demo')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/barcode-demo"!</div>
}
