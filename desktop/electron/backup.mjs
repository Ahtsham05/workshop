import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, dialog } from 'electron';
import AdmZip from 'adm-zip';
import Store from 'electron-store';
import { closeDatabase, getDatabase, getDbPath, openDatabase, SCHEMA_VERSION } from './db/database.mjs';
import { getServerEnvPath, parseEnvFile, restartEmbeddedServer, stopEmbeddedServer } from './server-manager.mjs';
import { getDatabaseSettings } from './local-database.mjs';
import { getSyncDashboard } from './sync/sync-dashboard.mjs';

const BACKUP_FORMAT_VERSION = 1;
const settingsStore = new Store({ name: 'desktop-backup' });
const sessionStore = new Store({ name: 'desktop-session' });
const databaseStore = new Store({ name: 'desktop-database' });

function getScope() {
  const lastScope = sessionStore.get('lastScope', {});
  return {
    organizationId: lastScope.organizationId || 'default',
    branchId: lastScope.branchId || 'default',
  };
}

function getDefaultBackupDir() {
  return path.join(app.getPath('documents'), 'Logix Plus Backups');
}

function formatBackupFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.zip`;
}

function readJsonStore(store) {
  return store.store || {};
}

function getBackupSettings() {
  return {
    destinationPath: settingsStore.get('destinationPath', getDefaultBackupDir()),
    schedule: settingsStore.get('schedule', 'off'),
    enabled: settingsStore.get('enabled', false),
    lastBackupAt: settingsStore.get('lastBackupAt', null),
    lastBackupPath: settingsStore.get('lastBackupPath', null),
    maxBackups: settingsStore.get('maxBackups', 10),
    defaultBackupDir: getDefaultBackupDir(),
  };
}

function saveBackupSettings(settings = {}) {
  const current = getBackupSettings();
  const next = {
    ...current,
    ...settings,
  };

  if (next.destinationPath) {
    settingsStore.set('destinationPath', next.destinationPath);
  }
  settingsStore.set('schedule', next.schedule);
  settingsStore.set('enabled', Boolean(next.enabled));
  settingsStore.set('maxBackups', Number(next.maxBackups || 10));

  return getBackupSettings();
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function collectBackupStats() {
  try {
    const dashboard = getSyncDashboard();
    return {
      entityPending: dashboard.entityPending,
      entityFailed: dashboard.entityFailed,
      httpPending: dashboard.httpPending,
      httpFailed: dashboard.httpFailed,
      cacheCount: dashboard.cacheCount,
      openConflicts: dashboard.openConflicts || 0,
      queueSize: dashboard.queueSize,
    };
  } catch {
    return {
      entityPending: 0,
      entityFailed: 0,
      httpPending: 0,
      httpFailed: 0,
      cacheCount: 0,
      openConflicts: 0,
      queueSize: 0,
    };
  }
}

function trackFile(zip, files, zipPath, absolutePath) {
  if (!absolutePath || !fs.existsSync(absolutePath)) return false;
  const dir = path.posix.dirname(zipPath);
  const name = path.posix.basename(zipPath);
  zip.addLocalFile(absolutePath, dir === '.' ? '' : dir, name);
  files.push({
    path: zipPath,
    size: fs.statSync(absolutePath).size,
  });
  return true;
}

function runCommand(command, args, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.on('error', () => finish({ ok: false, code: null }));
    child.on('exit', (code) => finish({ ok: code === 0, code }));

    setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok: false, code: null, timeout: true });
    }, timeoutMs);
  });
}

async function dumpLocalMongoArchive(tempDir, mongoUrl) {
  const archivePath = path.join(tempDir, 'mongo.archive.gz');
  const result = await runCommand('mongodump', [
    `--uri=${mongoUrl}`,
    `--archive=${archivePath}`,
    '--gzip',
  ]);

  if (!result.ok || !fs.existsSync(archivePath)) {
    return null;
  }

  return archivePath;
}

async function restoreLocalMongoArchive(archivePath, mongoUrl) {
  if (!archivePath || !fs.existsSync(archivePath)) {
    return { restored: false, reason: 'missing-archive' };
  }

  const result = await runCommand('mongorestore', [
    `--uri=${mongoUrl}`,
    `--archive=${archivePath}`,
    '--gzip',
    '--drop',
  ]);

  return { restored: result.ok, reason: result.ok ? 'ok' : 'mongorestore-failed' };
}

function readManifestFromZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry('manifest.json');
  if (!entry) {
    throw new Error('Invalid backup: manifest.json not found');
  }

  const manifest = JSON.parse(zip.readAsText(entry));
  const files = zip.getEntries().map((item) => ({
    path: item.entryName,
    size: item.header.size,
    compressedSize: item.header.compressedSize,
  }));

  return { manifest, files };
}

function validateManifest(manifest) {
  if (!manifest || manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error('Unsupported backup format version');
  }
  if (!manifest.createdAt) {
    throw new Error('Invalid backup manifest');
  }
  return true;
}

function rotateOldBackups(destinationPath, maxBackups) {
  if (!destinationPath || !fs.existsSync(destinationPath)) return;

  const backups = fs
    .readdirSync(destinationPath)
    .filter((name) => name.startsWith('backup-') && name.endsWith('.zip'))
    .map((name) => {
      const fullPath = path.join(destinationPath, name);
      return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const item of backups.slice(maxBackups)) {
    fs.unlinkSync(item.fullPath);
  }
}

export async function pickBackupDestination() {
  const result = await dialog.showOpenDialog({
    title: 'Choose backup folder',
    defaultPath: getBackupSettings().destinationPath || getDefaultBackupDir(),
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return null;
  }

  return result.filePaths[0];
}

export async function pickBackupFile() {
  const result = await dialog.showOpenDialog({
    title: 'Select backup file',
    defaultPath: getBackupSettings().destinationPath || getDefaultBackupDir(),
    properties: ['openFile'],
    filters: [{ name: 'Logix Plus Backup', extensions: ['zip'] }],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return null;
  }

  return result.filePaths[0];
}

export function listBackups(destinationPath) {
  const dir = destinationPath || getBackupSettings().destinationPath;
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('backup-') && name.endsWith('.zip'))
    .map((name) => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      let manifest = null;
      try {
        manifest = readManifestFromZip(fullPath).manifest;
      } catch {
        manifest = null;
      }

      return {
        fileName: name,
        path: fullPath,
        size: stat.size,
        createdAt: manifest?.createdAt || stat.mtime.toISOString(),
        organizationId: manifest?.organizationId || null,
        branchId: manifest?.branchId || null,
        includesMongo: Boolean(manifest?.includesMongo),
        stats: manifest?.stats || null,
        valid: Boolean(manifest),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createBackup({ destinationPath, label } = {}) {
  const settings = getBackupSettings();
  const targetDir = destinationPath || settings.destinationPath || getDefaultBackupDir();
  ensureDirectory(targetDir);

  const scope = getScope();
  const dbSettings = getDatabaseSettings();
  const dbPath = getDbPath(scope);

  try {
    getDatabase().pragma('wal_checkpoint(FULL)');
  } catch {
    // database may not be open yet
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logix-backup-'));
  const zip = new AdmZip();
  const stats = collectBackupStats();

  const files = [];

  trackFile(zip, files, 'sqlite/workshop.db', dbPath);
  trackFile(zip, files, 'sqlite/workshop.db-wal', `${dbPath}-wal`);
  trackFile(zip, files, 'sqlite/workshop.db-shm', `${dbPath}-shm`);

  const serverEnvPath = getServerEnvPath();
  trackFile(zip, files, 'config/server.env', serverEnvPath);

  const databaseJson = JSON.stringify(readJsonStore(databaseStore), null, 2);
  const sessionJson = JSON.stringify(readJsonStore(sessionStore), null, 2);
  zip.addFile('config/desktop-database.json', Buffer.from(databaseJson));
  zip.addFile('config/desktop-session.json', Buffer.from(sessionJson));
  files.push({ path: 'config/desktop-database.json', size: Buffer.byteLength(databaseJson) });
  files.push({ path: 'config/desktop-session.json', size: Buffer.byteLength(sessionJson) });

  let includesMongo = false;
  let mongoNote = null;
  if (dbSettings.mode === 'local') {
    const env = serverEnvPath ? parseEnvFile(serverEnvPath) : {};
    const mongoUrl = env.MONGODB_URL;
    if (mongoUrl) {
      const archivePath = await dumpLocalMongoArchive(tempDir, mongoUrl);
      if (archivePath) {
        trackFile(zip, files, 'mongo/mongo.archive.gz', archivePath);
        includesMongo = true;
      } else {
        mongoNote = 'Local MongoDB dump skipped — mongodump not available or dump failed';
      }
    }
  }

  const manifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    label: label || null,
    appVersion: app.getVersion(),
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    sqliteSchemaVersion: SCHEMA_VERSION,
    databaseMode: dbSettings.mode,
    includesMongo,
    mongoNote,
    stats,
    files,
  };

  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

  const outputPath = path.join(targetDir, formatBackupFileName());
  zip.writeZip(outputPath);
  fs.rmSync(tempDir, { recursive: true, force: true });

  rotateOldBackups(targetDir, settings.maxBackups);

  settingsStore.set('lastBackupAt', manifest.createdAt);
  settingsStore.set('lastBackupPath', outputPath);

  return {
    path: outputPath,
    fileName: path.basename(outputPath),
    size: fs.statSync(outputPath).size,
    manifest,
  };
}

export function validateBackup(zipPath) {
  const { manifest, files } = readManifestFromZip(zipPath);
  validateManifest(manifest);

  const requiredPaths = ['sqlite/workshop.db', 'manifest.json'];
  const entryNames = new Set(files.map((file) => file.path));
  const missing = requiredPaths.filter((item) => !entryNames.has(item));
  if (missing.length > 0) {
    throw new Error(`Backup is missing required files: ${missing.join(', ')}`);
  }

  return {
    valid: true,
    manifest,
    files,
    warnings: manifest.mongoNote ? [manifest.mongoNote] : [],
  };
}

export function previewBackup(zipPath) {
  const result = validateBackup(zipPath);
  return {
    ...result,
    fileName: path.basename(zipPath),
    path: zipPath,
    size: fs.statSync(zipPath).size,
  };
}

async function createSafetyBackup() {
  const safetyDir = path.join(app.getPath('userData'), 'safety-backups');
  ensureDirectory(safetyDir);
  return createBackup({ destinationPath: safetyDir, label: 'pre-restore-safety' });
}

function extractZipEntry(zip, entryName, targetPath) {
  const entry = zip.getEntry(entryName);
  if (!entry) return false;

  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, entry.getData());
  return true;
}

export async function restoreBackup(zipPath) {
  const preview = previewBackup(zipPath);
  const scope = getScope();
  const dbPath = getDbPath(scope);

  const safety = await createSafetyBackup();

  closeDatabase();
  stopEmbeddedServer();

  const zip = new AdmZip(zipPath);

  extractZipEntry(zip, 'sqlite/workshop.db', dbPath);
  extractZipEntry(zip, 'sqlite/workshop.db-wal', `${dbPath}-wal`);
  extractZipEntry(zip, 'sqlite/workshop.db-shm', `${dbPath}-shm`);

  const serverEnvPath = getServerEnvPath();
  if (serverEnvPath) {
    extractZipEntry(zip, 'config/server.env', serverEnvPath);
  }

  const databaseEntry = zip.getEntry('config/desktop-database.json');
  if (databaseEntry) {
    const parsed = JSON.parse(zip.readAsText(databaseEntry));
    databaseStore.clear();
    for (const [key, value] of Object.entries(parsed)) {
      databaseStore.set(key, value);
    }
  }

  const sessionEntry = zip.getEntry('config/desktop-session.json');
  if (sessionEntry) {
    const parsed = JSON.parse(zip.readAsText(sessionEntry));
    sessionStore.clear();
    for (const [key, value] of Object.entries(parsed)) {
      sessionStore.set(key, value);
    }
  }

  let mongoRestore = { restored: false, reason: 'not-included' };
  if (preview.manifest.includesMongo) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logix-restore-'));
    const archivePath = path.join(tempDir, 'mongo.archive.gz');
    extractZipEntry(zip, 'mongo/mongo.archive.gz', archivePath);

    const env = serverEnvPath ? parseEnvFile(serverEnvPath) : {};
    if (env.MONGODB_URL) {
      mongoRestore = await restoreLocalMongoArchive(archivePath, env.MONGODB_URL);
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  openDatabase(getScope());
  await restartEmbeddedServer();

  return {
    restored: true,
    restoredFrom: zipPath,
    safetyBackupPath: safety.path,
    manifest: preview.manifest,
    mongoRestore,
  };
}

function scheduleIntervalMs(schedule) {
  switch (schedule) {
    case 'daily':
      return 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export async function maybeRunScheduledBackup() {
  const settings = getBackupSettings();
  if (!settings.enabled || settings.schedule === 'off') {
    return { skipped: true, reason: 'disabled' };
  }

  const intervalMs = scheduleIntervalMs(settings.schedule);
  if (!intervalMs) {
    return { skipped: true, reason: 'invalid-schedule' };
  }

  if (!settings.destinationPath) {
    return { skipped: true, reason: 'missing-destination' };
  }

  const lastBackupAt = settings.lastBackupAt ? new Date(settings.lastBackupAt).getTime() : 0;
  if (Date.now() - lastBackupAt < intervalMs) {
    return { skipped: true, reason: 'not-due' };
  }

  const result = await createBackup({ destinationPath: settings.destinationPath });
  return { created: true, ...result };
}

export {
  getBackupSettings,
  saveBackupSettings,
  getDefaultBackupDir,
};
