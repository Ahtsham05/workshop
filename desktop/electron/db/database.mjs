import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import {
  encryptSecret,
  isEncryptedValue,
  unwrapMetaValue,
  wrapMetaValue,
} from '../secure-storage.mjs';

const SCHEMA_VERSION = 6;

export { SCHEMA_VERSION };

const TABLE_MIGRATIONS = [
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
  `CREATE TABLE IF NOT EXISTS suppliers (
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
  `CREATE TABLE IF NOT EXISTS api_cache (
    cache_key TEXT PRIMARY KEY,
    method TEXT NOT NULL DEFAULT 'GET',
    url TEXT,
    status_code INTEGER NOT NULL DEFAULT 200,
    response_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS http_sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query_json TEXT,
    body_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    status_code INTEGER,
    response_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    synced_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_conflict_id TEXT,
    client_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    operation TEXT NOT NULL,
    local_data_json TEXT NOT NULL,
    server_data_json TEXT NOT NULL,
    local_version INTEGER NOT NULL,
    server_version INTEGER NOT NULL,
    default_strategy TEXT NOT NULL DEFAULT 'manual_review',
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )`,
];

const INDEX_MIGRATIONS = [
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)`,
  `CREATE INDEX IF NOT EXISTS idx_api_cache_updated ON api_cache(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_api_cache_url ON api_cache(url)`,
  `CREATE INDEX IF NOT EXISTS idx_http_sync_queue_status ON http_sync_queue(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_conflicts_client ON sync_conflicts(client_id)`,
];

let db = null;

function migrateApiCacheV4(database) {
  const columns = database.prepare('PRAGMA table_info(api_cache)').all();
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('url')) database.exec('ALTER TABLE api_cache ADD COLUMN url TEXT');
  if (!names.has('version')) database.exec('ALTER TABLE api_cache ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  if (!names.has('expires_at')) database.exec('ALTER TABLE api_cache ADD COLUMN expires_at TEXT');
  database.prepare(`
    UPDATE api_cache
    SET url = substr(cache_key, instr(cache_key, ':') + 1)
    WHERE url IS NULL OR url = ''
  `).run();
  database.exec('CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_api_cache_url ON api_cache(url)');
}

function migrateSyncEngineV5(database) {
  for (const table of ['sync_queue', 'http_sync_queue']) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    const names = new Set(columns.map((column) => column.name));
    if (!names.has('retry_count')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`);
    }
    if (!names.has('next_retry_at')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN next_retry_at TEXT`);
    }
    if (!names.has('processing_at')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN processing_at TEXT`);
    }
    if (!names.has('failed_at')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN failed_at TEXT`);
    }
    if (!names.has('dead_letter_at')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN dead_letter_at TEXT`);
    }
    if (!names.has('batch_id')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN batch_id TEXT`);
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      module TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_sync_logs_created ON sync_logs(created_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_http_sync_queue_next_retry ON http_sync_queue(next_retry_at)');
}

function migrateSecureTokensV6(database) {
  const row = database.prepare(`SELECT value FROM meta WHERE key = 'access_token'`).get();
  if (row?.value && !isEncryptedValue(row.value)) {
    database
      .prepare(`UPDATE meta SET value = ? WHERE key = 'access_token'`)
      .run(encryptSecret(row.value));
  }
}

function migratePerformanceV6(database) {
  database.exec('CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry ON sync_queue(status, next_retry_at)');
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_http_sync_queue_status_retry ON http_sync_queue(status, next_retry_at)',
  );
  database.exec('CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_http_sync_queue_created ON http_sync_queue(created_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON sync_logs(type)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status)');
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity_status ON sync_conflicts(entity_type, status)',
  );
}

function runSchemaMigrations(database, fromVersion) {
  if (fromVersion < 4) {
    migrateApiCacheV4(database);
  }
  if (fromVersion < 5) {
    migrateSyncEngineV5(database);
  }
  if (fromVersion < 6) {
    migrateSecureTokensV6(database);
    migratePerformanceV6(database);
  }
}

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
  for (const sql of TABLE_MIGRATIONS) {
    db.exec(sql);
  }
  const versionRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  const currentVersion = Number(versionRow?.value || 1);
  if (currentVersion < SCHEMA_VERSION) {
    runSchemaMigrations(db, currentVersion);
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('schema_version', String(SCHEMA_VERSION));
  } else if (!versionRow) {
    db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  }
  for (const sql of INDEX_MIGRATIONS) {
    db.exec(sql);
  }
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
    .run(key, wrapMetaValue(key, value));
}

export function getMeta(key, fallback = '') {
  const row = getDatabase().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  const raw = row?.value;
  if (raw == null || raw === '') return fallback;
  return unwrapMetaValue(key, raw);
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
