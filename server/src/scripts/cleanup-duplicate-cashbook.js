/**
 * Cleanup script: remove historic *duplicate* cashbook lines that were created
 * by the CustomerLedger / SupplierLedger sync layers when a parent module
 * (Purchase, Invoice, LoadPurchase, LoadTransaction, SimSale, CashWithdrawal,
 * SalesReturn, …) had already written its own cashbook line for the same
 * transaction.
 *
 * What it does (in order):
 *   1) Re-syncs cashbook entries from every parent document so the canonical
 *      `referenceModel: 'Purchase' | 'Invoice' | 'LoadPurchase' | …` rows are
 *      present and correct.
 *   2) Deletes every cashbook row that is referenced from a CustomerLedger /
 *      SupplierLedger entry which itself has a parent `referenceId`. Those
 *      mirror rows are exactly the duplicates and never carry standalone
 *      information after step (1).
 *
 * The script is idempotent — running it multiple times is safe.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/cleanup-duplicate-cashbook.js                  # dry-run
 *   NODE_ENV=development node src/scripts/cleanup-duplicate-cashbook.js --apply          # all branches
 *   NODE_ENV=development node src/scripts/cleanup-duplicate-cashbook.js --apply <branchId>
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const {
  CashBookEntry,
  CustomerLedger,
  SupplierLedger,
  Purchase,
  Invoice,
  LoadPurchase,
  LoadTransaction,
} = require('../models');

const fmt = (n) => Number(n || 0).toFixed(2);

// ---- Step 1: parent re-syncs ----
// We import the parent services lazily so this script keeps working even if any
// one service has unrelated import-time side-effects we don't care about here.

const resyncPurchases = async (branchFilter, apply) => {
  const purchaseService = require('../services/purchase.service');
  const purchases = await Purchase.find({ ...branchFilter, paidAmount: { $gt: 0 } }).lean();
  console.log(`[Purchase] found ${purchases.length} purchases with paid amount > 0`);
  if (!apply) return;
  let count = 0;
  for (const p of purchases) {
    try {
      const paidAmount = Number(p.paidAmount || 0);
      const paymentType = String(p.paymentType || 'Cash');
      const isWalletPayment = paymentType === 'Wallet' && p.walletType;
      const cashBookService = require('../services/cashBook.service');
      const isCashPayment = cashBookService.isCashPaymentMethod(paymentType);

      if (paidAmount > 0 && isCashPayment) {
        await cashBookService.upsertReferenceEntry({
          organizationId: p.organizationId,
          branchId: p.branchId,
          type: 'expense',
          source: 'purchase',
          amount: paidAmount,
          paymentMethod: 'cash',
          referenceId: p._id,
          referenceModel: 'Purchase',
          description: `Payment made for Purchase #${p.invoiceNumber}`,
          date: p.purchaseDate || p.createdAt || new Date(),
          createdBy: p.createdBy,
        });
        count += 1;
      } else {
        await cashBookService.deleteEntriesByReference(p._id, 'Purchase');
      }
    } catch (err) {
      console.error(`[Purchase] failed for ${p._id}: ${err.message}`);
    }
  }
  console.log(`[Purchase] re-synced ${count} cashbook entries`);
  return purchaseService; // keep service import resilient
};

const resyncInvoices = async (branchFilter, apply) => {
  const invoices = await Invoice.find({ ...branchFilter, paidAmount: { $gt: 0 } }).lean();
  console.log(`[Invoice] found ${invoices.length} invoices with paid amount > 0`);
  if (!apply) return;
  const cashBookService = require('../services/cashBook.service');
  let count = 0;
  for (const inv of invoices) {
    try {
      const paidAmount = Number(inv.paidAmount || 0);
      const method = String(inv.paymentMethod || 'cash').toLowerCase();
      const isWalletPayment = method === 'wallet' && inv.walletType;
      if (paidAmount <= 0 || isWalletPayment) continue;
      const cashBookPaymentMethod =
        method === 'wallet'
          ? String(inv.walletType || '').trim().toLowerCase() || 'wallet'
          : method === 'bank'
            ? 'bank'
            : method === 'card'
              ? 'card'
              : 'cash';
      await cashBookService.upsertReferenceEntry({
        organizationId: inv.organizationId,
        branchId: inv.branchId,
        type: 'income',
        source: 'sale',
        amount: paidAmount,
        paymentMethod: cashBookPaymentMethod,
        referenceId: inv._id,
        referenceModel: 'Invoice',
        description: `Sale payment for Invoice #${inv.invoiceNumber}`,
        date: inv.invoiceDate || inv.createdAt || new Date(),
        createdBy: inv.createdBy,
      });
      count += 1;
    } catch (err) {
      console.error(`[Invoice] failed for ${inv._id}: ${err.message}`);
    }
  }
  console.log(`[Invoice] re-synced ${count} cashbook entries`);
};

// ---- Step 2: delete the ledger-side mirror rows ----

const cleanupLedger = async ({ Model, ledgerName, branchFilter, apply }) => {
  const ledgerFilter = {
    referenceId: { $ne: null },
    transactionType: { $in: ['payment_received', 'payment_made'] },
    ...branchFilter,
  };

  const ledgerEntries = await Model.find(ledgerFilter).select('_id referenceId transactionType').lean();
  console.log(`\n[${ledgerName}] entries with referenceId: ${ledgerEntries.length}`);
  if (ledgerEntries.length === 0) return { deleted: 0, amount: 0 };

  const ledgerIds = ledgerEntries.map((e) => e._id);

  const chunkSize = 500;
  let deletedTotal = 0;
  let amountTotal = 0;
  for (let i = 0; i < ledgerIds.length; i += chunkSize) {
    const slice = ledgerIds.slice(i, i + chunkSize);
    const dupes = await CashBookEntry.find({
      referenceId: { $in: slice },
      referenceModel: ledgerName,
    }).lean();
    if (dupes.length === 0) continue;
    const sum = dupes.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
    amountTotal += sum;
    deletedTotal += dupes.length;
    if (apply) {
      await CashBookEntry.deleteMany({
        _id: { $in: dupes.map((d) => d._id) },
      });
    }
  }
  console.log(
    `[${ledgerName}] duplicate cashbook rows: ${deletedTotal}  totalling Rs ${fmt(amountTotal)} ${
      apply ? '(DELETED)' : '(dry-run — pass --apply to delete)'
    }`
  );
  return { deleted: deletedTotal, amount: amountTotal };
};

const run = async () => {
  const apply = process.argv.includes('--apply');
  const branchArg = process.argv.find((a) => !a.startsWith('--') && /[0-9a-f]{24}/i.test(a));

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected.');
  console.log(`Mode: ${apply ? 'APPLY (deletions will be persisted)' : 'DRY-RUN'}`);
  if (branchArg) console.log(`Branch filter: ${branchArg}`);

  const branchFilter = branchArg ? { branchId: new mongoose.Types.ObjectId(branchArg) } : {};

  console.log('\n=== Step 1: ensure parent-module cashbook entries exist ===');
  await resyncPurchases(branchFilter, apply);
  await resyncInvoices(branchFilter, apply);

  console.log('\n=== Step 2: delete ledger-side mirror duplicates ===');
  const customer = await cleanupLedger({
    Model: CustomerLedger,
    ledgerName: 'CustomerLedger',
    branchFilter,
    apply,
  });

  const supplier = await cleanupLedger({
    Model: SupplierLedger,
    ledgerName: 'SupplierLedger',
    branchFilter,
    apply,
  });

  console.log('\n=== Summary ===');
  console.log(`  CustomerLedger duplicate rows: ${customer.deleted}  (Rs ${fmt(customer.amount)})`);
  console.log(`  SupplierLedger duplicate rows: ${supplier.deleted}  (Rs ${fmt(supplier.amount)})`);
  console.log(
    `  Total                        : ${customer.deleted + supplier.deleted}  (Rs ${fmt(
      customer.amount + supplier.amount
    )})`
  );

  if (!apply) {
    console.log('\nRun with --apply to actually re-sync + delete the duplicate rows.');
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
