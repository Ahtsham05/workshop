import crypto from 'crypto';
import { getDatabase, getMeta, setMeta } from '../db/database.mjs';

export const MAX_SYNC_RETRIES = 5;
export const SYNC_BATCH_SIZE = 25;
export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 30 * 60 * 1000;
export const PROCESSING_STALE_MS = 5 * 60 * 1000;

export function calculateBackoffMs(retryCount) {
  const exponent = Math.max(0, Number(retryCount) - 1);
  const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
  const jitter = Math.floor(Math.random() * 1000);
  return delay + jitter;
}

export function appendSyncLog({ type, module, status, message, details = null }) {
  getDatabase()
    .prepare(
      `INSERT INTO sync_logs (type, module, status, message, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      type,
      module,
      status,
      message,
      details ? JSON.stringify(details) : null,
      new Date().toISOString(),
    );
}

export function listSyncLogs(limit = 50) {
  return getDatabase()
    .prepare(
      `SELECT id, type, module, status, message, details_json, created_at
       FROM sync_logs ORDER BY id DESC LIMIT ?`,
    )
    .all(limit)
    .map((row) => ({
      id: row.id,
      type: row.type,
      module: row.module,
      status: row.status,
      message: row.message,
      details: row.details_json ? JSON.parse(row.details_json) : null,
      createdAt: row.created_at,
    }));
}

export function clearSyncLogs() {
  const result = getDatabase().prepare(`DELETE FROM sync_logs`).run();
  return { cleared: result.changes || 0 };
}

export function resetStaleProcessing() {
  const cutoff = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();
  const entityResult = getDatabase()
    .prepare(
      `UPDATE sync_queue
       SET status = 'pending', processing_at = NULL
       WHERE status = 'processing' AND processing_at IS NOT NULL AND processing_at <= ?`,
    )
    .run(cutoff);
  const httpResult = getDatabase()
    .prepare(
      `UPDATE http_sync_queue
       SET status = 'pending', processing_at = NULL
       WHERE status = 'processing' AND processing_at IS NOT NULL AND processing_at <= ?`,
    )
    .run(cutoff);

  return {
    reset: (entityResult.changes || 0) + (httpResult.changes || 0),
  };
}

function nowIso() {
  return new Date().toISOString();
}

export function getReadyEntityQueue(limit = SYNC_BATCH_SIZE) {
  resetStaleProcessing();
  const now = nowIso();
  return getDatabase()
    .prepare(
      `SELECT * FROM sync_queue
       WHERE status = 'pending'
          OR (status = 'failed' AND IFNULL(next_retry_at, '') <= ?)
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(now, limit);
}

export function getReadyHttpQueue(limit = SYNC_BATCH_SIZE) {
  resetStaleProcessing();
  const now = nowIso();
  return getDatabase()
    .prepare(
      `SELECT * FROM http_sync_queue
       WHERE status = 'pending'
          OR (status = 'failed' AND IFNULL(next_retry_at, '') <= ?)
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(now, limit);
}

export function markEntityBatchProcessing(rows, batchId = crypto.randomUUID()) {
  const stmt = getDatabase().prepare(
    `UPDATE sync_queue
     SET status = 'processing', processing_at = ?, batch_id = ?, error_message = NULL
     WHERE client_id = ?`,
  );
  const tx = getDatabase().transaction((items) => {
    for (const row of items) {
      stmt.run(nowIso(), batchId, row.client_id);
    }
  });
  tx(rows);
  return batchId;
}

export function markHttpBatchProcessing(rows, batchId = crypto.randomUUID()) {
  const stmt = getDatabase().prepare(
    `UPDATE http_sync_queue
     SET status = 'processing', processing_at = ?, batch_id = ?, error_message = NULL
     WHERE client_id = ?`,
  );
  const tx = getDatabase().transaction((items) => {
    for (const row of items) {
      stmt.run(nowIso(), batchId, row.client_id);
    }
  });
  tx(rows);
  return batchId;
}

export function markEntitySynced(clientId, serverId) {
  getDatabase()
    .prepare(
      `UPDATE sync_queue
       SET status = 'synced', server_id = ?, synced_at = ?, processing_at = NULL,
           error_message = NULL, failed_at = NULL, dead_letter_at = NULL
       WHERE client_id = ?`,
    )
    .run(serverId || null, nowIso(), clientId);
}

export function markEntityConflict(clientId, errorMessage) {
  getDatabase()
    .prepare(
      `UPDATE sync_queue
       SET status = 'conflict', error_message = ?, processing_at = NULL
       WHERE client_id = ?`,
    )
    .run(errorMessage || 'Sync conflict', clientId);
}

export function markEntityDeadLetter(clientId, errorMessage, retryCount) {
  getDatabase()
    .prepare(
      `UPDATE sync_queue
       SET status = 'dead_letter', dead_letter_at = ?, failed_at = ?, processing_at = NULL,
           error_message = ?, next_retry_at = NULL
       WHERE client_id = ?`,
    )
    .run(nowIso(), nowIso(), errorMessage, clientId);

  appendSyncLog({
    type: 'push',
    module: 'entity',
    status: 'dead_letter',
    message: errorMessage,
    details: { clientId, retryCount },
  });
}

export function scheduleEntityRetry(clientId, errorMessage, retryCount) {
  const nextRetry = Number(retryCount || 0) + 1;

  if (nextRetry >= MAX_SYNC_RETRIES) {
    markEntityDeadLetter(clientId, errorMessage, nextRetry);
    return { deadLetter: true, retryCount: nextRetry };
  }

  const nextRetryAt = new Date(Date.now() + calculateBackoffMs(nextRetry)).toISOString();
  getDatabase()
    .prepare(
      `UPDATE sync_queue
       SET status = 'failed', retry_count = ?, next_retry_at = ?, failed_at = ?,
           processing_at = NULL, error_message = ?
       WHERE client_id = ?`,
    )
    .run(nextRetry, nextRetryAt, nowIso(), errorMessage, clientId);

  appendSyncLog({
    type: 'push',
    module: 'entity',
    status: 'failed',
    message: errorMessage,
    details: { clientId, retryCount: nextRetry, nextRetryAt },
  });

  return { deadLetter: false, retryCount: nextRetry, nextRetryAt };
}

export function markHttpSynced(clientId, statusCode, responseData) {
  getDatabase()
    .prepare(
      `UPDATE http_sync_queue
       SET status = 'synced', status_code = ?, response_json = ?, synced_at = ?,
           processing_at = NULL, error_message = NULL, failed_at = NULL, dead_letter_at = NULL
       WHERE client_id = ?`,
    )
    .run(statusCode, JSON.stringify(responseData ?? null), nowIso(), clientId);
}

export function markHttpDeadLetter(clientId, errorMessage, retryCount) {
  getDatabase()
    .prepare(
      `UPDATE http_sync_queue
       SET status = 'dead_letter', dead_letter_at = ?, failed_at = ?, processing_at = NULL,
           error_message = ?, next_retry_at = NULL
       WHERE client_id = ?`,
    )
    .run(nowIso(), nowIso(), errorMessage, clientId);

  appendSyncLog({
    type: 'push',
    module: 'http',
    status: 'dead_letter',
    message: errorMessage,
    details: { clientId, retryCount },
  });
}

export function scheduleHttpRetry(clientId, errorMessage, retryCount) {
  const nextRetry = Number(retryCount || 0) + 1;

  if (nextRetry >= MAX_SYNC_RETRIES) {
    markHttpDeadLetter(clientId, errorMessage, nextRetry);
    return { deadLetter: true, retryCount: nextRetry };
  }

  const nextRetryAt = new Date(Date.now() + calculateBackoffMs(nextRetry)).toISOString();
  getDatabase()
    .prepare(
      `UPDATE http_sync_queue
       SET status = 'failed', retry_count = ?, next_retry_at = ?, failed_at = ?,
           processing_at = NULL, error_message = ?
       WHERE client_id = ?`,
    )
    .run(nextRetry, nextRetryAt, nowIso(), errorMessage, clientId);

  appendSyncLog({
    type: 'push',
    module: 'http',
    status: 'failed',
    message: errorMessage,
    details: { clientId, retryCount: nextRetry, nextRetryAt },
  });

  return { deadLetter: false, retryCount: nextRetry, nextRetryAt };
}

export function getEntityRetryCount(clientId) {
  const row = getDatabase()
    .prepare(`SELECT retry_count FROM sync_queue WHERE client_id = ?`)
    .get(clientId);
  return row?.retry_count || 0;
}

export function getHttpRetryCount(clientId) {
  const row = getDatabase()
    .prepare(`SELECT retry_count FROM http_sync_queue WHERE client_id = ?`)
    .get(clientId);
  return row?.retry_count || 0;
}

export function retryFailedAndDeadLetter() {
  const db = getDatabase();
  const entityResult = db
    .prepare(
      `UPDATE sync_queue
       SET status = 'pending', retry_count = 0, next_retry_at = NULL, processing_at = NULL,
           error_message = NULL, failed_at = NULL, dead_letter_at = NULL
       WHERE status IN ('failed', 'dead_letter')`,
    )
    .run();
  const httpResult = db
    .prepare(
      `UPDATE http_sync_queue
       SET status = 'pending', retry_count = 0, next_retry_at = NULL, processing_at = NULL,
           error_message = NULL, failed_at = NULL, dead_letter_at = NULL
       WHERE status IN ('failed', 'dead_letter')`,
    )
    .run();

  appendSyncLog({
    type: 'queue',
    module: 'system',
    status: 'retried',
    message: 'Failed and dead-letter items reset to pending',
    details: {
      entity: entityResult.changes || 0,
      http: httpResult.changes || 0,
    },
  });

  return {
    retried: (entityResult.changes || 0) + (httpResult.changes || 0),
  };
}

export function listDeadLetterItems(limit = 25) {
  const db = getDatabase();

  const entityItems = db
    .prepare(
      `SELECT client_id, entity, operation, error_message, retry_count, dead_letter_at, created_at
       FROM sync_queue WHERE status = 'dead_letter'
       ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);

  const httpItems = db
    .prepare(
      `SELECT client_id, method, path, error_message, retry_count, dead_letter_at, created_at
       FROM http_sync_queue WHERE status = 'dead_letter'
       ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);

  return { entityItems, httpItems };
}

export function getQueueMetrics() {
  const db = getDatabase();
  const count = (sql) => db.prepare(sql).get()?.count || 0;

  return {
    entityPending: count(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`),
    entityProcessing: count(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'processing'`),
    entityFailed: count(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`),
    entityDeadLetter: count(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'dead_letter'`),
    httpPending: count(`SELECT COUNT(*) as count FROM http_sync_queue WHERE status = 'pending'`),
    httpProcessing: count(`SELECT COUNT(*) as count FROM http_sync_queue WHERE status = 'processing'`),
    httpFailed: count(`SELECT COUNT(*) as count FROM http_sync_queue WHERE status = 'failed'`),
    httpDeadLetter: count(`SELECT COUNT(*) as count FROM http_sync_queue WHERE status = 'dead_letter'`),
    lastNetworkRecoveryAt: getMeta('last_network_recovery_at', null),
  };
}

export function recordNetworkRecovery() {
  const at = nowIso();
  setMeta('last_network_recovery_at', at);
  appendSyncLog({
    type: 'network',
    module: 'system',
    status: 'online',
    message: 'Network connection restored — sync resumed',
    details: { recoveredAt: at },
  });
  return at;
}

export function hasPendingSyncWork() {
  const metrics = getQueueMetrics();
  return (
    metrics.entityPending +
      metrics.entityFailed +
      metrics.httpPending +
      metrics.httpFailed >
    0
  );
}
