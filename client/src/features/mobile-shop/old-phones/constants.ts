import type {
  BuybackAccessory, BuybackGrade, BuybackImeiSummary, BuybackPtaStatus, PhoneBuybackRecord,
} from '@/stores/usedPhoneBuyback.api'

// Shared between the Buy Phone dialog (grading a phone as it's bought) and the Old
// Phones inventory/detail views (displaying that grading later) — kept in one place so
// both stay in sync instead of drifting apart as separate copies.

/** Old Phones' single shared catalog entry for individually-tracked used units — see
 *  phoneBuyback.service.js#getOrCreateUsedPhonesProduct. Every unit under it is a
 *  different phone (unlike a real trackImei product where every unit is the same model),
 *  so anything that lists/pickers real phone models (New Phones inventory, invoice IMEI
 *  pickers) must exclude it explicitly. */
export const isUsedPhonesBucketProduct = (product?: { name?: string; category?: string } | null) =>
  !!product && (product.category === 'Used Phones' || product.name === 'Used Phones')

export const GRADE_OPTIONS: { value: BuybackGrade; label: string; hint: string }[] = [
  { value: 'A', label: 'A', hint: 'Like New' },
  { value: 'B', label: 'B', hint: 'Good' },
  { value: 'C', label: 'C', hint: 'Fair' },
  { value: 'D', label: 'D', hint: 'For Parts' },
]

export const gradeToneClasses: Record<BuybackGrade, string> = {
  A: 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  B: 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  C: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  D: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
}

export const gradeBadgeClasses: Record<BuybackGrade, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
}

export const SCREEN_CONDITION_OPTIONS = ['excellent', 'good', 'fair', 'poor', 'cracked'] as const
export const BODY_CONDITION_OPTIONS = ['excellent', 'good', 'fair', 'poor'] as const

export const ACCESSORY_OPTIONS: { value: BuybackAccessory; label: string }[] = [
  { value: 'box', label: 'Box' },
  { value: 'charger', label: 'Charger' },
  { value: 'original_bill', label: 'Original Bill' },
  { value: 'earphones', label: 'Earphones' },
  { value: 'back_cover', label: 'Back Cover' },
]

export const PTA_OPTIONS: { value: BuybackPtaStatus; label: string }[] = [
  { value: 'unknown', label: 'Not Checked' },
  { value: 'approved', label: 'PTA Approved' },
  { value: 'non_pta', label: 'Non-PTA' },
  { value: 'blocked', label: 'Blocked' },
]

export const ptaToneClasses: Record<BuybackPtaStatus, string> = {
  approved: 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  non_pta: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  blocked: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  unknown: 'border-gray-400 bg-gray-50 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400',
}

export const ptaBadgeConfig: Record<BuybackPtaStatus, { label: string; color: string }> = {
  approved: { label: 'PTA Approved', color: 'bg-green-100 text-green-700' },
  non_pta: { label: 'Non-PTA', color: 'bg-amber-100 text-amber-700' },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-700' },
  unknown: { label: 'Not Checked', color: 'bg-gray-100 text-gray-600' },
}

export const statusBadgeConfig: Record<string, { label: string; color: string }> = {
  in_stock: { label: 'In Stock', color: 'bg-sky-100 text-sky-700' },
  sold: { label: 'Sold', color: 'bg-green-100 text-green-700' },
  returned: { label: 'Returned', color: 'bg-amber-100 text-amber-700' },
  scrapped: { label: 'Scrapped', color: 'bg-gray-100 text-gray-600' },
  lost: { label: 'Lost', color: 'bg-orange-100 text-orange-700' },
  stolen: { label: 'Stolen', color: 'bg-red-100 text-red-700' },
}

export const CHECKLIST_FIELDS: { key: keyof import('@/stores/usedPhoneBuyback.api').BuybackChecklist; label: string }[] = [
  { key: 'touchScreen', label: 'Touch screen' },
  { key: 'camera', label: 'Camera' },
  { key: 'speaker', label: 'Speaker' },
  { key: 'microphone', label: 'Microphone' },
  { key: 'buttons', label: 'Buttons' },
  { key: 'biometrics', label: 'Face ID / Fingerprint' },
  { key: 'charging', label: 'Charging' },
]

export const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString()}`

/** The list/detail endpoints populate imeiRecordId; the raw create response won't be. */
export const getImeiSummary = (b: PhoneBuybackRecord): BuybackImeiSummary | null =>
  typeof b.imeiRecordId === 'object' && b.imeiRecordId !== null ? b.imeiRecordId : null

export const daysSince = (date: string) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)))
