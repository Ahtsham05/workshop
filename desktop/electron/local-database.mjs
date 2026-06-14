import fs from 'fs';
import net from 'net';
import path from 'path';
import { app } from 'electron';
import Store from 'electron-store';
import {
  ensureUserServerEnv,
  getServerEnvPath,
  parseEnvFile,
  updateServerEnv,
  restartEmbeddedServer,
  isEmbeddedServerRunning,
  getEmbeddedApiUrl,
} from './server-manager.mjs';

const DEFAULT_LOCAL_MONGO_URL = 'mongodb://127.0.0.1:27017/logixplus';
const configStore = new Store({ name: 'desktop-database' });

function parseMongoUrl(url = DEFAULT_LOCAL_MONGO_URL) {
  try {
    const normalized = String(url)
      .replace(/^mongodb\+srv:\/\//, 'https://')
      .replace(/^mongodb:\/\//, 'http://');
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: Number(parsed.port || 27017),
      database: parsed.pathname.replace(/^\//, '') || 'logixplus',
    };
  } catch {
    return { host: '127.0.0.1', port: 27017, database: 'logixplus' };
  }
}

function probeTcpHost(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => resolve(false));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function getStoredSettings() {
  return {
    mode: configStore.get('mode', 'cloud'),
    localMongoUrl: configStore.get('localMongoUrl', DEFAULT_LOCAL_MONGO_URL),
    setupCompleted: configStore.get('setupCompleted', false),
    configuredAt: configStore.get('configuredAt', null),
  };
}

function maskMongoUrl(url = '') {
  return String(url).replace(/\/\/([^:@/]+):([^@/]+)@/u, '//$1:***@');
}

export function getDatabaseSettings() {
  const settings = getStoredSettings();
  const envPath = getServerEnvPath();
  const env = envPath ? parseEnvFile(envPath) : {};
  const activeMongoUrl = env.MONGODB_URL || null;

  return {
    ...settings,
    activeMongoUrl: activeMongoUrl ? maskMongoUrl(activeMongoUrl) : null,
    serverEnvPath: envPath,
    defaultLocalMongoUrl: DEFAULT_LOCAL_MONGO_URL,
  };
}

export async function probeLocalMongo(url) {
  const targetUrl = url || getStoredSettings().localMongoUrl || DEFAULT_LOCAL_MONGO_URL;
  const { host, port, database } = parseMongoUrl(targetUrl);
  const reachable = await probeTcpHost(host, port);

  return {
    reachable,
    host,
    port,
    database,
    url: targetUrl,
  };
}

export async function getLocalDatabaseStatus() {
  const settings = getDatabaseSettings();
  const probe =
    settings.mode === 'local'
      ? await probeLocalMongo(settings.localMongoUrl)
      : { reachable: null, host: null, port: null, database: null, url: settings.localMongoUrl };

  const needsSetup = settings.mode === 'local' && !probe.reachable;

  return {
    mode: settings.mode,
    localMongoUrl: settings.localMongoUrl,
    activeMongoUrl: settings.activeMongoUrl,
    localMongoReachable: probe.reachable,
    host: probe.host,
    port: probe.port,
    database: probe.database,
    embeddedServerRunning: isEmbeddedServerRunning(),
    needsSetup,
    setupCompleted: settings.setupCompleted,
    configuredAt: settings.configuredAt,
    serverEnvPath: settings.serverEnvPath,
    defaultLocalMongoUrl: DEFAULT_LOCAL_MONGO_URL,
  };
}

export async function evaluateLocalDatabaseStartup() {
  ensureUserServerEnv();
  const status = await getLocalDatabaseStatus();
  return status;
}

export async function saveDatabaseSettings({ mode, localMongoUrl }) {
  if (!['cloud', 'local'].includes(mode)) {
    throw new Error('Invalid database mode');
  }

  const nextUrl =
    mode === 'local'
      ? String(localMongoUrl || DEFAULT_LOCAL_MONGO_URL).trim()
      : null;

  if (mode === 'local') {
    const probe = await probeLocalMongo(nextUrl);
    if (!probe.reachable) {
      throw new Error(
        `Local MongoDB is not reachable at ${probe.host}:${probe.port}. Start MongoDB and try again.`,
      );
    }
  }

  ensureUserServerEnv();

  const bundledEnvPath = getServerEnvPath();
  const env = bundledEnvPath ? parseEnvFile(bundledEnvPath) : {};
  const cloudMongoUrl = configStore.get('cloudMongoUrl') || env.MONGODB_URL;

  if (mode === 'cloud' && !cloudMongoUrl) {
    throw new Error('Cloud MongoDB URL is missing from server configuration');
  }

  if (mode === 'cloud' && !configStore.get('cloudMongoUrl') && env.MONGODB_URL) {
    configStore.set('cloudMongoUrl', env.MONGODB_URL);
  }

  const mongoUrl = mode === 'local' ? nextUrl : configStore.get('cloudMongoUrl') || env.MONGODB_URL;
  updateServerEnv({ MONGODB_URL: mongoUrl });

  const configuredAt = new Date().toISOString();
  configStore.set('mode', mode);
  configStore.set('localMongoUrl', nextUrl || DEFAULT_LOCAL_MONGO_URL);
  configStore.set('setupCompleted', true);
  configStore.set('configuredAt', configuredAt);

  await restartEmbeddedServer();

  return getLocalDatabaseStatus();
}

export async function testLocalMongoConnection(url) {
  return probeLocalMongo(url);
}

export async function fetchDatabaseHealth(accessToken, branchId) {
  const base = getEmbeddedApiUrl();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (branchId) headers['x-branch-id'] = branchId;

  const response = await fetch(`${base}/system/database-health`, { headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    throw new Error(body?.message || `Health check failed (${response.status})`);
  }

  return body;
}

export async function restartDatabaseServer() {
  await restartEmbeddedServer();
  return getLocalDatabaseStatus();
}

export function getLocalMongoInstallGuide() {
  return {
    linux: {
      title: 'Install MongoDB on Linux',
      steps: [
        'Install MongoDB Community Edition from https://www.mongodb.com/try/download/community',
        'Start the service: sudo systemctl start mongod',
        'Enable on boot: sudo systemctl enable mongod',
        `Use connection string: ${DEFAULT_LOCAL_MONGO_URL}`,
      ],
    },
    win32: {
      title: 'Install MongoDB on Windows',
      steps: [
        'Download MongoDB Community Server MSI installer',
        'Run the installer and choose "Complete" setup',
        'Start MongoDB as a Windows service',
        `Use connection string: ${DEFAULT_LOCAL_MONGO_URL}`,
      ],
    },
    darwin: {
      title: 'Install MongoDB on macOS',
      steps: [
        'Install with Homebrew: brew tap mongodb/brew && brew install mongodb-community',
        'Start service: brew services start mongodb-community',
        `Use connection string: ${DEFAULT_LOCAL_MONGO_URL}`,
      ],
    },
  };
}

export function getUserDataServerEnvPath() {
  return path.join(app.getPath('userData'), 'server.env');
}
