import {
  prefetchUrls,
  getHttpSyncStatus,
  handleOfflineRequest,
  setCachedResponse,
  buildCacheKey,
  shouldCacheRequest,
  prefetchCollections,
} from './http-offline.mjs';
import {
  injectPendingIntoInvoiceCaches,
  injectPendingIntoPurchaseCaches,
  mergePendingCatalogRecords,
  mergePendingIntoResponse,
} from './pending-entities.mjs';
import { markSyncStarted, markSyncSuccess, markSyncFailed } from './sync-dashboard.mjs';
import { recordConflictFromPushResult, upsertLocalEntity, syncConflictsFromServer } from './conflicts.mjs';
import {
  appendSyncLog,
  getReadyEntityQueue,
  getReadyHttpQueue,
  markEntityBatchProcessing,
  markHttpBatchProcessing,
  markEntitySynced,
  scheduleEntityRetry,
  markHttpSynced,
  scheduleHttpRetry,
  getHttpRetryCount,
  SYNC_BATCH_SIZE,
} from './sync-processor.mjs';
import { getDatabase, getMeta, setMeta, setCursor, getCursor } from '../db/database.mjs';

const DEFAULT_API = 'http://127.0.0.1:3000/v1';
export const OFFLINE_BOOTSTRAP_VERSION = '1';

function getApiBase() {
  return getMeta('api_base_url', DEFAULT_API);
}

function getAuthHeaders() {
  const token = getMeta('access_token', '');
  const branchId = getMeta('active_branch_id', '');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (branchId) headers['x-branch-id'] = branchId;
  return headers;
}

async function apiFetch(path, options = {}) {
  const url = `${getApiBase().replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const message = body?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

function upsertProducts(products = [], scope = {}) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO products (
      server_id, organization_id, branch_id, name, name_urdu, barcode,
      sale_price, cost, stock_quantity, category_id, min_stock_level,
      payload_json, updated_at, deleted
    ) VALUES (
      @server_id, @organization_id, @branch_id, @name, @name_urdu, @barcode,
      @sale_price, @cost, @stock_quantity, @category_id, @min_stock_level,
      @payload_json, @updated_at, @deleted
    )
    ON CONFLICT(server_id) DO UPDATE SET
      name = excluded.name,
      name_urdu = excluded.name_urdu,
      barcode = excluded.barcode,
      sale_price = excluded.sale_price,
      cost = excluded.cost,
      stock_quantity = excluded.stock_quantity,
      category_id = excluded.category_id,
      min_stock_level = excluded.min_stock_level,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
  `);

  const tx = db.transaction((rows) => {
    for (const p of rows) {
      const id = String(p.id || p._id);
      stmt.run({
        server_id: id,
        organization_id: scope.organizationId || p.organizationId || '',
        branch_id: scope.branchId || p.branchId || '',
        name: p.name || '',
        name_urdu: p.nameUrdu || '',
        barcode: p.barcode || null,
        sale_price: Number(p.salePrice ?? p.price ?? 0),
        cost: Number(p.cost ?? 0),
        stock_quantity: Number(p.stockQuantity ?? 0),
        category_id: p.categoryId ? String(p.categoryId) : null,
        min_stock_level: Number(p.minStockLevel ?? 0),
        payload_json: JSON.stringify(p),
        updated_at: p.updatedAt || new Date().toISOString(),
        deleted: p.deleted ? 1 : 0,
      });
    }
  });
  tx(products);
}

