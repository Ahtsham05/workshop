import type { PrintInvoiceData } from './print-utils'
import type { InvoiceLanguage } from './language'
import { resolveCustomerIdString } from './invoice-print-contact-bridge'

/** Balance / amount due shown on the printed invoice (for PDF filename). */
export function resolvePrintBalanceAmount(data: PrintInvoiceData): number {
  if (data.newBalance != null && !Number.isNaN(Number(data.newBalance))) {
    return Math.round(Math.abs(Number(data.newBalance)) * 100) / 100
  }
  if (data.netBalance != null && !Number.isNaN(Number(data.netBalance))) {
    return Math.round(Math.abs(Number(data.netBalance)) * 100) / 100
  }
  const previousBalance = Number(data.previousBalance) || 0
  const currentInvoice = Number(data.total) || 0
  const paid = Number(data.paidAmount) || 0
  return Math.round(Math.abs(previousBalance + currentInvoice - paid) * 100) / 100
}

export function resolvePrintCustomerLabel(data: PrintInvoiceData): string {
  if (data.customerId === 'walk-in') {
    return (data.walkInCustomerName || 'Walk-in').trim()
  }
  if (data.printInUrdu) {
    return (data.customerNameUrdu || data.customerName || 'Customer').trim()
  }
  return (data.customerName || data.customerNameUrdu || 'Customer').trim()
}

function sanitizeFilenamePart(value: string, maxLen = 48): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!cleaned) return 'Customer'
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned
}

function formatInvoiceDateForFilename(data: PrintInvoiceData): string {
  const raw = data.invoiceDate?.trim()
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10)
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

/** e.g. Invoice-Shabir-Jutt-2026-05-20-Bal-5800-INV-202605-000251.pdf */
export function buildInvoicePdfDownloadFilename(data: PrintInvoiceData): string {
  const customer = sanitizeFilenamePart(resolvePrintCustomerLabel(data))
  const date = formatInvoiceDateForFilename(data)
  const balance = String(resolvePrintBalanceAmount(data)).replace(/\./g, '_')
  const inv = sanitizeFilenamePart(String(data.invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '-'), 64)
  return `Invoice-${customer}-${date}-Bal-${balance}-${inv}.pdf`
}

export function resolveInvoiceCustomerContact(
  invoice: { customerId?: unknown },
  customer?: { phone?: string; whatsapp?: string } | null,
): { phone?: string; whatsapp?: string } {
  const cid = invoice?.customerId
  if (cid && typeof cid === 'object' && cid !== null) {
    const o = cid as { phone?: string; whatsapp?: string }
    const phone = o.phone?.trim()
    const whatsapp = o.whatsapp?.trim()
    if (phone || whatsapp) {
      return { phone: phone || undefined, whatsapp: whatsapp || phone || undefined }
    }
  }
  const fromCustomer = {
    phone: customer?.phone?.trim() || undefined,
    whatsapp: customer?.whatsapp?.trim() || undefined,
  }
  if (fromCustomer.phone || fromCustomer.whatsapp) {
    return {
      phone: fromCustomer.phone,
      whatsapp: fromCustomer.whatsapp || fromCustomer.phone,
    }
  }
  return {}
}

/** Attach customer phone / WhatsApp for print-window send action. */
export function withCustomerContactForPrint(
  printData: PrintInvoiceData,
  invoice: { customerId?: unknown },
  customer?: { phone?: string; whatsapp?: string } | null,
): PrintInvoiceData {
  const existingPhone = printData.customerPhone?.trim()
  const existingWhatsapp = printData.customerWhatsapp?.trim()
  if (existingPhone || existingWhatsapp) {
    return {
      ...printData,
      customerPhone: existingPhone || existingWhatsapp,
      customerWhatsapp: existingWhatsapp || existingPhone,
    }
  }
  const { phone, whatsapp } = resolveInvoiceCustomerContact(invoice, customer)
  return {
    ...printData,
    customerPhone: phone || whatsapp,
    customerWhatsapp: whatsapp || phone,
  }
}

