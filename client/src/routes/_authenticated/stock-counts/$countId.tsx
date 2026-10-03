import { createFileRoute } from '@tanstack/react-router'
import CountSheetPage from '@/features/stock-counts/count-sheet'

export const Route = createFileRoute('/_authenticated/stock-counts/$countId')({
  component: CountSheetRoute,
})

function CountSheetRoute() {
  const { countId } = Route.useParams()
  return <CountSheetPage key={countId} countId={countId} />
}
