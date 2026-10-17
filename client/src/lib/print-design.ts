/**
 * Invoice designer — per-branch fine-tuning of A4/A5 sheet invoices on top of the chosen
 * template (Settings → Printing → Invoice designer). Stored on Branch.printSettings.design.
 *
 * Every setting has a "template" / null value meaning "leave the template alone", so an
 * untouched design adds no CSS at all. Font sizes are kept separately for A4 and A5: a
 * 40px business name that suits A4 swamps a half-size sheet.
 *
 * Like print colours (lib/print-colors.ts), the active branch's design is published here by
 * PrintColorsSync and read by the invoice + purchase generators, so the many print call
 * sites need no changes. Previews of unsaved choices use `withPrintDesign`.
 *
 * Everything that ends up in CSS comes from a whitelist or a clamped number, and the only
 * free text (wording overrides) is HTML-escaped where it is printed.
 */

export type SheetKind = 'a4' | 'a5'

export const FONT_OPTIONS = [
  { key: 'template', label: 'Template default', stack: '', google: '' },
  { key: 'inter', label: 'Inter (modern sans)', stack: "'Inter', sans-serif", google: '' },
  { key: 'roboto', label: 'Roboto', stack: "'Roboto', sans-serif", google: 'Roboto:wght@400;500;700;900' },
  { key: 'open-sans', label: 'Open Sans', stack: "'Open Sans', sans-serif", google: 'Open+Sans:wght@400;600;700;800' },
  { key: 'lato', label: 'Lato', stack: "'Lato', sans-serif", google: 'Lato:wght@400;700;900' },
  { key: 'poppins', label: 'Poppins (rounded)', stack: "'Poppins', sans-serif", google: 'Poppins:wght@400;500;600;700;800' },
  { key: 'montserrat', label: 'Montserrat (bold headings)', stack: "'Montserrat', sans-serif", google: 'Montserrat:wght@400;500;600;700;800' },
  { key: 'source-sans', label: 'Source Sans 3 (corporate)', stack: "'Source Sans 3', sans-serif", google: 'Source+Sans+3:wght@400;600;700;900' },
  { key: 'ibm-plex', label: 'IBM Plex Sans (banking)', stack: "'IBM Plex Sans', sans-serif", google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  { key: 'merriweather', label: 'Merriweather (serif)', stack: "'Merriweather', serif", google: 'Merriweather:wght@400;700;900' },
  { key: 'playfair', label: 'Playfair Display (elegant serif)', stack: "'Playfair Display', serif", google: 'Playfair+Display:wght@400;600;700;800' },
  { key: 'georgia', label: 'Georgia (classic serif)', stack: "Georgia, 'Times New Roman', serif", google: '' },
  { key: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif', google: '' },
  { key: 'mono', label: 'Monospace (typewriter)', stack: "'IBM Plex Mono', 'Courier New', monospace", google: 'IBM+Plex+Mono:wght@400;600;700' },
] as const

export type FontKey = (typeof FONT_OPTIONS)[number]['key']

/** Each adjustable text, the elements it covers, and its slider range. */
export const SIZE_FIELDS = [
  { key: 'businessName', label: 'Business name', min: 12, max: 64 },
  { key: 'title', label: 'Document title ("Invoice")', min: 10, max: 48 },
  { key: 'headerDetails', label: 'Address, contact, number & date', min: 8, max: 22 },
  { key: 'sectionHeadings', label: 'Section headings (Bill to…)', min: 8, max: 24 },
  { key: 'customerInfo', label: 'Customer & invoice details', min: 8, max: 22 },
  { key: 'tableHead', label: 'Table headings', min: 8, max: 22 },
  { key: 'tableBody', label: 'Item rows', min: 8, max: 22 },
  { key: 'totals', label: 'Totals', min: 8, max: 24 },
  { key: 'grandTotal', label: 'Amount payable (last total)', min: 10, max: 32 },
  { key: 'notes', label: 'Notes & terms', min: 8, max: 18 },
  { key: 'footer', label: 'Footer text', min: 8, max: 20 },
] as const

export type SizeKey = (typeof SIZE_FIELDS)[number]['key']
export type SizeSet = Partial<Record<SizeKey, number | null>>

export const SHOW_FIELDS = [
  { key: 'logo', label: 'Logo' },
  { key: 'address', label: 'Address' },
  { key: 'contact', label: 'Phone / contact line' },
  { key: 'time', label: 'Print time' },
  { key: 'infoBox', label: 'Customer & invoice details box' },
  { key: 'statusBadge', label: 'Cash / credit badge' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'notes', label: 'Notes & terms' },
  { key: 'branchNote', label: 'Branch invoice note' },
  { key: 'thankYou', label: 'Thank-you line' },
  { key: 'footerLine', label: 'Footer note line' },
] as const

export type ShowKey = (typeof SHOW_FIELDS)[number]['key']

export const LAYOUT_CHOICES = {
  headerLayout: [
    { value: 'template', label: 'Template default' },
    { value: 'split', label: 'Business left, invoice right' },
    { value: 'reversed', label: 'Invoice left, business right' },
    { value: 'centered', label: 'Centred letterhead' },
  ],
  margins: [
    { value: 'template', label: 'Template default' },
    { value: 'narrow', label: 'Narrow' },
    { value: 'normal', label: 'Normal' },
    { value: 'wide', label: 'Wide' },
  ],
  rowDensity: [
    { value: 'template', label: 'Template default' },
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
  ],
  tableLines: [
    { value: 'template', label: 'Template default' },
    { value: 'grid', label: 'Full grid' },
    { value: 'rows', label: 'Row lines only' },
    { value: 'none', label: 'No lines' },
  ],
  zebra: [
    { value: 'template', label: 'Template default' },
    { value: 'on', label: 'Striped rows' },
    { value: 'off', label: 'Plain rows' },
  ],
  corners: [
    { value: 'template', label: 'Template default' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'square', label: 'Square' },
  ],
  rowWeight: [
    { value: 'template', label: 'Template default' },
    { value: 'normal', label: 'Regular' },
    { value: 'medium', label: 'Medium' },
    { value: 'bold', label: 'Bold' },
  ],
  nameCase: [
    { value: 'template', label: 'Template default' },
    { value: 'normal', label: 'As typed' },
    { value: 'uppercase', label: 'CAPITALS' },
  ],
  totalsWidth: [
    { value: 'template', label: 'Template default' },
    { value: 'narrow', label: 'Narrow' },
    { value: 'half', label: 'Half page' },
    { value: 'full', label: 'Full width' },
  ],
  signatures: [
    { value: 'auto', label: 'As the template decides' },
    { value: 'show', label: 'Always show' },
    { value: 'hide', label: 'Never show' },
  ],
} as const

type ChoiceKey = keyof typeof LAYOUT_CHOICES
type ChoiceValue<K extends ChoiceKey> = (typeof LAYOUT_CHOICES)[K][number]['value']

export interface PrintDesign {
  font: FontKey
  sizes: { a4: SizeSet; a5: SizeSet }
  headerLayout: ChoiceValue<'headerLayout'>
  margins: ChoiceValue<'margins'>
  rowDensity: ChoiceValue<'rowDensity'>
  tableLines: ChoiceValue<'tableLines'>
  zebra: ChoiceValue<'zebra'>
  corners: ChoiceValue<'corners'>
  rowWeight: ChoiceValue<'rowWeight'>
  nameCase: ChoiceValue<'nameCase'>
  totalsWidth: ChoiceValue<'totalsWidth'>
  signatures: ChoiceValue<'signatures'>
  /** Logo width in px; null = template default. */
  logoSize: number | null
  show: Partial<Record<ShowKey, boolean>>
  /** Sales-invoice wording overrides; '' = the normal (translated) text. */
  texts: { title: string; thankYou: string; footerLine: string }
}

export const EMPTY_DESIGN: PrintDesign = {
  font: 'template',
  sizes: { a4: {}, a5: {} },
  headerLayout: 'template',
  margins: 'template',
  rowDensity: 'template',
  tableLines: 'template',
  zebra: 'template',
  corners: 'template',
  rowWeight: 'template',
  nameCase: 'template',
  totalsWidth: 'template',
  signatures: 'auto',
  logoSize: null,
  show: {},
  texts: { title: '', thankYou: '', footerLine: '' },
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function pick<K extends ChoiceKey>(key: K, value: unknown): ChoiceValue<K> {
  const options = LAYOUT_CHOICES[key] as readonly { value: string }[]
  return (options.some((o) => o.value === value) ? value : options[0].value) as ChoiceValue<K>
}

function normalizeSizes(value: unknown): SizeSet {
  const out: SizeSet = {}
  if (!value || typeof value !== 'object') return out
  SIZE_FIELDS.forEach((field) => {
    const raw = (value as Record<string, unknown>)[field.key]
    if (typeof raw === 'number' && Number.isFinite(raw)) out[field.key] = Math.round(clamp(raw, field.min, field.max))
  })
  return out
}

/**
 * The server's global xss-clean middleware entity-encodes request strings on the way in
 * ("<3" is stored as "&lt;3"). Decode once here — the generators escape again on output —
 * so the wording prints exactly as typed instead of showing "&lt;".
 */
const decodeEntities = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x?0*27;/gi, "'")
    .replace(/&amp;/g, '&')

const cleanText = (value: unknown, max = 160) =>
  typeof value === 'string' ? decodeEntities(value).replace(/[\r\n]+/g, ' ').trim().slice(0, max) : ''

/** Accepts anything (server payload, older saves) and returns a valid design. */
export function normalizePrintDesign(value: unknown): PrintDesign {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const sizes = (v.sizes && typeof v.sizes === 'object' ? v.sizes : {}) as Record<string, unknown>
  const show: Partial<Record<ShowKey, boolean>> = {}
  const rawShow = (v.show && typeof v.show === 'object' ? v.show : {}) as Record<string, unknown>
  SHOW_FIELDS.forEach((f) => {
    if (rawShow[f.key] === false) show[f.key] = false
  })
  const texts = (v.texts && typeof v.texts === 'object' ? v.texts : {}) as Record<string, unknown>
  return {
    font: FONT_OPTIONS.some((f) => f.key === v.font) ? (v.font as FontKey) : 'template',
    sizes: { a4: normalizeSizes(sizes.a4), a5: normalizeSizes(sizes.a5) },
    headerLayout: pick('headerLayout', v.headerLayout),
    margins: pick('margins', v.margins),
    rowDensity: pick('rowDensity', v.rowDensity),
    tableLines: pick('tableLines', v.tableLines),
    zebra: pick('zebra', v.zebra),
    corners: pick('corners', v.corners),
    rowWeight: pick('rowWeight', v.rowWeight),
    nameCase: pick('nameCase', v.nameCase),
    totalsWidth: pick('totalsWidth', v.totalsWidth),
    signatures: pick('signatures', v.signatures),
    logoSize: typeof v.logoSize === 'number' && Number.isFinite(v.logoSize) ? Math.round(clamp(v.logoSize, 40, 320)) : null,
    show,
    texts: { title: cleanText(texts.title, 60), thankYou: cleanText(texts.thankYou), footerLine: cleanText(texts.footerLine, 240) },
  }
}

/** Only the fields that differ from "template default" — what gets saved. */
export function compactPrintDesign(design: PrintDesign): Partial<PrintDesign> | null {
  const d = normalizePrintDesign(design)
  const out: Record<string, unknown> = {}
  ;(Object.keys(EMPTY_DESIGN) as (keyof PrintDesign)[]).forEach((key) => {
    if (JSON.stringify(d[key]) !== JSON.stringify(EMPTY_DESIGN[key])) out[key] = d[key]
  })
  return Object.keys(out).length ? (out as Partial<PrintDesign>) : null
}

export const isDesignCustomised = (design: PrintDesign | null | undefined) => !!design && compactPrintDesign(design) !== null

export const sameDesign = (a: PrintDesign, b: PrintDesign) =>
  JSON.stringify(compactPrintDesign(a)) === JSON.stringify(compactPrintDesign(b))

/* ── Active design (published by the app shell) ──────────────────────────── */

let active: PrintDesign = EMPTY_DESIGN

export function setActivePrintDesign(value: unknown) {
  active = normalizePrintDesign(value)
}
export const getActivePrintDesign = () => active

export function withPrintDesign<T>(design: PrintDesign, fn: () => T): T {
  const previous = active
  active = normalizePrintDesign(design)
  try {
    return fn()
  } finally {
    active = previous
  }
}

/** Kind of sheet a paper/sheet size prints on. */
export const sheetKindOf = (sheet: string): SheetKind => (sheet.startsWith('a5') ? 'a5' : 'a4')

/* ── Output ──────────────────────────────────────────────────────────────── */

/** Google-font <link> for the chosen font ('' when it is a system/template font). */
export function printDesignHeadHtml(design: PrintDesign = active): string {
  const font = FONT_OPTIONS.find((f) => f.key === design.font)
  if (!font?.google) return ''
  return `<link href="https://fonts.googleapis.com/css2?family=${font.google}&family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">`
}

/** Shared signature-strip CSS (also used by the formal templates in invoice-template.ts). */
export const DOC_EXTRAS_BASE = `
  .doc-extras { margin-top: 36px; page-break-inside: avoid; }
  .doc-signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
  .doc-sign { text-align: center; font-size: 12px; color: #475569; }
  .doc-sign-line { display: block; height: 34px; border-bottom: 1px solid #334155; margin-bottom: 6px; }
  .doc-note { margin-top: 14px; text-align: center; font-size: 11px; color: #64748b; }
`

const LAST_TOTAL = `.totals-wrapper:not(:has(~ .totals-wrapper)) .totals-table tr:last-child td`

const SIZE_SELECTORS: Record<SizeKey, string> = {
  businessName: '.company-name',
  title: '.invoice-title',
  headerDetails: '.company-details, .company-details *, .invoice-meta, .invoice-meta *',
  sectionHeadings: '.info-title, .terms-heading',
  customerInfo:
    '.invoice-info .info-row, .invoice-info .info-row *, .customer-bill-line, .customer-field-label, .bill-to-customer-name, .detail-value, .info-label',
  tableHead: '.items-table th',
  tableBody: '.items-table td, .items-table td *',
  totals: '.totals-table td',
  grandTotal: `${LAST_TOTAL}, .totals-table .final-total td`,
  notes: '.notes-content, .notes-content *, .invoice-branch-note, .invoice-branch-note *',
  footer: '.footer-line, .doc-sign, .doc-note',
}

const HIDE_SELECTORS: Record<ShowKey, string> = {
  logo: '.company-logo',
  address: '.company-address, .company-address + br',
  contact: '.company-contact-line',
  time: '.meta-time',
  infoBox: '.invoice-info',
  statusBadge: '.status-badge',
  barcode: '.barcode-section',
  notes: '.notes-section',
  branchNote: '.invoice-branch-note',
  thankYou: '.footer-thank-you',
  footerLine: '.footer-line:not(.footer-thank-you)',
}

/** CSS appended after the template + colour CSS. '' when nothing is customised. */
export function printDesignCss(sheet: SheetKind, design: PrintDesign = active): string {
  const d = design
  const rules: string[] = []

  const font = FONT_OPTIONS.find((f) => f.key === d.font)
  if (font?.stack) {
    // The barcode keeps its barcode font; Urdu falls back to Noto Naskh for its glyphs.
    rules.push(`body, body *:not(.barcode) { font-family: ${font.stack.replace(/, (sans-serif|serif|monospace)$/, '')}, 'Noto Naskh Arabic', ${font.stack.split(', ').pop()} !important; }`)
  }

  const sizes = d.sizes[sheet] ?? {}
  SIZE_FIELDS.forEach(({ key }) => {
    const px = sizes[key]
    if (px) rules.push(`${SIZE_SELECTORS[key]} { font-size: ${px}px !important; line-height: 1.3; }`)
  })
  // The thank-you line reads as the footer's heading, so it stays a step larger.
  if (sizes.footer) rules.push(`.footer-thank-you { font-size: ${Math.round(sizes.footer * 1.35)}px !important; }`)

  if (d.headerLayout === 'split') {
    rules.push(`.invoice-header { flex-direction: row !important; align-items: flex-start !important; text-align: start !important; }
    .company-info { flex: 1 !important; width: auto !important; align-items: flex-start !important; }
    .invoice-details { text-align: end !important; width: auto !important; margin-top: 0 !important; }
    .invoice-meta { display: block !important; }`)
  } else if (d.headerLayout === 'reversed') {
    rules.push(`.invoice-header { flex-direction: row-reverse !important; align-items: flex-start !important; }
    .company-info { flex: 1 !important; text-align: end !important; display: flex; flex-direction: column; align-items: flex-end !important; }
    .invoice-details { text-align: start !important; margin-top: 0 !important; }
    .invoice-meta { display: block !important; }`)
  } else if (d.headerLayout === 'centered') {
    rules.push(`.invoice-header { flex-direction: column !important; align-items: center !important; text-align: center !important; }
    .company-info { flex: none !important; width: 100%; display: flex; flex-direction: column; align-items: center !important; }
    .company-logo { margin-left: auto !important; margin-right: auto !important; }
    .company-details { text-align: center !important; }
    .invoice-details { flex: none !important; width: 100%; text-align: center !important; margin-top: 12px; }
    .invoice-meta { display: flex !important; justify-content: center; flex-wrap: wrap; gap: 4px 18px; }`)
  }

  if (d.nameCase === 'uppercase') rules.push(`.company-name { text-transform: uppercase !important; }`)
  if (d.nameCase === 'normal') rules.push(`.company-name { text-transform: none !important; }`)

  if (d.logoSize) rules.push(`.company-logo { max-width: ${d.logoSize}px !important; width: ${d.logoSize}px; height: auto !important; }`)

  if (d.margins !== 'template') {
    const page = { narrow: '6mm', normal: '12mm', wide: '20mm' }[d.margins]
    const screen = { narrow: '16px', normal: '32px', wide: '56px' }[d.margins]
    rules.push(`@media print { @page { margin: ${page}; } } @media screen { body { padding: ${screen} !important; } }`)
  }

  if (d.rowDensity !== 'template') {
    const pad = { compact: '4px 6px', comfortable: '9px 8px', spacious: '14px 10px' }[d.rowDensity]
    rules.push(`.items-table td, .items-table th { padding: ${pad} !important; } .totals-table td { padding: ${pad} !important; }`)
  }

  if (d.tableLines === 'grid') {
    rules.push(`.items-table { border: 1px solid #94a3b8 !important; } .items-table th, .items-table td { border: 1px solid #cbd5e1 !important; }`)
  } else if (d.tableLines === 'rows') {
    rules.push(`.items-table { border-left: none !important; border-right: none !important; }
    .items-table th, .items-table td { border-left: none !important; border-right: none !important; border-top: none !important; border-bottom: 1px solid #e2e8f0 !important; }`)
  } else if (d.tableLines === 'none') {
    rules.push(`.items-table, .items-table th, .items-table td { border: none !important; box-shadow: none !important; }`)
  }

  if (d.zebra === 'on') rules.push(`.items-table tbody tr:nth-child(even) { background: #f5f7fa !important; } .items-table tbody tr:nth-child(odd) { background: transparent !important; }`)
  if (d.zebra === 'off') rules.push(`.items-table tbody tr { background: transparent !important; }`)

  if (d.corners === 'square') {
    rules.push(`.invoice-header, .invoice-info, .info-section, .items-table, .items-table th, .totals-table, .barcode-section, .notes-section, .invoice-branch-note, .footer, .status-badge { border-radius: 0 !important; }`)
  } else if (d.corners === 'rounded') {
    rules.push(`.invoice-info, .totals-table, .barcode-section, .notes-section, .invoice-branch-note { border-radius: 10px !important; overflow: hidden; } .status-badge { border-radius: 999px !important; }`)
  }

  if (d.rowWeight !== 'template') {
    const w = { normal: 400, medium: 500, bold: 700 }[d.rowWeight]
    rules.push(`.items-table td, .items-table td * { font-weight: ${w} !important; }`)
  }

  if (d.totalsWidth !== 'template') {
    const w = { narrow: '300px', half: '50%', full: '100%' }[d.totalsWidth]
    rules.push(`.totals-table { width: ${w} !important; }`)
  }

  const hidden = SHOW_FIELDS.filter((f) => d.show[f.key] === false).map((f) => HIDE_SELECTORS[f.key])
  if (hidden.length) rules.push(`${hidden.join(', ')} { display: none !important; }`)
  if (d.show.thankYou === false && d.show.footerLine === false) rules.push(`.footer { display: none !important; }`)

  if (d.signatures === 'show') rules.push(DOC_EXTRAS_BASE)

  return rules.join('\n    ')
}
