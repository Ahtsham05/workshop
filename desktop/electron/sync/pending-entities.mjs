import { getDatabase, getMeta, setMeta } from '../db/database.mjs';
import { normalizePath } from './http-offline.mjs';

const PENDING_QUEUE_STATUSES = "('pending', 'processing', 'failed')";

function lookupLocalRecordName(table, recordId) {
  if (!recordId) return null;
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT payload_json FROM ${table}
       WHERE deleted = 0 AND server_id = ?
       LIMIT 1`,
    )
    .get(String(recordId));
  if (!row?.payload_json) return null;
  try {
    const payload = JSON.parse(row.payload_json);
    return payload.name || payload.nameUrdu || null;
  } catch {
    return null;
  }
}

function resolveSupplierLabel(payload) {
  if (payload?.supplier && typeof payload.supplier === 'object') {
    return payload.supplier.name || payload.supplier.nameUrdu || 'Supplier';
  }
  if (typeof payload?.supplier === 'string' && payload.supplier.trim()) {
    return payload.supplier;
  }
  if (payload?.supplierName) return payload.supplierName;
  const supplierId = payload.supplierId || payload.supplier?._id || payload.supplier?.id;
  const lookedUp = lookupLocalRecordName('suppliers', supplierId);
  if (lookedUp) return lookedUp;
  return 'Supplier';
}

function extractPathId(path) {
  const segments = normalizePath(path).split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || last.includes('?')) return null;
  if (['categories', 'products', 'customers', 'suppliers', 'purchase-orders', 'purchases', 'invoices'].includes(last)) {
    return null;
  }
  return last;
}

function payloadToInvoiceRecord(clientId, payload) {
  const invoiceNumber =
    payload.localInvoiceNumber ||
    payload.invoiceNumber ||
    `LOCAL-INV-${String(clientId).slice(0, 8).toUpperCase()}`;

  return {
    id: clientId,
    _id: clientId,
    invoiceNumber,
    customerId: payload.customerId,
    customerName: payload.customerName,
    walkInCustomerName: payload.walkInCustomerName,
    customerPhone: payload.customerPhone,
    type: payload.type || 'cash',
    paymentMethod: payload.paymentMethod || 'cash',
    status: payload.status || 'pending',
    total: payload.total ?? 0,
    paidAmount: payload.paidAmount ?? 0,
    balance: payload.balance ?? 0,
    invoiceDate: payload.invoiceDate || payload.offlineCreatedAt || new Date().toISOString(),
    createdAt: payload.offlineCreatedAt || new Date().toISOString(),
    updatedAt: payload.offlineCreatedAt || new Date().toISOString(),
    offlinePending: true,
    syncStatus: 'pending',
    items: payload.items || [],
  };
}

function payloadToPurchaseRecord(clientId, payload) {
  const invoiceNumber =
    payload.localPurchaseNumber ||
    payload.invoiceNumber ||
    `LOCAL-PO-${String(clientId).slice(0, 8).toUpperCase()}`;
  const supplierId = payload.supplierId || payload.supplier?._id || payload.supplier?.id;
  const supplierLabel = resolveSupplierLabel(payload);
  const supplierObject =
    payload.supplier && typeof payload.supplier === 'object' && payload.supplier.name
      ? payload.supplier
      : { _id: supplierId, id: supplierId, name: supplierLabel };

  return {
    id: clientId,
    _id: clientId,
    invoiceNumber,
    supplier: supplierObject,
    supplierName: supplierLabel,
    supplierId,
    totalAmount: payload.totalAmount ?? payload.total ?? 0,
    paidAmount: payload.paidAmount ?? 0,
    balance: payload.balance ?? 0,
    paymentType: payload.paymentType || 'Cash',
    purchaseDate: payload.purchaseDate || payload.offlineCreatedAt || new Date().toISOString(),
    createdAt: payload.offlineCreatedAt || new Date().toISOString(),
    offlinePending: true,
    syncStatus: 'pending',
    items: payload.items || [],
  };
}

function payloadToPurchaseOrderRecord(clientId, payload) {
  const orderNumber =
    payload.localOrderNumber ||
    payload.orderNumber ||
    `LOCAL-ORD-${String(clientId).slice(0, 8).toUpperCase()}`;

  const items = (payload.items || []).map((item) => {
    const quantity = Number(item?.quantity ?? 0);
    const expectedPrice = Number(item?.expectedPrice ?? item?.purchasePrice ?? item?.price ?? 0);
    const total = Number(item?.total ?? quantity * expectedPrice);
    return {
      ...item,
      quantity,
      expectedPrice,
      total,
      productName: item?.productName || item?.product?.name || 'Product',
    };
  });

  return {
    id: clientId,
    _id: clientId,
    orderNumber,
    supplier: payload.supplier || (payload.supplierId ? { _id: payload.supplierId, name: resolveSupplierLabel(payload) } : null),
    supplierId: payload.supplierId || payload.supplier?._id || payload.supplier?.id,
    status: payload.status || 'draft',
    orderDate: payload.orderDate || payload.offlineCreatedAt || new Date().toISOString(),
    expectedDeliveryDate: payload.expectedDeliveryDate || null,
    items,
    subtotal: payload.subtotal ?? items.reduce((sum, item) => sum + Number(item.total || 0), 0),
    totalAmount: payload.totalAmount ?? payload.total ?? items.reduce((sum, item) => sum + Number(item.total || 0), 0),
    createdAt: payload.offlineCreatedAt || new Date().toISOString(),
    updatedAt: payload.offlineCreatedAt || new Date().toISOString(),
    offlinePending: true,
  };
}

function payloadToCatalogRecord(clientId, payload, entityType, method = 'POST') {
  const now = payload.offlineCreatedAt || payload.updatedAt || new Date().toISOString();
  const isCreate = String(method || 'POST').toUpperCase() === 'POST';
  const base = {
    ...payload,
    id: payload.id || payload._id || clientId,
    _id: payload._id || payload.id || clientId,
    offlinePending: true,
    createdAt: payload.createdAt || now,
    updatedAt: now,
  };

  if (entityType === 'category') {
    if (payload.name || payload.nameUrdu || isCreate) {
      base.name = payload.name || payload.nameUrdu || base.name || 'Unnamed category';
    }
  }

  if (entityType === 'product') {
    if (payload.name || payload.nameUrdu || isCreate) {
      base.name = payload.name || payload.nameUrdu || base.name || 'Unnamed product';
    }
    if (payload.price != null || payload.salePrice != null || isCreate) {
      const price = Number(payload.price ?? payload.salePrice ?? base.price ?? 0);
      base.price = price;
      base.salePrice = price;
    }
    if (payload.cost != null || payload.purchasePrice != null || isCreate) {
      const cost = Number(payload.cost ?? payload.purchasePrice ?? base.cost ?? 0);
      base.cost = cost;
      base.purchasePrice = cost;
    }
    if (payload.stockQuantity != null || payload.stock != null || isCreate) {
      base.stockQuantity = Number(payload.stockQuantity ?? payload.stock ?? base.stockQuantity ?? 0);
    }
    if (isCreate) {
      base.barcode = payload.barcode || base.barcode || '';
      base.description = payload.description || base.description || '';
    }
  }

  if (entityType === 'customer') {
    if (payload.name || payload.nameUrdu || isCreate) {
      base.name = payload.name || payload.nameUrdu || base.name || 'Customer';
    }
  }

  if (entityType === 'supplier') {
    if (payload.name || payload.nameUrdu || isCreate) {
      base.name = payload.name || payload.nameUrdu || base.name || 'Supplier';
    }
  }

  return base;
}

function getPendingHttpRows(pathPrefix) {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT client_id, method, path, body_json
       FROM http_sync_queue
       WHERE status IN ${PENDING_QUEUE_STATUSES}
         AND (path = ? OR path LIKE ?)
       ORDER BY id ASC`,
    )
    .all(pathPrefix, `${pathPrefix}/%`);
}

