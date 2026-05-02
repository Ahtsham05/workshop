/**
 * Normalize paid/balance/status for reporting & dashboards.
 * Cash sales: paid = total, balance = 0, display status paid.
 * Credit: use stored payments; unpaid until fully collected.
 */

const roundMoney = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * @param {{ type?: string, total?: number, paidAmount?: number }} inv
 * @returns {{ paidAmount: number, balance: number, displayStatus: 'paid' | 'unpaid' }}
 */
function normalizeInvoicePayment(inv) {
  const total = roundMoney(inv.total);
  const type = (inv.type || 'cash').toLowerCase();

  if (type === 'cash') {
    return {
      paidAmount: total,
      balance: 0,
      displayStatus: 'paid',
    };
  }

  const paidRaw = roundMoney(inv.paidAmount);
  const applied = Math.min(paidRaw, total);
  const balance = Math.max(0, roundMoney(total - applied));
  const fullyPaid = balance <= 0.009;
  return {
    paidAmount: applied,
    balance,
    displayStatus: fullyPaid ? 'paid' : 'unpaid',
  };
}

/**
 * Purchases: Cash is settled immediately (matches purchase-report aggregates).
 * Credit / Wallet / etc. use stored paidAmount until balance is cleared.
 *
 * @param {{ paymentType?: string, totalAmount?: number, paidAmount?: number, balance?: number }} pur
 * @returns {{ paidAmount: number, balance: number, displayStatus: 'paid' | 'unpaid' }}
 */
function normalizePurchasePayment(pur) {
  const total = roundMoney(pur.totalAmount);
  const paymentType = String(pur.paymentType || 'Cash').trim();

  if (paymentType === 'Cash') {
    return {
      paidAmount: total,
      balance: 0,
      displayStatus: 'paid',
    };
  }

  const paidRaw = roundMoney(pur.paidAmount);
  const applied = Math.min(paidRaw, total);
  const balance = Math.max(0, roundMoney(total - applied));
  const fullyPaid = balance <= 0.009;
  return {
    paidAmount: applied,
    balance,
    displayStatus: fullyPaid ? 'paid' : 'unpaid',
  };
}

module.exports = {
  normalizeInvoicePayment,
  normalizePurchasePayment,
  roundMoney,
};
