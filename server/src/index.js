const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');

let server;

/**
 * MongoDB Connection
 */
mongoose
  .connect(config.mongoose.url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  })
  .then(() => {
    logger.info('✅ Connected to MongoDB');

    server = app.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
    });
  })
  .catch((error) => {
    logger.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  });

/**
 * MongoDB Connection Events
 */
mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('♻️ MongoDB reconnected');
});

/**
 * Graceful Shutdown
 */
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      mongoose.connection.close(false, () => {
        logger.info('🛑 MongoDB connection closed');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
};

/**
 * Process Handlers
 */

// Fatal errors → exit
process.on('uncaughtException', (error) => {
  logger.error('🔥 Uncaught Exception:', error);
  process.exit(1);
});

// Non-fatal → log only (DO NOT EXIT)
process.on('unhandledRejection', (error) => {
  logger.error('⚠️ Unhandled Rejection:', error);
});

// Kill signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
