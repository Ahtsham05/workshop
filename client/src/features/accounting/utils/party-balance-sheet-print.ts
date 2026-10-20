import { formatCurrency } from '@/features/invoice/utils/print-utils'
import { escapeHtml } from '@/lib/escape-html'
import { formatAppDate } from '@/lib/date-format'
import type { CurrencyOption } from '@/stores/localization.api'

import {
  isRtlPrintLanguage,
  nativePrintLanguage,
  printDirection,
  printScriptFontFamilies,
  printScriptFontParams,
  type PrintLanguage,
} from '@/lib/native-language'
import { toPrintLanguage } from '@/features/invoice/utils/language'
/** English or a native print language (Urdu, Arabic, Hindi — lib/native-language.ts). */
export type BalanceSheetLanguage = PrintLanguage

export type BalanceSheetParty = 'customer' | 'supplier'

export interface BalanceSheetRow {
  name: string
  nameUrdu?: string | null
  phone?: string | null
  /** Positive = they owe us (customer) / we owe them (supplier); negative = advance. */
  balance: number
}

export interface BalanceSheetData {
  party: BalanceSheetParty
  rows: BalanceSheetRow[]
  language?: BalanceSheetLanguage
  /** Leave out parties whose balance is zero. */
  hideSettled?: boolean
  companyName?: string
  companyNameUrdu?: string
  companyAddress?: string
  companyPhone?: string
  companyLogo?: string
  currencyMeta?: CurrencyOption
}

const sharedLabels = {
  en: {
    printed_on: 'Printed on',
    col_number: '#',
    col_phone: 'Phone',
    col_balance: 'Balance',
    grand_total: 'Total',
    prepared_by: 'Prepared by',
    checked_by: 'Checked by',
    print: 'Print',
    close: 'Close',
  },
  ur: {
    printed_on: 'تاریخ',
    col_number: 'نمبر',
    col_phone: 'فون نمبر',
    col_balance: 'بقایا رقم',
    grand_total: 'میزان',
    prepared_by: 'تیار کنندہ',
    checked_by: 'تصدیق کنندہ',
    print: 'پرنٹ کریں',
    close: 'بند کریں',
  },
  ar: {
    printed_on: 'تاريخ الطباعة',
    col_number: '#',
    col_phone: 'الهاتف',
    col_balance: 'الرصيد',
    grand_total: 'الإجمالي',
    prepared_by: 'أعدّه',
    checked_by: 'راجعه',
    print: 'طباعة',
    close: 'إغلاق',
  },
  hi: {
    printed_on: 'प्रिंट दिनांक',
    col_number: 'क्र.',
    col_phone: 'फ़ोन',
    col_balance: 'शेष',
    grand_total: 'कुल',
    prepared_by: 'तैयारकर्ता',
    checked_by: 'जाँचकर्ता',
    print: 'प्रिंट करें',
    close: 'बंद करें',
  },
} as const

/**
 * Customers: positive balance is receivable, the blank column is "Received".
 * Suppliers: positive balance is payable, the blank column is "Paid".
 */
