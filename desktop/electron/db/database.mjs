import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_cursors (
    entity TEXT PRIMARY KEY,
    cursor TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    server_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_urdu TEXT,
    barcode TEXT,
    sale_price REAL DEFAULT 0,
    cost REAL DEFAULT 0,
    stock_quantity REAL DEFAULT 0,
    category_id TEXT,
    min_stock_level REAL DEFAULT 0,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    server_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    balance REAL DEFAULT 0,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    server_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    entity TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    server_id TEXT,
    created_at TEXT NOT NULL,
    synced_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)`,
];

let db = null;

export function getDbPath(scope = {}) {
  const { organizationId = 'default', branchId = 'default' } = scope;
  const base = path.join(app.getPath('userData'), 'data', organizationId, branchId);
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, 'workshop.db');
}

export function openDatabase(scope = {}) {
  if (db) {
    db.close();
    db = null;
  }
  const dbPath = getDbPath(scope);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not opened. Call openDatabase first.');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export function setMeta(key, value) {
  getDatabase()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

export function getMeta(key, fallback = '') {
  const row = getDatabase().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row?.value ?? fallback;
}

export function getCursor(entity) {
  const row = getDatabase().prepare('SELECT cursor FROM sync_cursors WHERE entity = ?').get(entity);
  return row?.cursor ?? '';
}

export function setCursor(entity, cursor) {
  getDatabase()
    .prepare('INSERT INTO sync_cursors (entity, cursor) VALUES (?, ?) ON CONFLICT(entity) DO UPDATE SET cursor = excluded.cursor')
    .run(entity, cursor);
}
