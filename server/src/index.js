// Use Google DNS to resolve MongoDB Atlas SRV/TXT records
// (local ISP/router DNS often fails to resolve these records)
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

// Patch dns.promises.resolveTxt to handle network TXT-query blocks gracefully.
const _origResolveTxt = dns.promises.resolveTxt.bind(dns.promises);
dns.promises.resolveTxt = function patchedResolveTxt(hostname) {
  const nodata = Object.assign(new Error('DNS TXT timed out'), { code: 'ENODATA' });
  return Promise.race([
    _origResolveTxt(hostname).catch((err) => {
      if (err && (err.code === 'ETIMEOUT' || err.code === 'ECONNREFUSED')) throw nodata;
      throw err;
    }),
    new Promise((_, reject) => setTimeout(() => reject(nodata), 4000)),
  ]);
};

const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Mongoose will attempt to reconnect...');
});
mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected.');
});
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error:', err.message);
});

let server;
let migrationsDone = false;

async function runStartupMigrations() {
  if (migrationsDone) return;

  const db = mongoose.connection.db;

  const studentsCol = db.collection('students');
  const studentIndexes = await studentsCol.indexes();
  const staleStudentIndexes = studentIndexes.filter(
    (i) => i.key && (i.key.admissionNo !== undefined || i.name === 'admissionNo_1_organizationId_1'),
  );
  for (const idx of staleStudentIndexes) {
    await studentsCol.dropIndex(idx.name);
    logger.info(`Dropped stale students index: ${idx.name}`);
  }

  const expenseCatCol = db.collection('expensecategories');
  let expenseCatIndexes = await expenseCatCol.indexes();
  const staleExpenseCatIndexes = expenseCatIndexes.filter(
    (i) =>
      i.unique &&
      i.key &&
      i.key.organizationId !== undefined &&
      i.key.branchId !== undefined &&
      i.key.name !== undefined &&
      i.key.transactionType === undefined,
  );
  for (const idx of staleExpenseCatIndexes) {
    await expenseCatCol.dropIndex(idx.name);
    logger.info(`Dropped stale expensecategories index: ${idx.name}`);
  }

  const backfill = await expenseCatCol.updateMany(
    { $or: [{ transactionType: { $exists: false } }, { transactionType: null }] },
    { $set: { transactionType: 'business_expense' } },
  );
  if (backfill.modifiedCount > 0) {
    logger.info(`Backfilled transactionType on ${backfill.modifiedCount} expense category docs`);
  }

  expenseCatIndexes = await expenseCatCol.indexes();
  const hasTransactionTypeIndex = expenseCatIndexes.some(
    (i) => i.unique && i.key && i.key.transactionType !== undefined,
  );
  if (!hasTransactionTypeIndex) {
    await expenseCatCol.createIndex(
      { organizationId: 1, branchId: 1, name: 1, transactionType: 1 },
      { unique: true, name: 'organizationId_1_branchId_1_name_1_transactionType_1' },
    );
    logger.info('Created expensecategories unique index with transactionType');
  }

  const feeVouchersCol = db.collection('feevouchers');
  const feeVoucherIndexes = await feeVouchersCol.indexes();
  const staleFeeVoucherIndexes = feeVoucherIndexes.filter(
    (i) =>
      i.unique &&
      i.key &&
      i.key.organizationId !== undefined &&
      i.key.studentId !== undefined &&
      i.key.month !== undefined &&
      i.key.year !== undefined &&
      i.key.examId === undefined &&
      !i.partialFilterExpression,
  );
  for (const idx of staleFeeVoucherIndexes) {
    await feeVouchersCol.dropIndex(idx.name);
    logger.info(`Dropped stale feevouchers index: ${idx.name}`);
  }

  const expensesCol = db.collection('expenses');
  const expenseIndexes = await expensesCol.indexes();
  const staleExpenseNumberIndex = expenseIndexes.find(
    (i) => i.name === 'expenseNumber_1' && i.key && i.key.expenseNumber === 1 && !i.key.organizationId,
  );
  if (staleExpenseNumberIndex) {
    await expensesCol.dropIndex(staleExpenseNumberIndex.name);
    logger.info('Dropped stale global expenses index: expenseNumber_1');
  }
  const hasScopedExpenseNumberIndex = expenseIndexes.some(
    (i) => i.unique && i.key && i.key.organizationId === 1 && i.key.expenseNumber === 1,
  );
  if (!hasScopedExpenseNumberIndex) {
    await expensesCol.createIndex(
      { organizationId: 1, expenseNumber: 1 },
      { unique: true, sparse: true, name: 'organizationId_1_expenseNumber_1' },
    );
    logger.info('Created scoped expenses index: organizationId_1_expenseNumber_1');
  }

  migrationsDone = true;
}

async function startApplication() {
  if (server && mongoose.connection.readyState === 1) {
    return server;
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  logger.info('Connected to MongoDB');

  try {
    await runStartupMigrations();
  } catch (err) {
    logger.warn('Index migration warning (non-fatal):', err.message);
  }

  try {
    const { roleService } = require('./services');
    await roleService.createDefaultRoles();
    logger.info('Default roles initialized');
  } catch (error) {
    logger.error('Failed to initialize default roles:', error.message);
  }

  if (!server) {
    await new Promise((resolve, reject) => {
      server = app.listen(config.port, () => {
        logger.info(`Listening to port ${config.port}`);
        try {
          const { startPayrollScheduler } = require('./jobs/payrollScheduler');
          startPayrollScheduler();
        } catch (schedulerError) {
          logger.warn('Payroll scheduler skipped:', schedulerError.message);
        }
        try {
          const { startSalesInsightsScheduler } = require('./jobs/salesInsightsScheduler');
          startSalesInsightsScheduler();
        } catch (schedulerError) {
          logger.warn('Sales insights scheduler skipped:', schedulerError.message);
        }
        try {
          const { startPurchaseSuggestionsScheduler } = require('./jobs/purchaseSuggestionsScheduler');
          startPurchaseSuggestionsScheduler();
        } catch (schedulerError) {
          logger.warn('Purchase suggestions scheduler skipped:', schedulerError.message);
        }
        try {
          const { startSupplierScoringScheduler } = require('./jobs/supplierScoringScheduler');
          startSupplierScoringScheduler();
        } catch (schedulerError) {
          logger.warn('Supplier scoring scheduler skipped:', schedulerError.message);
        }
        try {
          const { startInventoryDriftScheduler } = require('./jobs/inventoryDriftScheduler');
          startInventoryDriftScheduler();
        } catch (schedulerError) {
          logger.warn('Inventory drift scheduler skipped:', schedulerError.message);
        }
        try {
          const { startSeasonalityScheduler } = require('./jobs/seasonalityScheduler');
          startSeasonalityScheduler();
        } catch (schedulerError) {
          logger.warn('Seasonality scheduler skipped:', schedulerError.message);
        }
        resolve(server);
      });
      server.on('error', reject);
    });
  }

  return server;
}

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
  mongoose.disconnect().catch(() => {});
});

if (require.main === module) {
  startApplication().catch((error) => {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  });
}

module.exports = { startApplication, app };
