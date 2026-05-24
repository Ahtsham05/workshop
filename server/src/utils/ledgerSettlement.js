/** Ledger rules when a purchase/sale is settled in full on cash (or wallet) terms. */

const AMOUNT_EPSILON = 0.001;

const isFullySettledCashPurchase = ({ totalAmount, paidAmount, paymentType, invoiceType }) => {
  const total = Number(totalAmount || 0);
  const paid = Number(paidAmount || 0);
  if (total <= 0) {
    return false;
  }

  const resolvedPaymentType =
    paymentType ||
    (String(invoiceType || '').toLowerCase() === 'credit' ? 'Credit' : 'Cash');

  if (String(resolvedPaymentType) === 'Credit') {
    return false;
  }

  return paid >= total - AMOUNT_EPSILON;
};

const isFullySettledCashSale = ({ total, paidAmount, invoiceType }) => {
  const totalAmount = Number(total || 0);
  const paid = Number(paidAmount || 0);
  if (totalAmount <= 0) {
    return false;
  }

  const type = String(invoiceType || 'cash').toLowerCase();
  if (type === 'credit' || type === 'pending') {
    return false;
  }

  return paid >= totalAmount - AMOUNT_EPSILON;
};

const buildSupplierPurchaseLedgerEntries = ({
  organizationId,
  branchId,
  supplierId,
  referenceId,
  invoiceNumber,
  transactionDate,
  totalAmount,
  paidAmount,
  paymentType,
  invoiceType,
  paymentMethod,
  itemsCount = 0,
  balance = 0,
  suffix = '',
}) => {
  const total = Number(totalAmount || 0);
  const paid = Number(paidAmount || 0);
  const date = transactionDate || new Date();
  const ledgerInvoiceType =
    invoiceType || (String(paymentType || 'Cash') === 'Credit' ? 'credit' : 'cash');

  const base = {
    organizationId,
    branchId,
    supplier: supplierId,
    reference: invoiceNumber,
    referenceId,
    paymentMethod,
    invoiceType: ledgerInvoiceType,
  };

  if (isFullySettledCashPurchase({ totalAmount: total, paidAmount: paid, paymentType, invoiceType: ledgerInvoiceType })) {
    return [
      {
        ...base,
        transactionType: 'purchase',
        transactionDate: date,
        description: `Purchase Invoice #${invoiceNumber}${suffix}`,
        debit: total,
        credit: total,
        notes: `Paid in full: Rs${total.toFixed(2)} · ${itemsCount} items${suffix ? ' (Updated)' : ''}`,
      },
    ];
  }

  const entries = [
    {
      ...base,
      transactionType: 'purchase',
      transactionDate: date,
      description: `Purchase Invoice #${invoiceNumber}${suffix}`,
      debit: 0,
      credit: total,
      notes: `Purchase of ${itemsCount} items${suffix ? ' (Updated)' : ''}`,
    },
  ];

  if (paid > 0) {
    const paymentDate = new Date(date);
    paymentDate.setSeconds(paymentDate.getSeconds() + 1);
    entries.push({
      ...base,
      transactionType: 'payment_made',
      transactionDate: paymentDate,
      description: `Payment made for Purchase #${invoiceNumber}${paid < total - AMOUNT_EPSILON ? ' (Partial)' : ''}${suffix}`,
      debit: paid,
      credit: 0,
      notes: `Amount paid: Rs${paid.toFixed(2)}${balance > 0 ? `, Balance: Rs${Number(balance).toFixed(2)}` : ''}`,
    });
  }

  return entries;
};

const buildCustomerSaleLedgerEntries = ({
  organizationId,
  branchId,
  customerId,
  referenceId,
  invoiceNumber,
  displayReference,
  description,
  transactionDate,
  total,
  paidAmount,
  invoiceType,
  paymentMethod,
  notes,
  balance = 0,
  suffix = '',
}) => {
  const totalAmount = Number(total || 0);
  const paid = Number(paidAmount || 0);
  const date = transactionDate || new Date();
  const reference = displayReference || invoiceNumber;
  const saleDescription = description || `Sale Invoice #${invoiceNumber}${suffix}`;
  const ledgerInvoiceType = String(invoiceType || 'cash').toLowerCase();

  const base = {
    organizationId,
    branchId,
    customer: customerId,
    reference,
    referenceId,
    paymentMethod,
    invoiceType: ledgerInvoiceType,
  };

  if (isFullySettledCashSale({ total: totalAmount, paidAmount: paid, invoiceType: ledgerInvoiceType })) {
    return [
      {
        ...base,
        transactionType: 'sale',
        transactionDate: date,
        description: saleDescription,
        debit: totalAmount,
        credit: totalAmount,
        notes: notes || `Paid in full: Rs${totalAmount.toFixed(2)}`,
      },
    ];
  }

  const entries = [
    {
      ...base,
      transactionType: 'sale',
      transactionDate: date,
      description: saleDescription,
      debit: totalAmount,
      credit: 0,
      notes: notes || `Invoice for items${suffix ? ' (Updated)' : ''}`,
    },
  ];

  if (paid > 0) {
    const paymentDate = new Date(date);
    paymentDate.setSeconds(paymentDate.getSeconds() + 1);
    entries.push({
      ...base,
      transactionType: 'payment_received',
      transactionDate: paymentDate,
      reference: invoiceNumber,
      description: `Payment received for Invoice #${invoiceNumber}${paid < totalAmount - AMOUNT_EPSILON ? ' (Partial)' : ''}${suffix}`,
      debit: 0,
      credit: paid,
      notes: `Amount paid: Rs${paid.toFixed(2)}${balance > 0 ? `, Balance: Rs${Number(balance).toFixed(2)}` : ''}`,
    });
  }

  return entries;
};

module.exports = {
  AMOUNT_EPSILON,
  isFullySettledCashPurchase,
  isFullySettledCashSale,
  buildSupplierPurchaseLedgerEntries,
  buildCustomerSaleLedgerEntries,
};
