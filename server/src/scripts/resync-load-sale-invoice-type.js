/**
 * One-time script to fix Customer Ledger entries for Load sales that were sold
 * fully or partially on credit but had `invoiceType` hardcoded to 'cash'.
 * Re-runs the (now-fixed) ledger sync for every load transaction with a linked customer.
 *
 * Usage: node src/scripts/resync-load-sale-invoice-type.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { LoadTransaction } = require('../models');
const { syncCustomerLedgerForLoadTransaction } = require('../services/loadTransaction.service');

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB');

  const transactions = await LoadTransaction.find({ customerId: { $ne: null } });
  console.log(`Found ${transactions.length} customer-linked load transaction(s) to re-sync`);

  let synced = 0;
  for (const transaction of transactions) {
    await syncCustomerLedgerForLoadTransaction(transaction);
    synced++;
  }

  console.log(`Done. Re-synced ${synced} load transaction ledger entr(y/ies).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
