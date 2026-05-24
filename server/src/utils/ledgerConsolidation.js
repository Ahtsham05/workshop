const { AMOUNT_EPSILON } = require('./ledgerSettlement');

/**
 * Merge duplicate full-cash rows: purchase/sale (credit/debit only) + matching payment row(s).
 * Also removes orphan payment rows when purchase is already a combined cash entry.
 */
const consolidateSupplierCashEntries = async (supplierId, SupplierLedger) => {
  const entries = await SupplierLedger.find({
    supplier: supplierId,
    referenceId: { $ne: null },
  }).lean();

  const byReference = new Map();
  for (const entry of entries) {
    const key = String(entry.referenceId);
    if (!byReference.has(key)) {
      byReference.set(key, []);
    }
    byReference.get(key).push(entry);
  }

  let changed = false;

  for (const group of byReference.values()) {
    const purchase = group.find((e) => e.transactionType === 'purchase');
    if (!purchase) {
      continue;
    }

    const payments = group.filter((e) => e.transactionType === 'payment_made');
    const purchaseDebit = Number(purchase.debit) || 0;
    const purchaseCredit = Number(purchase.credit) || 0;

    if (purchaseDebit > 0 && purchaseCredit > 0 && payments.length > 0) {
      await SupplierLedger.deleteMany({ _id: { $in: payments.map((p) => p._id) } });
      changed = true;
      continue;
    }

    if (purchaseCredit <= 0 || payments.length === 0) {
      continue;
    }

    const paidTotal = payments.reduce((sum, p) => sum + (Number(p.debit) || 0), 0);
    if (Math.abs(paidTotal - purchaseCredit) > AMOUNT_EPSILON) {
      continue;
    }

    await SupplierLedger.findByIdAndUpdate(purchase._id, {
      debit: purchaseCredit,
      credit: purchaseCredit,
    });
    await SupplierLedger.deleteMany({ _id: { $in: payments.map((p) => p._id) } });
    changed = true;
  }

  return changed;
};

const consolidateCustomerCashEntries = async (customerId, CustomerLedger) => {
  const entries = await CustomerLedger.find({
    customer: customerId,
    referenceId: { $ne: null },
  }).lean();

  const byReference = new Map();
  for (const entry of entries) {
    const key = String(entry.referenceId);
    if (!byReference.has(key)) {
      byReference.set(key, []);
    }
    byReference.get(key).push(entry);
  }

  let changed = false;

  for (const group of byReference.values()) {
    const sale = group.find((e) => e.transactionType === 'sale');
    if (!sale) {
      continue;
    }

    const payments = group.filter((e) => e.transactionType === 'payment_received');
    const saleDebit = Number(sale.debit) || 0;
    const saleCredit = Number(sale.credit) || 0;

    if (saleDebit > 0 && saleCredit > 0 && payments.length > 0) {
      await CustomerLedger.deleteMany({ _id: { $in: payments.map((p) => p._id) } });
      changed = true;
      continue;
    }

    if (saleDebit <= 0 || payments.length === 0) {
      continue;
    }

    const paidTotal = payments.reduce((sum, p) => sum + (Number(p.credit) || 0), 0);
    if (Math.abs(paidTotal - saleDebit) > AMOUNT_EPSILON) {
      continue;
    }

    await CustomerLedger.findByIdAndUpdate(sale._id, {
      debit: saleDebit,
      credit: saleDebit,
    });
    await CustomerLedger.deleteMany({ _id: { $in: payments.map((p) => p._id) } });
    changed = true;
  }

  return changed;
};

module.exports = {
  consolidateSupplierCashEntries,
  consolidateCustomerCashEntries,
};
