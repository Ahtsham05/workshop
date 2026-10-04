/** Sentinel page size meaning "fetch every row". The list endpoints take a plain numeric
 *  `limit` with no cap, so this is simply a limit larger than any branch's data. */
export const ALL_ROWS = 100000

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100, 500, ALL_ROWS]

export const isAllRows = (limit: number) => limit >= ALL_ROWS

export const formatPageSize = (limit: number, allLabel = 'All') => (isAllRows(limit) ? allLabel : String(limit))
