/**
 * One-time / maintenance: create the hidden shadow Customer record for every
 * existing Employee that doesn't have one yet, so they can be billed through
 * the Invoice screen like a customer.
 *
 * Usage: node src/scripts/backfill-employee-customer-accounts.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { Employee } = require('../models');
const { employeeService } = require('../services');

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB');

  const employees = await Employee.find({ customerId: { $exists: false } });
  console.log(`Found ${employees.length} employee(s) without a shadow customer account.`);

  let created = 0;
  for (const employee of employees) {
    await employeeService.ensureEmployeeCustomerAccount(employee);
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
