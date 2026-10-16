import * as XLSX from 'xlsx'
import { formatAppDate } from '@/lib/date-format'
import { cellOf, keyToDate, type DocSection, type ReportDoc } from './report-doc'

/**
 * Excel workbook of a report document: a cover sheet (title, period, summary) and one
 * sheet per table. Figures stay numbers so they can be summed and filtered.
 */
export function exportReportToExcel(doc: ReportDoc, { companyName, branchName }: { companyName?: string; branchName?: string }) {
  const wb = XLSX.utils.book_new()
  const period =
    doc.periodStart && doc.periodEnd
      ? `${formatAppDate(keyToDate(doc.periodStart))} — ${formatAppDate(keyToDate(doc.periodEnd))}`
      : doc.asOf
        ? `As of ${formatAppDate(new Date(doc.asOf))}`
        : ''
  const cover: (string | number)[][] = [
    [companyName || ''],
    [doc.title + (doc.subtitle ? ` — ${doc.subtitle}` : '')],
    ...(branchName ? [['Branch', branchName]] : []),
    ['Period', period],
    [],
    ...(doc.info || []).map((i) => [i.label, i.value]),
    ...doc.summary.map((s) => [s.label, s.value, s.hint || '']),
  ]
  const coverSheet = XLSX.utils.aoa_to_sheet(cover)
  coverSheet['!cols'] = [{ wch: 34 }, { wch: 24 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, coverSheet, 'Summary')

  const used = new Set<string>(['Summary'])
  doc.sections.forEach((s, i) => {
    let name = (s.title || doc.title).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet ${i + 1}`
    while (used.has(name)) name = `${name.slice(0, 28)} ${i + 1}`
    used.add(name)
    XLSX.utils.book_append_sheet(wb, sectionSheet(s), name)
  })
  const stem = `${doc.title}${doc.subtitle ? ` - ${doc.subtitle}` : ''} ${doc.periodStart || ''}${doc.periodEnd ? ` to ${doc.periodEnd}` : ''}`
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim()
  XLSX.writeFile(wb, `${stem}.xlsx`)
}

function sectionSheet(s: DocSection) {
  const header = s.columns.map((c) => (c.group ? `${c.group} — ${c.label}` : c.label))
  const rows: (string | number)[][] = [header]
  s.rows.forEach((row) => {
    const out: (string | number)[] = []
    let start = 0
    if (row.label != null) {
      const span = Math.min(row.labelSpan ?? s.columns.length, s.columns.length)
      out.push(row.labelSub ? `${row.label} (${row.labelSub})` : row.label)
      for (let i = 1; i < span; i += 1) out.push('')
      start = span
    }
    s.columns.slice(start).forEach((col) => {
      const c = cellOf(row.cells[col.key])
      const v = typeof c.value === 'number' && c.text !== '' ? c.value : c.text
      out.push(c.sub && typeof v === 'string' && v ? `${v} — ${c.sub}` : v)
    })
    rows.push(out)
  })
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = s.columns.map((c, i) => ({ wch: Math.min(40, Math.max(10, header[i].length + 2, c.align === 'right' ? 12 : 18)) }))
  return sheet
}
