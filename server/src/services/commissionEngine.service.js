const salesmanCommissionLedgerService = require('./salesmanCommissionLedger.service');

/**
 * Single entry point every invoice mutation site calls (mirrors postInvoiceToAccounts's
 * role in invoice.service.js) to keep the commission ledger in sync with the invoice's
 * current state. Fire-and-forget by every caller — commission bookkeeping must never
 * block or fail a sale, same reasoning as accounting postings.
 * @param {Object} invoice - Mongoose Invoice document, already saved with its final status
 * @param {ObjectId} userId
 */
const syncCommissionForInvoice = async (invoice, userId) => {
  if (!invoice || !invoice.salesmanId || invoice.type === 'quotation') return;

  if (invoice.status === 'paid' || invoice.status === 'finalized') {
    await salesmanCommissionLedgerService.creditCommissionEarned({ invoice, userId });
  } else if (invoice.status === 'cancelled') {
    await salesmanCommissionLedgerService.reverseCommissionForInvoice({
      invoiceId: invoice._id,
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      salesmanUserId: invoice.salesmanId,
      reason: 'Invoice cancelled',
      userId,
    });
  }
};

module.exports = {
  syncCommissionForInvoice,
};
