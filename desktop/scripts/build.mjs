#!/usr/bin/env node
/**
 * Build production desktop installers.
 * Bundles the Express API server and starts it automatically on app launch.
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
const DEFAULT_EMBEDDED_API_URL = 'http://127.0.0.1:3000/v1';

function loadApiUrl() {
  if (process.env.VITE_BACKEND_URL) {
    return process.env.VITE_BACKEND_URL.trim();
  }

  const envFile = path.join(desktopRoot, '.env.production');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^VITE_BACKEND_URL\s*=\s*["']?([^"'\s#]+)["']?/);
      if (match) return match[1].trim();
    }
  }

  return DEFAULT_EMBEDDED_API_URL;
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

console.log(`\nBuilding Logix Plus Desktop`);
console.log(`  API URL : ${apiUrl} (embedded backend auto-starts on launch)`);
console.log(`  Platform: ${platform}\n`);

run('node', ['scripts/prepare-server.mjs'], { cwd: desktopRoot });

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
