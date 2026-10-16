import { escapeHtml } from '@/lib/escape-html'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { cellOf, keyToDate, type DocColumn, type DocRow, type DocSection, type ReportDoc } from './report-doc'

/*
 * Printable manufacturing report in the house bank-statement style (see
 * features/accounting/utils/ledger-bank-statement-print.ts): masthead, statement panel,
 * a boxed summary strip, then ruled-grid registers. Plain black on white — no fills — so
 * it reads the same on a B&W office printer; figures bold and tabular.
 */

export interface ReportPrintHeader {
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyLogo?: string
  branchName?: string
  preparedBy?: string
}

const FONT_STACK = `'Inter', 'Noto Naskh Arabic', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`
const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap'

const e = escapeHtml

const groupBands = (cols: DocColumn[]) => {
  if (!cols.some((c) => c.group)) return ''
  const cells: string[] = []
  for (let i = 0; i < cols.length; ) {
    const g = cols[i].group
    let n = 1
    while (g && i + n < cols.length && cols[i + n].group === g) n += 1
    cells.push(g ? `<th class="band" colspan="${n}">${e(g)}</th>` : `<th class="band empty" colspan="1"></th>`)
    i += n
  }
  return `<tr>${cells.join('')}</tr>`
}

const cellHtml = (col: DocColumn, raw: DocRow['cells'][string]) => {
  const c = cellOf(raw)
  const cls = [col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : '', col.nowrap ? 'nw' : '', c.strong ? 'b' : '', c.tone === 'muted' ? 'm' : '']
    .filter(Boolean)
    .join(' ')
  return `<td${cls ? ` class="${cls}"` : ''}>${e(c.text)}${c.sub ? `<div class="sub">${e(c.sub)}</div>` : ''}</td>`
}

const rowHtml = (cols: DocColumn[], row: DocRow) => {
  const kind = row.kind || 'line'
  const cls = [kind !== 'line' ? kind : '', row.groupStart ? 'gs' : ''].filter(Boolean).join(' ')
  let cells = ''
  let start = 0
  if (row.label != null) {
    const span = Math.min(row.labelSpan ?? cols.length, cols.length)
    cells += `<td class="lbl" colspan="${span}">${e(row.label)}${row.labelSub ? `<span class="lsub">${e(row.labelSub)}</span>` : ''}</td>`
    start = span
  }
  cols.slice(start).forEach((col) => {
    cells += cellHtml(col, row.cells[col.key])
  })
  return `<tr${cls ? ` class="${cls}"` : ''}>${cells}</tr>`
}

const sectionHtml = (s: DocSection) => {
  const head = `<thead>${groupBands(s.columns)}<tr>${s.columns
    .map((c) => `<th${c.align === 'right' ? ' class="r"' : ''}${c.width ? ` style="width:${c.width}"` : ''}>${e(c.label)}</th>`)
    .join('')}</tr></thead>`
  const body = s.rows.length
    ? s.rows.map((r) => rowHtml(s.columns, r)).join('')
    : `<tr><td class="none" colspan="${s.columns.length}">${e(s.empty || '')}</td></tr>`
  return `<section>
    ${s.title ? `<h3>${e(s.title)}</h3>` : ''}
    <table class="grid">${head}<tbody>${body}</tbody></table>
    ${s.note ? `<p class="note">${e(s.note)}</p>` : ''}
  </section>`
}

