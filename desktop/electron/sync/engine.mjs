import { getDatabase, getMeta, setMeta, setCursor, getCursor } from '../db/database.mjs';

const DEFAULT_API = 'http://localhost:3000/v1';

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
    if (data.cursors) {
      for (const [entity, cursor] of Object.entries(data.cursors)) {
        setCursor(entity, cursor);
      }
    }
    setMeta('last_pull_at', new Date().toISOString());
    return { mode: 'bootstrap', counts: data.counts || {} };
  }

  const since = getCursor('all') || '';
  const data = await apiFetch(`/sync/pull?since=${encodeURIComponent(since)}`, { method: 'GET' });
  const scope = { organizationId: data.organizationId, branchId: data.branchId };
  upsertProducts(data.products || [], scope);
  upsertCustomers(data.customers || [], scope);
  upsertCategories(data.categories || [], scope);
  if (data.cursor) {
    setCursor('all', data.cursor);
    for (const entity of ['products', 'customers', 'categories']) {
      setCursor(entity, data.cursor);
    }
  }
  setMeta('last_pull_at', new Date().toISOString());
  return { mode: 'delta', counts: data.counts || {} };
}

export async function pushToServer() {
  const db = getDatabase();
  const pending = db
    .prepare(`SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 50`)
    .all();

  if (pending.length === 0) {
    return { pushed: 0, results: [] };
  }

  const operations = pending.map((row) => ({
    clientId: row.client_id,
    entity: row.entity,
    operation: row.operation,
    payload: JSON.parse(row.payload_json),
  }));

  const response = await apiFetch('/sync/push', {
    method: 'POST',
    body: JSON.stringify({ deviceId: getMeta('device_id'), operations }),
  });

  const markSynced = db.prepare(`
    UPDATE sync_queue
    SET status = 'synced', server_id = @server_id, synced_at = @synced_at, error_message = NULL
    WHERE client_id = @client_id
  `);
  const markFailed = db.prepare(`
    UPDATE sync_queue SET status = 'failed', error_message = @error_message WHERE client_id = @client_id
  `);

  const tx = db.transaction((results) => {
    for (const result of results) {
      if (result.status === 'synced') {
        markSynced.run({
          client_id: result.clientId,
          server_id: result.serverId || null,
          synced_at: new Date().toISOString(),
        });
      } else {
        markFailed.run({
          client_id: result.clientId,
          error_message: result.error || 'Sync failed',
        });
      }
    }
  });
  tx(response.results || []);

  setMeta('last_push_at', new Date().toISOString());
  return { pushed: response.synced || 0, failed: response.failed || 0, results: response.results || [] };
}

export async function runFullSync({ bootstrap = false } = {}) {
  await pullFromServer({ bootstrap });
  const pushResult = await pushToServer();
  return pushResult;
}

export function queueOperation({ clientId, entity, operation, payload }) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sync_queue (client_id, entity, operation, payload_json, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
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
}

export function getSyncStatus() {
  const db = getDatabase();
  const pending = db.prepare(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`).get();
  const failed = db.prepare(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`).get();
  const productCount = db.prepare(`SELECT COUNT(*) as count FROM products WHERE deleted = 0`).get();
  const customerCount = db.prepare(`SELECT COUNT(*) as count FROM customers WHERE deleted = 0`).get();
  return {
    pending: pending?.count || 0,
    failed: failed?.count || 0,
    productCount: productCount?.count || 0,
    customerCount: customerCount?.count || 0,
    lastPullAt: getMeta('last_pull_at', null),
    lastPushAt: getMeta('last_push_at', null),
    deviceId: getMeta('device_id', null),
  };
}

export function listLocalProducts(search = '') {
  const db = getDatabase();
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .prepare(
        `SELECT payload_json FROM products WHERE deleted = 0 AND (name LIKE ? OR barcode LIKE ?) ORDER BY name LIMIT 500`,
      )
      .all(q, q)
      .map((r) => JSON.parse(r.payload_json));
  }
  return db
    .prepare(`SELECT payload_json FROM products WHERE deleted = 0 ORDER BY name LIMIT 2000`)
    .all()
    .map((r) => JSON.parse(r.payload_json));
}

export function listLocalCustomers() {
  const db = getDatabase();
  return db
    .prepare(`SELECT payload_json FROM customers WHERE deleted = 0 ORDER BY name LIMIT 2000`)
    .all()
    .map((r) => JSON.parse(r.payload_json));
}

export async function registerDevice() {
  let deviceId = getMeta('device_id', '');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    setMeta('device_id', deviceId);
  }
  const payload = {
    deviceId,
    deviceName: getMeta('device_name', 'Desktop POS'),
    platform: process.platform,
  };
  await apiFetch('/sync/register-device', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setMeta('device_registered_at', new Date().toISOString());
  return deviceId;
}
