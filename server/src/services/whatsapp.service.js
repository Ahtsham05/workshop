/**
 * WhatsApp Service (via whatsapp-web.js — unofficial WhatsApp Web automation)
 *
 * This service manages a singleton WhatsApp client. On first start the server
 * generates a QR code that the admin scans with their WhatsApp app. After that
 * the session is persisted locally (LocalAuth) so the admin only needs to scan
 * once across server restarts.
 *
 * Key public methods:
 *  - getStatus()                     → { state, qr, qrImage }
 *  - sendMessage(phone, message)     → boolean
 *  - sendBulkMessages(recipients, message, { delay }) → { sent, failed }
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const logger = require('../config/logger');

// ── State ──────────────────────────────────────────────────────────────────────
let _client = null;
let _state = 'DISCONNECTED'; // DISCONNECTED | QR_READY | LOADING | READY | AUTH_FAILURE
let _qrRaw = null;       // raw QR string
let _qrImage = null;     // base64 data-URL for the QR image
let _initPromise = null; // ensure we only initialise once
let _reconnectTimer = null; // track auto-reconnect timer so it can be cancelled
let _loadingTimer = null;  // watchdog: reset to DISCONNECTED if stuck in LOADING too long

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Remove Chrome singleton lock files that are left behind after a crash.
 * Without this, Puppeteer refuses to start with "browser is already running".
 */
function _cleanChromeLocks() {
  const fs = require('fs');
  const path = require('path');
  const sessionDir = path.join(__dirname, '..', '..', '.wwebjs_auth', 'session-school-system');
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const f of lockFiles) {
    const p = path.join(sessionDir, f);
    try { if (fs.existsSync(p)) { fs.rmSync(p); logger.info(`WhatsApp: removed stale Chrome lock: ${f}`); } } catch (_) { /* ignore */ }
  }
}

/**
 * Normalise a Pakistani/international phone number to the WhatsApp JID format:
 *   "<countryCode><number>@c.us"
 *
 * Accepts:
 *   +92 300 1234567  →  923001234567@c.us
 *   0300-1234567     →  923001234567@c.us  (assumes PK prefix)
 *   923001234567     →  923001234567@c.us
 */
function toJid(phone) {
  if (!phone) return null;
  // Strip everything except digits
  let digits = String(phone).replace(/\D/g, '');
  // Pakistani local number starting with 0 → prepend 92
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '92' + digits.slice(1);
  }
  // If no country code but length is 10 (common local PK format), prepend 92
  if (digits.length === 10) {
    digits = '92' + digits;
  }
  return `${digits}@c.us`;
}

/** Wait for a given number of milliseconds */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Chrome executable auto-detection ──────────────────────────────────────────
// Priority:
//   1. CHROME_PATH env variable (explicit override)
//   2. Common system Chrome/Chromium paths
//   3. Dynamic `which` lookup (finds Chrome wherever it's installed)
//   4. Puppeteer's own bundled Chrome (downloaded during npm install)
function _findChrome() {
  const fs = require('fs');
  const { execSync } = require('child_process');

  const candidates = [
    process.env.CHROME_PATH,                    // explicit override via env
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/usr/local/bin/chromium',
    '/usr/local/bin/google-chrome',
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) { /* skip */ }
  }

  // Dynamic lookup — works for any installation path
  const whichTargets = ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'];
  for (const bin of whichTargets) {
    try {
      const p = execSync(`which ${bin} 2>/dev/null`, { timeout: 3000 }).toString().trim();
      if (p && fs.existsSync(p)) return p;
    } catch (_) { /* not found */ }
  }

  // Fall back to puppeteer's bundled Chrome — available if `puppeteer` (not
  // puppeteer-core) is installed and Chrome was downloaded via npm install.
  try {
    const { executablePath } = require('puppeteer');
    const p = executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (_) { /* puppeteer not available */ }

  return null;
}

