// ═══════════════════════════════════════════════════════════════════════════
// ─── Branded print builder — shared by every report's "Print" button ───────
// ═══════════════════════════════════════════════════════════════════════════
//
// Extracted so every tab in the Reports Center (fee-reports.tsx,
// fee-collection-reports.tsx, receipt-register.tsx, ...) can produce the same
// branded, signature-ready print sheet instead of each rolling its own.

import { useSelector } from 'react-redux';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import type { RootState } from '@/stores/store';

export type PrintSection =
  | { type: 'summary'; heading?: string; items: { label: string; value: string }[] }
  | { type: 'table'; heading: string; headers: string[]; rows: (string | number)[][]; footer?: (string | number)[] };

export function buildCollectionReportPrintHTML(
  org: any,
  opts: { title: string; periodLabel: string; generatedByName: string; sections: PrintSection[] },
): string {
  const logoHtml = org?.logo?.url ? `<img src="${org.logo.url}" class="logo" />` : '';
  const addressLine = [org?.address, org?.phone].filter(Boolean).join(' · ');

  const sectionsHtml = opts.sections.map((s) => {
    if (s.type === 'summary') {
      const boxes = s.items.map((it) => `<div class="box"><div class="l">${it.label}</div><div class="v">${it.value}</div></div>`).join('');
      return `${s.heading ? `<h4 class="section">${s.heading}</h4>` : ''}<div class="summary">${boxes}</div>`;
    }
    const headRow = `<tr>${s.headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    const bodyRows = s.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? '' : 'r'}">${c}</td>`).join('')}</tr>`).join('');
    const footRow = s.footer ? `<tfoot><tr>${s.footer.map((c) => `<td class="r">${c}</td>`).join('')}</tr></tfoot>` : '';
    return `<h4 class="section">${s.heading}</h4><table><thead>${headRow}</thead><tbody>${bodyRows}</tbody>${footRow}</table>`;
  }).join('');

  return `<!DOCTYPE html><html><head><title>${opts.title}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:9px;color:#111;background:#fff;padding:10mm}
.header{text-align:center;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:8px}
.logo{max-height:44px;margin-bottom:4px}
.header h1{font-size:18px;font-weight:900;text-transform:uppercase}
.header h2{font-size:9px;color:#666;margin-top:2px}
.header h3{font-size:13px;font-weight:700;margin-top:6px}
.header h4{font-size:10px;color:#333;margin-top:2px}
.summary{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.box{flex:1;min-width:110px;border:1px solid #ccc;border-radius:4px;padding:8px;text-align:center}
.box .l{font-size:7.5px;text-transform:uppercase;color:#666;font-weight:700}
.box .v{font-size:13px;font-weight:800;margin-top:2px}
h4.section{font-size:11px;text-transform:uppercase;margin:14px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px}
table{width:100%;border-collapse:collapse;margin-top:2px}
th,td{border:1px solid #ccc;padding:4px 5px}
thead{display:table-header-group}
th{background:#f0f0f0;font-size:8px;text-transform:uppercase;font-weight:700;text-align:left}
td{font-size:8.5px}
td.r{text-align:right;font-weight:600}
tbody tr:nth-child(even){background:#fafafa}
tfoot td{font-weight:800;background:#f0f0f0}
.sigs{display:flex;justify-content:space-between;margin-top:26px}
.sig-box{width:180px;text-align:center;font-size:8px;color:#444}
.sig-line{border-top:1px solid #444;margin-bottom:3px;height:26px}
.footer{display:flex;justify-content:space-between;margin-top:14px;font-size:7.5px;color:#888;border-top:1px solid #ccc;padding-top:4px}
@media print{@page{size:A4 portrait;margin:8mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header">
  ${logoHtml}
  <h1>${org?.name || 'School'}</h1>
  ${addressLine ? `<h2>${addressLine}</h2>` : ''}
  <h3>${opts.title}</h3>
  <h4>${opts.periodLabel}</h4>
</div>
${sectionsHtml}
<div class="sigs">
  <div class="sig-box"><div class="sig-line"></div>Prepared By</div>
  <div class="sig-box"><div class="sig-line"></div>Authorized Signature</div>
</div>
<div class="footer"><span>Generated: ${new Date().toLocaleString()} by ${opts.generatedByName || 'Staff'}</span><span>${org?.name || 'School'} — ${opts.title}</span></div>
</body></html>`;
}

export function openReportPrintWindow(html: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

/** Org + current user, for every print header/footer. */
export function useOrgAndUser() {
  const { data: org } = useGetMyOrganizationQuery();
  const user = useSelector((state: RootState) => state.auth.data?.user);
  return { org, generatedByName: user?.name || 'Staff' };
}

/** One-liner used by every Reports Center tab's Print button. */
export function printReport(org: any, opts: { title: string; periodLabel: string; generatedByName: string; sections: PrintSection[] }) {
  openReportPrintWindow(buildCollectionReportPrintHTML(org, opts));
}
