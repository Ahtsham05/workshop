import * as XLSX from 'xlsx'

export interface ExportLine {
  product: string
  code?: string
  oldCost: number | null
  newCost: number | null
  oldPrice: number | null
  newPrice: number | null
  status: string
  fromList?: string
  note?: string
}

const pct = (from: number | null, to: number | null) => (from && to !== null && from > 0 ? Math.round(((to - from) / from) * 10000) / 100 : '')

/** Writes the before/after of an update to an .xlsx the user can keep or send to the supplier. */
export function exportPriceChanges(lines: ExportLine[], fileName: string): void {
  const rows = lines.map((l) => ({
    Product: l.product,
    'SKU / Barcode': l.code || '',
    'Old cost': l.oldCost ?? '',
    'New cost': l.newCost ?? '',
    'Cost change %': pct(l.oldCost, l.newCost),
    'Old price': l.oldPrice ?? '',
    'New price': l.newPrice ?? '',
    'Price change %': pct(l.oldPrice, l.newPrice),
    Status: l.status,
    'From the list': l.fromList || '',
    Note: l.note || '',
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 38 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 34 }]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Price changes')
  XLSX.writeFile(book, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)
}