function _createClient() {
  const path = require('path');
  // Use absolute path so it works regardless of process.cwd() on the server
  const dataPath = path.join(__dirname, '..', '..', '.wwebjs_auth');
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'school-system',
      dataPath,
    }),
    puppeteer: (() => {
      const chromePath = _findChrome();
      const opts = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',               // required on headless Linux servers
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-first-run',
          '--safebrowsing-disable-auto-update',
          '--ignore-certificate-errors',
          '--ignore-ssl-errors',
          '--ignore-certificate-errors-spki-list',
        ],
        timeout: 60000,
      };
      if (chromePath) {
        logger.info(`WhatsApp: using Chrome at ${chromePath}`);
        opts.executablePath = chromePath;
      } else {
        logger.error('WhatsApp: no Chrome/Chromium found! Install Chrome on the server or set CHROME_PATH env variable.');
      }
      return opts;
    })(),
    // Keep the WhatsApp Web version that wwebjs ships with
    webVersionCache: {
      type: 'local',
    },
  });

  client.on('qr', async (qr) => {
    _state = 'QR_READY';
    _qrRaw = qr;
    try {
      _qrImage = await QRCode.toDataURL(qr);
    } catch (e) {
      logger.error('WhatsApp QR generation error:', e);
    }
    logger.info('WhatsApp: QR code ready — scan with your phone');
  });

  client.on('loading_screen', (percent) => {
    // Do NOT override QR_READY — loading_screen can fire after the qr event
    // and would hide the QR from the frontend
    if (_state !== 'QR_READY' && _state !== 'READY') {
      _state = 'LOADING';
    }
    logger.info(`WhatsApp: loading ${percent}%`);
  });

  client.on('authenticated', () => {
    _state = 'LOADING';
    _qrRaw = null;
    _qrImage = null;
    logger.info('WhatsApp: authenticated');
  });

  client.on('ready', () => {
    _state = 'READY';
    logger.info('WhatsApp: client is ready');
  });

  client.on('auth_failure', (msg) => {
    _state = 'AUTH_FAILURE';
    _client = null;
    _initPromise = null;
    logger.error('WhatsApp auth failure:', msg);
  });

  client.on('disconnected', (reason) => {
    _state = 'DISCONNECTED';
    _client = null;
    _initPromise = null;
    logger.warn('WhatsApp disconnected:', reason);
    // Auto-reconnect after 5 seconds unless it was a deliberate logout or manual disconnect
    if (reason !== 'LOGOUT') {
      logger.info('WhatsApp: will attempt auto-reconnect in 5s…');
      _reconnectTimer = setTimeout(() => {
        _reconnectTimer = null;
        if (_state === 'DISCONNECTED') {
          logger.info('WhatsApp: auto-reconnecting…');
          initialize().catch((e) => logger.error('WhatsApp auto-reconnect failed:', e));
        }
      }, 5000);
    }
  });

  return client;
}

async function initialize() {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      _state = 'LOADING';

      // Remove any Chrome singleton locks left by a previous crash so Puppeteer
      // can start without "browser is already running" errors.
      _cleanChromeLocks();

      // ── Loading watchdog ──────────────────────────────────────────────────
      // If Chrome loads an old/expired session it can stay in LOADING forever
      // without ever firing the 'qr' event. After 65 s we force-reset so the
      // UI shows the Connect button again and the user can retry.
      if (_loadingTimer) clearTimeout(_loadingTimer);
      _loadingTimer = setTimeout(() => {
        _loadingTimer = null;
        if (_state === 'LOADING') {
          logger.warn('WhatsApp: stuck in LOADING for 65 s — forcing reset to DISCONNECTED');
          if (_client) _client.destroy().catch(() => {});
          _client = null;
          _state = 'DISCONNECTED';
          _initPromise = null;
        }
      }, 65000);

      _client = _createClient();
      await _client.initialize();
    } catch (err) {
      if (_loadingTimer) { clearTimeout(_loadingTimer); _loadingTimer = null; }
      _state = 'DISCONNECTED';
      _client = null;
      _initPromise = null;
      logger.error('WhatsApp initialize error:', err);
      throw err;
    }
  })();

  return _initPromise;
}

