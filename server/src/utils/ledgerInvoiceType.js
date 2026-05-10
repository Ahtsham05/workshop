/** Canonical invoice terms for ledger display (cash vs credit sale / purchase). */

const CUSTOMER_INVOICE_TYPES = ['cash', 'credit', 'pending'];

const normalizeCustomerInvoiceType = (type) => {
  if (type === undefined || type === null) return undefined;
  const t = String(type).toLowerCase();
  return CUSTOMER_INVOICE_TYPES.includes(t) ? t : undefined;
};

/** Maps Invoice.type to ledger invoiceType. */
const resolveInvoiceLedgerInvoiceType = (invoice) =>
  normalizeCustomerInvoiceType(invoice?.type) || 'cash';

/** Purchase: Credit vs everything else (cash terms). */
const resolvePurchaseLedgerInvoiceType = (purchase) =>
  String(purchase?.paymentType || 'Cash') === 'Credit' ? 'credit' : 'cash';

module.exports = {
  normalizeCustomerInvoiceType,
  resolveInvoiceLedgerInvoiceType,
  resolvePurchaseLedgerInvoiceType,
};