function getPendingSyncEntityRows(entity, operations = ['create', 'update']) {
  const db = getDatabase();
  const placeholders = operations.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT client_id, operation, payload_json
       FROM sync_queue
       WHERE status IN ${PENDING_QUEUE_STATUSES}
         AND entity = ?
         AND operation IN (${placeholders})
       ORDER BY id ASC`,
    )
    .all(entity, ...operations);
}

function applyPendingMutations(localRows, mutations) {
  const deletedIds = new Set();
  const upserts = new Map();

  for (const mutation of mutations) {
    const method = String(mutation.method || 'POST').toUpperCase();
    const body = mutation.body || {};
    const pathId = mutation.path ? extractPathId(mutation.path) : null;
    const id = String(body.id || body._id || pathId || mutation.clientId || '');

    if (!id) continue;

    if (method === 'DELETE') {
      deletedIds.add(id);
      upserts.delete(id);
      continue;
    }

    upserts.set(id, mutation.record || { ...body, id, _id: id, offlinePending: true });
  }

  let merged = localRows.filter((row) => !deletedIds.has(String(row.id || row._id || '')));

  for (const [id, record] of upserts) {
    const index = merged.findIndex((row) => String(row.id || row._id || '') === id);
    if (index >= 0) {
      merged[index] = mergeDefinedFields(merged[index], record);
    } else {
      merged.unshift(record);
    }
  }

  return merged;
}

function mergeDefinedFields(existing, incoming) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function buildHttpMutations(pathPrefix, entityType, recordBuilder) {
  return getPendingHttpRows(pathPrefix).map((row) => {
    const body = row.body_json ? JSON.parse(row.body_json) : {};
    return {
      clientId: row.client_id,
      method: row.method,
      path: row.path,
      body,
      record: recordBuilder(row.client_id, body, row.method, row.path, entityType),
    };
  });
}

function buildSyncMutations(entity, recordBuilder) {
  return getPendingSyncEntityRows(entity).map((row) => {
    const body = row.payload_json ? JSON.parse(row.payload_json) : {};
    return {
      clientId: row.client_id,
      method: row.operation === 'create' ? 'POST' : 'PATCH',
      path: null,
      body,
      record: recordBuilder(row.client_id, body, row.operation === 'create' ? 'POST' : 'PATCH', null, entity),
    };
  });
}

export function mergePendingCatalogRecords(entityType, localRows = []) {
  const builders = {
    categories: (clientId, body, method) => payloadToCatalogRecord(clientId, body, 'category', method),
    products: (clientId, body, method) => payloadToCatalogRecord(clientId, body, 'product', method),
    customers: (clientId, body, method) => payloadToCatalogRecord(clientId, body, 'customer', method),
    suppliers: (clientId, body, method) => payloadToCatalogRecord(clientId, body, 'supplier', method),
  };

  const pathMap = {
    categories: '/categories',
    products: '/products',
    customers: '/customers',
    suppliers: '/suppliers',
  };

  const builder = builders[entityType];
  const pathPrefix = pathMap[entityType];
  if (!builder || !pathPrefix) return localRows;

  const httpMutations = buildHttpMutations(pathPrefix, entityType, builder);
  const syncMutations =
    entityType === 'customers' || entityType === 'suppliers'
      ? buildSyncMutations(entityType.slice(0, -1), builder)
      : [];

  return applyPendingMutations(localRows, [...syncMutations, ...httpMutations]);
}

export function getPendingInvoicesFromQueue() {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT client_id, payload_json FROM sync_queue
       WHERE status IN ${PENDING_QUEUE_STATUSES} AND entity = 'invoice' AND operation = 'create'
       ORDER BY id ASC`,
    )
    .all();

  const httpRows = getPendingHttpRows('/invoices').filter((row) => row.method === 'POST');

  const invoices = rows.map((row) =>
    payloadToInvoiceRecord(row.client_id, JSON.parse(row.payload_json)),
  );

  for (const row of httpRows) {
    const body = row.body_json ? JSON.parse(row.body_json) : {};
    invoices.push(payloadToInvoiceRecord(row.client_id, body));
  }

  return invoices;
}

