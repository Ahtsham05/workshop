import { pickedPrintBranding, setNextPrintBranding } from '@/lib/print-branding'

/**
 * Per-branch details printed only by the Distributor invoice layout: the licence / registration
 * numbers in the top-right block and the policy texts at the bottom (each only when filled in). Stored on
 * branch.printSettings.distributor, edited in Settings → Printing, handed to the print
 * generator by components/print-colors-sync.tsx (same pattern as print colours).
 */

/**
 * How the top of a Distributor invoice is branded:
 *  - logo: business details + centred logo (when one is uploaded)
 *  - no-logo: nothing about the business — no logo, name, address, contact, licence numbers,
 *    business policies or Terms · Status · Invoiced By · Tax ID band (an invoice's own Terms &
 *    Conditions still print). For letterhead paper or invoices sent on someone else's behalf.
 */
export type DistributorHeaderStyle = 'logo' | 'no-logo'

export const DISTRIBUTOR_HEADER_STYLES: Array<{ value: DistributorHeaderStyle; label: string; description: string }> = [
  { value: 'logo', label: 'With logo', description: 'Business name, address and your logo in the centre' },
  { value: 'no-logo', label: 'Without logo', description: 'No logo, business details, terms band or policies — plain invoice' },
]

const HEADER_STYLE_VALUES = DISTRIBUTOR_HEADER_STYLES.map((s) => s.value)

export interface DistributorSettings {
  headerStyle: DistributorHeaderStyle
  stateTaxId: string
  tobaccoLicenseId: string
  resaleCertificateId: string
  msaDidId: string
  feinId: string
  hempLicense: string
  foodDrugLicense: string
  generalPolicy: string
  returnPolicy: string
  buyersGuarantee: string
}

/** Licence lines, in the order and with the exact labels they print with. */
export const DISTRIBUTOR_LICENSE_FIELDS: Array<{ key: TextKey; label: string }> = [
  { key: 'stateTaxId', label: 'State Tax Id' },
  { key: 'tobaccoLicenseId', label: 'Tobacco License Id' },
  { key: 'resaleCertificateId', label: 'Resale Certificate Id' },
  { key: 'msaDidId', label: 'MSA DID Id' },
  { key: 'feinId', label: 'FEIN Id' },
  { key: 'hempLicense', label: 'Hemp License' },
  { key: 'foodDrugLicense', label: 'Food Drug License' },
]

export const DISTRIBUTOR_POLICY_FIELDS: Array<{ key: TextKey; label: string }> = [
  { key: 'generalPolicy', label: 'General Policy' },
  { key: 'returnPolicy', label: 'Return Policy' },
  { key: 'buyersGuarantee', label: 'Buyers Guarantee' },
]

export const DEFAULT_GENERAL_POLICY = 'All applicable product taxes will be calculated and added to the final invoice.'

export const DEFAULT_RETURN_POLICY =
  'ALL SALES ARE FINAL. We do not accept returns or provide refunds on sold products. If you have received an incorrect or damaged item, ' +
  'please notify your sales representative via text within 72 hours of receiving the product to process a refund. Approved returns will ' +
  'be charged a 10% restocking fee. Please also note that any products with manufacturing defects are non-returnable. You may contact the ' +
  'manufacture directly if there is a warranty on the defective product for replacement.'

export type TextKey = Exclude<keyof DistributorSettings, 'headerStyle'>

const LIMITS: Record<TextKey, number> = {
  stateTaxId: 60,
  tobaccoLicenseId: 60,
  resaleCertificateId: 60,
  msaDidId: 60,
  feinId: 60,
  hempLicense: 60,
  foodDrugLicense: 60,
  generalPolicy: 2000,
  returnPolicy: 4000,
  buyersGuarantee: 2000,
}

export const EMPTY_DISTRIBUTOR_SETTINGS: DistributorSettings = {
  headerStyle: 'logo',
  stateTaxId: '',
  tobaccoLicenseId: '',
  resaleCertificateId: '',
  msaDidId: '',
  feinId: '',
  hempLicense: '',
  foodDrugLicense: '',
  generalPolicy: DEFAULT_GENERAL_POLICY,
  returnPolicy: DEFAULT_RETURN_POLICY,
  buyersGuarantee: '',
}

/**
 * Policies keep their default wording until the branch saves its own; saving an empty
 * policy is respected (that heading is then left off the print).
 */
export function normalizeDistributorSettings(value: Partial<DistributorSettings> | null | undefined): DistributorSettings {
  const out = { ...EMPTY_DISTRIBUTOR_SETTINGS }
  if (!value || typeof value !== 'object') return out
  for (const key of Object.keys(LIMITS) as TextKey[]) {
    const raw = value[key]
    if (typeof raw === 'string') out[key] = raw.trim().slice(0, LIMITS[key])
  }
  // Earlier option names: 'unbranded' became "Without logo"; 'simple' (removed) kept the business details.
  const raw = value.headerStyle as string
  const style = raw === 'unbranded' ? 'no-logo' : raw === 'simple' ? 'logo' : raw
  if (HEADER_STYLE_VALUES.includes(style as DistributorHeaderStyle)) out.headerStyle = style as DistributorHeaderStyle
  return out
}

let active: DistributorSettings = EMPTY_DISTRIBUTOR_SETTINGS

export function setActiveDistributorSettings(value: Partial<DistributorSettings> | null | undefined) {
  active = normalizeDistributorSettings(value)
}

/**
 * A one-off header style for the print just requested from the Print button's dropdown
 * ("Without logo" etc.). Shared with every other print through lib/print-branding — the
 * button's main click or the next pick replaces it, and it lapses on its own after 45 seconds.
 */
export function setNextPrintHeaderStyle(style: DistributorHeaderStyle | null) {
  setNextPrintBranding(style)
}

/** The header style picked for the current print, if it is still in force. */
export function pickedPrintHeaderStyle(): DistributorHeaderStyle | null {
  return pickedPrintBranding()
}

export const getActiveDistributorSettings = () => active

/** Runs `fn` with `settings` active (used to render previews), then restores the previous ones. */
export function withDistributorSettings<T>(settings: DistributorSettings, fn: () => T): T {
  const previous = active
  active = settings
  try {
    return fn()
  } finally {
    active = previous
  }
}
