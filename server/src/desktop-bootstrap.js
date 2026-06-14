const { startApplication } = require('./index');
const logger = require('./config/logger');

const RETRY_MS = 15_000;
const isDesktopEmbedded = process.env.ELECTRON_DESKTOP === 'true';

async function runDesktopServer() {
  while (true) {
    try {
      await startApplication();
      logger.info('Embedded desktop API server is ready');
      return;
    } catch (error) {
      logger.error(`Desktop server startup failed: ${error.message}`);
      if (!isDesktopEmbedded) {
        process.exit(1);
      }
      logger.info(`Retrying embedded server in ${RETRY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

runDesktopServer();
