import { getDatabase, getMeta, setMeta } from '../db/database.mjs';
import { getHttpSyncStatus } from './http-offline.mjs';
import { countOpenConflicts } from './conflicts.mjs';
import {
  getQueueMetrics,
  retryFailedAndDeadLetter,
  listDeadLetterItems,
  listSyncLogs,
  clearSyncLogs,
} from './sync-processor.mjs';

function readOfflineBootstrapInfo() {
  return {
    status: getMeta('offline_bootstrap_status', 'not_started'),
    completedAt: getMeta('offline_bootstrap_completed_at', null),
    version: getMeta('offline_bootstrap_version', null),
  };
}

export function getSyncDashboard() {
  const db = getDatabase();
  const queueMetrics = getQueueMetrics();
  const httpStatus = getHttpSyncStatus();
  const productCount =
    db.prepare(`SELECT COUNT(*) as count FROM products WHERE deleted = 0`).get()?.count || 0;
  const customerCount =
    db.prepare(`SELECT COUNT(*) as count FROM customers WHERE deleted = 0`).get()?.count || 0;
  const categoryCount =
    db.prepare(`SELECT COUNT(*) as count FROM categories WHERE deleted = 0`).get()?.count || 0;
  const supplierCount =
    db.prepare(`SELECT COUNT(*) as count FROM suppliers WHERE deleted = 0`).get()?.count || 0;

  const pendingRequests =
    queueMetrics.entityPending +
    queueMetrics.httpPending +
    queueMetrics.entityProcessing +
    queueMetrics.httpProcessing;
  const failedRequests =
    queueMetrics.entityFailed +
    queueMetrics.httpFailed +
    queueMetrics.entityDeadLetter +
    queueMetrics.httpDeadLetter;
  const openConflicts = countOpenConflicts();
  const bootstrap = readOfflineBootstrapInfo();

  return {
    syncState: getMeta('sync_state', 'idle'),
    offlineActive: bootstrap.status === 'complete',
    pendingRequests,
    failedRequests,
    openConflicts,
    queueSize: pendingRequests + failedRequests + openConflicts,
    entityPending: queueMetrics.entityPending,
    entityProcessing: queueMetrics.entityProcessing,
    entityFailed: queueMetrics.entityFailed,
    entityDeadLetter: queueMetrics.entityDeadLetter,
    httpPending: queueMetrics.httpPending,
    httpProcessing: queueMetrics.httpProcessing,
    httpFailed: queueMetrics.httpFailed,
    httpDeadLetter: queueMetrics.httpDeadLetter,
    cacheCount: httpStatus.cacheCount,
    productCount,
    customerCount,
    categoryCount,
    supplierCount,
    lastPullAt: getMeta('last_pull_at', null),
    lastPushAt: getMeta('last_push_at', null),
    lastSuccessAt: getMeta('last_sync_success_at', null),
    lastFailedAt: getMeta('last_sync_failed_at', null),
    lastFailedMessage: getMeta('last_sync_failed_message', null) || null,
    lastNetworkRecoveryAt: queueMetrics.lastNetworkRecoveryAt,
    deviceId: getMeta('device_id', null),
    offlineBootstrap: bootstrap,
  };
}

export function listFailedSyncItems(limit = 25) {
  const db = getDatabase();

  const entityItems = db
    .prepare(
      `SELECT client_id, entity, operation, error_message, retry_count, next_retry_at, failed_at, created_at
       FROM sync_queue WHERE status = 'failed'
       ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);

  const httpItems = db
    .prepare(
      `SELECT client_id, method, path, error_message, retry_count, next_retry_at, failed_at, created_at
       FROM http_sync_queue WHERE status = 'failed'
       ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);

  return { entityItems, httpItems };
}

export function retryFailedSync() {
  return retryFailedAndDeadLetter();
}

export function clearSyncQueue({ includePending = false } = {}) {
  const db = getDatabase();
  const statuses = includePending
    ? "('pending', 'failed', 'processing', 'dead_letter')"
    : "('failed', 'processing', 'dead_letter')";

  const entityResult = db.prepare(`DELETE FROM sync_queue WHERE status IN ${statuses}`).run();
  const httpResult = db.prepare(`DELETE FROM http_sync_queue WHERE status IN ${statuses}`).run();

  return {
    cleared: (entityResult.changes || 0) + (httpResult.changes || 0),
  };
}

export function clearApiCache() {
  const db = getDatabase();
  const result = db.prepare(`DELETE FROM api_cache`).run();
  return { cleared: result.changes || 0 };
}

export async function rebuildCache(onProgress) {
  clearApiCache();
  setMeta('offline_bootstrap_status', 'not_started');
  setMeta('offline_bootstrap_completed_at', '');
  const { downloadAllDataForOffline } = await import('./engine.mjs');
  return downloadAllDataForOffline(onProgress);
}

export function markSyncStarted() {
  setMeta('sync_state', 'syncing');
}

export function markSyncSuccess() {
  const now = new Date().toISOString();
  setMeta('sync_state', 'idle');
  setMeta('last_sync_success_at', now);
  setMeta('last_sync_failed_message', '');
}

export function markSyncFailed(message) {
  setMeta('sync_state', 'error');
  setMeta('last_sync_failed_at', new Date().toISOString());
  setMeta('last_sync_failed_message', message || 'Sync failed');
}

export { listDeadLetterItems, listSyncLogs, clearSyncLogs };