const partyLabels = {
  customer: {
    en: {
      title: 'Customer Balances',
      subtitle: 'Collection Sheet',
      total_parties: 'Customers',
      total_owed: 'Total Receivable',
      total_advance: 'Total Payable',
      total_settled: 'Total Received',
      col_name: 'Customer Name',
      col_settled: 'Received',
      advance_tag: 'Payable',
      settled_by: 'Collected by',
      empty: 'No customers to print.',
    },
    ur: {
      title: 'کسٹمرز بقایا جات',
      subtitle: 'وصولی شیٹ',
      total_parties: 'کل کسٹمرز',
      total_owed: 'کل بقایا (بنام)',
      total_advance: 'کل ایڈوانس (جمع)',
      total_settled: 'کل وصولی',
      col_name: 'کسٹمر کا نام',
      col_settled: 'وصول شدہ رقم',
      advance_tag: 'جمع',
      settled_by: 'وصول کنندہ',
      empty: 'پرنٹ کرنے کے لیے کوئی کسٹمر نہیں۔',
    },
    ar: {
      title: 'أرصدة العملاء',
      subtitle: 'كشف التحصيل',
      total_parties: 'العملاء',
      total_owed: 'إجمالي المستحق لنا',
      total_advance: 'إجمالي المستحق علينا',
      total_settled: 'إجمالي المحصّل',
      col_name: 'اسم العميل',
      col_settled: 'المحصّل',
      advance_tag: 'مستحق علينا',
      settled_by: 'المحصّل',
      empty: 'لا يوجد عملاء للطباعة.',
    },
    hi: {
      title: 'ग्राहक शेष',
      subtitle: 'वसूली शीट',
      total_parties: 'ग्राहक',
      total_owed: 'कुल प्राप्य',
      total_advance: 'कुल देय',
      total_settled: 'कुल प्राप्त',
      col_name: 'ग्राहक का नाम',
      col_settled: 'प्राप्त',
      advance_tag: 'देय',
      settled_by: 'वसूलकर्ता',
      empty: 'प्रिंट करने के लिए कोई ग्राहक नहीं।',
    },
  },
  supplier: {
    en: {
      title: 'Supplier Balances',
      subtitle: 'Payment Sheet',
      total_parties: 'Suppliers',
      total_owed: 'Total Payable',
      total_advance: 'Total Receivable',
      total_settled: 'Total Paid',
      col_name: 'Supplier Name',
      col_settled: 'Paid',
      advance_tag: 'Receivable',
      settled_by: 'Paid by',
      empty: 'No suppliers to print.',
    },
    ur: {
      title: 'سپلائرز بقایا جات',
      subtitle: 'ادائیگی شیٹ',
      total_parties: 'کل سپلائرز',
      total_owed: 'کل بقایا (جمع)',
      total_advance: 'کل ایڈوانس (بنام)',
      total_settled: 'کل ادائیگی',
      col_name: 'سپلائر کا نام',
      col_settled: 'ادا شدہ رقم',
      advance_tag: 'بنام',
      settled_by: 'ادا کنندہ',
      empty: 'پرنٹ کرنے کے لیے کوئی سپلائر نہیں۔',
    },
    ar: {
      title: 'أرصدة الموردين',
      subtitle: 'كشف السداد',
      total_parties: 'الموردون',
      total_owed: 'إجمالي المستحق علينا',
      total_advance: 'إجمالي المستحق لنا',
      total_settled: 'إجمالي المدفوع',
      col_name: 'اسم المورد',
      col_settled: 'المدفوع',
      advance_tag: 'مستحق لنا',
      settled_by: 'الدافع',
      empty: 'لا يوجد موردون للطباعة.',
    },
    hi: {
      title: 'आपूर्तिकर्ता शेष',
      subtitle: 'भुगतान शीट',
      total_parties: 'आपूर्तिकर्ता',
      total_owed: 'कुल देय',
      total_advance: 'कुल प्राप्य',
      total_settled: 'कुल भुगतान',
      col_name: 'आपूर्तिकर्ता का नाम',
      col_settled: 'भुगतान',
      advance_tag: 'प्राप्य',
      settled_by: 'भुगतानकर्ता',
      empty: 'प्रिंट करने के लिए कोई आपूर्तिकर्ता नहीं।',
    },
  },
} as const

const fontStack = () =>
  `'Inter', ${printScriptFontFamilies()}, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`
const googleFontsHref = () =>
  `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700${printScriptFontParams()}&display=swap`

const isZero = (n: number) => Math.abs(n) < 0.005

/** Highest balance first; equal balances fall back to name so the order is stable. */
export function sortForBalanceSheet<T extends BalanceSheetRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0) || a.name.localeCompare(b.name),
  )
}

/**
 * A4 customer collection / supplier payment sheet: every party with phone and current
 * balance, highest balance on top, plus an empty "Received" (customers) or "Paid"
 * (suppliers) column to fill in by hand.
 * Prints right-to-left in Urdu (Latin digits and phone numbers kept left-to-right).
 */
