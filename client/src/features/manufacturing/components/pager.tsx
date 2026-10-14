import { SimplePagination } from '@/components/ui/simple-pagination'

/** Pagination footer for the module's list pages (hidden when everything fits on one page). */
export function Pager({
  data,
  page,
  onPageChange,
}: {
  data?: { totalPages: number; totalResults: number; limit: number }
  page: number
  onPageChange: (page: number) => void
}) {
  if (!data || data.totalPages <= 1) return null
  return (
    <SimplePagination
      currentPage={page}
      totalPages={data.totalPages}
      totalResults={data.totalResults}
      limit={data.limit}
      onPageChange={onPageChange}
    />
  )
}
