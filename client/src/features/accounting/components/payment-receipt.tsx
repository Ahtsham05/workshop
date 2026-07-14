import { format } from 'date-fns';
import { paymentReceiptLabels, resolveInvoiceLanguage, type InvoiceLanguage } from '@/features/invoice/utils/language';
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils';
import { PAPER_FORMATS, useBranchPaperSize, type PaperSize } from '@/features/invoice/utils/paper-format';
import { PrintFormatButton } from '@/components/print-format-button';

function resolveReceiptPartyName(lang: InvoiceLanguage, name: string, nameUrdu?: string): string {
  return lang === 'ur' && nameUrdu?.trim() ? nameUrdu.trim() : name;
}

function resolveReceiptCompany(
  lang: InvoiceLanguage,
  company:
    | {
        name?: string;
        nameUrdu?: string;
        address?: string;
        addressUrdu?: string;
        phone?: string;
        email?: string;
        logo?: string;
      }
    | undefined
): { name: string; address: string; phone?: string; email?: string; logo?: string } {
  const c = company;
  const fallbackName = c?.name?.trim() || 'Logix Plus Solutions';
  const name = lang === 'ur' && c?.nameUrdu?.trim() ? c.nameUrdu.trim() : fallbackName;
  const address =
    lang === 'ur' ? (c?.addressUrdu?.trim() || c?.address?.trim() || '') : (c?.address?.trim() || '');
  return {
    name,
    address,
    phone: c?.phone,
    email: c?.email,
    logo: c?.logo,
  };
}

