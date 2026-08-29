/**
 * Migration Script: backfill isActive:true on suppliers that predate the field.
 *
 * The Supplier schema defaults isActive to true, but Mongoose defaults only apply to
 * new documents, never retroactively to what's already stored — so most existing
 * suppliers simply have no isActive field at all. The app already treats a missing
 * field as active everywhere (supplier.service.js's ACTIVE_ONLY_FILTER, the frontend's
 * `supplier.isActive !== false`), but a raw Mongo sort treats a missing field as lower
 * than an explicit `false`, which put explicitly-deactivated suppliers ABOVE
 * never-touched ones in a `-isActive` sort — the opposite of the intended
 * active-first/inactive-last order on the Suppliers list. Same issue/fix as
 * migrate-product-active-default.js.
 *
 * This only sets the field where it's absent; it never touches documents that already
 * have isActive: true or isActive: false.
 *
 * Run once:
 *   node src/scripts/migrate-supplier-active-default.js
 */

const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');
const { Supplier } = require('../models');

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB');

    const result = await Supplier.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );

    logger.info(`Backfilled isActive:true on ${result.modifiedCount} supplier(s).`);
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
