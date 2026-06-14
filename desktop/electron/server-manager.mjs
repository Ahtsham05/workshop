import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, net } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PORT = 3000;
const HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/health`;
const EMBEDDED_API_URL = `http://127.0.0.1:${SERVER_PORT}/v1`;

let serverProcess = null;

function getServerRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server');
  }
  return path.join(__dirname, '../../..', 'server');
}

function getBundledServerEnvPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server.env');
  }

  const serverRoot = getServerRoot();
  const candidates = [
    path.join(serverRoot, '.env.production'),
    path.join(serverRoot, '.env'),
    path.join(__dirname, '../../server.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function getUserServerEnvPath() {
  return path.join(app.getPath('userData'), 'server.env');
}

export function ensureUserServerEnv() {
  const userPath = getUserServerEnvPath();
  if (fs.existsSync(userPath)) {
    return userPath;
  }

  const bundledPath = getBundledServerEnvPath();
  if (!bundledPath) {
    return null;
  }

  fs.mkdirSync(path.dirname(userPath), { recursive: true });
  fs.copyFileSync(bundledPath, userPath);
  return userPath;
}

export function getServerEnvPath() {
  const userPath = getUserServerEnvPath();
  if (fs.existsSync(userPath)) {
    return userPath;
  }
  return getBundledServerEnvPath();
}

export function parseEnvFile(filePath) {
  const env = {};
  if (!filePath || !fs.existsSync(filePath)) return env;

  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

export function writeEnvFile(filePath, env = {}) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export function updateServerEnv(updates = {}) {
  const envPath = ensureUserServerEnv() || getServerEnvPath();
  if (!envPath) {
    throw new Error('No server environment file found');
  }

  const env = parseEnvFile(envPath);
  Object.assign(env, updates);
  writeEnvFile(envPath, env);
  return envPath;
}

function waitForHealth(timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    const attempt = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(attempt, 750);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(attempt, 750);
      });
    };

    attempt();
  });
}

export function getEmbeddedApiUrl() {
  return EMBEDDED_API_URL;
}

export async function startEmbeddedServer() {
  if (serverProcess && !serverProcess.killed) {
    return { started: true, reason: 'already-running' };
  }

  const serverRoot = getServerRoot();
  const entry = path.join(serverRoot, 'src/desktop-bootstrap.js');

  if (!fs.existsSync(entry)) {
    console.warn('[server] Embedded backend not found at', entry);
    return { started: false, reason: 'missing' };
  }

  const envFile = ensureUserServerEnv() || getServerEnvPath();
  if (!envFile) {
    console.warn('[server] No server env file found — embedded backend skipped');
    return { started: false, reason: 'missing-env' };
  }

  const fileEnv = parseEnvFile(envFile);
  if (!fileEnv.MONGODB_URL || !fileEnv.JWT_SECRET) {
    console.warn('[server] server env missing MONGODB_URL or JWT_SECRET');
    return { started: false, reason: 'invalid-env' };
  }

  const env = {
    ...process.env,
    ...fileEnv,
    NODE_ENV: 'production',
    PORT: String(SERVER_PORT),
    FRONTEND_URL: 'file://electron',
    ELECTRON_DESKTOP: 'true',
    ELECTRON_RUN_AS_NODE: '1',
    ENV_FILE: envFile,
  };

  console.log('[server] Starting embedded backend on port', SERVER_PORT);
  console.log('[server] Using env file', envFile);

  serverProcess = spawn(process.execPath, [entry], {
    cwd: serverRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.log('[server]', text);
  });

  serverProcess.stderr?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error('[server]', text);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log('[server] Embedded backend exited', { code, signal });
    serverProcess = null;
  });

  const ready = await waitForHealth(60_000);
  if (ready) {
    console.log('[server] Embedded backend is ready at', EMBEDDED_API_URL);
  } else if (!net.isOnline()) {
    console.log('[server] Offline — embedded API unavailable; using local SQLite cache for all modules');
  } else {
    console.warn('[server] Embedded backend not ready yet — app will continue in offline mode');
  }

  return { started: ready, reason: ready ? 'ok' : net.isOnline() ? 'timeout' : 'offline' };
}

export function stopEmbeddedServer() {
  if (!serverProcess || serverProcess.killed) return;

  serverProcess.kill('SIGTERM');
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGKILL');
    }
  }, 5000);
}

export function isEmbeddedServerRunning() {
  return Boolean(serverProcess && !serverProcess.killed);
}

export async function restartEmbeddedServer() {
  stopEmbeddedServer();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return startEmbeddedServer();
}

export async function ensureEmbeddedServerWhenOnline() {
  if (!net.isOnline()) {
    return { started: false, reason: 'offline' };
  }
  return startEmbeddedServer();
}
