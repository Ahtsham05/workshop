const mongoose = require('mongoose');
const config = require('../config/config');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)}${units[index]}`;
}

function detectDatabaseMode(url = config.mongoose.url) {
  if (!url) return 'unknown';
  if (/mongodb(\+srv)?:\/\/(127\.0\.0\.1|localhost)/i.test(url)) {
    return 'local';
  }
  return 'cloud';
}

const getDatabaseHealth = async () => {
  const mode = detectDatabaseMode();
  const readyState = mongoose.connection.readyState;

  if (readyState !== 1) {
    return {
      connected: false,
      latency: null,
      storageUsed: null,
      mode,
      database: mongoose.connection.name || null,
      host: mongoose.connection.host || null,
    };
  }

  const startedAt = Date.now();
  await mongoose.connection.db.admin().ping();
  const latency = Date.now() - startedAt;

  let storageUsed = null;
  try {
    const stats = await mongoose.connection.db.stats();
    storageUsed = formatBytes((stats.dataSize || 0) + (stats.indexSize || 0));
  } catch {
    storageUsed = null;
  }

  return {
    connected: true,
    latency,
    storageUsed,
    mode,
    database: mongoose.connection.name,
    host: mongoose.connection.host,
  };
};

module.exports = {
  getDatabaseHealth,
  detectDatabaseMode,
};
