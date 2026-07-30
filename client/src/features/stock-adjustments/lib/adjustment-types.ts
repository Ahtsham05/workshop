import { AlertTriangle, ShieldAlert, Clock, PackageX, PackageSearch, RefreshCcw, HelpCircle } from 'lucide-react'
import type { AdjustmentDirection, AdjustmentType } from '@/stores/stockAdjustment.api'
import type { StatCardTone } from '@/lib/stat-card-tones'

export interface AdjustmentTypeMeta {
  value: AdjustmentType
  label: string
  icon: typeof AlertTriangle
  tone: StatCardTone
  badgeClass: string
  /** Set when this reason can only ever move stock one way — the create dialog hides the direction toggle for these. */
  fixedDirection?: AdjustmentDirection
  description: string
  reasonPlaceholder: string
}

export const ADJUSTMENT_TYPE_ORDER: AdjustmentType[] = ['damage', 'theft', 'expired', 'lost', 'found', 'correction', 'other']

export const ADJUSTMENT_TYPE_META: Record<AdjustmentType, AdjustmentTypeMeta> = {
  damage: {
    value: 'damage',
    label: 'Damage',
    icon: AlertTriangle,
    tone: 'rose',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    fixedDirection: 'decrease',
    description: 'Goods damaged and no longer sellable',
    reasonPlaceholder: 'e.g. Dropped and cracked during handling',
  },
  theft: {
    value: 'theft',
    label: 'Theft / Stolen',
    icon: ShieldAlert,
    tone: 'orange',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
    fixedDirection: 'decrease',
    description: 'Stock missing due to theft or shoplifting',
    reasonPlaceholder: 'e.g. Missing after closing stock count',
  },
  expired: {
    value: 'expired',
    label: 'Expired',
    icon: Clock,
    tone: 'amber',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    fixedDirection: 'decrease',
    description: 'Past expiry date and written off',
    reasonPlaceholder: 'e.g. Expired batch written off',
  },
  lost: {
    value: 'lost',
    label: 'Lost',
    icon: PackageX,
    tone: 'amber',
    badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    fixedDirection: 'decrease',
    description: 'Misplaced or otherwise unaccounted for',
    reasonPlaceholder: 'e.g. Not found during stock count',
  },
  found: {
    value: 'found',
    label: 'Found',
    icon: PackageSearch,
    tone: 'emerald',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    fixedDirection: 'increase',
    description: 'Extra stock found that was not recorded',
    reasonPlaceholder: 'e.g. Found extra units during stock count',
  },
  correction: {
    value: 'correction',
    label: 'Stock Correction',
    icon: RefreshCcw,
    tone: 'indigo',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Manual correction after a physical recount',
    reasonPlaceholder: 'e.g. Recount correction',
  },
  other: {
    value: 'other',
    label: 'Other',
    icon: HelpCircle,
    tone: 'slate',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
    description: 'Any other reason (a reason is required)',
    reasonPlaceholder: 'Describe the reason for this adjustment',
  },
}

/** Reason types whose loss/gain value counts toward the "shrinkage" total shown on the stats row. */
export const LOSS_TYPES: AdjustmentType[] = ['damage', 'theft', 'expired', 'lost']
