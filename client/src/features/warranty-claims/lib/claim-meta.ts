import type { WarrantyClaimStatus, WarrantyCover, WarrantyResolution } from '@/stores/warrantyClaim.api'

export const STATUS_META: Record<WarrantyClaimStatus, { label: string; className: string }> = {
  received: { label: 'Received', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' },
  sent: { label: 'At supplier', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
  returned: { label: 'Back — to hand over', className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300' },
  closed: { label: 'Closed', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
  cancelled: { label: 'Cancelled', className: 'text-muted-foreground' },
}

export const COVER_META: Record<WarrantyCover, { label: string; className: string }> = {
  in_warranty: { label: 'In warranty', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
  expired: { label: 'Warranty expired', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' },
  unknown: { label: 'No warranty on record', className: 'text-muted-foreground' },
}

export const RESOLUTION_META: Record<WarrantyResolution, { label: string; hint: string }> = {
  repaired: { label: 'Repaired', hint: 'The same unit came back working.' },
  replaced: { label: 'Replaced', hint: 'A new unit came back instead (enter its serial).' },
  rejected: { label: 'Rejected', hint: 'Claim refused — the unit came back as it was.' },
  credited: { label: 'Credited', hint: 'The supplier kept it and gave credit / money.' },
}

export const ACCESSORY_OPTIONS = ['Box', 'Charger', 'Cable', 'Earphones', 'Back cover', 'Bill / receipt', 'Remote', 'Battery']

export const STEPS: WarrantyClaimStatus[] = ['received', 'sent', 'returned', 'closed']
