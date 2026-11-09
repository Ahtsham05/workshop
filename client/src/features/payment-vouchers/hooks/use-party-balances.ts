import { useEffect, useMemo, useRef, useState } from 'react'
import Axios from '@/utils/Axios'

/**
 * Ledger balances for the customers / suppliers picked on a voucher
 * (customer: + = they owe us; supplier: + = we owe them).
 *
 * Network-frugal by design:
 *  1. `known` — balances that came with the customer/supplier list the dialog already loaded
 *     on open. Those cost NO request at all (the normal case).
 *  2. Anything not in that list (past the first page, just created…) is fetched in ONE batched
 *     request (`/…-ledger/balances?ids=a,b,c`), debounced so picking several parties quickly
 *     still makes a single call, and never asked for twice while the dialog is open.
 * Ids the user can't read stay undefined and the figures are simply hidden.
 */
export function usePartyBalances(
  side: 'customer' | 'supplier',
  ids: string[],
  enabled: boolean,
  known: Record<string, number | undefined> = {}
) {
  const [fetched, setFetched] = useState<Record<string, number>>({})
  const requested = useRef(new Set<string>())

  // A fresh session each time the dialog opens: balances move as vouchers are posted.
  useEffect(() => {
    if (!enabled) {
      requested.current = new Set()
      setFetched({})
    }
  }, [enabled])

  const missingKey = [...new Set(ids.filter((id) => id && known[id] === undefined))].sort().join(',')

  useEffect(() => {
    if (!enabled || !missingKey) return
    const toFetch = missingKey.split(',').filter((id) => !requested.current.has(id))
    if (toFetch.length === 0) return
    const timer = setTimeout(() => {
      toFetch.forEach((id) => requested.current.add(id))
      Axios.get(`/${side}-ledger/balances`, { params: { ids: toFetch.slice(0, 200).join(',') } })
        .then((res) => setFetched((prev) => ({ ...prev, ...(res.data?.balances || {}) })))
        .catch(() => {
          /* no permission / gone — figures stay hidden for these parties */
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [missingKey, side, enabled])

  return useMemo(() => {
    const out: Record<string, number> = { ...fetched }
    Object.entries(known).forEach(([id, balance]) => {
      if (typeof balance === 'number' && Number.isFinite(balance)) out[id] = balance
    })
    return out
  }, [known, fetched])
}
