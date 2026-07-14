import { useSelector } from 'react-redux'
import { useGetBranchQuery, type PaperSize } from '@/stores/branch.api'
import { RootState } from '@/stores/store'

export type { PaperSize }

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

export const PAPER_FORMATS: Record<PaperSize, PaperFormatConfig> = {
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
    baseFontPx: 14,
    itemsPerPage: 14,
    popup: { width: 900, height: 1200 },
    printDelayMs: 1500,
  },
  a5: {
    family: 'sheet',
    label: 'A5',
    pageCss: 'A5',
    pageMargin: '8mm',
    baseFontPx: 12,
    itemsPerPage: 7,
    popup: { width: 640, height: 900 },
    printDelayMs: 1500,
  },
}

export const PAPER_SIZE_OPTIONS: Array<{ value: PaperSize; label: string; description: string }> = [
  { value: 'thermal80', label: 'Thermal 80mm', description: 'Best for 80mm receipt printers' },
  { value: 'thermal58', label: 'Thermal 58mm', description: 'Best for narrow 58mm receipt printers' },
  { value: 'a4', label: 'A4', description: 'Best for full-page A4 printers' },
  { value: 'a5', label: 'A5', description: 'Best for half-page A5 printers' },
]

const DEFAULT_PAPER_SIZE: PaperSize = 'thermal80'

/** Branch's configured default paper size, falling back to thermal 80mm. */
export function useBranchPaperSize(): PaperSize {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  return branchData?.printSettings?.paperSize ?? DEFAULT_PAPER_SIZE
}

/** Forces a sheet-family size for documents that only make sense on full pages (e.g. tabular statements). */
export function resolveSheetSize(paperSize: PaperSize): 'a4' | 'a5' {
  return paperSize === 'a5' ? 'a5' : 'a4'
}

/** Forces a thermal-family size for documents that only make sense on receipt rolls. */
export function resolveThermalSize(paperSize: PaperSize): 'thermal80' | 'thermal58' {
  return paperSize === 'thermal58' ? 'thermal58' : 'thermal80'
}
