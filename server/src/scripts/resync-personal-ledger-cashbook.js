/**
 * One-time / maintenance: create Cash Book rows for all existing My Wallet (PersonalLedger) entries.
 *
 * Usage: node src/scripts/resync-personal-ledger-cashbook.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { personalLedgerService } = require('../services');

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB');

  const { processed } = await personalLedgerService.resyncCashBookForAllPersonalLedgers();
  console.log(`Re-synced Cash Book for ${processed} personal ledger row(s).`);

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
