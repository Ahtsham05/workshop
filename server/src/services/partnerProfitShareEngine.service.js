const partnerProfitShareRuleService = require('./partnerProfitShareRule.service');
const partnerProfitShareLedgerService = require('./partnerProfitShareLedger.service');

/**
 * Sum profit and quantity per distinct productId across an invoice's items — a product can
 * legitimately appear as more than one line (e.g. two different batches/variants sold in
 * the same sale), and a partner's product rule should earn once per invoice off the total,
 * not once per line.
 */
const summarizeItemsByProduct = (items) => {
  const byProduct = new Map();
  for (const item of items || []) {
    if (!item.productId) continue;
    const key = String(item.productId);
    const existing = byProduct.get(key) || { productId: item.productId, profit: 0, quantity: 0 };
    existing.profit += Number(item.profit || 0);
    existing.quantity += Number(item.quantity || 0);
    byProduct.set(key, existing);
  }
  return [...byProduct.values()];
};

/**
 * Credit every partner/rule entitled to a share of this invoice — every distinct product's
 * rules (against that product's summed profit/quantity), plus every org/branch-scoped rule
 * (against the invoice's totalProfit). Several different partners can earn independently on
 * the same invoice; this fires all of them, not just one (see
 * partnerProfitShareRule.model.js for why resolution returns an array).
 */
const creditPartnerSharesForInvoice = async (invoice, userId) => {
  const date = invoice.invoiceDate || invoice.createdAt;

  const productSummaries = summarizeItemsByProduct(invoice.items);
  for (const summary of productSummaries) {
    // eslint-disable-next-line no-await-in-loop
    const rules = await partnerProfitShareRuleService.resolveActiveProductRules({
      organizationId: invoice.organizationId,
      productId: summary.productId,
      date,
    });
    for (const rule of rules) {
      // eslint-disable-next-line no-await-in-loop
      await partnerProfitShareLedgerService.creditShareEarned({
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        partnerId: rule.partnerId,
        ruleId: rule.ruleId,
        referenceId: invoice._id,
        referenceModel: 'Invoice',
        reference: invoice.invoiceNumber,
        productId: summary.productId,
        shareType: rule.shareType,
        rate: rule.rate,
        saleProfit: summary.profit,
        quantity: summary.quantity,
        date,
        userId,
      });
    }
  }

  const orgRules = await partnerProfitShareRuleService.resolveActiveOrgRules({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    date,
  });
  for (const rule of orgRules) {
    // eslint-disable-next-line no-await-in-loop
    await partnerProfitShareLedgerService.creditShareEarned({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      partnerId: rule.partnerId,
      ruleId: rule.ruleId,
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      reference: invoice.invoiceNumber,
      shareType: rule.shareType,
      rate: rule.rate,
      saleProfit: invoice.totalProfit,
      quantity: invoice.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      date,
      userId,
    });
  }
};

/**
 * Single entry point every invoice mutation site calls (mirrors commissionEngine.service.js's
 * syncCommissionForInvoice) to keep every partner's profit-share ledger in sync with the
 * invoice's current state. Fire-and-forget by every caller — partner bookkeeping must never
 * block or fail a sale, same reasoning as accounting postings and commission.
 * @param {Object} invoice - Mongoose Invoice document, already saved with its final status
 * @param {ObjectId} userId
 */
const syncPartnerShareForInvoice = async (invoice, userId) => {
  if (!invoice || invoice.type === 'quotation') return;

  if (invoice.status === 'paid' || invoice.status === 'finalized') {
    await creditPartnerSharesForInvoice(invoice, userId);
  } else if (invoice.status === 'cancelled') {
    await partnerProfitShareLedgerService.reverseAllShareForReference({
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      organizationId: invoice.organizationId,
      reason: 'Invoice cancelled',
      userId,
    });
  }
};

module.exports = {
  syncPartnerShareForInvoice,
};
