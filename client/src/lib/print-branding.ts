/**
 * "With logo" / "Without logo" for invoice prints in a wholesale / distributor organization —
 * wherever an invoice is printed (New Invoice, invoice list and view, phone view, pending
 * invoices, quotations, invoice rows in customer / supplier ledgers), on every template.
 * Ledger statements, vouchers, receipts, purchases and reports are not affected.
 *
 *  - logo:    the business block (logo, name, address, contacts) prints as usual.
 *  - no-logo: nothing about the business — for letterhead / pre-printed paper or invoices
 *             sent on someone else's behalf. The invoice generator marks that block with
 *             `PRINT_BRAND_CLASS` and adds `printBrandingCss()` to its stylesheet (the
 *             Distributor template has its own header styles and reads the same pick).
 *
 * The choice comes from the ▾ next to a Print button (`setNextPrintBranding`) and lasts for
 * that one print (45 s window so async prints and the WhatsApp PDF of a Save & Print use it
 * too). Otherwise the branch default applies: Settings → Printing → Invoice header when the
 * branch prints on the Distributor template, "With logo" for any other template.
 */

export type PrintBranding = 'logo' | 'no-logo'

export const PRINT_BRANDING_OPTIONS: Array<{ value: PrintBranding; label: string; description: string }> = [
  { value: 'logo', label: 'With logo', description: 'Business name, address and your logo' },
  { value: 'no-logo', label: 'Without logo', description: 'No logo or business details — for letterhead paper' },
]

/** Class for everything that identifies the business on a print (hidden on "Without logo"). */
export const PRINT_BRAND_CLASS = 'print-brand'
/** Class for a header row whose remaining content should sit on the right once the brand block is hidden. */
export const PRINT_BRAND_HOST_CLASS = 'print-brand-host'

let defaultBranding: PrintBranding = 'logo'
let picked: { style: PrintBranding; until: number } | null = null

/** Set by components/print-colors-sync.tsx from the active branch + organization. */
export function setDefaultPrintBranding(style: PrintBranding) {
  defaultBranding = style
}

export const getDefaultPrintBranding = () => defaultBranding

/** One-off choice for the print just requested; `null` = the default (the Print button's main click). */
export function setNextPrintBranding(style: PrintBranding | null) {
  picked = style ? { style, until: Date.now() + 45_000 } : null
}

/** The style picked for the current print, if it is still in force. */
export function pickedPrintBranding(): PrintBranding | null {
  if (picked && picked.until <= Date.now()) picked = null
  return picked?.style ?? null
}

/** What the print being generated right now should use. */
export const activePrintBranding = (): PrintBranding => pickedPrintBranding() ?? defaultBranding

export const printsWithoutBranding = () => activePrintBranding() === 'no-logo'

/**
 * CSS for a print's `<style>` block: hides the marked business block (and any stray logo) on
 * "Without logo", nothing otherwise. Generators call it while building the HTML, so the pick
 * in force at that moment decides.
 */
export function printBrandingCss(): string {
  if (!printsWithoutBranding()) return ''
  return `
    .${PRINT_BRAND_CLASS}, img.company-logo { display: none !important; }
    .${PRINT_BRAND_HOST_CLASS} { justify-content: flex-end !important; }
  `
}
