// Use Google DNS to resolve MongoDB Atlas SRV/TXT records
// (local ISP/router DNS often fails to resolve these records)
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

// Patch dns.promises.resolveTxt to handle network TXT-query blocks gracefully.
// MongoDB driver v5 uses dns.promises.resolveTxt(); some ISP/router firmwares
// drop TXT queries (anti-DDoS amplification measure).  TXT is OPTIONAL for
// mongodb+srv: the driver's own code already ignores ENODATA/ENOTFOUND errors,
// so we convert any timeout into ENODATA so it skips the TXT step safely.
const _origResolveTxt = dns.promises.resolveTxt.bind(dns.promises);
dns.promises.resolveTxt = function patchedResolveTxt(hostname) {
  const nodata = Object.assign(new Error('DNS TXT timed out'), { code: 'ENODATA' });
  return Promise.race([
    _origResolveTxt(hostname).catch(err => {
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
mongoose.connect(config.mongoose.url, config.mongoose.options).then(async () => {
  logger.info('Connected to MongoDB');

  // Drop stale indexes that conflict with the current schema
  try {
    const db = mongoose.connection.db;
    const studentsCol = db.collection('students');
    const indexes = await studentsCol.indexes();
    // Drop any index referencing the old 'admissionNo' field
    const staleIndexes = indexes.filter(
      (i) => i.key && (i.key.admissionNo !== undefined || i.name === 'admissionNo_1_organizationId_1')
    );
    for (const idx of staleIndexes) {
      await studentsCol.dropIndex(idx.name);
      logger.info(`Dropped stale students index: ${idx.name}`);
    }
  } catch (err) {
    logger.warn('Index migration warning (non-fatal):', err.message);
  }

  // Initialize default roles (Admin, Manager, Cashier, Viewer)
  try {
    const { roleService } = require('./services');
    await roleService.createDefaultRoles();
    logger.info('Default roles initialized');
  } catch (error) {
    logger.error('Failed to initialize default roles:', error.message);
  }

  server = app.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);

    // Try to auto-reconnect WhatsApp using any saved session.
    // This runs in the background and is safe to fail silently.
    const { whatsappService } = require('./services');
    whatsappService.tryAutoConnect();
  });
}).catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

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
});
