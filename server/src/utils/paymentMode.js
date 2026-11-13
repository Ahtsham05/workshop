/**
 * Payment method (tender) helpers for sale invoices — Cash / Credit Card / ACH / Check, plus
 * 'bank' for any other receiving account. Invoice.paymentMode is derived on save (see the
 * pre-save hook in invoice.model.js); invoices saved before that field existed fall back to
 * their paymentMethod so old data still lands in a sensible bucket.
 */

const PAYMENT_MODE_LABELS = {
  cash: 'Cash',
  card: 'Credit Card',
  ach: 'ACH',
  check: 'Check',
  bank: 'Bank',
};

const PAYMENT_MODE_ORDER = ['cash', 'card', 'ach', 'check', 'bank'];

/** The primary leg's tender for an invoice (new field first, legacy paymentMethod after). */
const resolveInvoicePaymentMode = (invoice) => {
  if (invoice?.paymentMode) return invoice.paymentMode;
  const method = String(invoice?.paymentMethod || 'cash').toLowerCase();
  if (method === 'card') return 'card';
  if (method === 'wallet' || method === 'bank') return 'bank';
  return 'cash';
};

const bucketFor = (mode, walletType) => {
  // Plain bank / wallet accounts are listed by their own name (e.g. "Meezan Bank").
  if (mode === 'bank' && walletType) return { key: `bank:${walletType}`, mode, label: walletType };
  return { key: mode, mode, label: PAYMENT_MODE_LABELS[mode] || mode };
};

/**
 * Money collected at the time of sale, split by tender. `paidAmount` is the whole amount paid
 * (both legs); a split leg is carved out of it. Quotations and pending invoices collected
 * nothing yet and are skipped.
 *
 * @param {Array} invoices rows with type, paidAmount, paymentMode/paymentMethod, walletType and
 *   splitPaymentMethod/splitWalletType/splitPaidAmount
 * @param {Map<string,string>} walletModeByName account name → its Wallet.paymentMode
 */
const buildPaymentModeBreakdown = (invoices, walletModeByName = new Map()) => {
  const buckets = new Map();
  const add = (bucket, amount, countInvoice) => {
    if (!(amount > 0)) return;
    const row = buckets.get(bucket.key) || { ...bucket, invoices: 0, amount: 0 };
    row.amount += amount;
    if (countInvoice) row.invoices += 1;
    buckets.set(bucket.key, row);
  };

  invoices.forEach((inv) => {
    if (inv.type === 'quotation' || inv.type === 'pending') return;
    const paid = Math.max(0, Number(inv.paidAmount) || 0);
    if (paid <= 0) return;

    let splitAmount = 0;
    let splitBucket = null;
    if (inv.splitPaymentMethod === 'cash') {
      splitAmount = Math.min(paid, Math.max(0, Number(inv.splitPaidAmount) || 0));
      splitBucket = bucketFor('cash');
    } else if (inv.splitPaymentMethod === 'wallet' && inv.splitWalletType) {
      splitAmount = Math.min(paid, Math.max(0, Number(inv.splitPaidAmount) || 0));
      const mode = walletModeByName.get(String(inv.splitWalletType).trim()) || 'bank';
      splitBucket = bucketFor(mode, inv.splitWalletType);
    }

    const primaryMode = resolveInvoicePaymentMode(inv);
    add(bucketFor(primaryMode, inv.walletType), paid - splitAmount, true);
    if (splitBucket) add(splitBucket, splitAmount, true);
  });

  const rank = (mode) => {
    const i = PAYMENT_MODE_ORDER.indexOf(mode);
    return i === -1 ? PAYMENT_MODE_ORDER.length : i;
  };
  return [...buckets.values()]
    .map((row) => ({ ...row, amount: Math.round(row.amount * 100) / 100 }))
    .sort((a, b) => rank(a.mode) - rank(b.mode) || b.amount - a.amount);
};

module.exports = {
  PAYMENT_MODE_LABELS,
  resolveInvoicePaymentMode,
  buildPaymentModeBreakdown,
};
