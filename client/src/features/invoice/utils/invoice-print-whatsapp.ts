import type { PrintInvoiceData } from './print-utils'
import type { InvoiceLanguage } from './language'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { resolveCustomerIdString } from './invoice-print-contact-bridge'
import { buildInvoiceSmsMessage } from '@/utils/sms-messages'

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
  send_sms: string
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
    smsSending: string
    smsSent: string
    smsFailed: string
    smsNoBridge: string
    smsPhone: string
    smsMessage: string
    smsTitle: string
    smsCancel: string
    smsSend: string
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
    send_sms: en ? 'Send SMS' : 'ایس ایم ایس بھیجیں',
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
        ? 'WhatsApp is not connected. Open Settings → WhatsApp and connect via Meta Embedded Signup.'
        : 'واٹس ایپ منسلک نہیں۔ Settings → WhatsApp کھولیں اور Meta Embedded Signup سے منسلک کریں۔',
      noBridge: en
        ? 'Could not reach the app. Close this window and send again from the invoice screen.'
        : 'ایپ سے رابطہ نہیں ہوا۔ یہ ونڈو بند کریں اور انوائس اسکرین سے دوبارہ بھیجیں۔',
      pdfHint: en
        ? 'Sends invoice PDF through your connected WhatsApp — connect in Settings → WhatsApp.'
        : 'انوائس PDF آپ کے منسلک واٹس ایپ سے بھیجی جاتی ہے — Settings → WhatsApp میں منسلک کریں۔',
      savePdfFailed: en ? 'Could not save PDF' : 'PDF محفوظ نہیں ہو سکی',
      smsSending: en ? 'Sending SMS…' : 'ایس ایم ایس بھیجا جا رہا ہے…',
      smsSent: en ? 'SMS Sent!' : 'ایس ایم ایس بھیج دیا گیا!',
      smsFailed: en ? 'Could not send SMS' : 'ایس ایم ایس نہیں بھیجا جا سکا',
      smsNoBridge: en
        ? 'Could not reach the app. Close this window and send again from the invoice screen.'
        : 'ایپ سے رابطہ نہیں ہوا۔ یہ ونڈو بند کریں اور انوائس اسکرین سے دوبارہ بھیجیں۔',
      smsPhone: en ? 'Phone Number' : 'فون نمبر',
      smsMessage: en ? 'Message' : 'پیغام',
      smsTitle: en ? 'Send Invoice SMS' : 'انوائس ایس ایم ایس بھیجیں',
      smsCancel: en ? 'Cancel' : 'منسوخ کریں',
      smsSend: en ? 'Send SMS' : 'ایس ایم ایس بھیجیں',
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
  const customerName = resolvePrintCustomerLabel(data)
  const balance = resolvePrintBalanceAmount(data)
  const phone = data.customerPhone?.trim() || ''
  const isRegisteredCustomer = Boolean(customerIdStr) && data.customerId !== 'walk-in'
  const previousBalance = data.previousBalance != null ? Number(data.previousBalance) : undefined
  const newBalance = data.newBalance != null
    ? Number(data.newBalance)
    : previousBalance != null
      ? previousBalance + Number(data.total ?? 0) - Number(data.paidAmount ?? 0)
      : undefined
  const smsDefaultMessage = buildInvoiceSmsMessage({
    branchName: companyName || undefined,
    invoiceNumber: data.invoiceNumber,
    customerName: customerName !== 'Customer' ? customerName : undefined,
    total: Number(data.total ?? 0),
    paidAmount: data.paidAmount != null ? Number(data.paidAmount) : undefined,
    previousBalance,
    newBalance,
  })

  const meta = {
    invoiceNumber: data.invoiceNumber,
    customerId: customerIdStr,
    customerName,
    invoiceDate: formatInvoiceDateForFilename(data),
    balanceAmount: balance,
    pdfFilename,
    phone,
    whatsapp: data.customerWhatsapp?.trim() || phone,
    companyName,
    message: labels.whatsappMessage(data.invoiceNumber, companyName),
    smsMessage: smsDefaultMessage,
    pdfHint: labels.alerts.pdfHint,
    btnLabel: labels.send_whatsapp,
    btnSmsLabel: labels.send_sms,
    savePdfLabel: labels.save_pdf,
    alerts: labels.alerts,
    settingsPath: labels.settingsWhatsAppPath,
  }
  const metaJson = escapeJsonForHtmlScript(meta)
  const showWhatsApp = WHATSAPP_UI_ENABLED && isRegisteredCustomer
  const showSms = isRegisteredCustomer

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
      ${
        showSms
          ? `<button type="button" id="btn-sms" onclick="window.__showInvoiceSmsDialog && window.__showInvoiceSmsDialog()" class="print-btn print-btn-sms">
        ${labels.send_sms}
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

  /**
   * Capture invoice HTML as a true A4-page PDF (does not use jspdf.html - needs html2canvas
   * on window). Two earlier approaches both had real problems: slicing one tall screenshot
   * across fixed-height pages re-drew the same image at shifting offsets and could show a row
   * twice at the slice boundary; capturing everything as one giant custom-height page avoided
   * that but no longer looked like "A4" (a 13-item invoice came out taller than two A4 sheets
   * stacked). The generator already splits the invoice into complete .invoice-print-page
   * chunks sized for one real A4 sheet each (never mid-row) - capturing each chunk on its own
   * true 210x297mm page reuses that boundary instead of guessing one from pixels, so it's
   * always genuine A4 proportions, one PDF page per chunk, with zero risk of duplicating a row.
   */
  window.__buildInvoicePdfBlob = async function (root) {
    await window.__ensureInvoicePdfLibraries();
    var html2canvas = window.html2canvas;
    var jsPDF = window.jspdf.jsPDF;

    var actionsBar = document.querySelector('.print-actions-bar');
    var prevBarDisplay = actionsBar ? actionsBar.style.display : '';
    if (actionsBar) actionsBar.style.display = 'none';

    // The on-screen "floating card" look (narrow centered width, shadow, rounded corners) comes
    // from an @media screen rule that may itself be !important (the A4-half/two-up landscape
    // layout sets max-width: 1200px !important on body) - plain el.style.x = 'none' cannot beat
    // an !important stylesheet rule, only setProperty with 'important' can. And patching this
    // only inside html2canvas's onclone callback still measured captureWidth beforehand from
    // the LIVE (still-narrow) element, so the virtual viewport stayed narrow regardless of what
    // the clone's CSS said - the fix has to happen on the real document, with !important,
    // before measuring, so the browser actually reflows wide. Restored in finally.
    function setImportant(el, prop, value) {
      el.style.setProperty(prop, value, 'important');
    }
    var bodyEl = document.body;
    var prevBodyCss = bodyEl.style.cssText;
    setImportant(bodyEl, 'max-width', 'none');
    setImportant(bodyEl, 'width', '100%');
    setImportant(bodyEl, 'margin', '0');
    setImportant(bodyEl, 'box-shadow', 'none');
    setImportant(bodyEl, 'border-radius', '0');

    var rootEl = document.getElementById('invoice-print-root');
    var prevRootCss = rootEl ? rootEl.style.cssText : null;
    if (rootEl) {
      setImportant(rootEl, 'max-width', 'none');
      setImportant(rootEl, 'width', '100%');
      setImportant(rootEl, 'margin', '0');
      setImportant(rootEl, 'box-shadow', 'none');
      setImportant(rootEl, 'border-radius', '0');
      setImportant(rootEl, 'background', '#ffffff');
    }

    try {
      var margin = 8;
      var pageWidthMM = 210;
      var pageHeightMM = 297;
      var printableWidthMM = pageWidthMM - margin * 2;
      var printableHeightMM = pageHeightMM - margin * 2;

      var pageEls = root.querySelectorAll('.invoice-print-page');
      var chunks = pageEls.length ? Array.prototype.slice.call(pageEls) : [root];

      var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // Standard A4 CSS-pixel width at 96dpi (210mm), same constant used for the template
      // preview thumbnails in Settings -> Printing. Capturing at a FIXED width — rather than
      // whatever size the popup window happens to be (900px for A4, but a Save/WhatsApp click
      // right after opening, or a resized window, can catch it narrower) — is what makes
      // wrapping/font proportions match true print layout consistently every time, instead of
      // varying with window size (a long name that fit on one line in a wide window would wrap
      // differently in the PDF if capture width depended on the live window's current size).
      var A4_CSS_WIDTH_PX = 794;

      for (var i = 0; i < chunks.length; i++) {
        var chunk = chunks[i];
        var prevChunkCss = chunk.style.cssText;
        // Fixed width, not 100% — 100% would still just resolve to whatever the popup window's
        // current (variable) size is, defeating the point of a fixed reference width.
        setImportant(chunk, 'max-width', 'none');
        setImportant(chunk, 'width', A4_CSS_WIDTH_PX + 'px');
        setImportant(chunk, 'margin', '0');

        // Measured AFTER setting the fixed width above, so this reflects the true height at
        // that exact width — not at whatever the popup window's current size happens to be.
        var captureWidth = A4_CSS_WIDTH_PX;
        var captureHeight = chunk.scrollHeight || undefined;

        var canvas = await html2canvas(chunk, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: -window.scrollY,
          // Sizing html2canvas's virtual window to the chunk's own full height up front avoids
          // the internal scroll-and-stitch capture that used to duplicate a row.
          windowWidth: captureWidth,
          windowHeight: captureHeight,
          onclone: function (clonedDoc) {
            clonedDoc.querySelectorAll('.no-print').forEach(function (el) {
              el.style.display = 'none';
              el.style.visibility = 'hidden';
            });
          },
        });

        chunk.style.cssText = prevChunkCss;

        var naturalHeight = (canvas.height * printableWidthMM) / canvas.width;
        // Only shrinks (never stretches) if a chunk is unexpectedly taller than one real A4
        // page — normal case is naturalHeight <= printableHeightMM and scale stays 1.
        var fitScale = naturalHeight > printableHeightMM ? printableHeightMM / naturalHeight : 1;
        var imgWidth = printableWidthMM * fitScale;
        var imgHeight = naturalHeight * fitScale;

        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgWidth, imgHeight);
      }

      return pdf.output('blob');
    } finally {
      bodyEl.style.cssText = prevBodyCss;
      if (rootEl && prevRootCss !== null) {
        rootEl.style.cssText = prevRootCss;
      }
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

  window.__showInvoiceSmsDialog = function () {
    var meta = JSON.parse(document.getElementById('invoice-print-meta').textContent);
    var overlay = document.createElement('div');
    overlay.id = 'sms-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';

    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#fff;border-radius:10px;padding:22px 24px;max-width:420px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,0.22);font-family:sans-serif';

    var title = document.createElement('h3');
    title.textContent = meta.alerts.smsTitle || 'Send Invoice SMS';
    title.style.cssText = 'margin:0 0 16px;font-size:15px;font-weight:700;color:#111';

    var phoneLabel = document.createElement('label');
    phoneLabel.textContent = (meta.alerts.smsPhone || 'Phone Number') + ':';
    phoneLabel.style.cssText = 'display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#374151';

    var phoneInput = document.createElement('input');
    phoneInput.type = 'text';
    phoneInput.value = meta.phone || '';
    phoneInput.readOnly = true;
    phoneInput.style.cssText = 'width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;margin-bottom:12px;box-sizing:border-box;font-size:14px;outline:none;background:#f3f4f6;color:#374151;cursor:default';

    var msgLabel = document.createElement('label');
    msgLabel.textContent = (meta.alerts.smsMessage || 'Message') + ':';
    msgLabel.style.cssText = 'display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#374151';

    var charCount = document.createElement('span');
    charCount.style.cssText = 'float:right;font-size:11px;color:#6b7280;font-weight:400';
    charCount.textContent = (meta.smsMessage || '').length + ' chars';
    msgLabel.appendChild(charCount);

    var msgTextarea = document.createElement('textarea');
    msgTextarea.rows = 7;
    msgTextarea.value = meta.smsMessage || '';
    msgTextarea.style.cssText = 'width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;margin-bottom:14px;box-sizing:border-box;font-size:13px;resize:vertical;line-height:1.5;outline:none';
    msgTextarea.addEventListener('input', function() {
      charCount.textContent = msgTextarea.value.length + ' chars';
    });
    msgTextarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBtn.click(); }
    });

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = meta.alerts.smsCancel || 'Cancel';
    cancelBtn.style.cssText = 'padding:8px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;font-weight:500';
    cancelBtn.onclick = function() { document.body.removeChild(overlay); };

    var sendBtn = document.createElement('button');
    sendBtn.textContent = meta.alerts.smsSend || 'Send SMS';
    sendBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-size:14px;font-weight:600';
    sendBtn.onclick = async function() {
      var phone = phoneInput.value.trim();
      var msg = msgTextarea.value.trim();
      if (!phone || !msg) { alert('Phone and message are required'); return; }
      if (!window.opener || !window.opener.__sendInvoiceSmsViaGateway) {
        alert(meta.alerts.smsNoBridge || 'Could not reach the app. Close this window and send again.');
        return;
      }
      sendBtn.disabled = true;
      cancelBtn.disabled = true;
      sendBtn.textContent = meta.alerts.smsSending || 'Sending…';
      var result = await window.opener.__sendInvoiceSmsViaGateway({ to: phone, message: msg, source: 'invoice-print' });
      if (result && result.success) {
        document.body.removeChild(overlay);
        var toast = document.createElement('div');
        toast.textContent = meta.alerts.smsSent || 'SMS Sent!';
        toast.style.cssText = 'position:fixed;top:16px;right:16px;background:#16a34a;color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:700;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
        document.body.appendChild(toast);
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
      } else {
        sendBtn.disabled = false;
        cancelBtn.disabled = false;
        sendBtn.textContent = meta.alerts.smsSend || 'Send SMS';
        alert((meta.alerts.smsFailed || 'Could not send SMS') + (result && result.error ? ': ' + result.error : ' — is a device connected?'));
      }
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(sendBtn);
    dialog.appendChild(title);
    dialog.appendChild(phoneLabel);
    dialog.appendChild(phoneInput);
    dialog.appendChild(msgLabel);
    dialog.appendChild(msgTextarea);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    setTimeout(function() { msgTextarea.focus(); msgTextarea.selectionStart = msgTextarea.selectionEnd = msgTextarea.value.length; }, 50);
    phoneInput.focus();
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
    .print-btn-sms {
      background: #2563eb;
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
