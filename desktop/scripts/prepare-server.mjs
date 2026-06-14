#!/usr/bin/env node
/**
 * Prepare the Express backend for bundling inside the Electron desktop app.
 * - Installs production server dependencies
 * - Copies server/.env.production (or .env) to desktop/server.env
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, '..');
const serverRoot = path.join(desktopRoot, '..', 'server');
const serverEnvDest = path.join(desktopRoot, 'server.env');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const envSources = [
  path.join(serverRoot, '.env.production'),
  path.join(serverRoot, '.env'),
];

let copied = false;
for (const src of envSources) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, serverEnvDest);
    console.log(`[prepare-server] Copied ${path.basename(src)} -> desktop/server.env`);
    copied = true;
    break;
  }
}

if (!copied) {
  console.error(`
ERROR: No server environment file found.

Create server/.env.production (copy from server/.env.example) with at least:
  NODE_ENV=production
  PORT=3000
  MONGODB_URL=...
  JWT_SECRET=...
`);
  process.exit(1);
}

let envContents = fs.readFileSync(serverEnvDest, 'utf8');
if (!/^NODE_ENV=/m.test(envContents)) {
  envContents = `NODE_ENV=production\n${envContents}`;
  fs.writeFileSync(serverEnvDest, envContents);
}

console.log('[prepare-server] Installing production server dependencies...');
run('npm', ['ci', '--omit=dev'], { cwd: serverRoot });

console.log('[prepare-server] Server bundle ready.\n');