export function getPendingPurchasesFromQueue() {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT client_id, payload_json FROM sync_queue
       WHERE status IN ${PENDING_QUEUE_STATUSES} AND entity = 'purchase' AND operation = 'create'
       ORDER BY id ASC`,
    )
    .all();

  const httpRows = getPendingHttpRows('/purchases').filter((row) => row.method === 'POST');

  const purchases = rows.map((row) =>
    payloadToPurchaseRecord(row.client_id, JSON.parse(row.payload_json)),
  );

  for (const row of httpRows) {
    const body = row.body_json ? JSON.parse(row.body_json) : {};
    purchases.push(payloadToPurchaseRecord(row.client_id, body));
  }

  return purchases;
}

export function getPendingPurchaseOrdersFromQueue() {
  return getPendingHttpRows('/purchase-orders')
    .filter((row) => row.method === 'POST')
    .map((row) => {
      const body = row.body_json ? JSON.parse(row.body_json) : {};
      return payloadToPurchaseOrderRecord(row.client_id, body);
    });
}

export function getPendingCatalogFromQueue(entityType) {
  const pathMap = {
    categories: '/categories',
    products: '/products',
    customers: '/customers',
    suppliers: '/suppliers',
  };
  const pathPrefix = pathMap[entityType];
  if (!pathPrefix) return [];

  const catalogEntityMap = {
    categories: 'category',
    products: 'product',
    customers: 'customer',
    suppliers: 'supplier',
  };
  const builder = (clientId, body, method) =>
    payloadToCatalogRecord(clientId, body, catalogEntityMap[entityType], method);
  const httpRecords = buildHttpMutations(pathPrefix, entityType, builder)
    .filter((mutation) => mutation.method !== 'DELETE')
    .map((mutation) => mutation.record);

  const syncRecords =
    entityType === 'customers' || entityType === 'suppliers'
      ? buildSyncMutations(entityType.slice(0, -1), builder)
          .filter((mutation) => mutation.method !== 'DELETE')
          .map((mutation) => mutation.record)
      : [];

  return dedupeById([...syncRecords, ...httpRecords]);
}

function isListPath(path, basePath) {
  const normalized = normalizePath(path).split('?')[0];
  return normalized === basePath || normalized === `${basePath}/all`;
}

function isProductsListPath(path) {
  const normalized = normalizePath(path).split('?')[0];
  return normalized === '/products' || normalized === '/products/all';
}

function dedupeById(records) {
  const seen = new Set();
  return records.filter((record) => {
    const id = String(record.id || record._id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function mergeRecordsIntoList(data, pendingRecords) {
  if (!pendingRecords.length) return data;

  if (Array.isArray(data)) {
    return dedupeById([...pendingRecords, ...data]);
  }

  if (data && Array.isArray(data.results)) {
    const existingIds = new Set(data.results.map((row) => String(row.id || row._id || '')));
    const newRecords = pendingRecords.filter((row) => !existingIds.has(String(row.id || row._id || '')));
    const results = dedupeById([...newRecords, ...data.results]);
    const totalResults = results.length;
    const limit = Number(data.limit) || 10;
    return {
      ...data,
      results,
      totalResults,
      totalPages: Math.max(1, Math.ceil(totalResults / limit)),
    };
  }

  return data;
}

export function mergePendingIntoResponse(method, path, data) {
  const upper = String(method || 'GET').toUpperCase();
  if (upper !== 'GET') return data;

  const normalized = normalizePath(path);

  if (isListPath(normalized, '/invoices')) {
    return mergeRecordsIntoList(data, getPendingInvoicesFromQueue());
  }

  if (isListPath(normalized, '/purchases')) {
    return mergeRecordsIntoList(data, getPendingPurchasesFromQueue());
  }

  if (isListPath(normalized, '/purchase-orders')) {
    return mergeRecordsIntoList(data, getPendingPurchaseOrdersFromQueue());
  }

  if (isListPath(normalized, '/categories')) {
    return mergeRecordsIntoList(data, getPendingCatalogFromQueue('categories'));
  }

  if (isProductsListPath(normalized)) {
    return mergeRecordsIntoList(data, getPendingCatalogFromQueue('products'));
  }

  if (isListPath(normalized, '/customers')) {
    return mergeRecordsIntoList(data, getPendingCatalogFromQueue('customers'));
  }

  if (isListPath(normalized, '/suppliers')) {
    return mergeRecordsIntoList(data, getPendingCatalogFromQueue('suppliers'));
  }

  return data;
}

function injectPendingIntoCacheByPrefix(cachePrefix, pendingRecords) {
  if (!pendingRecords.length) return;
  const db = getDatabase();
  const cacheRows = db
    .prepare(`SELECT cache_key, response_json FROM api_cache WHERE cache_key LIKE ?`)
    .all(`${cachePrefix}%`);

  const update = db.prepare(
    `UPDATE api_cache SET response_json = ?, updated_at = ? WHERE cache_key = ?`,
  );

  for (const row of cacheRows) {
    try {
      const parsed = JSON.parse(row.response_json);
      const merged = mergeRecordsIntoList(parsed, pendingRecords);
      update.run(JSON.stringify(merged), new Date().toISOString(), row.cache_key);
    } catch {
      // ignore corrupt cache rows
    }
  }
}

export function injectPendingIntoInvoiceCaches() {
  injectPendingIntoCacheByPrefix('GET:/invoices', getPendingInvoicesFromQueue());
}

export function injectPendingIntoPurchaseCaches() {
  injectPendingIntoCacheByPrefix('GET:/purchases', getPendingPurchasesFromQueue());
}

export function injectPendingIntoPurchaseOrderCaches() {
  injectPendingIntoCacheByPrefix('GET:/purchase-orders', getPendingPurchaseOrdersFromQueue());
}

export function injectPendingIntoCategoryCaches() {
  injectPendingIntoCacheByPrefix('GET:/categories', getPendingCatalogFromQueue('categories'));
}

export function injectPendingIntoProductCaches() {
  injectPendingIntoCacheByPrefix('GET:/products', getPendingCatalogFromQueue('products'));
}

export function injectPendingIntoCustomerCaches() {
  injectPendingIntoCacheByPrefix('GET:/customers', getPendingCatalogFromQueue('customers'));
}

export function injectPendingIntoSupplierCaches() {
  injectPendingIntoCacheByPrefix('GET:/suppliers', getPendingCatalogFromQueue('suppliers'));
}

export function injectPendingIntoAllListCaches() {
  injectPendingIntoInvoiceCaches();
  injectPendingIntoPurchaseCaches();
  injectPendingIntoPurchaseOrderCaches();
  injectPendingIntoCategoryCaches();
  injectPendingIntoProductCaches();
  injectPendingIntoCustomerCaches();
  injectPendingIntoSupplierCaches();
}
