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
 * Sum profit and quantity per distinct variantId across an invoice's items — a variant-scoped
 * rule earns on every batch of that variant, so this doesn't care which batch(es) the line
 * actually drew from (see summarizeItemsByBatch for that). Items with no variantId (legacy
 * flat products) are skipped, same as summarizeItemsByProduct skips items with no productId.
 */
const summarizeItemsByVariant = (items) => {
  const byVariant = new Map();
  for (const item of items || []) {
    if (!item.variantId) continue;
    const key = String(item.variantId);
    const existing = byVariant.get(key) || { variantId: item.variantId, productId: item.productId, profit: 0, quantity: 0 };
    existing.profit += Number(item.profit || 0);
    existing.quantity += Number(item.quantity || 0);
    byVariant.set(key, existing);
  }
  return [...byVariant.values()];
};

/** Same normalization invoice.service.js's getItemBatchAllocations uses when saving an
 * invoice — inlined here (rather than imported) to avoid a circular require, since
 * invoice.service.js is what calls into this engine. */
const getItemBatchAllocations = (item) => {
  if (Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0) {
    return item.batchAllocations;
  }
  if (item.batchId) {
    return [{ batchId: item.batchId, quantity: item.quantity }];
  }
  return [];
};

/**
 * Sum profit and quantity per distinct batchId across an invoice's items — a batch-scoped
 * rule (e.g. an investor who funded that exact lot) only earns off units that actually came
 * from their batch. A line's profit is prorated across its batch allocations by each
 * allocation's share of the line's quantity, since batchAllocations only records quantity,
 * not a per-batch profit split.
 */
const summarizeItemsByBatch = (items) => {
  const byBatch = new Map();
  for (const item of items || []) {
    const allocations = getItemBatchAllocations(item);
    if (allocations.length === 0) continue;
    const lineQuantity = Number(item.quantity || 0);
    if (lineQuantity <= 0) continue;
    const unitProfit = Number(item.profit || 0) / lineQuantity;
    for (const alloc of allocations) {
      if (!alloc.batchId) continue;
      const key = String(alloc.batchId);
      const existing = byBatch.get(key) || {
        batchId: alloc.batchId,
        variantId: item.variantId,
        productId: item.productId,
        profit: 0,
        quantity: 0,
      };
      existing.profit += unitProfit * Number(alloc.quantity || 0);
      existing.quantity += Number(alloc.quantity || 0);
      byBatch.set(key, existing);
    }
  }
  return [...byBatch.values()];
};

/**
 * Credit every partner/rule entitled to a share of this invoice — every distinct product's
 * rules, every distinct variant's rules, every distinct batch's rules (each against that
 * item's summed/prorated profit/quantity), plus every org/branch-scoped rule (against the
 * invoice's totalProfit). Several different partners can earn independently on the same
 * invoice — an org-wide partner, a product investor, a variant investor, and the specific
 * investor who funded the batch that sold can all earn off the very same sale; this fires
 * every one of them, not just one (see partnerProfitShareRule.model.js for why resolution
 * returns an array).
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

  const variantSummaries = summarizeItemsByVariant(invoice.items);
  for (const summary of variantSummaries) {
    // eslint-disable-next-line no-await-in-loop
    const rules = await partnerProfitShareRuleService.resolveActiveVariantRules({
      organizationId: invoice.organizationId,
      variantId: summary.variantId,
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
        variantId: summary.variantId,
        shareType: rule.shareType,
        rate: rule.rate,
        saleProfit: summary.profit,
        quantity: summary.quantity,
        date,
        userId,
      });
    }
  }

  const batchSummaries = summarizeItemsByBatch(invoice.items);
  for (const summary of batchSummaries) {
    // eslint-disable-next-line no-await-in-loop
    const rules = await partnerProfitShareRuleService.resolveActiveBatchRules({
      organizationId: invoice.organizationId,
      batchId: summary.batchId,
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
        variantId: summary.variantId,
        batchId: summary.batchId,
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