export function generateReportHTML(doc: ReportDoc, header: ReportPrintHeader, t: (s: string) => string): string {
  const landscape = doc.orientation === 'landscape'
  const period = doc.asOf
    ? `${t('As of')} ${formatAppDateTime(new Date(doc.asOf))}`
    : doc.periodStart && doc.periodEnd
      ? `${formatAppDate(keyToDate(doc.periodStart))} — ${formatAppDate(keyToDate(doc.periodEnd))}`
      : ''
  const company = header.companyName?.trim() || t('Business')
  const contact = [header.companyAddress, header.companyPhone].filter((v) => v && v.trim()).map((v) => e(v!.trim())).join(' &nbsp;·&nbsp; ')
  const info = [
    ...(doc.info || []),
    ...(header.branchName ? [{ label: t('Branch / Warehouse'), value: header.branchName }] : []),
    ...(period ? [{ label: doc.asOf ? t('Position as of') : t('Statement period'), value: period }] : []),
    { label: t('Printed on'), value: formatAppDateTime(new Date()) },
    ...(header.preparedBy ? [{ label: t('Prepared by'), value: header.preparedBy }] : []),
  ]
  const summary = doc.summary
    .map(
      (s) => `<div class="${s.emphasis ? 'em' : ''}"><div class="sl">${e(s.label)}</div><div class="sv">${e(s.value)}</div>${s.hint ? `<div class="sh">${e(s.hint)}</div>` : ''}</div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en" translate="no" class="notranslate">
<head>
<meta charset="UTF-8"><meta name="google" content="notranslate">
<title>${e(doc.title)}${doc.subtitle ? ` — ${e(doc.subtitle)}` : ''} — ${e(company)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm 9mm 13mm;
    @bottom-left { content: "${e(company)} — ${e(doc.title)}"; font-size: 8pt; color: #000; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #000; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: ${FONT_STACK}; font-size: ${landscape ? 10 : 11}px; font-weight: 500; line-height: 1.4; padding: 16px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } }
  .mast { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 8px; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand img { max-height: 50px; max-width: 120px; object-fit: contain; }
  .bn { font-size: 1.9em; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
  .bs { font-size: 0.95em; margin-top: 2px; }
  .doc { text-align: right; flex-shrink: 0; }
  .dt { font-size: 1.5em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .ds { font-size: 1.1em; font-weight: 700; margin-top: 2px; }
  .dp { font-size: 0.95em; margin-top: 2px; }
  .rule { border-top: 3px solid #000; margin-bottom: 2px; } .rule2 { border-top: 1px solid #000; margin-bottom: 10px; }
  .info { display: grid; grid-template-columns: repeat(${landscape ? 4 : 2}, minmax(0, 1fr)); border: 1px solid #000; border-radius: 3px; margin-bottom: 10px; }
  .info > div { padding: 5px 9px; border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .info .k { font-size: 0.85em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .info .v { font-weight: 700; margin-top: 1px; }
  .sum { display: grid; grid-template-columns: repeat(${doc.summary.length || 1}, minmax(0, 1fr)); border: 1.5px solid #000; border-radius: 3px; margin-bottom: 12px; }
  .sum > div { padding: 7px 10px; border-right: 1px solid #000; }
  .sum > div:last-child { border-right: 0; }
  .sum > div.em { box-shadow: inset 0 0 0 2px #000; }
  .sl { font-size: 0.88em; font-weight: 600; }
  .sv { font-size: 1.35em; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .em .sv { font-size: 1.5em; }
  .sh { font-size: 0.85em; margin-top: 1px; }
  section { margin-bottom: 14px; }
  h3 { font-size: 1.1em; margin: 0 0 5px; text-transform: uppercase; letter-spacing: 0.05em; border-left: 4px solid #000; padding-left: 7px; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid thead { display: table-header-group; }
  table.grid th { font-weight: 700; font-size: 0.9em; text-align: left; padding: 5px 5px; border: 1px solid #000; border-bottom: 2px solid #000;
    text-transform: uppercase; letter-spacing: 0.02em; vertical-align: bottom; }
  table.grid th.r { text-align: right; }
  table.grid th.band { text-align: center; border-bottom: 1px solid #000; letter-spacing: 0.08em; }
  table.grid th.band.empty { border-top-color: transparent; border-left-color: transparent; border-right-color: transparent; }
  table.grid td { padding: 4px 5px; border: 1px solid #555; vertical-align: top; }
  table.grid tr { break-inside: avoid; page-break-inside: avoid; }
  .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .c { text-align: center; }
  .nw { white-space: nowrap; }
  .b { font-weight: 700; }
  .m { font-style: italic; }
  .sub { font-size: 0.86em; font-weight: 500; margin-top: 1px; }
  tr.gs td { border-top: 1.5px solid #000; }
  tr.group td { border-top: 2px solid #000; font-weight: 700; }
  tr.group td.lbl { font-size: 1.02em; }
  .lsub { font-weight: 500; margin-left: 10px; font-size: 0.92em; }
  tr.total td, tr.closing td, tr.opening td { font-weight: 700; border-top: 2px solid #000; border-bottom: 2px solid #000; }
  tr.closing td.lbl, tr.opening td.lbl, tr.total td.lbl { text-transform: uppercase; letter-spacing: 0.03em; }
  td.none { text-align: center; padding: 14px; font-style: italic; }
  .note { font-size: 0.86em; margin: 4px 0 0; }
  .foot { font-size: 0.86em; margin-top: 4px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; margin-top: 36px; break-inside: avoid; }
  .sign div { border-top: 1.5px solid #000; padding-top: 4px; font-weight: 600; text-align: center; }
  .gen { margin-top: 14px; font-size: 0.82em; text-align: center; }
</style>
</head>
<body>
  <div class="mast">
    <div class="brand">
      ${header.companyLogo ? `<img src="${e(header.companyLogo)}" alt="">` : ''}
      <div><div class="bn">${e(company)}</div>${contact ? `<div class="bs">${contact}</div>` : ''}</div>
    </div>
    <div class="doc">
      <div class="dt">${e(doc.title)}</div>
      ${doc.subtitle ? `<div class="ds">${e(doc.subtitle)}</div>` : ''}
      <div class="dp">${e(period)}</div>
    </div>
  </div>
  <div class="rule"></div><div class="rule2"></div>
  <div class="info">${info.map((i) => `<div><div class="k">${e(i.label)}</div><div class="v">${e(i.value)}</div></div>`).join('')}</div>
  <div class="sum">${summary}</div>
  ${doc.sections.map(sectionHtml).join('')}
  ${(doc.footnotes || []).map((f) => `<p class="foot">* ${e(f)}</p>`).join('')}
  <div class="sign"><div>${e(t('Prepared by'))}</div><div>${e(t('Checked by'))}</div><div>${e(t('Approved by'))}</div></div>
  <div class="gen">${e(t('This is a computer-generated report.'))}</div>
</body>
</html>`
}
