import { toBusinessCalendarDate } from '@/lib/business-timezone'
import { transferDateOf } from '@/stores/inventoryTransfer.api'

/**
 * True when the transfer's date was picked as an earlier (or later) day than the day it was
 * entered. Its stored time of day is then only the entry time carried over (see the server's
 * atBusinessTimeOfDay), so screens show the date alone plus when it was entered.
 */
export function isBackDated(tr: { transferDate?: string; suggestedAt?: string }): boolean {
  const date = transferDateOf(tr)
  if (!date || !tr.suggestedAt || !tr.transferDate) return false
  const a = new Date(date)
  const b = new Date(tr.suggestedAt)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false
  return toBusinessCalendarDate(a) !== toBusinessCalendarDate(b)
}
