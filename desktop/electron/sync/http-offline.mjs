import crypto from 'crypto';
import { getDatabase, getMeta, setMeta } from '../db/database.mjs';
import { getCacheTtlMs } from './cache-settings.mjs';
import {
  injectPendingIntoInvoiceCaches,
  injectPendingIntoPurchaseCaches,
  injectPendingIntoPurchaseOrderCaches,
  injectPendingIntoCategoryCaches,
  injectPendingIntoProductCaches,
  injectPendingIntoCustomerCaches,
  injectPendingIntoSupplierCaches,
  mergePendingIntoResponse,
} from './pending-entities.mjs';

const SKIP_CACHE_PREFIXES = [
  '/auth/',
  '/sync/',
  '/health',
  '/webhooks/',
];

const SKIP_QUEUE_PREFIXES = [
  '/auth/',
  '/sync/',
  '/health',
  '/webhooks/',
  '/admin/',
];

export function normalizePath(path = '') {
  let p = String(path).trim();
  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      const url = new URL(p);
      p = `${url.pathname}${url.search}`;
    } catch {
      // keep as-is
    }
  }
  p = p.replace(/^\/v1/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

export function buildCacheKey(method, path) {
  const normalized = normalizePath(path);
  return `${String(method || 'GET').toUpperCase()}:${normalized}`;
}

export function shouldCacheRequest(method, path) {
  if (String(method || 'GET').toUpperCase() !== 'GET') return false;
  const p = normalizePath(path);
  return !SKIP_CACHE_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export function shouldQueueRequest(method, path) {
  const upper = String(method || 'GET').toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return false;
  const p = normalizePath(path);
  return !SKIP_QUEUE_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export function getCachedResponse(cacheKey) {
  const row = getDatabase()
    .prepare('SELECT response_json, status_code, expires_at FROM api_cache WHERE cache_key = ?')
    .get(cacheKey);
  if (!row) return null;

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    getDatabase().prepare('DELETE FROM api_cache WHERE cache_key = ?').run(cacheKey);
    return null;
  }

  try {
    return {
      status: row.status_code || 200,
      data: JSON.parse(row.response_json),
    };
  } catch {
    return null;
  }
}

function parseCachedRow(row) {
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    getDatabase().prepare('DELETE FROM api_cache WHERE cache_key = ?').run(row.cache_key);
    return null;
  }
  try {
    return {
      status: row.status_code || 200,
      data: JSON.parse(row.response_json),
    };
  } catch {
    return null;
  }
}

export function getCachedResponseFuzzy(method, path) {
  const cacheKey = buildCacheKey(method, path);
  const exact = getCachedResponse(cacheKey);
  if (exact) return exact;

  const normalized = normalizePath(path);
  const pathOnly = normalized.split('?')[0];
  const fuzzyPrefixes = ['/dashboard/', '/reports/', '/payments/trial/'];

  if (!fuzzyPrefixes.some((prefix) => pathOnly.startsWith(prefix))) {
    return null;
  }

  const row = getDatabase()
    .prepare(
      `SELECT cache_key, response_json, status_code, expires_at
       FROM api_cache
       WHERE cache_key LIKE ? OR IFNULL(url, '') LIKE ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(`GET:${pathOnly}%`, `${pathOnly}%`);

  return parseCachedRow(row);
}

export function setCachedResponse(cacheKey, method, status, data) {
  const db = getDatabase();
  const url = normalizePath(String(cacheKey).includes(':') ? String(cacheKey).slice(String(cacheKey).indexOf(':') + 1) : cacheKey);
  const now = new Date();
  const ttlMs = getCacheTtlMs();
  const expiresAt = ttlMs ? new Date(now.getTime() + ttlMs).toISOString() : null;

  const existing = db.prepare('SELECT version FROM api_cache WHERE cache_key = ?').get(cacheKey);
  const version = existing?.version ? Number(existing.version) + 1 : 1;

  db.prepare(
    `INSERT INTO api_cache (
      cache_key, method, url, status_code, response_json, version, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       method = excluded.method,
       url = excluded.url,
       status_code = excluded.status_code,
       response_json = excluded.response_json,
       version = excluded.version,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
  ).run(
    cacheKey,
    String(method || 'GET').toUpperCase(),
    url,
    Number(status) || 200,
    JSON.stringify(data ?? null),
    version,
    expiresAt,
    now.toISOString(),
  );
}

export function queueHttpMutation({ clientId, method, path, body }) {
  const db = getDatabase();
  const id = clientId || crypto.randomUUID();
  const normalizedPath = normalizePath(path);

  db.prepare(
    `INSERT INTO http_sync_queue (client_id, method, path, query_json, body_json, status, created_at)
     VALUES (?, ?, ?, NULL, ?, 'pending', ?)
     ON CONFLICT(client_id) DO UPDATE SET
       method = excluded.method,
       path = excluded.path,
       body_json = excluded.body_json,
       status = 'pending',
       error_message = NULL`,
  ).run(
    id,
    String(method || 'POST').toUpperCase(),
    normalizedPath,
    body != null ? JSON.stringify(body) : null,
    new Date().toISOString(),
  );

  if (normalizedPath.startsWith('/invoices')) {
    injectPendingIntoInvoiceCaches();
  }
  if (normalizedPath.startsWith('/purchases')) {
    injectPendingIntoPurchaseCaches();
  }
  if (normalizedPath.startsWith('/purchase-orders')) {
    injectPendingIntoPurchaseOrderCaches();
  }
  if (normalizedPath.startsWith('/categories')) {
    injectPendingIntoCategoryCaches();
  }
  if (normalizedPath.startsWith('/products')) {
    injectPendingIntoProductCaches();
  }
  if (normalizedPath.startsWith('/customers')) {
    injectPendingIntoCustomerCaches();
  }
  if (normalizedPath.startsWith('/suppliers')) {
    injectPendingIntoSupplierCaches();
  }

  return { clientId: id, path: normalizedPath };
}

export function getPendingHttpMutations(limit = 50) {
  return getDatabase()
    .prepare(`SELECT * FROM http_sync_queue WHERE status = 'pending' ORDER BY id ASC LIMIT ?`)
    .all(limit);
}

export function markHttpMutationSynced(clientId, statusCode, responseData) {
  getDatabase()
    .prepare(
      `UPDATE http_sync_queue
       SET status = 'synced', status_code = ?, response_json = ?, synced_at = ?, error_message = NULL
       WHERE client_id = ?`,
    )
    .run(
      statusCode,
      JSON.stringify(responseData ?? null),
      new Date().toISOString(),
      clientId,
    );
}

export function markHttpMutationFailed(clientId, errorMessage) {
  getDatabase()
    .prepare(`UPDATE http_sync_queue SET status = 'failed', error_message = ? WHERE client_id = ?`)
    .run(errorMessage, clientId);
}

function nextOfflineDocumentNumber(metaKey, prefix) {
  const seq = Number(getMeta(metaKey, '0')) + 1;
  setMeta(metaKey, String(seq));
  const deviceId = String(getMeta('device_id', 'local') || 'local');
  return `${prefix}-${deviceId.slice(0, 8).toUpperCase()}-${String(seq).padStart(5, '0')}`;
}

function buildOfflineMutationResponse(method, path, body, clientId) {
  const now = new Date().toISOString();
  const upper = String(method || 'POST').toUpperCase();

  if (upper === 'DELETE') {
    return { status: 200, data: { message: 'Queued for sync', offlinePending: true, clientId } };
  }

  const payload = body && typeof body === 'object' ? { ...body } : {};
  const id = clientId;
  payload.id = payload.id || payload._id || id;
  payload._id = payload._id || id;
  payload.offlinePending = true;
  payload.createdAt = payload.createdAt || now;
  payload.updatedAt = now;

  if (path.includes('/invoices') && !payload.invoiceNumber) {
    payload.invoiceNumber =
      payload.localInvoiceNumber ||
      nextOfflineDocumentNumber('offline_invoice_seq', 'LOCAL-INV');
    payload.localInvoiceNumber = payload.invoiceNumber;
  }
  if (path.includes('/purchases') && !payload.invoiceNumber) {
    payload.invoiceNumber =
      payload.localPurchaseNumber ||
      nextOfflineDocumentNumber('offline_purchase_seq', 'LOCAL-PO');
    payload.localPurchaseNumber = payload.invoiceNumber;
  }
  if (path.includes('/purchase-orders') && !payload.orderNumber) {
    payload.orderNumber =
      payload.localOrderNumber ||
      nextOfflineDocumentNumber('offline_purchase_order_seq', 'LOCAL-ORD');
    payload.localOrderNumber = payload.orderNumber;
    payload.status = payload.status || 'draft';
  }
  if (path.includes('/products')) {
    if (!payload.name) payload.name = payload.nameUrdu || 'Unnamed product';
    payload.price = Number(payload.price ?? payload.salePrice ?? 0);
    payload.salePrice = payload.price;
    payload.cost = Number(payload.cost ?? payload.purchasePrice ?? 0);
    payload.purchasePrice = payload.cost;
    payload.stockQuantity = Number(payload.stockQuantity ?? payload.stock ?? 0);
  }
  if (path.includes('/categories') && !payload.name) {
    payload.name = payload.nameUrdu || 'Unnamed category';
  }

  return { status: upper === 'POST' ? 201 : 200, data: payload };
}

export function handleOfflineRequest({ method, path, body }) {
  const upper = String(method || 'GET').toUpperCase();
  const normalizedPath = normalizePath(path);
  const cacheKey = buildCacheKey(upper, normalizedPath);

  if (upper === 'GET' || upper === 'HEAD') {
    const cached = getCachedResponseFuzzy(upper, normalizedPath);
    const baseData = cached
      ? cached.data
      : {
          results: [],
          page: 1,
          limit: 50,
          totalPages: 0,
          totalResults: 0,
        };
    const mergedData = mergePendingIntoResponse(upper, normalizedPath, baseData);

    return {
      status: cached?.status || 200,
      data: mergedData,
      offline: true,
      cached: Boolean(cached),
    };
  }

  if (!shouldQueueRequest(upper, normalizedPath)) {
    throw new Error(`Cannot perform ${upper} ${normalizedPath} while offline`);
  }

  const { clientId } = queueHttpMutation({ method: upper, path: normalizedPath, body });
  const response = buildOfflineMutationResponse(upper, normalizedPath, body, clientId);
  return { ...response, offline: true, queued: true, clientId };
}

export function getHttpSyncStatus() {
  const db = getDatabase();
  const pending = db.prepare(`SELECT COUNT(*) as count FROM http_sync_queue WHERE status = 'pending'`).get();
  const failed = db.prepare(`SELECT COUNT(*) as count FROM http_sync_queue WHERE status = 'failed'`).get();
  const cacheCount = db.prepare(`SELECT COUNT(*) as count FROM api_cache`).get();
  return {
    httpPending: pending?.count || 0,
    httpFailed: failed?.count || 0,
    cacheCount: cacheCount?.count || 0,
  };
}

export async function prefetchUrls(urls = [], apiFetch) {
  let cached = 0;
  let failed = 0;

  for (const path of urls) {
    const normalized = normalizePath(path);
    if (!shouldCacheRequest('GET', normalized)) continue;

    try {
      const data = await apiFetch(normalized.startsWith('/') ? normalized : `/${normalized}`);
      const cacheKey = buildCacheKey('GET', normalized);
      setCachedResponse(cacheKey, 'GET', 200, data);
      cached += 1;
    } catch {
      failed += 1;
    }
  }

  return { cached, failed, total: urls.length };
}

export async function prefetchCollections(collections = {}, apiFetch, onProgress) {
  const entries = Object.entries(collections).filter(([, value]) => value?.enabled !== false);
  const total = entries.length;
  let current = 0;
  let cachedTotal = 0;
  let failedTotal = 0;

  for (const [key, collection] of entries) {
    current += 1;
    const label = collection.label || key;
    onProgress?.({
      phase: 'downloading',
      step: key,
      label,
      current,
      total,
      message: `Downloading ${label}...`,
    });

    const result = await prefetchUrls(collection.urls || [], apiFetch);
    cachedTotal += result.cached;
    failedTotal += result.failed;
  }

  return { cachedTotal, failedTotal, collections: total };
}