/**
 * Called at server startup. If a saved session exists, attempt to restore it
 * silently. If no session exists, do nothing — the admin must click Connect.
 * Unlike the manual connect endpoint this does NOT clear the session first.
 */
async function tryAutoConnect() {
  const fs = require('fs');
  const path = require('path');
  const sessionDir = path.join(__dirname, '..', '..', '.wwebjs_auth');
  if (!fs.existsSync(sessionDir)) {
    logger.info('WhatsApp: no saved session — skipping auto-connect on startup');
    return;
  }
  logger.info('WhatsApp: saved session found — attempting auto-connect on startup…');
  initialize().catch((e) => logger.error('WhatsApp startup auto-connect failed:', e.message));
}

async function disconnect() {
  // Cancel any pending timers
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_loadingTimer)   { clearTimeout(_loadingTimer);   _loadingTimer   = null; }

  if (_client) {
    try {
      await _client.destroy();
    } catch (e) {
      logger.error('WhatsApp destroy error:', e);
    }
  }
  _client = null;
  _state = 'DISCONNECTED';
  _qrRaw = null;
  _qrImage = null;
  _initPromise = null;

  // Clear session files so next connect() always shows a fresh QR code.
  // This prevents Chrome from silently restoring an invalidated session (which
  // causes "stuck on LOADING" with no QR shown).
  const fs = require('fs');
  const path = require('path');
  const sessionDir = path.join(__dirname, '..', '..', '.wwebjs_auth');
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    logger.info('WhatsApp: session cleared on disconnect');
  }
}

/** Delete saved session files so the next connect() forces a fresh QR scan */
async function clearSession() {
  await disconnect();
  const fs = require('fs');
  const path = require('path');
  const sessionDir = path.join(__dirname, '..', '..', '.wwebjs_auth');
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    logger.info('WhatsApp: session cleared');
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

function getStatus() {
  return {
    state: _state,
    qrImage: _qrImage, // base64 PNG data-URL or null
  };
}

/**
 * Send a single WhatsApp message.
 * @param {string} phone  - phone number (any common format)
 * @param {string} message - message text
 * @returns {{ success: boolean, error?: string }}
 */
async function sendMessage(phone, message) {
  if (_state !== 'READY' || !_client) {
    return { success: false, error: 'WhatsApp client is not ready. State: ' + _state };
  }

  const jid = toJid(phone);
  if (!jid) {
    return { success: false, error: 'Invalid phone number: ' + phone };
  }

  try {
    // Check if the number exists on WhatsApp before sending
    const isRegistered = await _client.isRegisteredUser(jid);
    if (!isRegistered) {
      return { success: false, error: `${phone} is not registered on WhatsApp` };
    }
    await _client.sendMessage(jid, message);
    return { success: true };
  } catch (err) {
    logger.error(`WhatsApp sendMessage to ${phone} failed:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Send a message to multiple recipients with a configurable delay between sends
 * to avoid WhatsApp rate-limiting.
 *
 * @param {Array<{ phone: string, name?: string }>} recipients
 * @param {string} message  - may contain {name} placeholder
 * @param {{ delayMs?: number }} options
 * @returns {{ total: number, sent: number, failed: Array<{ phone, reason }> }}
 */
async function sendBulkMessages(recipients, message, options = {}) {
  const { delayMs = 2000 } = options;
  const result = { total: recipients.length, sent: 0, failed: [] };

  for (const recipient of recipients) {
    const personalised = message.replace(/\{name\}/gi, recipient.name || 'Student');
    const { success, error } = await sendMessage(recipient.phone, personalised);

    if (success) {
      result.sent++;
    } else {
      result.failed.push({ phone: recipient.phone, reason: error });
    }

    // Respectful delay between sends
    if (delayMs > 0 && recipient !== recipients[recipients.length - 1]) {
      await sleep(delayMs);
    }
  }

  return result;
}

module.exports = {
  initialize,
  tryAutoConnect,
  disconnect,
  clearSession,
  getStatus,
  sendMessage,
  sendBulkMessages,
};
