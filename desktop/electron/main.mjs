import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { openDatabase, closeDatabase, setMeta, getMeta } from './db/database.mjs';
import {
  pullFromServer,
  pushToServer,
  runFullSync,
  queueOperation,
  getSyncStatus,
  listLocalProducts,
  listLocalCustomers,
  listLocalCategories,
  listLocalSuppliers,
  registerDevice,
  handleOfflineRequest,
  setCachedResponse,
  buildCacheKey,
  shouldCacheRequest,
  mergePendingIntoResponse,
  downloadAllDataForOffline,
  getOfflineBootstrapInfo,
} from './sync/engine.mjs';
import {
  getSyncDashboard,
  listFailedSyncItems,
  listDeadLetterItems,
  listSyncLogs,
  clearSyncLogs,
  retryFailedSync,
  clearSyncQueue,
  rebuildCache,
} from './sync/sync-dashboard.mjs';
import {
  hasPendingSyncWork,
  recordNetworkRecovery,
} from './sync/sync-processor.mjs';
import { saveSyncLogsExport } from './sync/sync-observability.mjs';
import { encryptSecret, decryptSecret, isEncryptionAvailable } from './secure-storage.mjs';
import {
  listOpenConflicts,
  resolveConflict,
  syncConflictsFromServer,
} from './sync/conflicts.mjs';
import {
  evaluateLocalDatabaseStartup,
  getLocalDatabaseStatus,
  saveDatabaseSettings,
  testLocalMongoConnection,
  fetchDatabaseHealth,
  restartDatabaseServer,
  getLocalMongoInstallGuide,
  getDatabaseSettings,
} from './local-database.mjs';
import { ensureUserServerEnv, startEmbeddedServer, stopEmbeddedServer, ensureEmbeddedServerWhenOnline } from './server-manager.mjs';
import {
  createBackup,
  getBackupSettings,
  saveBackupSettings,
  pickBackupDestination,
  pickBackupFile,
  listBackups,
  validateBackup,
  previewBackup,
  restoreBackup,
  maybeRunScheduledBackup,
} from './backup.mjs';
import {
  getCacheStats,
  getCacheSettings,
  saveCacheSettings,
  listCacheEntries,
  purgeExpiredCache,
  invalidateCacheByPrefix,
  invalidateCacheKey,
  clearAllCache,
  refreshAllCache,
  rebuildAllCache,
} from './sync/cache-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const sessionStore = new Store({ name: 'desktop-session' });

let mainWindow = null;
let syncTimer = null;
let backupTimer = null;

function getRendererPath() {
  return path.join(__dirname, '../out/renderer/index.html');
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.mjs');
}

function restoreLocalDatabase() {
  const lastScope = sessionStore.get('lastScope');
  if (lastScope?.organizationId && lastScope?.branchId) {
    openDatabase({
      organizationId: lastScope.organizationId,
      branchId: lastScope.branchId,
    });
    return;
  }

  openDatabase();
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function createWindow() {
  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Logix Plus Solutions',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(getRendererPath());

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function isOnline() {
  return net.isOnline();
}

function broadcastNetworkStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('network:status', { online: isOnline() });
  }
}

function broadcastDatabaseSetupRequired(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('database:setup-required', payload);
  }
}

function broadcastOfflineBootstrapProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('offline-bootstrap:progress', payload);
  }
}

function broadcastSyncStatusChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('sync:status-changed', getSyncDashboard());
    } catch {
      // database may not be open yet
    }
  }
}

async function safeSync({ bootstrap = false } = {}) {
  if (!isOnline()) return { skipped: true, reason: 'offline' };
  try {
    await registerDevice();
    const result = await runFullSync({ bootstrap });
    broadcastSyncStatusChanged();
    return result;
  } catch (err) {
    console.error('[sync]', err.message);
    broadcastSyncStatusChanged();
    return { error: err.message };
  }
}

function startSyncLoop() {
  if (syncTimer) clearTimeout(syncTimer);

  const tick = async () => {
    try {
      await safeSync();
    } catch {
      // logged in safeSync
    } finally {
      const interval = hasPendingSyncWork() ? 15_000 : 60_000;
      syncTimer = setTimeout(tick, interval);
    }
  };

  syncTimer = setTimeout(tick, 5_000);
}

function startBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(() => {
    maybeRunScheduledBackup()
      .then((result) => {
        if (result?.created) {
          console.log('[backup] Scheduled backup created:', result.path);
          broadcastSyncStatusChanged();
        }
      })
      .catch((err) => console.warn('[backup]', err.message));
  }, 60 * 60 * 1000);

  maybeRunScheduledBackup().catch((err) => console.warn('[backup]', err.message));
}

function setupIpc() {
  ipcMain.handle('network:status', () => ({ online: isOnline() }));

  ipcMain.handle('sync:configure', (_e, config = {}) => {
    if (config.apiBaseUrl) setMeta('api_base_url', config.apiBaseUrl);
    if (config.accessToken) setMeta('access_token', config.accessToken);
    if (config.branchId) setMeta('active_branch_id', config.branchId);
    if (config.organizationId) setMeta('organization_id', config.organizationId);
    if (config.deviceName) setMeta('device_name', config.deviceName);

    if (config.organizationId && config.branchId) {
      openDatabase({ organizationId: config.organizationId, branchId: config.branchId });
      sessionStore.set('lastScope', {
        organizationId: config.organizationId,
        branchId: config.branchId,
      });
    }

    return { ok: true };
  });

  ipcMain.handle('sync:status', () => getSyncStatus());
  ipcMain.handle('sync:dashboard', () => getSyncDashboard());
  ipcMain.handle('sync:failed-items', () => listFailedSyncItems());
  ipcMain.handle('sync:dead-letter-items', () => listDeadLetterItems());
  ipcMain.handle('sync:logs', (_e, limit) => listSyncLogs(limit || 50));
  ipcMain.handle('sync:clear-logs', () => clearSyncLogs());
  ipcMain.handle('sync:export-logs', (_e, opts) => saveSyncLogsExport(opts || {}));
  ipcMain.handle('secure:encrypt', (_e, plaintext) => {
    if (!plaintext) return '';
    return encryptSecret(String(plaintext));
  });
  ipcMain.handle('secure:decrypt', (_e, stored) => {
    if (!stored) return '';
    return decryptSecret(String(stored));
  });
  ipcMain.handle('secure:status', () => ({ available: isEncryptionAvailable() }));
  ipcMain.handle('sync:retry-failed', () => {
    const result = retryFailedSync();
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('sync:clear-queue', (_e, opts) => {
    const result = clearSyncQueue(opts || {});
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('sync:rebuild-cache', async () => {
    if (!isOnline()) {
      throw new Error('Internet connection is required to rebuild cache');
    }
    const result = await rebuildCache(broadcastOfflineBootstrapProgress);
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('sync:pull', (_e, opts) => pullFromServer(opts));
  ipcMain.handle('sync:push', async () => {
    const result = await pushToServer();
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('sync:conflicts', () => listOpenConflicts());
  ipcMain.handle('sync:resolve-conflict', async (_e, { conflictId, strategy }) => {
    const result = await resolveConflict(conflictId, strategy);
    if (strategy === 'local_wins' && isOnline()) {
      await pushToServer();
    }
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('sync:sync-conflicts-from-server', async () => {
    const result = await syncConflictsFromServer();
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('sync:run', (_e, opts) => safeSync(opts));
  ipcMain.handle('sync:bootstrap', () => safeSync({ bootstrap: true }));
  ipcMain.handle('sync:queue', (_e, op) => queueOperation(op));
  ipcMain.handle('sync:offline-bootstrap-info', () => getOfflineBootstrapInfo());
  ipcMain.handle('sync:download-offline-data', async () => {
    if (!isOnline()) {
      throw new Error('Internet connection is required to download offline data');
    }
    const result = await downloadAllDataForOffline(broadcastOfflineBootstrapProgress);
    broadcastSyncStatusChanged();
    return result;
  });

  ipcMain.handle('database:status', () => getLocalDatabaseStatus());
  ipcMain.handle('database:settings', () => getDatabaseSettings());
  ipcMain.handle('database:test-local', (_e, url) => testLocalMongoConnection(url));
  ipcMain.handle('database:save-config', (_e, config) => saveDatabaseSettings(config));
  ipcMain.handle('database:health', (_e, { accessToken, branchId } = {}) =>
    fetchDatabaseHealth(accessToken, branchId),
  );
  ipcMain.handle('database:restart-server', async () => {
    const result = await restartDatabaseServer();
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('database:install-guide', () => getLocalMongoInstallGuide());

  ipcMain.handle('backup:settings', () => getBackupSettings());
  ipcMain.handle('backup:save-settings', (_e, settings) => saveBackupSettings(settings));
  ipcMain.handle('backup:pick-destination', () => pickBackupDestination());
  ipcMain.handle('backup:pick-file', () => pickBackupFile());
  ipcMain.handle('backup:list', (_e, destinationPath) => listBackups(destinationPath));
  ipcMain.handle('backup:create', async (_e, opts) => {
    const result = await createBackup(opts || {});
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('backup:validate', (_e, zipPath) => validateBackup(zipPath));
  ipcMain.handle('backup:preview', (_e, zipPath) => previewBackup(zipPath));
  ipcMain.handle('backup:restore', async (_e, zipPath) => {
    const result = await restoreBackup(zipPath);
    broadcastSyncStatusChanged();
    return result;
  });

  ipcMain.handle('cache:stats', () => getCacheStats());
  ipcMain.handle('cache:settings', () => getCacheSettings());
  ipcMain.handle('cache:save-settings', (_e, settings) => saveCacheSettings(settings));
  ipcMain.handle('cache:list', (_e, opts) => listCacheEntries(opts || {}));
  ipcMain.handle('cache:purge-expired', () => {
    const result = purgeExpiredCache();
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('cache:invalidate-prefix', (_e, prefix) => {
    const result = invalidateCacheByPrefix(prefix);
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('cache:invalidate-key', (_e, cacheKey) => {
    const result = invalidateCacheKey(cacheKey);
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('cache:clear', () => {
    const result = clearAllCache();
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('cache:refresh-all', async () => {
    if (!isOnline()) {
      throw new Error('Internet connection is required to refresh cache');
    }
    const result = await refreshAllCache(broadcastOfflineBootstrapProgress);
    broadcastSyncStatusChanged();
    return result;
  });
  ipcMain.handle('cache:rebuild', async () => {
    if (!isOnline()) {
      throw new Error('Internet connection is required to rebuild cache');
    }
    const result = await rebuildAllCache(broadcastOfflineBootstrapProgress);
    broadcastSyncStatusChanged();
    return result;
  });

  ipcMain.handle('db:products', (_e, search) => listLocalProducts(search));
  ipcMain.handle('db:customers', (_e, search) => listLocalCustomers(search));
  ipcMain.handle('db:categories', (_e, search) => listLocalCategories(search));
  ipcMain.handle('db:suppliers', (_e, search) => listLocalSuppliers(search));
  ipcMain.handle('db:meta', (_e, key) => getMeta(key));

  ipcMain.handle('http:offline-request', (_e, payload) => handleOfflineRequest(payload));

  ipcMain.handle('http:cache-response', (_e, { method, path, status, data }) => {
    if (!shouldCacheRequest(method, path)) return { ok: false, skipped: true };
    const cacheKey = buildCacheKey(method, path);
    setCachedResponse(cacheKey, method, status, data);
    return { ok: true };
  });

  ipcMain.handle('http:merge-response', (_e, { method, path, data }) =>
    mergePendingIntoResponse(method, path, data),
  );
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    ensureUserServerEnv();
    setupIpc();
    restoreLocalDatabase();
    createWindow();
    startSyncLoop();
    startBackupScheduler();

    try {
      const dbStartup = await evaluateLocalDatabaseStartup();
      if (dbStartup.needsSetup) {
        mainWindow?.webContents.once('did-finish-load', () => {
          broadcastDatabaseSetupRequired(dbStartup);
        });
      }
    } catch (err) {
      console.warn('[database] Startup check failed:', err.message);
    }

    startEmbeddedServer().catch(() => {});

    app.on('online', () => {
      recordNetworkRecovery();
      broadcastNetworkStatus();
      ensureEmbeddedServerWhenOnline()
        .then(() => safeSync({ bootstrap: false }))
        .catch(() => {});
    });
    app.on('offline', broadcastNetworkStatus);
  });
}

app.on('window-all-closed', () => {
  if (syncTimer) clearTimeout(syncTimer);
  if (backupTimer) clearInterval(backupTimer);
  closeDatabase();
  stopEmbeddedServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopEmbeddedServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return { action: 'allow' };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});
