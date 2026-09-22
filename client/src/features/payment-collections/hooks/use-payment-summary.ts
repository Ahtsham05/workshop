import { useMemo } from 'react'
import { getBusinessToday } from '@/lib/business-timezone'
import { useGetCustomerPaymentsQuery } from '@/stores/customerPayment.api'
import { useGetSupplierPaymentsQuery } from '@/stores/supplierPayment.api'

export interface PaymentStatBucket {
  amount: number
  count: number
}

export interface PaymentKindSummary {
  /** direction=payment, status=posted, all-time — the same figure the dashboard's "Payments
   *  Received"/"Payments Paid" card shows for "all time". */
  total: PaymentStatBucket
  /** Same filter, current calendar month only. */
  month: PaymentStatBucket
  /** Money handed back (direction=refund, status=posted), all-time. */
  refunded: PaymentStatBucket
  /** Payments later voided (status=void), all-time. */
  voided: PaymentStatBucket
}

export interface PaymentSummary {
  customer: PaymentKindSummary
  supplier: PaymentKindSummary
}

/** Page-level totals for the stat cards row — independent of the table's own filters below, so
 *  the cards read as a stable overview. `limit: 1` is enough: the paginated response carries
 *  `totalAmountSum`/`totalResults` for the whole filtered set, not just the page. */
export function usePaymentSummary(): PaymentSummary {
  const monthStart = useMemo(() => `${getBusinessToday().slice(0, 7)}-01`, [])
  const today = useMemo(() => getBusinessToday(), [])

  const { data: customerTotal } = useGetCustomerPaymentsQuery({ limit: 1, direction: 'payment', status: 'posted' })
  const { data: customerMonth } = useGetCustomerPaymentsQuery({
    limit: 1,
    direction: 'payment',
    status: 'posted',
    startDate: monthStart,
    endDate: today,
  })
  const { data: customerRefunded } = useGetCustomerPaymentsQuery({ limit: 1, direction: 'refund', status: 'posted' })
  const { data: customerVoided } = useGetCustomerPaymentsQuery({ limit: 1, status: 'void' })

  const { data: supplierTotal } = useGetSupplierPaymentsQuery({ limit: 1, direction: 'payment', status: 'posted' })
  const { data: supplierMonth } = useGetSupplierPaymentsQuery({
    limit: 1,
    direction: 'payment',
    status: 'posted',
    startDate: monthStart,
    endDate: today,
  })
  const { data: supplierRefunded } = useGetSupplierPaymentsQuery({ limit: 1, direction: 'refund', status: 'posted' })
  const { data: supplierVoided } = useGetSupplierPaymentsQuery({ limit: 1, status: 'void' })

  return {
    customer: {
      total: { amount: customerTotal?.totalAmountSum ?? 0, count: customerTotal?.totalResults ?? 0 },
      month: { amount: customerMonth?.totalAmountSum ?? 0, count: customerMonth?.totalResults ?? 0 },
      refunded: { amount: customerRefunded?.totalAmountSum ?? 0, count: customerRefunded?.totalResults ?? 0 },
      voided: { amount: customerVoided?.totalAmountSum ?? 0, count: customerVoided?.totalResults ?? 0 },
    },
    supplier: {
      total: { amount: supplierTotal?.totalAmountSum ?? 0, count: supplierTotal?.totalResults ?? 0 },
      month: { amount: supplierMonth?.totalAmountSum ?? 0, count: supplierMonth?.totalResults ?? 0 },
      refunded: { amount: supplierRefunded?.totalAmountSum ?? 0, count: supplierRefunded?.totalResults ?? 0 },
      voided: { amount: supplierVoided?.totalAmountSum ?? 0, count: supplierVoided?.totalResults ?? 0 },
    },
  }
}
