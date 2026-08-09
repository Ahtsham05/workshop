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
    await salesmanCommissionLedgerService.creditCommissionEarned({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      salesmanUserId: invoice.salesmanId,
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      reference: invoice.invoiceNumber,
      saleAmount: invoice.total,
      date: invoice.invoiceDate || invoice.createdAt,
      userId,
    });
  } else if (invoice.status === 'cancelled') {
    await salesmanCommissionLedgerService.reverseCommissionForReference({
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      salesmanUserId: invoice.salesmanId,
      reason: 'Invoice cancelled',
      userId,
    });
  }
};

/**
 * Sim Sale is atomic — a completed sale the instant it's created, no draft/finalize
 * concept — so it's always commission-eligible once it exists with a salesman attached.
 * @param {Object} sale - Mongoose SimSale document
 * @param {ObjectId} userId
 */
const syncCommissionForSimSale = async (sale, userId) => {
  if (!sale || !sale.salesmanId) return;
  await salesmanCommissionLedgerService.creditCommissionEarned({
    organizationId: sale.organizationId,
    branchId: sale.branchId,
    salesmanUserId: sale.salesmanId,
    referenceId: sale._id,
    referenceModel: 'SimSale',
    reference: sale.jobNumber != null ? `SIM-${sale.jobNumber}` : undefined,
    saleAmount: sale.saleAmount,
    date: sale.date,
    userId,
  });
};

/** Load Transaction is atomic, same reasoning as Sim Sale. */
const syncCommissionForLoadTransaction = async (transaction, userId) => {
  if (!transaction || !transaction.salesmanId) return;
  await salesmanCommissionLedgerService.creditCommissionEarned({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    salesmanUserId: transaction.salesmanId,
    referenceId: transaction._id,
    referenceModel: 'LoadTransaction',
    reference: transaction.walletType || undefined,
    saleAmount: transaction.amount,
    date: transaction.date,
    userId,
  });
};

/**
 * Repair jobs only earn commission once the customer has actually paid in full —
 * `status: 'completed'|'delivered'` — mirroring repairJob.service.js's own
 * computeRepairCashAmount, which uses the full `charges` only at that point too (before
 * that it's just the advance). A job stuck at pending/in_progress never has commission,
 * and there's no 'cancelled' status here — reversal only happens via delete.
 */
const syncCommissionForRepairJob = async (repairJob, userId) => {
  if (!repairJob || !repairJob.salesmanId) return;
  if (repairJob.status !== 'completed' && repairJob.status !== 'delivered') return;
  await salesmanCommissionLedgerService.creditCommissionEarned({
    organizationId: repairJob.organizationId,
    branchId: repairJob.branchId,
    salesmanUserId: repairJob.salesmanId,
    referenceId: repairJob._id,
    referenceModel: 'RepairJob',
    reference: repairJob.deviceModel ? `Repair: ${repairJob.deviceModel}` : undefined,
    saleAmount: repairJob.charges,
    date: repairJob.date,
    userId,
  });
};

/** Service Invoice is atomic, same reasoning as Sim Sale. */
const syncCommissionForServiceInvoice = async (invoice, userId) => {
  if (!invoice || !invoice.salesmanId) return;
  await salesmanCommissionLedgerService.creditCommissionEarned({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    salesmanUserId: invoice.salesmanId,
    referenceId: invoice._id,
    referenceModel: 'ServiceInvoice',
    reference: invoice.invoiceNumber,
    saleAmount: invoice.totalAmount,
    date: invoice.date,
    userId,
  });
};

/** Full reversal on delete — shared by every non-Invoice sale type (none of them have a
 * partial-return concept the way Invoice+SalesReturn does). */
const reverseCommissionOnDelete = async ({ sale, referenceModel, reason, userId }) => {
  if (!sale || !sale.salesmanId) return;
  await salesmanCommissionLedgerService.reverseCommissionForReference({
    referenceId: sale._id,
    referenceModel,
    organizationId: sale.organizationId,
    branchId: sale.branchId,
    salesmanUserId: sale.salesmanId,
    reason,
    userId,
  });
};

module.exports = {
  syncCommissionForInvoice,
  syncCommissionForSimSale,
  syncCommissionForLoadTransaction,
  syncCommissionForRepairJob,
  syncCommissionForServiceInvoice,
  reverseCommissionOnDelete,
};
