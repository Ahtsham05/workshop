import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDatabase, closeDatabase, setMeta, getMeta } from './db/database.mjs';
import {
  pullFromServer,
  pushToServer,
  runFullSync,
  queueOperation,
  getSyncStatus,
  listLocalProducts,
  listLocalCustomers,
  registerDevice,
} from './sync/engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow = null;
let syncTimer = null;

function getRendererPath() {
  // Packaged: resources/app.asar/out/renderer/index.html
  // Dev:       desktop/out/renderer/index.html
  return path.join(__dirname, '../out/renderer/index.html');
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.mjs');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
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

async function safeSync({ bootstrap = false } = {}) {
  if (!isOnline()) return { skipped: true, reason: 'offline' };
  try {
    await registerDevice();
    return await runFullSync({ bootstrap });
  } catch (err) {
    console.error('[sync]', err.message);
    return { error: err.message };
  }
}

function startSyncLoop() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    safeSync().catch(() => {});
  }, 60_000);
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
    }
    return { ok: true };
  });

  ipcMain.handle('sync:status', () => getSyncStatus());
  ipcMain.handle('sync:pull', (_e, opts) => pullFromServer(opts));
  ipcMain.handle('sync:push', () => pushToServer());
  ipcMain.handle('sync:run', (_e, opts) => safeSync(opts));
  ipcMain.handle('sync:bootstrap', () => safeSync({ bootstrap: true }));
  ipcMain.handle('sync:queue', (_e, op) => queueOperation(op));

  ipcMain.handle('db:products', (_e, search) => listLocalProducts(search));
  ipcMain.handle('db:customers', () => listLocalCustomers());
  ipcMain.handle('db:meta', (_e, key) => getMeta(key));
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

  app.whenReady().then(() => {
    setupIpc();
    createWindow();
    startSyncLoop();

    app.on('online', broadcastNetworkStatus);
    app.on('offline', broadcastNetworkStatus);
  });
}

app.on('window-all-closed', () => {
  if (syncTimer) clearInterval(syncTimer);
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Open external links in system browser
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
