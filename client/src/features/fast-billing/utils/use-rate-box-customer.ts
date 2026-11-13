// Customer details for the rate-history box on Fast Billing (cart rows + Add to Cart dialog).
// Name/phone/photo come from the customer list the picker already loaded (cached — no extra
// request). The ledger balance is asked for only when a box actually opens, then reused for a
// minute, so hopping between rows or reopening the dialog never asks again.
import { useEffect, useMemo, useState } from 'react'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import type { RateHistoryCustomer } from '@/features/invoice/components/customer-rate-history-panel'
import type { FastBillCustomer } from './build-invoice-payload'

type CustomerRow = {
  _id?: string
  id?: string
  name: string
  nameUrdu?: string
  phone?: string
  picture?: unknown
  isSupplierAccount?: boolean
  linkedSupplierId?: string
}

const unwrapCustomers = (data: unknown): CustomerRow[] => {
  if (Array.isArray(data)) return data as CustomerRow[]
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: CustomerRow[] }).results
  }
  return []
}

const BALANCE_TTL_MS = 60_000
const balanceCache = new Map<string, { value: number; at: number }>()
const balanceInFlight = new Map<string, Promise<number>>()

function loadBalance(customerId: string, row?: CustomerRow): Promise<number> {
  const pending = balanceInFlight.get(customerId)
  if (pending) return pending
  const supplierId = row?.isSupplierAccount ? row.linkedSupplierId : undefined
  const request = (
    supplierId
      ? Axios.get(
          `${summery.fetchSupplierBalance.url}/${supplierId}${summery.fetchSupplierBalance.urlSuffix || ''}`
        ).then(
          // Supplier ledger is positive = we owe them; the box shows positive = they owe us.
          (r) => -(r.data?.balance || 0)
        )
      : Axios.get(
          `${summery.fetchCustomerBalance.url}/${customerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
        ).then((r) => r.data?.balance || 0)
  )
    .then((value: number) => {
      balanceCache.set(customerId, { value, at: Date.now() })
      return value
    })
    .finally(() => balanceInFlight.delete(customerId))
  balanceInFlight.set(customerId, request)
  return request
}

export function useRateBoxCustomer(
  customer: FastBillCustomer | undefined,
  boxOpen: boolean
) {
  const customerId = customer?.id || null
  const { data: customersRaw } = useGetAllCustomersQuery(undefined)
  const row = useMemo(
    () =>
      customerId
        ? unwrapCustomers(customersRaw).find(
            (c) => String(c._id || c.id) === customerId
          )
        : undefined,
    [customersRaw, customerId]
  )

  const [balance, setBalance] = useState<{
    customerId: string
    value?: number
    loading: boolean
  } | null>(null)
  useEffect(() => {
    if (!boxOpen || !customerId) return
    const cached = balanceCache.get(customerId)
    if (cached && Date.now() - cached.at < BALANCE_TTL_MS) {
      setBalance({ customerId, value: cached.value, loading: false })
      return
    }
    let cancelled = false
    setBalance({ customerId, loading: true })
    loadBalance(customerId, row)
      .then(
        (value) =>
          !cancelled && setBalance({ customerId, value, loading: false })
      )
      .catch(() => !cancelled && setBalance({ customerId, loading: false }))
    return () => {
      cancelled = true
    }
    // `row` only matters for the supplier-account case; it is stable once the list loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxOpen, customerId])

  const boxCustomer: RateHistoryCustomer | null = customer?.id
    ? {
        id: customer.id,
        name: row?.name || customer.name,
        nameUrdu: row?.nameUrdu,
        phone: row?.phone,
        picture: row?.picture,
      }
    : null
  const mine = balance && balance.customerId === customerId ? balance : null
  return {
    boxCustomer,
    customerBalance: mine?.value,
    loadingBalance: Boolean(mine?.loading),
  }
}