/** Clean Urdu + Latin stack — no Nastaliq / Jameel (aligned with sales & purchase prints). */
const RECEIPT_FONT_STACK = `'Inter', 'Manrope', 'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

const RECEIPT_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap';

interface PaymentReceiptProps {
  customer: {
    name: string;
    /** Shown when receipt language / user preference is Urdu */
    nameUrdu?: string;
    phone?: string;
    address?: string;
  };
  payment: {
    amount: number;
    date: string;
    reference?: string;
    paymentMethod?: string;
    description?: string;
  };
  balance: {
    previousBalance: number;
    currentBalance: number;
  };
  company?: {
    name: string;
    nameUrdu?: string;
    address?: string;
    /** Urdu address line(s); falls back to `address` when empty */
    addressUrdu?: string;
    phone?: string;
    email?: string;
    logo?: string;
  };
  receiptNumber?: string;
  userPreferredLanguage?: InvoiceLanguage;
  isTrial?: boolean;
}

export function PaymentReceipt({
  customer,
  payment,
  balance,
  company,
  receiptNumber,
  userPreferredLanguage,
  isTrial,
}: PaymentReceiptProps) {
  const language = resolveInvoiceLanguage({ userPreferredLanguage });
  const labels = paymentReceiptLabels[language];
  const isUrdu = language === 'ur';
  const dir = isUrdu ? 'rtl' : 'ltr';
  const startAlign = isUrdu ? 'right' : 'left';
  const locale = isUrdu ? 'ur-PK' : 'en-PK';

  const resolvedCompany = resolveReceiptCompany(language, company);
  const displayCustomerName = resolveReceiptPartyName(language, customer.name, customer.nameUrdu);
  const defaultPaperSize = useBranchPaperSize();

  const formatCurrency = (amount: number) => {
    return `Rs ${Math.abs(amount).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'PPP');
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const printReceipt = (paperSize: PaperSize = defaultPaperSize) => {
    const baseCompany = company || {
      name: 'Logix Plus Solutions',
      address: '',
      phone: '',
      email: '',
      logo: '',
    };
    const printCompany = resolveReceiptCompany(language, company);
    const printData = {
      customer: {
        ...customer,
        name: resolveReceiptPartyName(language, customer.name, customer.nameUrdu),
      },
      payment,
      balance,
      company: {
        ...baseCompany,
        name: printCompany.name,
        address: printCompany.address,
      },
      receiptNumber: receiptNumber || `RCP-${Date.now()}`,
      isTrial: isTrial ?? false,
    };

    const htmlContent = generateReceiptHTML(printData, paperSize);
    openPrintWindowForFormat(htmlContent, paperSize);
  };

  const generateReceiptHTML = (data: any, paperSize: PaperSize) => {
    const paperFormat = PAPER_FORMATS[paperSize];
    const cardWidth = (paperFormat.bodyWidthPx ?? 380) + (paperFormat.family === 'thermal' ? 80 : 220);
    return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${labels.payment_receipt} ${data.receiptNumber}</title>
  <style>
    @media print {
      @page {
        margin: ${paperFormat.pageMargin};
        size: ${paperFormat.pageCss};
      }
      body {
        margin: 0;
        padding: 0;
        font-size: ${paperFormat.baseFontPx - 1}px;
      }
      .no-print {
        display: none !important;
      }
    }

    body {
      font-family: ${RECEIPT_FONT_STACK};
      font-size: ${paperFormat.baseFontPx}px;
      line-height: 1.45;
      margin: 0;
      padding: 12px 14px;
      max-width: ${cardWidth}px;
      margin-left: auto;
      margin-right: auto;
      background: #fff;
      color: #111827;
      direction: ${dir};
      text-align: ${startAlign};
      -webkit-font-smoothing: antialiased;
      font-feature-settings: 'kern' 1;
    }

    .receipt-header {
      text-align: center;
      margin-bottom: 14px;
      border-bottom: 1px solid #1f2937;
      padding-bottom: 12px;
    }
    
    .company-logo {
      max-width: 120px;
      height: auto;
      margin: 0 auto 8px;
      display: block;
    }
    
    .business-name {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 6px;
      letter-spacing: 0.02em;
      color: #111827;
    }

    .business-info {
      font-size: 11px;
      margin-bottom: 2px;
      color: #4b5563;
      line-height: 1.4;
    }

    .receipt-title {
      font-size: 14px;
      font-weight: 700;
      margin: 10px 0 6px;
      color: #111827;
      border-bottom: none;
      text-decoration: none;
    }

    .receipt-info {
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px dashed #d1d5db;
    }

    .info-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
      gap: 10px 16px;
      align-items: baseline;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .info-label {
      font-weight: 600;
      color: #374151;
    }

    .info-row span:last-child {
      font-variant-numeric: tabular-nums;
      color: #111827;
      word-break: break-word;
    }

    .description-section {
      margin-bottom: 14px;
      padding: 10px 12px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }

    .payment-details {
      background: #fafafa;
      border: 1px solid #1f2937;
      border-radius: 6px;
      padding: 12px 14px;
      margin: 14px 0;
    }

    .amount-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: baseline;
      padding: 9px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 12px;
    }
    
    .amount-row:last-child {
      border-bottom: none;
    }
    
    .amount-row.total {
      font-size: 13px;
      font-weight: 700;
      border-top: 2px solid #111827;
      margin-top: 6px;
      padding-top: 10px;
      border-bottom: none;
    }

    .amount-paid {
      font-size: 14px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    
    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 22px;
      margin-bottom: 14px;
    }

    .signature-line {
      border-top: 1px solid #374151;
      padding-top: 8px;
      text-align: center;
      font-weight: 600;
      font-size: 10px;
      color: #374151;
    }

    .footer {
      text-align: center;
      font-size: 10px;
      margin-top: 14px;
      border-top: 1px solid #d1d5db;
      padding-top: 10px;
      color: #6b7280;
    }
    
    .footer-line {
      margin-bottom: 2px;
    }
    
    .no-print {
      text-align: center;
      margin: 20px 0;
      padding: 15px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 5px;
    }
    
    .print-btn {
      padding: 8px 16px;
      margin: 0 5px;
      font-size: 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
    }
    
    .print-btn-primary {
      background: #007bff;
      color: white;
    }
    
    .print-btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    @media screen {
      body {
        max-width: ${cardWidth}px;
        margin: 24px auto;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
        padding: 20px 22px;
        border-radius: 10px;
        border: 1px solid #e5e7eb;
      }
    }
  </style>
  <link href="${RECEIPT_GOOGLE_FONTS_HREF}" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    ${data.company.logo ? `<img src="${data.company.logo}" alt="" class="company-logo" />` : data.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus Solutions" class="company-logo" />` : ''}
    <div class="business-name">${data.company.name}</div>
    ${data.company.address ? `<div class="business-info">${data.company.address}</div>` : ''}
    ${data.company.phone || data.company.email ? `
      <div class="business-info">
        ${data.company.phone ? `${data.company.phone}` : ''}
        ${data.company.phone && data.company.email ? ' | ' : ''}
        ${data.company.email ? `${data.company.email}` : ''}
      </div>
    ` : ''}
    <div class="receipt-title">${labels.payment_receipt}</div>
    ${data.receiptNumber ? `<div class="business-info">${labels.receipt_no}: ${data.receiptNumber}</div>` : ''}
  </div>
  
  <div class="receipt-info">
    <div class="info-row">
      <span class="info-label">${labels.received_from}:</span>
      <span>${data.customer.name}</span>
    </div>
    ${data.customer.phone ? `
    <div class="info-row">
      <span class="info-label">${labels.phone}:</span>
      <span>${data.customer.phone}</span>
    </div>
    ` : ''}
    ${data.customer.address ? `
    <div class="info-row">
      <span class="info-label">${labels.address}:</span>
      <span>${data.customer.address}</span>
    </div>
    ` : ''}
    <div class="info-row">
      <span class="info-label">${labels.payment_date}:</span>
      <span>${formatDate(data.payment.date)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${labels.payment_time}:</span>
      <span>${formatTime(data.payment.date)}</span>
    </div>
    ${data.payment.paymentMethod ? `
    <div class="info-row">
      <span class="info-label">${labels.payment_method}:</span>
      <span>${data.payment.paymentMethod}</span>
    </div>
    ` : ''}
    ${data.payment.reference ? `
    <div class="info-row">
      <span class="info-label">${labels.reference}:</span>
      <span>${data.payment.reference}</span>
    </div>
    ` : ''}
  </div>
  
  ${data.payment.description ? `
  <div class="description-section">
    <div class="info-label">${labels.description}:</div>
    <div style="margin-top: 3px; font-size: 11px;">${data.payment.description}</div>
  </div>
  ` : ''}
  
  <div class="payment-details">
    <div class="amount-row">
      <span>${labels.previous_balance}:</span>
      <span>${formatCurrency(data.balance.previousBalance)}</span>
    </div>
    <div class="amount-row">
      <span>${labels.payment_received}:</span>
      <span class="amount-paid">${formatCurrency(data.payment.amount)}</span>
    </div>
    <div class="amount-row total">
      <span>${labels.remaining_balance}:</span>
      <span style="color: ${data.balance.currentBalance > 0 ? '#dc2626' : data.balance.currentBalance < 0 ? '#16a34a' : '#000'}">
        ${formatCurrency(data.balance.currentBalance)}
        ${data.balance.currentBalance > 0 ? ` (${labels.receivable})` : ''}
        ${data.balance.currentBalance < 0 ? ` (${labels.payable})` : ''}
        ${data.balance.currentBalance === 0 ? ` (${labels.settled})` : ''}
      </span>
    </div>
  </div>
  
  <div class="signature-section">
    <div>
      <div class="signature-line">${labels.received_by}</div>
    </div>
    <div>
      <div class="signature-line">${labels.customer_signature}</div>
    </div>
  </div>
  
  <div class="footer">
    <div class="footer-line"><strong>${labels.thank_you}</strong></div>
    <div class="footer-line">${labels.computer_generated}</div>
    <div class="footer-line" style="margin-top: 4px; font-style: italic;">${labels.powered_by}</div>
  </div>
  
  <div class="no-print">
    <button onclick="window.print()" class="print-btn print-btn-primary">
      🖨️ ${labels.print_receipt}
    </button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">
      ✕ ${labels.close}
    </button>
  </div>
</body>
</html>
    `.trim();
  };

  return (
    <div className="payment-receipt-container" dir={dir}>
      <style>
        {`
        .receipt-content {
          font-family: ${RECEIPT_FONT_STACK};
          color: #111827;
          background: #fff;
          font-size: 14px;
          line-height: 1.45;
          max-width: 420px;
          margin: 0 auto;
          padding: 22px 24px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
          -webkit-font-smoothing: antialiased;
        }

        .receipt-header {
          text-align: center;
          margin-bottom: 18px;
          border-bottom: 1px solid #1f2937;
          padding-bottom: 16px;
        }

        .company-name {
          font-size: 17px;
          font-weight: 700;
          margin-bottom: 8px;
          letter-spacing: 0.02em;
          color: #111827;
        }

        .receipt-title {
          font-size: 16px;
          font-weight: 700;
          margin: 12px 0 8px;
          color: #111827;
          text-decoration: none;
        }

        .receipt-number {
          font-size: 13px;
          color: #4b5563;
          margin-top: 6px;
        }

        .receipt-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin: 18px 0;
          align-items: stretch;
        }

        .info-section {
          border: 1px solid #e5e7eb;
          padding: 14px 16px;
          border-radius: 8px;
          background: #fafafa;
          min-height: 100%;
        }

        .info-label {
          font-weight: 600;
          font-size: 12px;
          color: #374151;
          margin-bottom: 4px;
        }

        .info-value {
          font-size: 14px;
          color: #111827;
          margin-bottom: 12px;
          font-variant-numeric: tabular-nums;
          word-break: break-word;
        }

        .info-value:last-child {
          margin-bottom: 0;
        }

        .payment-details {
          background: #fafafa;
          border: 1px solid #1f2937;
          border-radius: 8px;
          padding: 14px 16px;
          margin: 18px 0;
        }

        .amount-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: baseline;
          padding: 10px 0;
          border-bottom: 1px solid #e5e7eb;
          font-size: 13px;
          color: #111827;
        }

        .amount-row:last-child {
          border-bottom: none;
        }

        .amount-row.total {
          font-size: 13px;
          font-weight: 700;
          border-top: 2px solid #111827;
          margin-top: 6px;
          padding-top: 12px;
          border-bottom: none;
        }

        .amount-paid {
          font-size: 15px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .signature-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 28px;
        }

        .signature-line {
          border-top: 1px solid #374151;
          padding-top: 8px;
          text-align: center;
          font-weight: 600;
          font-size: 11px;
          color: #374151;
        }

        .notes {
          margin-top: 18px;
          font-size: 11px;
          color: #6b7280;
          text-align: center;
          line-height: 1.5;
          border-top: 1px solid #e5e7eb;
          padding-top: 12px;
        }
        `}
      </style>

      <div className="receipt-content">
        <div className="receipt-header">
          <div className="company-name">{resolvedCompany.name}</div>
          {resolvedCompany.address?.trim() ? (
            <div style={{ fontSize: '12px', marginBottom: '6px', color: '#4b5563', lineHeight: 1.4 }}>
              {resolvedCompany.address}
            </div>
          ) : null}
          {(resolvedCompany.phone || resolvedCompany.email) && (
            <div style={{ fontSize: '12px', color: '#4b5563', lineHeight: 1.4 }}>
              {resolvedCompany.phone && `Tel: ${resolvedCompany.phone}`}
              {resolvedCompany.phone && resolvedCompany.email && ' | '}
              {resolvedCompany.email && `Email: ${resolvedCompany.email}`}
            </div>
          )}
          <div className="receipt-title">{labels.payment_receipt}</div>
          {receiptNumber && (
            <div className="receipt-number">
              {labels.receipt_no}: {receiptNumber}
            </div>
          )}
        </div>

        <div className="receipt-info">
          <div className="info-section">
            <div className="info-label">{labels.received_from}:</div>
            <div className="info-value">{displayCustomerName}</div>
            {customer.phone && (
              <>
                <div className="info-label">{labels.phone}:</div>
                <div className="info-value">{customer.phone}</div>
              </>
            )}
            {customer.address && (
              <>
                <div className="info-label">{labels.address}:</div>
                <div className="info-value">{customer.address}</div>
              </>
            )}
            {payment.reference && (
              <>
                <div className="info-label">{labels.reference}:</div>
                <div className="info-value">{payment.reference}</div>
              </>
            )}
          </div>

          <div className="info-section">
            <div className="info-label">{labels.payment_date}:</div>
            <div className="info-value">{formatDate(payment.date)}</div>
            <div className="info-label">{labels.payment_time}:</div>
            <div className="info-value">{formatTime(payment.date)}</div>
            {payment.paymentMethod && (
              <>
                <div className="info-label">{labels.payment_method}:</div>
                <div className="info-value">{payment.paymentMethod}</div>
              </>
            )}
          </div>
        </div>

        {payment.description && (
          <div style={{ marginBottom: '16px' }}>
            <div className="info-label" style={{ marginBottom: '6px' }}>
              {labels.description}:
            </div>
            <div
              style={{
                padding: '10px 12px',
                background: '#f9fafb',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                color: '#111827',
                fontSize: '13px',
                lineHeight: 1.45,
              }}
            >
              {payment.description}
            </div>
          </div>
        )}

        <div className="payment-details">
          <div className="amount-row">
            <span>{labels.previous_balance}:</span>
            <span>{formatCurrency(balance.previousBalance)}</span>
          </div>
          <div className="amount-row">
            <span>{labels.payment_received}:</span>
            <span className="amount-paid">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="amount-row total">
            <span>{labels.remaining_balance}:</span>
            <span style={{ color: balance.currentBalance > 0 ? '#dc2626' : balance.currentBalance < 0 ? '#16a34a' : '#000' }}>
              {formatCurrency(balance.currentBalance)}
              {balance.currentBalance > 0 && ` (${labels.receivable})`}
              {balance.currentBalance < 0 && ` (${labels.payable})`}
              {balance.currentBalance === 0 && ` (${labels.settled})`}
            </span>
          </div>
        </div>

        <div className="receipt-footer">
          <div className="signature-section">
            <div>
              <div className="signature-line">{labels.received_by}</div>
            </div>
            <div>
              <div className="signature-line">{labels.customer_signature}</div>
            </div>
          </div>

          <div className="notes">
            {labels.computer_generated}
            <br />
            {labels.thank_you}
          </div>
        </div>
      </div>

      <div className="no-print" style={{ textAlign: 'center', marginTop: '20px' }}>
        <PrintFormatButton
          label={labels.print_receipt}
          defaultPaperSize={defaultPaperSize}
          onPrint={printReceipt}
        />
      </div>
    </div>
  );
}