function upsertCustomers(customers = [], scope = {}) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO customers (
      server_id, organization_id, branch_id, name, phone, balance,
      payload_json, updated_at, deleted
    ) VALUES (
      @server_id, @organization_id, @branch_id, @name, @phone, @balance,
      @payload_json, @updated_at, @deleted
    )
    ON CONFLICT(server_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      balance = excluded.balance,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
  `);
  const tx = db.transaction((rows) => {
    for (const c of rows) {
      const id = String(c.id || c._id);
      stmt.run({
        server_id: id,
        organization_id: scope.organizationId || c.organizationId || '',
        branch_id: scope.branchId || c.branchId || '',
        name: c.name || '',
        phone: c.phone || null,
        balance: Number(c.balance ?? 0),
        payload_json: JSON.stringify(c),
        updated_at: c.updatedAt || new Date().toISOString(),
        deleted: c.deleted ? 1 : 0,
      });
    }
  });
  tx(customers);
}

function upsertCategories(categories = [], scope = {}) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO categories (
      server_id, organization_id, branch_id, name, payload_json, updated_at, deleted
    ) VALUES (
      @server_id, @organization_id, @branch_id, @name, @payload_json, @updated_at, @deleted
    )
    ON CONFLICT(server_id) DO UPDATE SET
      name = excluded.name,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
  `);
  const tx = db.transaction((rows) => {
    for (const c of rows) {
      const id = String(c.id || c._id);
      stmt.run({
        server_id: id,
        organization_id: scope.organizationId || c.organizationId || '',
        branch_id: scope.branchId || c.branchId || '',
        name: c.name || '',
        payload_json: JSON.stringify(c),
        updated_at: c.updatedAt || new Date().toISOString(),
        deleted: c.deleted ? 1 : 0,
      });
    }
  });
  tx(categories);
}

