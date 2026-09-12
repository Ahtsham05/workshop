/**
 * One-time / maintenance: settle open purchase invoices from supplier-ledger payments that
 * were recorded BEFORE payments started allocating to invoices.
 *
 * Until this feature landed, a "Cash Paid" row on the Supplier Ledger (and a Payment
 * Voucher's supplier line) moved real money and moved the supplier's balance, but no
 * invoice knew about it — the ledger said paid while the purchase list still said
 * outstanding. New payments now allocate as they are recorded; this script does the same
 * for the historical ones, oldest payment first so the FIFO order matches what would have
 * happened had they allocated at the time.
 *
 * Two kinds of row are replayed, and neither moves money (each already banked whatever it
 * banked when it was entered):
 *   • `payment_made` with no `referenceId` — a standalone payment. An entry tied to a
 *     purchase is already reflected on that purchase, so it is skipped.
 *   • `purchase_return` — goods sent back against a specific invoice, where the credit only
 *     ever reached the account balance. Credited to its own invoice, never FIFO.
 *
 * Anything that already has a SupplierPayment record is skipped, so this is safe to re-run.
 *
 * Usage:
 *   node src/scripts/backfill-supplier-payment-allocations.js --dry-run   # report only
 *   node src/scripts/backfill-supplier-payment-allocations.js             # apply
 *   node src/scripts/backfill-supplier-payment-allocations.js --supplier=<id>
 *   node src/scripts/backfill-supplier-payment-allocations.js --organization=<id>
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { SupplierLedger, SupplierPayment, PurchaseReturn } = require('../models');
const supplierPaymentService = require('../services/supplierPayment.service');
const { formatMoney } = require('../utils/money');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const supplierArg = args.find((arg) => arg.startsWith('--supplier='));
const organizationArg = args.find((arg) => arg.startsWith('--organization='));

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log(`Connected to MongoDB${isDryRun ? ' (DRY RUN — nothing will be written)' : ''}`);

  const filter = {
    debit: { $gt: 0 },
    $or: [
      { transactionType: 'payment_made', referenceId: { $in: [null, undefined] } },
      { transactionType: 'purchase_return' },
    ],
  };
  if (supplierArg) filter.supplier = supplierArg.split('=')[1];
  if (organizationArg) filter.organizationId = organizationArg.split('=')[1];

  const entries = await SupplierLedger.find(filter).sort({ transactionDate: 1, createdAt: 1 });
  console.log(`Found ${entries.length} unapplied payment(s)/return(s) in the ledger.`);

  let allocatedCount = 0;
  let skippedCount = 0;
  let totalApplied = 0;
  /** purchaseId → amount this dry run has already "spent" on it. Unused in a real run. */
  const simulatedAllocations = new Map();

  for (const entry of entries) {
    const existing = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id }).select('paymentNumber');
    if (existing) {
      skippedCount += 1;
      continue;
    }

    if (isDryRun) {
      // A return is credited to the invoice it came from, so the preview has to resolve that
      // invoice rather than walking the FIFO queue — mirrors recordAllocationForLedgerEntry.
      let restrictToPurchaseId = null;
      if (entry.transactionType === 'purchase_return') {
        const purchaseReturn = await PurchaseReturn.findById(entry.referenceId).select('purchaseId status');
        if (!purchaseReturn?.purchaseId || purchaseReturn.status === 'rejected') {
          skippedCount += 1;
          continue;
        }
        restrictToPurchaseId = String(purchaseReturn.purchaseId);
      }

      // Same plan the real run would use, without writing it — but a real run allocates as
      // it goes, so each later payment sees less outstanding than the one before. Carry that
      // forward in `simulatedAllocations`, or the preview reports the same invoice being
      // paid over and over by every payment in the list.
      const openInvoices = (
        await supplierPaymentService.getOpenInvoicesForSupplier({
          organizationId: entry.organizationId,
          branchId: entry.branchId,
          supplier: entry.supplier,
          strategy: 'fifo',
        })
      )
        .map((invoice) => ({
          ...invoice,
          remainingAmount: invoice.remainingAmount - (simulatedAllocations.get(String(invoice._id)) || 0),
        }))
        .filter((invoice) => invoice.remainingAmount > 0.001)
        .filter((invoice) => !restrictToPurchaseId || String(invoice._id) === restrictToPurchaseId);

      if (restrictToPurchaseId && openInvoices.length === 0) {
        skippedCount += 1;
        continue;
      }

      const plan = supplierPaymentService.planAllocation({ openInvoices, amount: entry.debit, mode: 'fifo' });
      for (const allocation of plan.allocations) {
        const key = String(allocation.purchase);
        simulatedAllocations.set(key, (simulatedAllocations.get(key) || 0) + allocation.amount);
      }
      console.log(
        `  [dry-run] ${new Date(entry.transactionDate).toISOString().slice(0, 10)} ` +
          `${entry.transactionType === 'purchase_return' ? 'return' : 'payment'} ${formatMoney(entry.debit)} -> ` +
          `${
            plan.allocations
              .map((allocation) => `${allocation.invoiceNumber}:${formatMoney(allocation.amount)}`)
              .join(', ') || 'nothing open'
          }` +
          `${plan.unappliedAmount > 0 ? ` (${formatMoney(plan.unappliedAmount)} would stay as credit)` : ''}`
      );
      allocatedCount += 1;
      totalApplied += plan.allocatedTotal;
      continue;
    }

    const payment = await supplierPaymentService.recordAllocationForLedgerEntry(entry, null);
    if (!payment) {
      skippedCount += 1;
      continue;
    }
    allocatedCount += 1;
    totalApplied += payment.allocatedTotal;
    console.log(
      `  ${payment.paymentNumber} ${formatMoney(payment.amount)} -> ` +
        `${
          payment.allocations
            .map((allocation) => `${allocation.invoiceNumber}:${formatMoney(allocation.amount)}`)
            .join(', ') || 'nothing open'
        }` +
        `${payment.unappliedAmount > 0 ? ` (${formatMoney(payment.unappliedAmount)} kept as credit)` : ''}`
    );
  }

  console.log(
    `\n${isDryRun ? 'Would allocate' : 'Allocated'} ${allocatedCount} payment(s), ${formatMoney(
      totalApplied
    )} applied to invoices. ` + `${skippedCount} already had an allocation.`
  );

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
