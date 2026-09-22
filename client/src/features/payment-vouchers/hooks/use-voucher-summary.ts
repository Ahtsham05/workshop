import { useMemo } from 'react'
import { getBusinessToday } from '@/lib/business-timezone'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useGetPaymentVouchersQuery } from '@/stores/paymentVoucher.api'
import { useGetReceiptVouchersQuery } from '@/stores/receiptVoucher.api'

export interface VoucherStatBucket {
  amount: number
  count: number
}

export interface VoucherKindSummary {
  total: VoucherStatBucket
  month: VoucherStatBucket
  isLoading: boolean
}

export interface VoucherSummary {
  payment: VoucherKindSummary
  receipt: VoucherKindSummary
  /** Combined current balance of "Cash" and "Bank" type accounts (Bank Accounts page) —
   *  mobile-wallet accounts (JazzCash, EasyPaisa, Load, ...) aren't counted, since those are
   *  tracked separately under Mobile Shop rather than Finance & Banking. */
  cashBank: VoucherStatBucket & { isLoading: boolean }
}

/** Page-level totals for the stat cards row — deliberately independent of the table's own
 *  search/date/type/amount filters below, so the cards read as a stable at-a-glance overview
 *  instead of jumping around every time someone tweaks a filter. */
export function useVoucherSummary(): VoucherSummary {
  const monthStart = useMemo(() => `${getBusinessToday().slice(0, 7)}-01`, [])
  const today = useMemo(() => getBusinessToday(), [])

  const { data: paymentTotal, isFetching: paymentTotalLoading } = useGetPaymentVouchersQuery({ limit: 1 })
  const { data: paymentMonth, isFetching: paymentMonthLoading } = useGetPaymentVouchersQuery({
    limit: 1,
    startDate: monthStart,
    endDate: today,
  })
  const { data: receiptTotal, isFetching: receiptTotalLoading } = useGetReceiptVouchersQuery({ limit: 1 })
  const { data: receiptMonth, isFetching: receiptMonthLoading } = useGetReceiptVouchersQuery({
    limit: 1,
    startDate: monthStart,
    endDate: today,
  })
  const { data: walletsData, isFetching: walletsLoading } = useGetWalletsQuery()

  const cashBankWallets = (walletsData?.results ?? []).filter(
    (w) => w.isActive !== false && (w.accountType === 'cash' || w.accountType === 'bank')
  )

  return {
    payment: {
      total: { amount: paymentTotal?.totalAmountSum ?? 0, count: paymentTotal?.totalResults ?? 0 },
      month: { amount: paymentMonth?.totalAmountSum ?? 0, count: paymentMonth?.totalResults ?? 0 },
      isLoading: paymentTotalLoading || paymentMonthLoading,
    },
    receipt: {
      total: { amount: receiptTotal?.totalAmountSum ?? 0, count: receiptTotal?.totalResults ?? 0 },
      month: { amount: receiptMonth?.totalAmountSum ?? 0, count: receiptMonth?.totalResults ?? 0 },
      isLoading: receiptTotalLoading || receiptMonthLoading,
    },
    cashBank: {
      amount: cashBankWallets.reduce((sum, w) => sum + (w.balance || 0), 0),
      count: cashBankWallets.length,
      isLoading: walletsLoading,
    },
  }
}
