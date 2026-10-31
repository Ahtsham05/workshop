import { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { normalizeBusinessType } from '@/lib/business-types'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'

export type TradeSide = 'purchase' | 'sale'

/**
 * Product types a Manufacturing ('factory') business keeps off each side of trade:
 * finished goods are made in-house, so they're never bought; raw materials are used up
 * in production, so they're never sold. Every other type (packaging, by-products,
 * scrap, unclassified products…) stays available on both sides.
 */
const HIDDEN_TYPES: Record<TradeSide, ReadonlySet<string>> = {
  purchase: new Set(['finished_good']),
  sale: new Set(['raw_material']),
}

const BLOCKED_MESSAGE: Record<TradeSide, string> = {
  purchase: 'is a finished good — it is made in Manufacturing, not purchased',
  sale: 'is a raw material — it is used in production, not sold',
}

type Typed = { productType?: string | null }

/**
 * Which products a purchase or sale screen may offer. Pickers, catalog tiles and barcode
 * scans run new picks through `isAllowed`; lines already on a saved document are left
 * alone, so old purchases/invoices still open and edit normally. For any business type
 * other than Manufacturing everything is allowed.
 */
export function useTradeProductFilter(side: TradeSide) {
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, {
    skip: !user?.organizationId,
  })
  const active =
    normalizeBusinessType(org?.businessType || user?.businessType) === 'factory'

  const isAllowed = useCallback(
    (item: Typed | null | undefined) =>
      !active || !item?.productType || !HIDDEN_TYPES[side].has(item.productType),
    [active, side]
  )

  const blockedMessage = useCallback(
    (name: string) => `${name} ${BLOCKED_MESSAGE[side]}`,
    [side]
  )

  return useMemo(
    () => ({ active, isAllowed, blockedMessage }),
    [active, isAllowed, blockedMessage]
  )
}
