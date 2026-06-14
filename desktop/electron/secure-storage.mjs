import crypto from 'crypto';
import os from 'os';
import { app, safeStorage } from 'electron';

const SS_PREFIX = 'ss:v1:';
const AES_PREFIX = 'aes:v1:';

export const SECURE_META_KEYS = new Set(['access_token']);

export function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function getFallbackKey() {
  return crypto.scryptSync(
    `${app.getPath('userData')}:${os.hostname()}:logix-desktop-secure-v1`,
    'logix-desktop-token-salt-v1',
    32,
  );
}

function aesEncrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getFallbackKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${AES_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function aesDecrypt(stored) {
  const payload = stored.slice(AES_PREFIX.length);
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted token format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getFallbackKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function encryptSecret(plaintext) {
  if (!plaintext) return '';
  if (isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(String(plaintext));
    return `${SS_PREFIX}${buf.toString('base64')}`;
  }
  return aesEncrypt(plaintext);
}

export function decryptSecret(stored) {
  if (!stored) return '';
  if (stored.startsWith(SS_PREFIX)) {
    if (!isEncryptionAvailable()) {
      throw new Error('OS secure storage unavailable to decrypt token');
    }
    return safeStorage.decryptString(Buffer.from(stored.slice(SS_PREFIX.length), 'base64'));
  }
  if (stored.startsWith(AES_PREFIX)) {
    return aesDecrypt(stored);
  }
  return String(stored);
}

export function isEncryptedValue(value) {
  return Boolean(value && (value.startsWith(SS_PREFIX) || value.startsWith(AES_PREFIX)));
}

export function wrapMetaValue(key, value) {
  if (SECURE_META_KEYS.has(key) && value) {
    return encryptSecret(value);
  }
  return String(value);
}

export function unwrapMetaValue(key, value) {
  if (value == null || value === '') return value ?? '';
  if (SECURE_META_KEYS.has(key)) {
    return decryptSecret(value);
  }
  return value;
}
