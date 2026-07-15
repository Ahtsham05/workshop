import { useSelector } from 'react-redux'
import { useGetBranchQuery, type PaperSize, type PrintOrientation } from '@/stores/branch.api'
import { RootState } from '@/stores/store'

export type { PaperSize, PrintOrientation }

/** A resolved sheet size, folding the branch's A5 print orientation into the format key. */
export type SheetSize = 'a4' | 'a5' | 'a5-landscape' | 'a4-half-left' | 'a4-half-right'

/** Every key `PAPER_FORMATS`/`openPrintWindowForFormat` can be looked up by. */
export type PaperFormatKey = PaperSize | 'a5-landscape'

export interface PaperFormatConfig {
  family: 'thermal' | 'sheet'
  label: string
  /** `@page { size: ... }` value */
  pageCss: string
  pageMargin: string
  /** Receipt body width (thermal only) */
  bodyWidthPx?: number
  baseFontPx: number
  /** Max line items per sheet page (sheet formats only) */
  itemsPerPage?: number
  popup: { width: number; height: number }
  printDelayMs: number
}

export const PAPER_FORMATS: Record<PaperFormatKey, PaperFormatConfig> = {
  thermal80: {
    family: 'thermal',
    label: 'Thermal 80mm',
    pageCss: '80mm auto',
    pageMargin: '5mm',
    bodyWidthPx: 300,
    baseFontPx: 13,
    popup: { width: 400, height: 700 },
    printDelayMs: 1000,
  },
  thermal58: {
    family: 'thermal',
    label: 'Thermal 58mm',
    pageCss: '58mm auto',
    pageMargin: '3mm',
    bodyWidthPx: 220,
    baseFontPx: 11,
    popup: { width: 320, height: 600 },
    printDelayMs: 1000,
  },
  a4: {
    family: 'sheet',
    label: 'A4',
    pageCss: 'A4',
    pageMargin: '14mm',
    baseFontPx: 16,
    itemsPerPage: 14,
    popup: { width: 900, height: 1200 },
    printDelayMs: 1500,
  },
  a5: {
    family: 'sheet',
    label: 'A5',
    pageCss: 'A5',
    pageMargin: '8mm',
    baseFontPx: 13,
    itemsPerPage: 7,
    popup: { width: 640, height: 900 },
    printDelayMs: 1500,
  },
  'a5-landscape': {
    family: 'sheet',
    label: 'A5 Landscape',
    pageCss: 'A5 landscape',
    pageMargin: '8mm',
    baseFontPx: 13,
    itemsPerPage: 5,
    popup: { width: 900, height: 640 },
    printDelayMs: 1500,
  },
  'a4-half-left': {
    family: 'sheet',
    label: 'A4 — Left half',
    pageCss: 'A4 landscape',
    pageMargin: '8mm',
    baseFontPx: 13,
    itemsPerPage: 7,
    popup: { width: 900, height: 640 },
    printDelayMs: 1500,
  },
  'a4-half-right': {
    family: 'sheet',
    label: 'A4 — Right half',
    pageCss: 'A4 landscape',
    pageMargin: '8mm',
    baseFontPx: 13,
    itemsPerPage: 7,
    popup: { width: 900, height: 640 },
    printDelayMs: 1500,
  },
}

export const PAPER_SIZE_OPTIONS: Array<{ value: PaperSize; label: string; description: string }> = [
  { value: 'thermal80', label: 'Thermal 80mm', description: 'Best for 80mm receipt printers' },
  { value: 'thermal58', label: 'Thermal 58mm', description: 'Best for narrow 58mm receipt printers' },
  { value: 'a4', label: 'A4', description: 'Best for full-page A4 printers' },
  { value: 'a5', label: 'A5', description: 'Best for half-page A5 printers' },
  { value: 'a4-half-left', label: 'A4 — Left half', description: 'Prints in the left half of a landscape A4 sheet, leaving the right half blank for another invoice' },
  { value: 'a4-half-right', label: 'A4 — Right half', description: 'Prints in the right half — use on a sheet whose left half is already printed' },
]

const DEFAULT_PAPER_SIZE: PaperSize = 'thermal80'
const DEFAULT_PRINT_ORIENTATION: PrintOrientation = 'portrait'

/** Branch's configured default paper size, falling back to thermal 80mm. */
export function useBranchPaperSize(): PaperSize {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  return branchData?.printSettings?.paperSize ?? DEFAULT_PAPER_SIZE
}

/** Branch's configured A5 print orientation, falling back to portrait. Meaningless for non-A5 sizes. */
export function useBranchPrintOrientation(): PrintOrientation {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  return branchData?.printSettings?.printOrientation ?? DEFAULT_PRINT_ORIENTATION
}

/** Forces a sheet-family size for documents that only make sense on full pages (e.g. tabular statements). */
export function resolveSheetSize(paperSize: PaperSize): 'a4' | 'a5' {
  return paperSize === 'a5' ? 'a5' : 'a4'
}

/**
 * Folds the branch's print orientation into a paper-format lookup key. A no-op for every
 * size except A5 — landscape only exists for A5, so thermal/A4 sizes pass through unchanged.
 */
export function withPrintOrientation(paperSize: 'a4' | 'a5', orientation: PrintOrientation): SheetSize
export function withPrintOrientation(paperSize: PaperSize, orientation: PrintOrientation): PaperFormatKey
export function withPrintOrientation(paperSize: PaperSize, orientation: PrintOrientation): PaperFormatKey {
  return paperSize === 'a5' && orientation === 'landscape' ? 'a5-landscape' : paperSize
}

/**
 * Resolves a branch's paper size into the sheet format to actually render for full invoice
 * documents (as opposed to `resolveSheetSize`, which is for tabular documents that must stay
 * on a full page). Preserves the A4-half-sheet choices as-is; everything else goes through
 * the normal A4/A5 + orientation resolution.
 */
export function resolveSheetFormat(paperSize: PaperSize, orientation: PrintOrientation): SheetSize {
  if (paperSize === 'a4-half-left' || paperSize === 'a4-half-right') return paperSize
  return withPrintOrientation(resolveSheetSize(paperSize), orientation)
}

/** Forces a thermal-family size for documents that only make sense on receipt rolls. */
export function resolveThermalSize(paperSize: PaperSize): 'thermal80' | 'thermal58' {
  return paperSize === 'thermal58' ? 'thermal58' : 'thermal80'
}
