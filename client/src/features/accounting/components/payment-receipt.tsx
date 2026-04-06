import { format } from 'date-fns';
import { paymentReceiptLabels, resolveInvoiceLanguage, type InvoiceLanguage } from '@/features/invoice/utils/language';

interface PaymentReceiptProps {
  customer: {
    name: string;
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
    address?: string;
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

  const printReceipt = () => {
    const printData = {
      customer,
      payment,
      balance,
      company: company || {
        name: 'Logix Plus Solutions',
        address: '',
        phone: '',
        email: '',
        logo: '',
      },
      receiptNumber: receiptNumber || `RCP-${Date.now()}`,
      isTrial: isTrial ?? false,
    };

    const htmlContent = generateReceiptHTML(printData);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const generateReceiptHTML = (data: typeof printReceipt extends () => void ? any : any) => {
    return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${labels.payment_receipt} ${data.receiptNumber}</title>
  <style>
    @media print {
      @page { 
        margin: 5mm; 
        size: 80mm auto; 
      }
      body { 
        margin: 0; 
        padding: 0; 
        font-size: 13px;
      }
      .no-print {
        display: none !important;
      }
    }
    
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      margin: 0;
      padding: 8px;
      width: 300px;
      background: white;
      color: #000;
      direction: ${dir};
      text-align: ${startAlign};
    }
    
    .receipt-header {
      text-align: center;
      margin-bottom: 12px;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
    }
    
    .company-logo {
      max-width: 120px;
      height: auto;
      margin: 0 auto 8px;
      display: block;
    }
    
    .business-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .business-info {
      font-size: 10px;
      margin-bottom: 1px;
    }
    
    .receipt-title {
      font-size: 14px;
      font-weight: bold;
      margin: 8px 0;
      text-decoration: underline;
    }
    
    .receipt-info {
      margin-bottom: 12px;
      border-bottom: 1px dashed #000;
      padding-bottom: 8px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 12px;
    }
    
    .info-label {
      font-weight: bold;
    }
    
    .description-section {
      margin-bottom: 12px;
      padding: 8px;
      background: #f9f9f9;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    
    .payment-details {
      background: #f5f5f5;
      border: 2px solid #000;
      padding: 12px;
      margin: 12px 0;
    }
    
    .amount-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #333;
      font-size: 13px;
    }
    
    .amount-row:last-child {
      border-bottom: none;
    }
    
    .amount-row.total {
      font-size: 16px;
      font-weight: bold;
      border-top: 2px solid #000;
      margin-top: 6px;
      padding-top: 10px;
    }
    
    .amount-paid {
      font-size: 16px;
      font-weight: bold;
    }
    
    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 30px;
      margin-bottom: 12px;
    }
    
    .signature-line {
      border-top: 2px solid #000;
      padding-top: 8px;
      text-align: center;
      font-weight: bold;
      font-size: 10px;
    }
    
    .footer {
      text-align: center;
      font-size: 9px;
      margin-top: 12px;
      border-top: 2px solid #000;
      padding-top: 8px;
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
        max-width: 350px;
        margin: 20px auto;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        padding: 20px;
        border-radius: 8px;
      }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
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
          font-family: ${isUrdu ? "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Arial, sans-serif" : "'Inter', 'Manrope', Arial, sans-serif"};
          color: #000;
          background: white;
          font-size: ${isUrdu ? '16px' : '14px'};
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          border: 2px solid #000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .receipt-header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px double #000;
          padding-bottom: 20px;
        }
        
        .company-name {
          font-size: ${isUrdu ? '28px' : '24px'};
          font-weight: bold;
          margin-bottom: 10px;
          text-transform: uppercase;
          color: #000;
          line-height: ${isUrdu ? '1.8' : '1.2'};
        }
        
        .receipt-title {
          font-size: ${isUrdu ? '24px' : '20px'};
          font-weight: bold;
          margin: 15px 0;
          text-decoration: underline;
          color: #000;
          line-height: ${isUrdu ? '1.8' : '1.2'};
        }
        
        .receipt-number {
          font-size: ${isUrdu ? '16px' : '14px'};
          color: #333;
          margin-top: 10px;
          line-height: ${isUrdu ? '1.8' : '1.2'};
        }
        
        .receipt-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin: 30px 0;
        }
        
        .info-section {
          border: 1px solid #333;
          padding: 15px;
          border-radius: 4px;
          background: white;
        }
        
        .info-label {
          font-weight: bold;
          font-size: ${isUrdu ? '16px' : '14px'};
          color: #000;
          margin-bottom: 5px;
          line-height: ${isUrdu ? '1.8' : '1.4'};
        }
        
        .info-value {
          font-size: ${isUrdu ? '18px' : '16px'};
          color: #000;
          margin-bottom: 10px;
          line-height: ${isUrdu ? '1.8' : '1.4'};
        }
        
        .payment-details {
          background: #f5f5f5;
          border: 2px solid #000;
          padding: 20px;
          margin: 30px 0;
        }
        
        .amount-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #333;
          font-size: ${isUrdu ? '18px' : '16px'};
          color: #000;
          line-height: ${isUrdu ? '1.8' : '1.4'};
        }
        
        .amount-row:last-child {
          border-bottom: none;
        }
        
        .amount-row.total {
          font-size: ${isUrdu ? '22px' : '20px'};
          font-weight: bold;
          border-top: 2px solid #000;
          margin-top: 10px;
          padding-top: 15px;
          line-height: ${isUrdu ? '1.8' : '1.4'};
        }
        
        .amount-paid {
          font-size: ${isUrdu ? '26px' : '24px'};
          font-weight: bold;
          color: #000;
        }
        
        .signature-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 60px;
        }
        
        .signature-line {
          border-top: 2px solid #000;
          padding-top: 10px;
          text-align: center;
          font-weight: bold;
          color: #000;
          line-height: ${isUrdu ? '1.8' : '1.4'};
        }
        
        .notes {
          margin-top: 30px;
          font-size: ${isUrdu ? '14px' : '12px'};
          color: #333;
          text-align: center;
          line-height: ${isUrdu ? '1.8' : '1.4'};
        }
        `}
      </style>

      <div className="receipt-content">
        <div className="receipt-header">
          <div className="company-name">
            {company?.name || 'Logix Plus Solutions'}
          </div>
          {company?.address && (
            <div style={{ fontSize: '14px', marginBottom: '5px', color: '#000' }}>
              {company.address}
            </div>
          )}
          {(company?.phone || company?.email) && (
            <div style={{ fontSize: '14px', color: '#000' }}>
              {company?.phone && `Tel: ${company.phone}`}
              {company?.phone && company?.email && ' | '}
              {company?.email && `Email: ${company.email}`}
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
            <div className="info-value">{customer.name}</div>
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
            {payment.paymentMethod && (
              <>
                <div className="info-label">{labels.payment_method}:</div>
                <div className="info-value">{payment.paymentMethod}</div>
              </>
            )}
          </div>
        </div>

        {payment.description && (
          <div style={{ marginBottom: '20px' }}>
            <div className="info-label">{labels.description}:</div>
            <div style={{ padding: '10px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #ddd', color: '#000' }}>
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
        <button
          onClick={printReceipt}
          style={{
            padding: '10px 30px',
            fontSize: '16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {labels.print_receipt}
        </button>
      </div>
    </div>
  );
}
