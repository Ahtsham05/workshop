/**
 * Branch print colours — the user's own background / header / table / footer colours for
 * A4 and A5 sheet invoices (sales and purchase). Stored on Branch.printSettings.colors.
 *
 * Every colour is optional: an unset one keeps whatever the chosen template already does,
 * so a branch that never touches this prints byte-identically to before.
 *
 * The many print call sites don't each pass the colours in: the app shell publishes the
 * active branch's colours here (`setActivePrintColors`) and the generators read them via
 * `printColorsCss()`. The settings page renders previews with `withPrintColors`.
 */

export interface PrintColors {
  /** Whole page background. */
  pageBg?: string | null
  /** Header band: company name, address, invoice number. */
  headerBg?: string | null
  headerText?: string | null
  /** Rules, section titles and the grand-total highlight. */
  accent?: string | null
  /** Items table heading row. */
  tableHeaderBg?: string | null
  tableHeaderText?: string | null
  /** Thank-you / note band at the bottom. */
  footerBg?: string | null
  footerText?: string | null
}

export const PRINT_COLOR_KEYS: (keyof PrintColors)[] = [
  'pageBg',
  'headerBg',
  'headerText',
  'accent',
  'tableHeaderBg',
  'tableHeaderText',
  'footerBg',
  'footerText',
]

const HEX = /^#[0-9a-fA-F]{6}$/

/** Keeps only well-formed #rrggbb values — anything else is "use the template's own". */
export function normalizePrintColors(value: Partial<PrintColors> | null | undefined): PrintColors {
  const out: PrintColors = {}
  PRINT_COLOR_KEYS.forEach((key) => {
    const raw = value?.[key]
    if (typeof raw === 'string' && HEX.test(raw.trim())) out[key] = raw.trim().toLowerCase()
  })
  return out
}

export const hasPrintColors = (colors: PrintColors | null | undefined) => !!colors && PRINT_COLOR_KEYS.some((k) => !!colors[k])

/** Ready-made combinations; each still editable colour by colour afterwards. */
export const PRINT_COLOR_PRESETS: { key: string; label: string; colors: PrintColors }[] = [
  { key: 'none', label: 'Template default', colors: {} },
  {
    key: 'navy',
    label: 'Navy',
    colors: { headerBg: '#1e3a8a', headerText: '#ffffff', accent: '#1e3a8a', tableHeaderBg: '#1e3a8a', tableHeaderText: '#ffffff', footerBg: '#eff6ff', footerText: '#1e3a8a' },
  },
  {
    key: 'emerald',
    label: 'Emerald',
    colors: { headerBg: '#065f46', headerText: '#ffffff', accent: '#047857', tableHeaderBg: '#047857', tableHeaderText: '#ffffff', footerBg: '#ecfdf5', footerText: '#065f46' },
  },
  {
    key: 'maroon',
    label: 'Maroon',
    colors: { headerBg: '#7f1d1d', headerText: '#ffffff', accent: '#991b1b', tableHeaderBg: '#991b1b', tableHeaderText: '#ffffff', footerBg: '#fef2f2', footerText: '#7f1d1d' },
  },
  {
    key: 'charcoal',
    label: 'Charcoal & gold',
    colors: { headerBg: '#1f2937', headerText: '#fbbf24', accent: '#b45309', tableHeaderBg: '#1f2937', tableHeaderText: '#fbbf24', footerBg: '#1f2937', footerText: '#fbbf24' },
  },
  {
    key: 'violet',
    label: 'Violet',
    colors: { headerBg: '#5b21b6', headerText: '#ffffff', accent: '#6d28d9', tableHeaderBg: '#ede9fe', tableHeaderText: '#4c1d95', footerBg: '#f5f3ff', footerText: '#4c1d95' },
  },
  {
    key: 'cream',
    label: 'Cream paper',
    colors: { pageBg: '#fffbeb', headerBg: '#fef3c7', headerText: '#78350f', accent: '#92400e', tableHeaderBg: '#fde68a', tableHeaderText: '#78350f', footerBg: '#fef3c7', footerText: '#78350f' },
  },
]

let active: PrintColors = {}

export function setActivePrintColors(colors: Partial<PrintColors> | null | undefined) {
  active = normalizePrintColors(colors)
}

export const getActivePrintColors = () => active

/** Runs a generator with a specific set of colours (live previews of unsaved choices). */
export function withPrintColors<T>(colors: PrintColors, fn: () => T): T {
  const previous = active
  active = normalizePrintColors(colors)
  try {
    return fn()
  } finally {
    active = previous
  }
}

/** WCAG relative luminance → a readable text colour for a fill the user picked. */
export function readableTextOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  return L > 0.4 ? '#111827' : '#ffffff'
}

/**
 * CSS appended after the base + template stylesheet. Only colours that are set produce a
 * rule. `print-color-adjust: exact` is what makes browsers actually print backgrounds
 * instead of dropping them to save ink.
 */
export function printColorsCss(colors: PrintColors = active): string {
  const c = normalizePrintColors(colors)
  if (!hasPrintColors(c)) return ''
  const rules: string[] = ['* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }']

  if (c.pageBg) {
    rules.push(`html, body { background: ${c.pageBg} !important; }`)
    rules.push(`@media print { @page { background: ${c.pageBg}; } }`)
  }
  if (c.headerBg || c.headerText) {
    const text = c.headerText ?? (c.headerBg ? readableTextOn(c.headerBg) : null)
    const band = c.headerBg
      ? `background: ${c.headerBg} !important; padding: 16px 18px !important; border-radius: 6px; border-bottom-color: transparent !important;`
      : ''
    rules.push(`.invoice-header { ${band} }`)
    if (text) rules.push(`.invoice-header, .invoice-header * { color: ${text} !important; }`)
  }
  if (c.accent) {
    rules.push(`.invoice-header { border-bottom-color: ${c.accent} !important; }`)
    rules.push(`.info-title { color: ${c.accent} !important; border-bottom-color: ${c.accent} !important; }`)
    rules.push(`.items-table, .items-table th, .items-table td { border-color: ${c.accent} !important; }`)
    rules.push(
      `.totals-table .final-total, .totals-table .final-total .total-label, .totals-table .final-total .total-amount { background: ${c.accent} !important; color: ${readableTextOn(c.accent)} !important; }`
    )
    rules.push(`.footer { border-top-color: ${c.accent} !important; }`)
  }
  if (c.tableHeaderBg || c.tableHeaderText) {
    const text = c.tableHeaderText ?? (c.tableHeaderBg ? readableTextOn(c.tableHeaderBg) : null)
    rules.push(`.items-table th { ${c.tableHeaderBg ? `background: ${c.tableHeaderBg} !important;` : ''} ${text ? `color: ${text} !important;` : ''} }`)
  }
  if (c.footerBg || c.footerText) {
    const text = c.footerText ?? (c.footerBg ? readableTextOn(c.footerBg) : null)
    if (c.footerBg) rules.push(`.footer { background: ${c.footerBg} !important; padding: 14px 16px !important; border-radius: 6px; }`)
    if (text) rules.push(`.footer, .footer * { color: ${text} !important; }`)
  }
  return rules.join('\n    ')
}
