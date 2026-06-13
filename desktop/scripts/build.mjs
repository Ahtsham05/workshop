#!/usr/bin/env node
/**
 * Build production desktop installers.
 * Reads VITE_BACKEND_URL from desktop/.env.production or the environment.
 *
 * Usage:
 *   node scripts/build.mjs          # build for current OS
 *   node scripts/build.mjs linux    # Linux .deb + AppImage
 *   node scripts/build.mjs win      # Windows .exe (run on Windows)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, '..');
const clientRoot = path.join(desktopRoot, '..', 'client');

function loadApiUrl() {
  if (process.env.VITE_BACKEND_URL) {
    return process.env.VITE_BACKEND_URL.trim();
  }

  const envFile = path.join(desktopRoot, '.env.production');
  if (!fs.existsSync(envFile)) return '';

  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^VITE_BACKEND_URL\s*=\s*["']?([^"'\s#]+)["']?/);
    if (match) return match[1].trim();
  }

  return '';
}

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

const platform = process.argv[2] || 'current';
const apiUrl = loadApiUrl();

if (!apiUrl) {
  console.error(`
ERROR: VITE_BACKEND_URL is required.

Create desktop/.env.production (copy from .env.production.example) with your server URL, e.g.:

  VITE_BACKEND_URL=https://your-server.com/v1

Or pass it inline:

  VITE_BACKEND_URL=https://your-server.com/v1 npm run dist
`);
  process.exit(1);
}

console.log(`\nBuilding Logix Plus Desktop`);
console.log(`  API URL : ${apiUrl}`);
console.log(`  Platform: ${platform}\n`);

run('npm', ['run', 'build:electron'], {
  cwd: clientRoot,
  env: {
    ...process.env,
    VITE_ELECTRON: 'true',
    VITE_BACKEND_URL: apiUrl,
  },
});

const builderArgs = ['electron-builder'];
if (platform === 'linux') builderArgs.push('--linux');
else if (platform === 'win') builderArgs.push('--win');
else if (platform === 'mac') builderArgs.push('--mac');

run('npx', builderArgs, { cwd: desktopRoot });

console.log('\nDone. Installers are in desktop/dist/\n');
