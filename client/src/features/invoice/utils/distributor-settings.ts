/**
 * Per-branch details printed only by the Distributor invoice layout: the licence / registration
 * numbers in the top-right block and the policy texts at the bottom. Stored on
 * branch.printSettings.distributor, edited in Settings → Printing, handed to the print
 * generator by components/print-colors-sync.tsx (same pattern as print colours).
 */

export interface DistributorSettings {
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
export const DISTRIBUTOR_LICENSE_FIELDS: Array<{ key: keyof DistributorSettings; label: string }> = [
  { key: 'stateTaxId', label: 'State Tax Id' },
  { key: 'tobaccoLicenseId', label: 'Tobacco License Id' },
  { key: 'resaleCertificateId', label: 'Resale Certificate Id' },
  { key: 'msaDidId', label: 'MSA DID Id' },
  { key: 'feinId', label: 'FEIN Id' },
  { key: 'hempLicense', label: 'Hemp License' },
  { key: 'foodDrugLicense', label: 'Food Drug License' },
]

export const DISTRIBUTOR_POLICY_FIELDS: Array<{ key: keyof DistributorSettings; label: string }> = [
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

/** Printed when a licence number has not been entered (the layout always shows every line). */
export const DISTRIBUTOR_MISSING_VALUE = 'N/A'

const LIMITS: Record<keyof DistributorSettings, number> = {
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
 * policy is respected (the heading still prints, with no text under it).
 */
export function normalizeDistributorSettings(value: Partial<DistributorSettings> | null | undefined): DistributorSettings {
  const out = { ...EMPTY_DISTRIBUTOR_SETTINGS }
  if (!value || typeof value !== 'object') return out
  for (const key of Object.keys(LIMITS) as Array<keyof DistributorSettings>) {
    const raw = value[key]
    if (typeof raw === 'string') out[key] = raw.trim().slice(0, LIMITS[key])
  }
  return out
}

/** Sample numbers — used only by the Settings previews, never on a real print. */
export const DEMO_DISTRIBUTOR_LICENSES: Partial<DistributorSettings> = {
  stateTaxId: '1002050430',
  tobaccoLicenseId: '1002684172',
  resaleCertificateId: '1001495056',
  msaDidId: '17033757',
  feinId: '88-0581939',
  hempLicense: 'WLSHDC-DAV-0000026',
  foodDrugLicense: 'TNFM2552',
}

/** For previews: the branch's own values, with sample numbers in any empty licence field. */
export function withDemoLicenses(settings: DistributorSettings): DistributorSettings {
  const out = { ...settings }
  for (const { key } of DISTRIBUTOR_LICENSE_FIELDS) {
    if (!out[key]) out[key] = DEMO_DISTRIBUTOR_LICENSES[key] || ''
  }
  return out
}

let active: DistributorSettings = EMPTY_DISTRIBUTOR_SETTINGS

export function setActiveDistributorSettings(value: Partial<DistributorSettings> | null | undefined) {
  active = normalizeDistributorSettings(value)
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
