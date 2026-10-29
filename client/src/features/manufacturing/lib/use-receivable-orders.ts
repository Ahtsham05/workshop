import { useMemo } from 'react'
import { useGetWipQuery } from '@/stores/manufacturing.api'

const EPS = 1e-6

/**
 * Production orders whose finished goods can be received now: released, running or paused
 * production orders (assembly runs report their output on their own page). Orders with
 * something still to make come first, most urgent first.
 */
export function useReceivableOrders() {
  const query = useGetWipQuery()
  const orders = useMemo(() => {
    const urgency = { urgent: 0, high: 1, normal: 2, low: 3 } as const
    return (query.data?.orders || [])
      .filter((o) => o.orderType !== 'assembly')
      .sort(
        (a, b) =>
          Number(a.remainingQuantity <= EPS) -
            Number(b.remainingQuantity <= EPS) ||
          Number(b.isOverdue) - Number(a.isOverdue) ||
          urgency[a.priority] - urgency[b.priority] ||
          a.orderNumber.localeCompare(b.orderNumber)
      )
  }, [query.data])
  return { ...query, orders }
}
