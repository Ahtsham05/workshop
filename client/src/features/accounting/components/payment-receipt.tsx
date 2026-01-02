import { format } from 'date-fns';
import { useLanguage } from '@/context/language-context';

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
  };
  receiptNumber?: string;
}

export function PaymentReceipt({
  customer,
  payment,
  balance,
  company,
  receiptNumber,
}: PaymentReceiptProps) {
  const { t, language } = useLanguage();
  const isUrdu = language === 'ur';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'PPP');
    } catch {
      return dateString;
    }
  };

  const printReceipt = () => {
    const printData = {
      customer,
      payment,
      balance,
      company: company || {
        name: 'Jhulelal',
        address: '',
        phone: '',
        email: ''
      },
      receiptNumber: receiptNumber || `RCP-${Date.now()}`
    };

    const htmlContent = generateReceiptHTML(printData);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      
      // Auto print after load
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const generateReceiptHTML = (data: any) => {
    const urduTexts = {
      payment_receipt: 'ادائیگی کی رسید',
      receipt_no: 'رسید نمبر',
      received_from: 'وصول کنندہ',
      phone: 'فون',
      address: 'پتہ',
      payment_date: 'ادائیگی کی تاریخ',
      payment_method: 'ادائیگی کا طریقہ',
      reference: 'حوالہ',
      description: 'تفصیل',
      previous_balance: 'پچھلا بیلنس',
      payment_received: 'وصول شدہ رقم',
      remaining_balance: 'باقی رقم',
      receivable: 'وصولی',
      payable: 'ادائیگی',
      settled: 'طے شدہ',
      received_by: 'وصول کنندہ',
      customer_signature: 'کسٹمر کے دستخط',
      thank_you: 'آپ کا شکریہ',
      computer_generated: 'یہ کمپیوٹر سے تیار کردہ رسید ہے'
    };

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="UTF-8">
  <title>${urduTexts.payment_receipt}</title>
  <style>
    @media print {
      @page { 
        margin: 5mm; 
        size: 80mm auto; 
      }
      body { 
        margin: 0; 
        padding: 0; 
        font-size: 11px;
      }
      .no-print {
        display: none !important;
      }
    }
    
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.3;
      margin: 0;
      padding: 8px;
      width: 300px;
      background: white;
      color: #000;
      direction: rtl;
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
      font-size: 9px;
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
      font-size: 11px;
    }
    
    .info-label {
      font-weight: bold;
    }
    
    .info-value {
      text-align: left;
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
      font-size: 11px;
    }
    
    .amount-row:last-child {
      border-bottom: none;
    }
    
    .amount-row.total {
      font-size: 13px;
      font-weight: bold;
      border-top: 2px solid #000;
      margin-top: 6px;
      padding-top: 10px;
    }
    
    .amount-paid {
      font-size: 15px;
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
    
    .highlight {
      background: #ffffcc;
      padding: 1px 2px;
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
    <img src="/images/logo-light.jpeg" alt="Jhulelal" class="company-logo" />
    <div class="business-name">${data.company.name}</div>
    ${data.company.address ? `<div class="business-info">${data.company.address}</div>` : ''}
    ${data.company.phone || data.company.email ? `
      <div class="business-info">
        ${data.company.phone ? `${data.company.phone}` : ''}
        ${data.company.phone && data.company.email ? ' | ' : ''}
        ${data.company.email ? `${data.company.email}` : ''}
      </div>
    ` : ''}
    <div class="receipt-title">${urduTexts.payment_receipt}</div>
    ${data.receiptNumber ? `<div class="business-info">${urduTexts.receipt_no}: <span class="highlight">${data.receiptNumber}</span></div>` : ''}
  </div>
  
  <div class="receipt-info">
    <div class="info-row">
      <span class="info-label">${urduTexts.received_from}:</span>
      <span class="info-value">${data.customer.name}</span>
    </div>
    ${data.customer.phone ? `
    <div class="info-row">
      <span class="info-label">${urduTexts.phone}:</span>
      <span class="info-value">${data.customer.phone}</span>
    </div>
    ` : ''}
    ${data.customer.address ? `
    <div class="info-row">
      <span class="info-label">${urduTexts.address}:</span>
      <span class="info-value">${data.customer.address}</span>
    </div>
    ` : ''}
    <div class="info-row">
      <span class="info-label">${urduTexts.payment_date}:</span>
      <span class="info-value">${formatDate(data.payment.date)}</span>
    </div>
    ${data.payment.paymentMethod ? `
    <div class="info-row">
      <span class="info-label">${urduTexts.payment_method}:</span>
      <span class="info-value">${data.payment.paymentMethod}</span>
    </div>
    ` : ''}
    ${data.payment.reference ? `
    <div class="info-row">
      <span class="info-label">${urduTexts.reference}:</span>
      <span class="info-value">${data.payment.reference}</span>
    </div>
    ` : ''}
  </div>
  
  ${data.payment.description ? `
  <div class="description-section">
    <div class="info-label">${urduTexts.description}:</div>
    <div style="margin-top: 3px; font-size: 10px;">${data.payment.description}</div>
  </div>
  ` : ''}
  
  <div class="payment-details">
    <div class="amount-row">
      <span>${urduTexts.previous_balance}:</span>
      <span>${formatCurrency(data.balance.previousBalance)}</span>
    </div>
    <div class="amount-row">
      <span>${urduTexts.payment_received}:</span>
      <span class="amount-paid">${formatCurrency(data.payment.amount)}</span>
    </div>
    <div class="amount-row total">
      <span>${urduTexts.remaining_balance}:</span>
      <span style="color: ${data.balance.currentBalance > 0 ? '#dc2626' : data.balance.currentBalance < 0 ? '#16a34a' : '#000'}">
        ${formatCurrency(data.balance.currentBalance)}
        ${data.balance.currentBalance > 0 ? ` (${urduTexts.receivable})` : ''}
        ${data.balance.currentBalance < 0 ? ` (${urduTexts.payable})` : ''}
        ${data.balance.currentBalance === 0 ? ` (${urduTexts.settled})` : ''}
      </span>
    </div>
  </div>
  
  <div class="signature-section">
    <div>
      <div class="signature-line">${urduTexts.received_by}</div>
    </div>
    <div>
      <div class="signature-line">${urduTexts.customer_signature}</div>
    </div>
  </div>
  
  <div class="footer">
    <div class="footer-line"><strong>${urduTexts.thank_you}</strong></div>
    <div class="footer-line">${urduTexts.computer_generated}</div>
  </div>
  
  <div class="no-print">
    <button onclick="window.print()" class="print-btn print-btn-primary">
      🖨️ ${t('Print Receipt')}
    </button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">
      ✕ ${t('Close')}
    </button>
  </div>
</body>
</html>
    `.trim();
  };

  return (
    <div className="payment-receipt-container" dir={isUrdu ? 'rtl' : 'ltr'}>
      <style>
        {`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
            background: white;
          }
          
          .payment-receipt-container {
            width: 100%;
            height: 100%;
            background: white;
            display: block;
          }
          
          .receipt-content {
            width: 100%;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 15mm 20mm !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: avoid;
            background: white;
          }
          
          .no-print {
            display: none !important;
          }
          
          .receipt-header,
          .receipt-info,
          .payment-details,
          .receipt-footer {
            page-break-inside: avoid;
          }
          
          @page {
            size: A4;
            margin: 0;
          }
        }
        
        @media screen {
          .receipt-content {
            max-width: 800px;
            margin: 0px auto;
            padding: 40px;
            background: white;
            border: 2px solid #000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
        }
        
        .receipt-content {
          font-family: ${isUrdu ? "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Pak Nastaleeq', Arial, sans-serif" : 'Arial, sans-serif'};
          color: #000;
          background: white;
          font-size: ${isUrdu ? '16px' : '14px'};
        }
        
        .receipt-header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px double #000;
          padding-bottom: 20px;
        }
        
        .company-name {
          font-size: ${isUrdu ? '32px' : '28px'};
          font-weight: bold;
          margin-bottom: 10px;
          text-transform: uppercase;
          color: #000;
          line-height: ${isUrdu ? '1.8' : '1.2'};
        }
        
        .receipt-title {
          font-size: ${isUrdu ? '26px' : '22px'};
          font-weight: bold;
          margin: 20px 0;
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
        
        @media print {
          .company-name {
            font-size: ${isUrdu ? '28px' : '24px'};
          }
          
          .receipt-title {
            font-size: ${isUrdu ? '24px' : '20px'};
          }
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
        
        @media print {
          .payment-details {
            background: #f9f9f9;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .amount-paid {
            color: #000;
          }
        } padding-top: 15px;
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
        
        @media print {
          .signature-section {
            margin-top: 40px;
          }
          
          .notes {
            color: #000;
          }
        }
        `}
      </style>

      <div className="receipt-content">
        <div className="receipt-header">
          <div className="company-name">
            {company?.name || 'Jhulelal'}
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
          <div className="receipt-title">{t('Payment Receipt')}</div>
          {receiptNumber && (
            <div className="receipt-number">
              {t('Receipt No')}: {receiptNumber}
            </div>
          )}
        </div>

        <div className="receipt-info">
          <div className="info-section">
            <div className="info-label">{t('Received From')}:</div>
            <div className="info-value">{customer.name}</div>
            {customer.phone && (
              <>
                <div className="info-label">{t('Phone')}:</div>
                <div className="info-value">{customer.phone}</div>
              </>
            )}
            {customer.address && (
              <>
                <div className="info-label">{t('Address')}:</div>
                <div className="info-value">{customer.address}</div>
              </>
            )}
               {payment.reference && (
              <>
                <div className="info-label">{t('Reference')}:</div>
                <div className="info-value">{payment.reference}</div>
              </>
            )}
          </div>

          <div className="info-section">
            <div className="info-label">{t('Payment Date')}:</div>
            <div className="info-value">{formatDate(payment.date)}</div>
            {payment.paymentMethod && (
              <>
                <div className="info-label">{t('Payment Method')}:</div>
                <div className="info-value">{payment.paymentMethod}</div>
              </>
            )}
          </div>
        </div>

        {payment.description && (
          <div style={{ marginBottom: '20px' }}>
            <div className="info-label">{t('Description')}:</div>
            <div style={{ padding: '10px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #ddd', color: '#000' }}>
              {payment.description}
            </div>
          </div>
        )}

        <div className="payment-details">
          <div className="amount-row">
            <span>{t('Previous Balance')}:</span>
            <span>{formatCurrency(balance.previousBalance)}</span>
          </div>
          <div className="amount-row">
            <span>{t('Payment Received')}:</span>
            <span className="amount-paid">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="amount-row total">
            <span>{t('Remaining Balance')}:</span>
            <span style={{ color: balance.currentBalance > 0 ? '#dc2626' : '#16a34a' }}>
              {formatCurrency(balance.currentBalance)}
              {balance.currentBalance > 0 && ` (${t('Receivable')})`}
              {balance.currentBalance < 0 && ` (${t('Payable')})`}
              {balance.currentBalance === 0 && ` (${t('Settled')})`}
            </span>
          </div>
        </div>

        <div className="receipt-footer">
          <div className="signature-section">
            <div>
              <div className="signature-line">{t('Received By')}</div>
            </div>
            <div>
              <div className="signature-line">{t('Customer Signature')}</div>
            </div>
          </div>

          <div className="notes">
            {t('This is a computer generated receipt')}
            <br />
            {t('Thank you for your payment')}
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
          {t('Print Receipt')}
        </button>
      </div>
    </div>
  );
}