export type PrintActionsLabels = {
  print_options: string
  print_primary: string
  close: string
  send_whatsapp: string
  save_pdf: string
  alerts: {
    noPhone: string
    promptPhone: string
    preparing: string
    sending: string
    sent: string
    failed: string
    notConnected: string
    noBridge: string
    pdfHint: string
    savePdfFailed: string
  }
  settingsWhatsAppPath: string
  whatsappMessage: (invoiceNumber: string, companyName: string) => string
}

export function buildPrintActionsLabels(
  lang: InvoiceLanguage,
  format: 'receipt' | 'a4',
  receiptPrintLabel: string,
  a4PrintLabel: string,
): PrintActionsLabels {
  const en = lang !== 'ur'
  return {
    print_options: en ? 'Print Options' : 'پرنٹ آپشنز',
    print_primary: format === 'receipt' ? receiptPrintLabel : a4PrintLabel,
    close: en ? 'Close' : 'بند کریں',
    send_whatsapp: en ? 'Send on WhatsApp' : 'واٹس ایپ پر بھیجیں',
    save_pdf: en ? 'Save as PDF' : 'PDF محفوظ کریں',
    alerts: {
      noPhone: en
        ? 'Customer has no phone or WhatsApp number. Add it in Customers or enter a number when prompted.'
        : 'کسٹمر کا فون/واٹس ایپ نمبر نہیں۔ کسٹمر میں شامل کریں یا پوچھے گئے خانے میں درج کریں۔',
      promptPhone: en
        ? 'Enter customer WhatsApp / mobile number:'
        : 'کسٹمر کا واٹس ایپ / موبائل نمبر درج کریں:',
      preparing: en ? 'Preparing PDF…' : 'PDF تیار ہو رہی ہے…',
      sending: en ? 'Sending PDF on WhatsApp…' : 'واٹس ایپ پر PDF بھیجی جا رہی ہے…',
      sent: en ? 'Sent on WhatsApp' : 'واٹس ایپ پر بھیج دی گئی',
      failed: en ? 'Could not send invoice' : 'انوائس نہیں بھیجی جا سکی',
      notConnected: en
        ? 'WhatsApp is not ready. Open Settings → WhatsApp and configure Meta Cloud API (recommended) or connect local QR.'
        : 'واٹس ایپ تیار نہیں۔ Settings → WhatsApp میں Meta Cloud API سیٹ کریں یا مقامی QR منسلک کریں۔',
      noBridge: en
        ? 'Could not reach the app. Close this window and send again from the invoice screen.'
        : 'ایپ سے رابطہ نہیں ہوا۔ یہ ونڈو بند کریں اور انوائس اسکرین سے دوبارہ بھیجیں۔',
      pdfHint: en
        ? 'Sends invoice PDF via Meta WhatsApp Cloud API or local connection — configure in Settings → WhatsApp.'
        : 'انوائس PDF Meta Cloud API یا مقامی کنکشن سے بھیجی جاتی ہے — Settings → WhatsApp میں ترتیب دیں۔',
      savePdfFailed: en ? 'Could not save PDF' : 'PDF محفوظ نہیں ہو سکی',
    },
    settingsWhatsAppPath: '/settings/whatsapp',
    whatsappMessage: (invoiceNumber, companyName) =>
      en
        ? `Invoice ${invoiceNumber}${companyName ? ` from ${companyName}` : ''}`
        : `انوائس ${invoiceNumber}${companyName ? ` — ${companyName}` : ''}`,
  }
}

function escapeJsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Footer buttons + WhatsApp PDF script for print popup windows. */
export function buildPrintWindowActionsBlock(
  data: PrintInvoiceData,
  labels: PrintActionsLabels,
): string {
  const companyName =
    (data.printInUrdu ? data.companyNameUrdu || data.companyName : data.companyName || data.companyNameUrdu) ||
    ''
  const customerIdStr = resolveCustomerIdString(data.customerId) || ''
  const pdfFilename = buildInvoicePdfDownloadFilename(data)
  const meta = {
    invoiceNumber: data.invoiceNumber,
    customerId: customerIdStr,
    customerName: resolvePrintCustomerLabel(data),
    invoiceDate: formatInvoiceDateForFilename(data),
    balanceAmount: resolvePrintBalanceAmount(data),
    pdfFilename,
    phone: data.customerPhone || '',
    whatsapp: data.customerWhatsapp || data.customerPhone || '',
    companyName,
    message: labels.whatsappMessage(data.invoiceNumber, companyName),
    pdfHint: labels.alerts.pdfHint,
    btnLabel: labels.send_whatsapp,
    savePdfLabel: labels.save_pdf,
    alerts: labels.alerts,
    settingsPath: labels.settingsWhatsAppPath,
  }
  const metaJson = escapeJsonForHtmlScript(meta)
  const showWhatsApp = Boolean(customerIdStr) && data.customerId !== 'walk-in'

  return `
  <script type="application/json" id="invoice-print-meta">${metaJson}</script>
  <div class="no-print print-actions-bar">
    <div class="print-actions-title">${labels.print_options}</div>
    <div class="print-actions">
      <button type="button" onclick="window.print()" class="print-btn print-btn-primary">
        ${labels.print_primary}
      </button>
      ${
        showWhatsApp
          ? `<button type="button" id="btn-whatsapp" onclick="window.__sendInvoiceWhatsApp && window.__sendInvoiceWhatsApp()" class="print-btn print-btn-whatsapp">
        ${labels.send_whatsapp}
      </button>`
          : ''
      }
      <button type="button" id="btn-save-pdf" onclick="window.__saveInvoicePdf && window.__saveInvoicePdf()" class="print-btn print-btn-save-pdf">
        ${labels.save_pdf}
      </button>
      <button type="button" onclick="window.close()" class="print-btn print-btn-secondary">
        ${labels.close}
      </button>
    </div>
    ${showWhatsApp ? `<p class="whatsapp-hint">${labels.alerts.pdfHint}</p>` : ''}
  </div>
  <script>
  window.__PDF_LIB_HTML2CANVAS = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  window.__PDF_LIB_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@3.0.1/dist/jspdf.umd.min.js';

  window.__loadExternalScript = function (src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('Failed to load ' + src)); });
        return;
      }
      var el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.setAttribute('data-src', src);
      el.onload = function () {
        el.setAttribute('data-loaded', '1');
        resolve();
      };
      el.onerror = function () {
        reject(new Error('Failed to load ' + src));
      };
      document.head.appendChild(el);
    });
  };

  window.__ensureInvoicePdfLibraries = function () {
    if (!window.__invoicePdfLibsPromise) {
      window.__invoicePdfLibsPromise = window.__loadExternalScript(window.__PDF_LIB_HTML2CANVAS)
        .then(function () {
          if (!window.html2canvas) {
            throw new Error('html2canvas failed to initialize');
          }
          return window.__loadExternalScript(window.__PDF_LIB_JSPDF);
        })
        .then(function () {
          if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF failed to initialize');
          }
        });
    }
    return window.__invoicePdfLibsPromise;
  };

  /** Capture invoice HTML as a multi-page A4 PDF (does not use jspdf.html — needs html2canvas on window). */
  window.__buildInvoicePdfBlob = async function (root) {
    await window.__ensureInvoicePdfLibraries();
    var html2canvas = window.html2canvas;
    var jsPDF = window.jspdf.jsPDF;

    var actionsBar = document.querySelector('.print-actions-bar');
    var prevBarDisplay = actionsBar ? actionsBar.style.display : '';
    if (actionsBar) actionsBar.style.display = 'none';

    try {
      var canvas = await html2canvas(root, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: Math.max(root.scrollWidth || 0, root.offsetWidth || 0, 720),
        onclone: function (clonedDoc) {
          clonedDoc.querySelectorAll('.no-print').forEach(function (el) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
          });
          var clonedRoot = clonedDoc.getElementById('invoice-print-root');
          if (clonedRoot) {
            clonedRoot.style.background = '#ffffff';
            clonedRoot.style.boxShadow = 'none';
          }
        },
      });

      var imgData = canvas.toDataURL('image/jpeg', 0.92);
      var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      var pageWidth = pdf.internal.pageSize.getWidth();
      var pageHeight = pdf.internal.pageSize.getHeight();
      var margin = 8;
      var printableWidth = pageWidth - margin * 2;
      var printableHeight = pageHeight - margin * 2;
      var imgWidth = printableWidth;
      var imgHeight = (canvas.height * imgWidth) / canvas.width;
      var heightLeft = imgHeight;
      var position = 0;

      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
      heightLeft -= printableHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position + margin, imgWidth, imgHeight);
        heightLeft -= printableHeight;
      }

      return pdf.output('blob');
    } finally {
      if (actionsBar) actionsBar.style.display = prevBarDisplay;
    }
  };

  window.__normalizeWhatsAppIntl = function (phone) {
    var digits = String(phone || '').replace(/\\D/g, '');
    if (!digits) return '';
    if (digits.indexOf('92') === 0) return digits;
    if (digits.indexOf('0') === 0) return '92' + digits.slice(1);
    return '92' + digits;
  };

  window.__blobToPdfBase64 = function (blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        var base64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  window.__resolveInvoiceWhatsAppPhone = async function (meta) {
    var phone = (meta.whatsapp || meta.phone || '').trim();
    if (phone) return phone;
    var cid = meta.customerId;
    if (cid && window.opener && window.opener.__invoicePrintContactById && window.opener.__invoicePrintContactById[cid]) {
      var cached = window.opener.__invoicePrintContactById[cid];
      phone = (cached.whatsapp || cached.phone || '').trim();
      if (phone) return phone;
    }
    if (cid && window.opener && window.opener.__fetchCustomerContactForInvoicePrint) {
      try {
        var fetched = await window.opener.__fetchCustomerContactForInvoicePrint(cid);
        phone = (fetched.whatsapp || fetched.phone || '').trim();
        if (phone) return phone;
      } catch (e) {}
    }
    var entered = prompt(meta.alerts.promptPhone || 'Enter WhatsApp number:');
    return (entered || '').trim();
  };

  window.__downloadPdfBlob = function (blob, filename) {
    var blobUrl = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'invoice.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(blobUrl);
    }, 2000);
  };

  window.__saveInvoicePdf = async function () {
    var meta = JSON.parse(document.getElementById('invoice-print-meta').textContent);
    var btn = document.getElementById('btn-save-pdf');
    var btnLabel = meta.savePdfLabel || 'Save as PDF';
    if (btn) {
      btn.disabled = true;
      btn.textContent = meta.alerts.preparing || 'Preparing PDF…';
    }
    try {
      var root = document.getElementById('invoice-print-root');
      if (!root) throw new Error('Print content missing');
      var blob;
      try {
        blob = await window.__buildInvoicePdfBlob(root);
      } catch (pdfErr) {
        if (window.opener && window.opener.__buildInvoicePdfInOpener) {
          blob = await window.opener.__buildInvoicePdfInOpener(root.outerHTML);
        } else {
          throw pdfErr;
        }
      }
      var filename = meta.pdfFilename || ('Invoice-' + (meta.invoiceNumber || 'invoice') + '.pdf');
      window.__downloadPdfBlob(blob, filename);
    } catch (err) {
      alert((meta.alerts.savePdfFailed || 'Could not save PDF') + (err && err.message ? ': ' + err.message : ''));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btnLabel;
      }
    }
  };

  window.__sendInvoiceWhatsApp = async function () {
    var meta = JSON.parse(document.getElementById('invoice-print-meta').textContent);
    var btn = document.getElementById('btn-whatsapp');
    var btnLabel = meta.btnLabel;
    if (btn) {
      btn.disabled = true;
      btn.textContent = meta.alerts.preparing;
    }
    try {
      var phone = await window.__resolveInvoiceWhatsAppPhone(meta);
      if (!phone) {
        alert(meta.alerts.noPhone);
        return;
      }
      var intl = window.__normalizeWhatsAppIntl(phone);
      if (!intl) {
        alert(meta.alerts.noPhone);
        return;
      }
      var chatMessage = meta.message || ('Invoice ' + (meta.invoiceNumber || ''));

      var root = document.getElementById('invoice-print-root');
      if (!root) throw new Error('Print content missing');

      var blob;
      try {
        blob = await window.__buildInvoicePdfBlob(root);
      } catch (pdfErr) {
        if (window.opener && window.opener.__buildInvoicePdfInOpener) {
          blob = await window.opener.__buildInvoicePdfInOpener(root.outerHTML);
        } else {
          throw pdfErr;
        }
      }
      var filename = meta.pdfFilename || ('Invoice-' + String(meta.invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '-') + '.pdf');
      var pdfBase64 = await window.__blobToPdfBase64(blob);

      if (!window.opener || !window.opener.__sendInvoicePdfViaWhatsApp) {
        alert(meta.alerts.noBridge);
        return;
      }

      if (btn) btn.textContent = meta.alerts.sending || 'Sending…';
      var sendResult = await window.opener.__sendInvoicePdfViaWhatsApp({
        phone: phone,
        pdfBase64: pdfBase64,
        filename: filename,
        caption: chatMessage,
        invoiceNumber: meta.invoiceNumber,
      });

      if (!sendResult || !sendResult.success) {
        var errText = (sendResult && sendResult.error) || meta.alerts.failed;
        if (errText && /not connected/i.test(errText)) {
          alert(meta.alerts.notConnected + '\\n\\n' + errText);
          if (meta.settingsPath && window.opener && !window.opener.closed) {
            try {
              window.opener.focus();
              if (window.opener.location && window.opener.location.pathname !== meta.settingsPath) {
                window.opener.location.href = meta.settingsPath;
              }
            } catch (navErr) {}
          }
        } else {
          alert(meta.alerts.failed + (errText ? ': ' + errText : ''));
        }
        return;
      }

      if (btn) btn.textContent = meta.alerts.sent || 'Sent';
      setTimeout(function () {
        if (btn) btn.textContent = btnLabel;
      }, 2500);
    } catch (err) {
      alert(meta.alerts.failed + (err && err.message ? ': ' + err.message : ''));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btnLabel;
      }
    }
  };
  <\/script>
  `
}

export const printActionsBarStyles = `
    .print-actions-bar {
      margin-top: 24px;
      padding: 16px;
      text-align: center;
      border-top: 2px dashed #ccc;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .print-actions-title {
      font-weight: bold;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .print-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
      align-items: center;
    }
    .print-btn {
      padding: 10px 18px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    }
    .print-btn-primary {
      background: #007bff;
      color: white;
    }
    .print-btn-secondary {
      background: #6c757d;
      color: white;
    }
    .print-btn-whatsapp {
      background: #25d366;
      color: white;
    }
    .print-btn-save-pdf {
      background: #0d6efd;
      color: white;
    }
    .print-btn:disabled {
      opacity: 0.65;
      cursor: wait;
    }
    .whatsapp-hint {
      margin: 12px 0 0;
      font-size: 11px;
      color: #444;
      line-height: 1.4;
    }
    .whatsapp-hint-muted {
      color: #888;
    }
    #invoice-print-root {
      background: #fff;
    }
`
