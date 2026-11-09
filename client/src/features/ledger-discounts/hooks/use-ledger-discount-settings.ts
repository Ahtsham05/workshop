import { useGetLedgerDiscountSettingsQuery } from '@/stores/ledgerDiscounts.api'
import { usePermissions } from '@/context/permission-context'
import { DEFAULT_DISCOUNT_SETTINGS, type LedgerSide } from '../lib/ledger-discounts'

/** Org discount rules (defaults while loading) + whether this user may give / approve one. */
export function useLedgerDiscountSettings(side?: LedgerSide, options: { skip?: boolean } = {}) {
  const { hasPermission } = usePermissions()
  const { data, isLoading } = useGetLedgerDiscountSettingsQuery(undefined, { skip: options.skip })
  // Merge over defaults: the ledger form must never break on a partial / older payload.
  const settings = {
    ...DEFAULT_DISCOUNT_SETTINGS,
    ...(data ?? {}),
    quickPercents: Array.isArray(data?.quickPercents) ? data.quickPercents : DEFAULT_DISCOUNT_SETTINGS.quickPercents,
  }
  const sideOn = side ? (side === 'customer' ? settings.customerEnabled : settings.supplierEnabled) : true
  const canGive = hasPermission('giveLedgerDiscount')
  return {
    settings,
    loaded: Boolean(data),
    isLoading,
    enabled: settings.enabled && sideOn,
    canGive,
    canApprove: hasPermission('approveLedgerDiscount'),
    available: settings.enabled && sideOn && canGive,
  }
}
