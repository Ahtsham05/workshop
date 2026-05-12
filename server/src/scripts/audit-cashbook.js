/**
 * Diagnostic audit for cash book.
 *
 * Walks every CashBookEntry for a given branch (or all if no branch specified)
 * and prints per-source / per-payment-method totals together with a list of
 * suspicious looking entries.
 *
 * Usage:
 *   node src/scripts/audit-cashbook.js                # all branches
 *   node src/scripts/audit-cashbook.js <branchId>     # one branch
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { CashBookEntry, BillPayment, CashWithdrawal, LoadPurchase, LoadTransaction, Purchase, Invoice } = require('../models');

const fmt = (n) => Number(n || 0).toFixed(2);

const run = async () => {
  const branchArg = process.argv[2];
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB:', config.mongoose.url.replace(/\/\/.*@/, '//<creds>@'));

  const filter = {};
  if (branchArg) {
    filter.branchId = mongoose.Types.ObjectId.isValid(branchArg)
      ? new mongoose.Types.ObjectId(branchArg)
      : branchArg;
  }

  const entries = await CashBookEntry.find(filter).lean();
  console.log(`\nTotal cashbook entries: ${entries.length}`);

  // --- Group totals
  const bySource = {};
  const byPM = {};
  const byModel = {};
  let totalCashIncome = 0;
  let totalCashExpense = 0;
  let totalWalletIncome = 0;
  let totalWalletExpense = 0;

  for (const e of entries) {
    const k = `${e.source}|${e.paymentMethod}|${e.type}`;
    bySource[k] = (bySource[k] || 0) + e.amount;
    byPM[`${e.paymentMethod}|${e.type}`] = (byPM[`${e.paymentMethod}|${e.type}`] || 0) + e.amount;
    byModel[`${e.referenceModel || '<none>'}|${e.type}|${e.paymentMethod}`] =
      (byModel[`${e.referenceModel || '<none>'}|${e.type}|${e.paymentMethod}`] || 0) + e.amount;

    if (e.paymentMethod === 'wallet') {
      if (e.type === 'income') totalWalletIncome += e.amount;
      else totalWalletExpense += e.amount;
    } else if (e.source !== 'opening_balance') {
      if (e.type === 'income') totalCashIncome += e.amount;
      else totalCashExpense += e.amount;
    }
  }

  console.log('\n=== Totals by paymentMethod / type (excluding opening_balance source) ===');
  Object.entries(byPM).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(30)} ${fmt(v)}`));

  console.log('\n=== Totals by referenceModel / type / paymentMethod ===');
  Object.entries(byModel).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(50)} ${fmt(v)}`));

  console.log('\n=== Net cash effect (paymentMethod != wallet, source != opening_balance) ===');
  console.log(`  Cash income:  ${fmt(totalCashIncome)}`);
  console.log(`  Cash expense: ${fmt(totalCashExpense)}`);
  console.log(`  Net:          ${fmt(totalCashIncome - totalCashExpense)}`);
  console.log(`  Wallet income:  ${fmt(totalWalletIncome)}`);
  console.log(`  Wallet expense: ${fmt(totalWalletExpense)}`);

  // --- Double counting checks
  console.log('\n=== Double counting checks: same (transactionRoot) recorded twice as cashbook lines ===');

  // 1. CashWithdrawal: a single CashWithdrawal should NEVER produce a CustomerLedger-sourced
  //    cashbook line, because cashWithdrawal.service.js already writes its own lines. The
  //    CustomerLedger mirror is the bug source.
  const cwReferenceIds = (await CashWithdrawal.find({}).select('_id').lean()).map((d) => String(d._id));
  const cwCashbook = entries.filter((e) => e.referenceModel === 'CashWithdrawal');
  const ledgerForCw = entries.filter(
    (e) => e.referenceModel === 'CustomerLedger' && /Withdrawal:|Deposit:/.test(e.description || '')
  );
  console.log(`  CashWithdrawal cashbook lines: ${cwCashbook.length}`);
  console.log(`  CustomerLedger-mirror lines that look like CashWithdrawal: ${ledgerForCw.length}`);

  // 2. LoadTransaction with linked customer + cash paymentMethod
  const ltReferenceIds = (await LoadTransaction.find({}).select('_id customerId paymentMethod').lean());
  const ltDouble = ltReferenceIds.filter((d) => d.customerId && d.paymentMethod === 'cash');
  console.log(`  LoadTransactions w/ customer+cash (may double-count via CustomerLedger): ${ltDouble.length}`);

  // 3. Purchase with linked supplier + cash/cheque/card/bank payment
  const pReferenceIds = (await Purchase.find({}).select('_id supplier paymentType paidAmount').lean());
  const pDouble = pReferenceIds.filter(
    (d) => d.supplier && d.paidAmount > 0 && d.paymentType && String(d.paymentType).toLowerCase() !== 'wallet'
  );
  console.log(`  Purchases w/ supplier+non-wallet payment (may double-count via SupplierLedger): ${pDouble.length}`);

  // 4. Invoice with linked customer + non-walk-in + bank/card payment
  const invReferenceIds = (await Invoice.find({}).select('_id customerId paymentMethod paidAmount').lean());
  const invDouble = invReferenceIds.filter(
    (d) =>
      d.customerId &&
      String(d.customerId) !== 'walk-in' &&
      d.paidAmount > 0 &&
      ['bank', 'card'].includes(String(d.paymentMethod || '').toLowerCase())
  );
  console.log(`  Invoices w/ customer+bank/card (may double-count via CustomerLedger): ${invDouble.length}`);

  // --- Paid bills using cash as expense method
  const paidBills = await BillPayment.find({ status: 'paid' }).lean();
  const paidByMethod = {};
  paidBills.forEach((b) => {
    const k = b.paymentMethod;
    paidByMethod[k] = (paidByMethod[k] || 0) + b.billAmount;
  });
  console.log('\n=== Paid bills (utility expenses) by paymentMethod ===');
  Object.entries(paidByMethod).forEach(([k, v]) => console.log(`  ${k.padEnd(15)} ${fmt(v)}`));

  // --- LoadPurchases with no supplier vs with supplier
  const loadPurchases = await LoadPurchase.find({}).lean();
  console.log(`\n=== LoadPurchases ===`);
  console.log(`  Total: ${loadPurchases.length}`);
  console.log(`  With supplier:    ${loadPurchases.filter((p) => p.supplierId).length}`);
  console.log(`  Without supplier: ${loadPurchases.filter((p) => !p.supplierId).length}`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
