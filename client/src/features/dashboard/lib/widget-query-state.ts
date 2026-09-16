/**
 * Display state for a dashboard widget's RTK Query result.
 *
 * Reads `currentData` (the result for the *current* args) rather than `data`, so a widget
 * never shows the previous date range's numbers under a new range label. A skeleton is only
 * shown when nothing is known yet for these args; a refetch of numbers already on screen
 * (Refresh, remount, focus) keeps them visible and just flags `isRefreshing`.
 */
export function getWidgetQueryState<T>({ currentData, isFetching }: { currentData?: T; isFetching: boolean }) {
  return {
    data: currentData,
    showSkeleton: currentData === undefined && isFetching,
    isRefreshing: currentData !== undefined && isFetching,
  }
}