function upsertSuppliers(suppliers = [], scope = {}) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO suppliers (
      server_id, organization_id, branch_id, name, phone, balance,
      payload_json, updated_at, deleted
    ) VALUES (
      @server_id, @organization_id, @branch_id, @name, @phone, @balance,
      @payload_json, @updated_at, @deleted
    )
    ON CONFLICT(server_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      balance = excluded.balance,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
  `);
  const tx = db.transaction((rows) => {
    for (const s of rows) {
      const id = String(s.id || s._id);
      stmt.run({
        server_id: id,
        organization_id: scope.organizationId || s.organizationId || '',
        branch_id: scope.branchId || s.branchId || '',
        name: s.name || '',
        phone: s.phone || null,
        balance: Number(s.balance ?? 0),
        payload_json: JSON.stringify(s),
        updated_at: s.updatedAt || new Date().toISOString(),
        deleted: s.deleted ? 1 : 0,
      });
    }
  });
  tx(suppliers);
}

export async function pullFromServer({ bootstrap = false } = {}) {
  const deviceId = getMeta('device_id');
  if (!deviceId) {
    throw new Error('Device not registered');
  }

  if (bootstrap) {
    const data = await apiFetch('/sync/bootstrap', { method: 'GET' });
    const scope = { organizationId: data.organizationId, branchId: data.branchId };
    upsertProducts(data.products || [], scope);
    upsertCustomers(data.customers || [], scope);
    upsertCategories(data.categories || [], scope);
    upsertSuppliers(data.suppliers || [], scope);
    if (data.cursors) {
      for (const [entity, cursor] of Object.entries(data.cursors)) {
        setCursor(entity, cursor);
      }
    }
    setMeta('last_pull_at', new Date().toISOString());
    setMeta('bootstrapped', 'true');
    return { mode: 'bootstrap', counts: data.counts || {} };
  }

  const since = getCursor('all') || '';
  const data = await apiFetch(`/sync/pull?since=${encodeURIComponent(since)}`, { method: 'GET' });
  const scope = { organizationId: data.organizationId, branchId: data.branchId };
  upsertProducts(data.products || [], scope);
  upsertCustomers(data.customers || [], scope);
  upsertCategories(data.categories || [], scope);
  upsertSuppliers(data.suppliers || [], scope);
  if (data.cursor) {
    setCursor('all', data.cursor);
    for (const entity of ['products', 'customers', 'categories', 'suppliers']) {
      setCursor(entity, data.cursor);
    }
  }
  setMeta('last_pull_at', new Date().toISOString());
  return { mode: 'delta', counts: data.counts || {} };
}

function getLocalScope() {
  return {
    organizationId: getMeta('organization_id', ''),
    branchId: getMeta('active_branch_id', ''),
  };
}

function remapCustomerServerId(localId, serverId) {
  if (!localId || !serverId || localId === serverId) return;

  const db = getDatabase();
  const row = db.prepare('SELECT payload_json FROM customers WHERE server_id = ?').get(String(localId));
  if (!row) return;

  const payload = JSON.parse(row.payload_json);
  payload.id = serverId;
  delete payload.offlinePending;

  db.prepare('DELETE FROM customers WHERE server_id = ?').run(String(localId));
  upsertCustomers([payload], getLocalScope());
}

function remapSupplierServerId(localId, serverId) {
  if (!localId || !serverId || localId === serverId) return;

  const db = getDatabase();
  const row = db.prepare('SELECT payload_json FROM suppliers WHERE server_id = ?').get(String(localId));
  if (!row) return;

  const payload = JSON.parse(row.payload_json);
  payload.id = serverId;
  delete payload.offlinePending;

  db.prepare('DELETE FROM suppliers WHERE server_id = ?').run(String(localId));
  upsertSuppliers([payload], getLocalScope());
}

function remapEntityReferencesInQueue(field, localId, serverId) {
  if (!localId || !serverId || localId === serverId) return;

  const db = getDatabase();
  const pending = db
    .prepare(`SELECT client_id, payload_json FROM sync_queue WHERE status = 'pending'`)
    .all();

  const updateStmt = db.prepare(`UPDATE sync_queue SET payload_json = ? WHERE client_id = ?`);

  for (const row of pending) {
    const payload = JSON.parse(row.payload_json);
    if (String(payload[field]) === String(localId)) {
      payload[field] = serverId;
      updateStmt.run(JSON.stringify(payload), row.client_id);
    }
  }
}

const ENTITY_PUSH_PRIORITY = {
  supplier: 0,
  customer: 1,
  purchase: 2,
  invoice: 3,
};

function applyPushResults(results = []) {
  for (const result of results) {
    if (result.status !== 'synced' || !result.serverId) continue;

    const row = getDatabase()
      .prepare('SELECT entity, operation FROM sync_queue WHERE client_id = ?')
      .get(result.clientId);

    if (row?.entity === 'customer' && row?.operation === 'create') {
      remapCustomerServerId(result.clientId, result.serverId);
      remapEntityReferencesInQueue('customerId', result.clientId, result.serverId);
    }

    if (row?.entity === 'supplier' && row?.operation === 'create') {
      remapSupplierServerId(result.clientId, result.serverId);
      remapEntityReferencesInQueue('supplier', result.clientId, result.serverId);
    }
  }
}

export async function pushToServer() {
  const db = getDatabase();
  const pending = getReadyEntityQueue(SYNC_BATCH_SIZE).sort((a, b) => {
    const priorityDiff =
      (ENTITY_PUSH_PRIORITY[a.entity] ?? 99) - (ENTITY_PUSH_PRIORITY[b.entity] ?? 99);
    return priorityDiff !== 0 ? priorityDiff : a.id - b.id;
  });

  if (pending.length === 0) {
    return { pushed: 0, failed: 0, results: [] };
  }

  const batchId = markEntityBatchProcessing(pending);
  const operations = pending.map((row) => ({
    clientId: row.client_id,
    entity: row.entity,
    operation: row.operation,
    payload: JSON.parse(row.payload_json),
  }));

  let response;
  try {
    response = await apiFetch('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId: getMeta('device_id'), operations }),
    });
  } catch (err) {
    for (const row of pending) {
      scheduleEntityRetry(row.client_id, err.message || 'Sync push failed', row.retry_count || 0);
    }
    appendSyncLog({
      type: 'push',
      module: 'entity',
      status: 'error',
      message: err.message || 'Sync push failed',
      details: { batchId, count: pending.length },
    });
    throw err;
  }

  const tx = db.transaction((results) => {
    for (const result of results) {
      const row = db.prepare('SELECT retry_count FROM sync_queue WHERE client_id = ?').get(result.clientId);
      const retryCount = row?.retry_count || 0;

      if (result.status === 'synced') {
        markEntitySynced(result.clientId, result.serverId || null);
        appendSyncLog({
          type: 'push',
          module: 'entity',
          status: 'synced',
          message: `${result.clientId} synced`,
          details: { clientId: result.clientId, serverId: result.serverId, batchId },
        });
        if (result.resolution === 'server_wins' && result.serverData) {
          const entityRow = db.prepare('SELECT entity FROM sync_queue WHERE client_id = ?').get(result.clientId);
          if (entityRow?.entity) {
            upsertLocalEntity(entityRow.entity, result.serverData);
          }
        }
      } else if (result.status === 'conflict') {
        const queueRow = db.prepare('SELECT * FROM sync_queue WHERE client_id = ?').get(result.clientId);
        recordConflictFromPushResult(result, queueRow);
        appendSyncLog({
          type: 'push',
          module: 'entity',
          status: 'conflict',
          message: result.message || 'Sync conflict detected',
          details: { clientId: result.clientId, batchId },
        });
      } else {
        scheduleEntityRetry(result.clientId, result.error || 'Sync failed', retryCount);
      }
    }
  });
  tx(response.results || []);
  applyPushResults(response.results || []);

  setMeta('last_push_at', new Date().toISOString());
  appendSyncLog({
    type: 'push',
    module: 'entity',
    status: 'batch_complete',
    message: `Processed ${pending.length} entity operations`,
    details: {
      batchId,
      synced: response.synced || 0,
      failed: response.failed || 0,
    },
  });

  return { pushed: response.synced || 0, failed: response.failed || 0, results: response.results || [], batchId };
}

export async function pushHttpToServer() {
  const pending = getReadyHttpQueue(SYNC_BATCH_SIZE);
  if (pending.length === 0) {
    return { pushed: 0, failed: 0, results: [] };
  }

  const batchId = markHttpBatchProcessing(pending);
  const requests = pending.map((row) => ({
    clientId: row.client_id,
    method: row.method,
    path: row.path,
    body: row.body_json ? JSON.parse(row.body_json) : undefined,
  }));

  let response;
  try {
    response = await apiFetch('/sync/push-http', {
      method: 'POST',
      body: JSON.stringify({ deviceId: getMeta('device_id'), requests }),
    });
  } catch (err) {
    for (const row of pending) {
      scheduleHttpRetry(row.client_id, err.message || 'HTTP sync failed', row.retry_count || 0);
    }
    appendSyncLog({
      type: 'push',
      module: 'http',
      status: 'error',
      message: err.message || 'HTTP sync push failed',
      details: { batchId, count: pending.length },
    });
    throw err;
  }

  for (const result of response.results || []) {
    const retryCount = getHttpRetryCount(result.clientId);
    if (result.status === 'synced') {
      markHttpSynced(result.clientId, result.statusCode || 200, result.data);
      appendSyncLog({
        type: 'push',
        module: 'http',
        status: 'synced',
        message: `${result.clientId} synced`,
        details: { clientId: result.clientId, batchId },
      });
    } else {
      scheduleHttpRetry(result.clientId, result.error || 'Sync failed', retryCount);
    }
  }

  appendSyncLog({
    type: 'push',
    module: 'http',
    status: 'batch_complete',
    message: `Processed ${pending.length} HTTP operations`,
    details: {
      batchId,
      synced: response.synced || 0,
      failed: response.failed || 0,
    },
  });

  return {
    pushed: response.synced || 0,
    failed: response.failed || 0,
    results: response.results || [],
    batchId,
  };
}

export async function runPrefetchManifest() {
  const manifest = await apiFetch('/sync/prefetch-manifest', { method: 'GET' });
  if (manifest.collections && Object.keys(manifest.collections).length > 0) {
    return prefetchCollections(manifest.collections, apiFetch);
  }
  return prefetchUrls(manifest.urls || [], apiFetch);
}

export function getOfflineBootstrapInfo() {
  return {
    status: getMeta('offline_bootstrap_status', 'not_started'),
    completedAt: getMeta('offline_bootstrap_completed_at', null),
    version: getMeta('offline_bootstrap_version', null),
  };
}

export async function downloadAllDataForOffline(onProgress) {
  const emit = (payload) => {
    if (typeof onProgress === 'function') onProgress(payload);
  };

  try {
    setMeta('offline_bootstrap_status', 'downloading');
    emit({ phase: 'preparing', message: 'Preparing...' });

    await registerDevice();

    emit({
      phase: 'downloading',
      step: 'catalog',
      label: 'Core catalog',
      message: 'Downloading core catalog...',
      current: 0,
      total: 0,
    });
    await pullFromServer({ bootstrap: true });

    const manifest = await apiFetch('/sync/prefetch-manifest', { method: 'GET' });
    let prefetchResult = { cachedTotal: 0, failedTotal: 0 };

    if (manifest.collections && Object.keys(manifest.collections).length > 0) {
      prefetchResult = await prefetchCollections(manifest.collections, apiFetch, emit);
    } else {
      emit({
        phase: 'downloading',
        step: 'modules',
        label: 'Modules',
        message: 'Downloading module data...',
      });
      prefetchResult = await prefetchUrls(manifest.urls || [], apiFetch);
    }

    const completedAt = new Date().toISOString();
    setMeta('offline_bootstrap_status', 'complete');
    setMeta('offline_bootstrap_completed_at', completedAt);
    setMeta(
      'offline_bootstrap_version',
      String(manifest.version || OFFLINE_BOOTSTRAP_VERSION),
    );
    setMeta('last_pull_at', completedAt);
    setMeta('bootstrapped', 'true');

    emit({
      phase: 'complete',
      message: 'Complete',
      completedAt,
      cachedTotal: prefetchResult.cachedTotal || 0,
      failedTotal: prefetchResult.failedTotal || 0,
    });

    return {
      ok: true,
      completedAt,
      version: getMeta('offline_bootstrap_version', OFFLINE_BOOTSTRAP_VERSION),
      cachedTotal: prefetchResult.cachedTotal || 0,
      failedTotal: prefetchResult.failedTotal || 0,
    };
  } catch (err) {
    setMeta('offline_bootstrap_status', 'failed');
    emit({ phase: 'error', message: err.message || 'Download failed' });
    throw err;
  }
}

export async function runFullSync({ bootstrap = false } = {}) {
  markSyncStarted();
  appendSyncLog({
    type: 'sync',
    module: 'system',
    status: 'started',
    message: bootstrap ? 'Bootstrap sync started' : 'Background sync started',
  });

  try {
    if (bootstrap) {
      await pullFromServer({ bootstrap: true });
      try {
        await runPrefetchManifest();
      } catch (err) {
        console.warn('[sync] Prefetch manifest failed:', err.message);
      }
    }

    await pushHttpToServer();
    const pushResult = await pushToServer();
    await syncConflictsFromServer();

    if (!bootstrap) {
      await pullFromServer({});
    }

    markSyncSuccess();
    appendSyncLog({
      type: 'sync',
      module: 'system',
      status: 'success',
      message: 'Sync completed successfully',
      details: {
        pushed: pushResult.pushed || 0,
        failed: pushResult.failed || 0,
      },
    });
    return pushResult;
  } catch (err) {
    markSyncFailed(err.message);
    appendSyncLog({
      type: 'sync',
      module: 'system',
      status: 'error',
      message: err.message || 'Sync failed',
    });
    throw err;
  }
}

export function queueOperation({ clientId, entity, operation, payload }) {
  const db = getDatabase();
  const scope = getLocalScope();

  if (entity === 'customer' && operation === 'create') {
    const localCustomer = {
      ...payload,
      id: clientId,
      offlinePending: true,
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: payload.updatedAt || new Date().toISOString(),
    };
    upsertCustomers([localCustomer], scope);
  }

  if (entity === 'customer' && operation === 'update') {
    const customerId = String(payload.customerId || payload.id || payload._id || clientId);
    const existing = db.prepare('SELECT payload_json FROM customers WHERE server_id = ?').get(customerId);
    const merged = existing
      ? { ...JSON.parse(existing.payload_json), ...payload, id: customerId, updatedAt: new Date().toISOString() }
      : { ...payload, id: customerId, updatedAt: new Date().toISOString() };
    upsertCustomers([merged], scope);
    payload.baseVersion =
      payload.baseVersion ?? merged.version ?? merged.syncVersion ?? 1;
  }

  if (entity === 'supplier' && operation === 'update') {
    const supplierId = String(payload.supplierId || payload.id || payload._id || clientId);
    const existing = db.prepare('SELECT payload_json FROM suppliers WHERE server_id = ?').get(supplierId);
    const merged = existing
      ? { ...JSON.parse(existing.payload_json), ...payload, id: supplierId, updatedAt: new Date().toISOString() }
      : { ...payload, id: supplierId, updatedAt: new Date().toISOString() };
    upsertSuppliers([merged], scope);
    payload.baseVersion =
      payload.baseVersion ?? merged.version ?? merged.syncVersion ?? 1;
  }

  if (entity === 'supplier' && operation === 'create') {
    const localSupplier = {
      ...payload,
      id: clientId,
      offlinePending: true,
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: payload.updatedAt || new Date().toISOString(),
    };
    upsertSuppliers([localSupplier], scope);
  }

  db.prepare(`
    INSERT INTO sync_queue (client_id, entity, operation, payload_json, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
    ON CONFLICT(client_id) DO UPDATE SET
      entity = excluded.entity,
      operation = excluded.operation,
      payload_json = excluded.payload_json,
      status = 'pending',
      error_message = NULL
  `).run(clientId, entity, operation, JSON.stringify(payload), new Date().toISOString());

  // Optimistic local stock update for offline cash invoices
  if (entity === 'invoice' && operation === 'create' && Array.isArray(payload.items)) {
    const dec = db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE server_id = ?');
    for (const item of payload.items) {
      if (item.productId) {
        dec.run(Number(item.stockQuantity || item.quantity || 0), String(item.productId));
      }
    }
  }

  // Optimistic local stock update for offline purchases
  if (entity === 'purchase' && operation === 'create' && Array.isArray(payload.items)) {
    const inc = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE server_id = ?');
    for (const item of payload.items) {
      const productId = item.product || item.productId;
      if (productId) {
        inc.run(Number(item.stockQuantity || item.quantity || 0), String(productId));
      }
    }
  }

  if (entity === 'invoice' && operation === 'create') {
    injectPendingIntoInvoiceCaches();
  }
  if (entity === 'purchase' && operation === 'create') {
    injectPendingIntoPurchaseCaches();
  }
}

export function getSyncStatus() {
  const db = getDatabase();
  const pending = db.prepare(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`).get();
  const failed = db.prepare(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`).get();
  const productCount = db.prepare(`SELECT COUNT(*) as count FROM products WHERE deleted = 0`).get();
  const customerCount = db.prepare(`SELECT COUNT(*) as count FROM customers WHERE deleted = 0`).get();
  const categoryCount = db.prepare(`SELECT COUNT(*) as count FROM categories WHERE deleted = 0`).get();
  const supplierCount = db.prepare(`SELECT COUNT(*) as count FROM suppliers WHERE deleted = 0`).get();
  const httpStatus = getHttpSyncStatus();
  return {
    pending: (pending?.count || 0) + (httpStatus.httpPending || 0),
    failed: (failed?.count || 0) + (httpStatus.httpFailed || 0),
    productCount: productCount?.count || 0,
    customerCount: customerCount?.count || 0,
    categoryCount: categoryCount?.count || 0,
    supplierCount: supplierCount?.count || 0,
    httpPending: httpStatus.httpPending || 0,
    httpFailed: httpStatus.httpFailed || 0,
    cacheCount: httpStatus.cacheCount || 0,
    lastPullAt: getMeta('last_pull_at', null),
    lastPushAt: getMeta('last_push_at', null),
    deviceId: getMeta('device_id', null),
    offlineBootstrap: getOfflineBootstrapInfo(),
  };
}

export function listLocalProducts(search = '') {
  const db = getDatabase();
  let local = [];
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    local = db
      .prepare(
        `SELECT payload_json FROM products WHERE deleted = 0 AND (name LIKE ? OR barcode LIKE ?) ORDER BY name LIMIT 500`,
      )
      .all(q, q)
      .map((r) => JSON.parse(r.payload_json));
  } else {
    local = db
      .prepare(`SELECT payload_json FROM products WHERE deleted = 0 ORDER BY name LIMIT 2000`)
      .all()
      .map((r) => JSON.parse(r.payload_json));
  }
  return mergePendingCatalogRecords('products', local);
}

export function listLocalCustomers(search = '') {
  const db = getDatabase();
  let local = [];
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    local = db
      .prepare(
        `SELECT payload_json FROM customers
         WHERE deleted = 0 AND (name LIKE ? OR phone LIKE ?)
         ORDER BY name LIMIT 500`,
      )
      .all(q, q)
      .map((r) => JSON.parse(r.payload_json));
  } else {
    local = db
      .prepare(`SELECT payload_json FROM customers WHERE deleted = 0 ORDER BY name LIMIT 2000`)
      .all()
      .map((r) => JSON.parse(r.payload_json));
  }
  return mergePendingCatalogRecords('customers', local);
}

export function listLocalCategories(search = '') {
  const db = getDatabase();
  let local = [];
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    local = db
      .prepare(
        `SELECT payload_json FROM categories WHERE deleted = 0 AND name LIKE ? ORDER BY name LIMIT 500`,
      )
      .all(q)
      .map((r) => JSON.parse(r.payload_json));
  } else {
    local = db
      .prepare(`SELECT payload_json FROM categories WHERE deleted = 0 ORDER BY name LIMIT 2000`)
      .all()
      .map((r) => JSON.parse(r.payload_json));
  }
  return mergePendingCatalogRecords('categories', local);
}

export function listLocalSuppliers(search = '') {
  const db = getDatabase();
  let local = [];
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    local = db
      .prepare(
        `SELECT payload_json FROM suppliers
         WHERE deleted = 0 AND (name LIKE ? OR phone LIKE ?)
         ORDER BY name LIMIT 500`,
      )
      .all(q, q)
      .map((r) => JSON.parse(r.payload_json));
  } else {
    local = db
      .prepare(`SELECT payload_json FROM suppliers WHERE deleted = 0 ORDER BY name LIMIT 2000`)
      .all()
      .map((r) => JSON.parse(r.payload_json));
  }
  return mergePendingCatalogRecords('suppliers', local);
}

export { handleOfflineRequest, setCachedResponse, buildCacheKey, shouldCacheRequest, mergePendingIntoResponse };

export async function registerDevice() {
  let deviceId = getMeta('device_id', '');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    setMeta('device_id', deviceId);
  }
  const alreadyRegistered = getMeta('device_registered_at', '');
  const payload = {
    deviceId,
    deviceName: getMeta('device_name', 'Desktop POS'),
    platform: process.platform,
  };
  try {
    await apiFetch('/sync/register-device', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setMeta('device_registered_at', new Date().toISOString());
  } catch (err) {
    if (alreadyRegistered) {
      console.warn('[sync] register-device failed, continuing with local device:', err.message);
      return deviceId;
    }
    throw err;
  }
  return deviceId;
}
