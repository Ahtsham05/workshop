/**
 * One-time script to re-sync cash book entries for all paid bill payments.
 * Previously only an INCOME entry was created; now we also create an EXPENSE entry.
 *
 * Usage: node src/scripts/resync-bill-cashbook.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { BillPayment } = require('../models');
const cashBookService = require('../services/cashBook.service');

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB');

  const allBills = await BillPayment.find({});
  console.log(`Found ${allBills.length} bill(s) to re-sync`);

  let synced = 0;
  for (const bill of allBills) {
    // Delete old entries and re-create
    await cashBookService.deleteEntriesByReference(bill._id, 'BillPayment');

    const commonFields = {
      organizationId: bill.organizationId,
      branchId: bill.branchId,
      source: 'bill_payment',
      paymentMethod: bill.paymentMethod,
      referenceId: bill._id,
      referenceModel: 'BillPayment',
      createdBy: bill.createdBy,
    };

    // INCOME entry always (customer paid at counter)
    await cashBookService.upsertReferenceEntry({
      ...commonFields,
      type: 'income',
      amount: bill.totalReceived,
      date: bill.createdAt,
      description: `Bill collection: ${bill.companyName} – Ref# ${bill.referenceNumber} (${bill.customerName})`,
    });

    // EXPENSE entry only if paid to utility company
    if (bill.status === 'paid') {
      await cashBookService.upsertReferenceEntry({
        ...commonFields,
        type: 'expense',
        amount: bill.billAmount,
        date: bill.paymentDate || bill.createdAt,
        description: `Bill paid to ${bill.companyName} – Ref# ${bill.referenceNumber} (${bill.customerName})`,
      });
    }

    synced++;
    console.log(`[${synced}/${allBills.length}] Synced: ${bill.companyName} – ${bill.referenceNumber} (${bill.status})`);
  }

  console.log(`Done. Re-synced ${synced} bill payment(s).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
