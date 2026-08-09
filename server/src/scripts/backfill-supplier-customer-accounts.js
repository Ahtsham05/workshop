/**
 * One-time / maintenance: create the hidden shadow Customer record for every
 * existing Supplier that doesn't have one yet, so a supplier can also be
 * billed as a customer (sold products/services) through the Invoice, Load,
 * SIM Sale and Services screens like any other customer.
 *
 * Usage: node src/scripts/backfill-supplier-customer-accounts.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { Supplier } = require('../models');
const { supplierService } = require('../services');

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB');

  const suppliers = await Supplier.find({ customerId: { $exists: false } });
  console.log(`Found ${suppliers.length} supplier(s) without a shadow customer account.`);

  let created = 0;
  for (const supplier of suppliers) {
    await supplierService.ensureSupplierCustomerAccount(supplier);
    created += 1;
  }

  console.log(`Created ${created} shadow customer account(s).`);

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