export function generateBalanceSheetHTML(data: BalanceSheetData): string {
  // No language = the native one (this sheet always defaulted to Urdu).
  const language: BalanceSheetLanguage = data.language === 'en' ? 'en' : toPrintLanguage(data.language ?? nativePrintLanguage())
  const L = { ...sharedLabels[language], ...partyLabels[data.party][language] }
  const native = language !== 'en'
  const rtl = isRtlPrintLanguage(language)
  const dir = printDirection(language)
  const start = rtl ? 'right' : 'left'
  const end = rtl ? 'left' : 'right'
  const money = (n: number) => formatCurrency(n, data.currencyMeta)

  const rows = sortForBalanceSheet(
    data.rows.filter((c) => !(data.hideSettled && isZero(Number(c.balance) || 0))),
  )

  const totalOwed = rows.reduce((s, c) => s + Math.max(0, Number(c.balance) || 0), 0)
  const totalAdvance = rows.reduce((s, c) => s + Math.max(0, -(Number(c.balance) || 0)), 0)

  const businessName =
    (native && data.companyNameUrdu?.trim()) || data.companyName?.trim() || 'Business'
  const now = new Date()

  const bodyRows = rows.length
    ? rows
        .map((c, i) => {
          const balance = Number(c.balance) || 0
          const name = (native && c.nameUrdu?.trim()) || c.name
          const balanceCell = isZero(balance)
            ? `<span class="ltr muted">${money(0)}</span>`
            : balance > 0
              ? `<span class="ltr">${money(balance)}</span>`
              : `<span class="ltr">${money(Math.abs(balance))}</span><span class="tag">${L.advance_tag}</span>`
          return `
        <tr>
          <td class="c-num">${i + 1}</td>
          <td class="c-name">${escapeHtml(name)}</td>
          <td class="c-phone"><span class="ltr">${c.phone?.trim() ? escapeHtml(c.phone.trim()) : '—'}</span></td>
          <td class="c-balance${balance < 0 ? ' is-payable' : ''}">${balanceCell}</td>
          <td class="c-received"></td>
        </tr>`
        })
        .join('')
    : `<tr><td colspan="5" class="empty">${L.empty}</td></tr>`

  const contactLine = [data.companyAddress, data.companyPhone]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => escapeHtml(v.trim()))
    .join(' &nbsp;·&nbsp; ')

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}" translate="no" class="notranslate">
<head>
  <meta charset="UTF-8">
  <meta name="google" content="notranslate">
  <title>${L.title} — ${escapeHtml(businessName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${googleFontsHref()}" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 12mm 14mm;
      @bottom-center { content: counter(page) " / " counter(pages); direction: ltr; font-size: 9pt; color: #333; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body {
      font-family: ${fontStack()};
      font-size: ${native ? 13.5 : 12.5}px;
      font-weight: 500;
      line-height: 1.5;
      direction: ${dir};
      text-align: ${start};
      padding: 18px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
    .ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; }
    .muted { color: #444; }

    .header {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding-bottom: 12px; border-bottom: 2.5px solid #111; margin-bottom: 14px;
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand img { max-height: 56px; max-width: 120px; object-fit: contain; }
    .brand-name { font-size: 21px; font-weight: 700; line-height: 1.25; }
    .brand-contact { font-size: 12px; color: #222; margin-top: 2px; }
    .doc-title { text-align: ${end}; flex-shrink: 0; }
    .doc-title .t1 { font-size: 18px; font-weight: 700; }
    .doc-title .t2 {
      display: inline-block; margin-top: 3px; padding: 1px 10px; border: 1px solid #111;
      border-radius: 999px; font-size: 11px; font-weight: 600;
    }
    .doc-title .meta { font-size: 12px; color: #222; margin-top: 4px; }

    .summary { display: grid; grid-template-columns: repeat(${totalAdvance > 0 ? 4 : 3}, 1fr); gap: 8px; margin-bottom: 14px; }
    .summary .box { border: 1px solid #000; border-radius: 6px; padding: 7px 10px; }
    .summary .lbl { font-size: 12px; font-weight: 600; color: #333; }
    .summary .val { font-size: 15px; font-weight: 700; margin-top: 1px; }
    .summary .blank { height: 22px; border-bottom: 1px dashed #333; }

    table.sheet { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.sheet thead { display: table-header-group; }
    table.sheet tfoot { display: table-row-group; }
    table.sheet th {
      color: #000; font-weight: 700; font-size: 12.5px;
      padding: 8px 8px; border: 1px solid #000; border-bottom: 2px solid #000; text-align: ${start};
    }
    table.sheet td {
      border: 1px solid #777; padding: 0 8px; height: 34px; vertical-align: middle; font-size: 13.5px; color: #000;
    }
    table.sheet tr { page-break-inside: avoid; break-inside: avoid; }
    .c-num { width: 7%; text-align: center !important; color: #222; }
    .c-name { width: 33%; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .c-phone { width: 20%; white-space: nowrap; }
    .c-balance { width: 18%; text-align: ${end} !important; font-weight: 700; white-space: nowrap; }
    .c-balance.is-payable { color: #222; font-weight: 600; }
    .c-received { width: 22%; }
    th.c-balance, th.c-received, th.c-num { text-align: center !important; }
    .tag { font-size: 11px; font-weight: 700; margin-${start}: 4px; padding: 0 5px; border: 1px solid #333; border-radius: 3px; }
    .empty { text-align: center; color: #333; height: 60px !important; }
    tfoot td { font-weight: 700; border-top: 2px solid #000 !important; border-bottom: 3px double #000 !important; height: 38px; }

    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 46px; break-inside: avoid; }
    .signatures div { border-top: 1px solid #333; padding-top: 5px; text-align: center; font-size: 11.5px; color: #333; }

    .no-print { text-align: center; margin: 24px 0 4px; }
    .btn { font-family: inherit; font-size: 13px; padding: 8px 18px; margin: 0 4px; border-radius: 6px; border: 1px solid #111; cursor: pointer; }
    .btn-primary { background: #111; color: #fff; }
    .btn-secondary { background: #fff; color: #111; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${data.companyLogo ? `<img src="${escapeHtml(data.companyLogo)}" alt="">` : ''}
      <div>
        <div class="brand-name">${escapeHtml(businessName)}</div>
        ${contactLine ? `<div class="brand-contact">${contactLine}</div>` : ''}
      </div>
    </div>
    <div class="doc-title">
      <div class="t1">${L.title}</div>
      <div class="t2">${L.subtitle}</div>
      <div class="meta">${L.printed_on}: <span class="ltr">${formatAppDate(now)} ${now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span></div>
    </div>
  </div>

  <div class="summary">
    <div class="box"><div class="lbl">${L.total_parties}</div><div class="val"><span class="ltr">${rows.length}</span></div></div>
    <div class="box"><div class="lbl">${L.total_owed}</div><div class="val"><span class="ltr">${money(totalOwed)}</span></div></div>
    ${totalAdvance > 0 ? `<div class="box"><div class="lbl">${L.total_advance}</div><div class="val"><span class="ltr">${money(totalAdvance)}</span></div></div>` : ''}
    <div class="box"><div class="lbl">${L.total_settled}</div><div class="blank"></div></div>
  </div>

  <table class="sheet">
    <thead>
      <tr>
        <th class="c-num">${L.col_number}</th>
        <th class="c-name">${L.col_name}</th>
        <th class="c-phone">${L.col_phone}</th>
        <th class="c-balance">${L.col_balance}</th>
        <th class="c-received">${L.col_settled}</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    ${rows.length ? `<tfoot>
      <tr>
        <td colspan="3">${L.grand_total}</td>
        <td class="c-balance"><span class="ltr">${money(totalOwed - totalAdvance)}</span></td>
        <td class="c-received"></td>
      </tr>
    </tfoot>` : ''}
  </table>

  <div class="signatures">
    <div>${L.prepared_by}</div>
    <div>${L.settled_by}</div>
    <div>${L.checked_by}</div>
  </div>

  <div class="no-print">
    <button type="button" class="btn btn-primary" onclick="window.print()">${L.print}</button>
    <button type="button" class="btn btn-secondary" onclick="window.close()">${L.close}</button>
  </div>
</body>
</html>`
}
