import { getDatabase, getMeta } from '../db/database.mjs';

const DEFAULT_API = 'http://127.0.0.1:3000/v1';

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

function getLocalScope() {
  return {
    organizationId: getMeta('organization_id', ''),
    branchId: getMeta('active_branch_id', ''),
  };
}

function rowToConflict(row) {
  if (!row) return null;
  return {
    id: row.id,
    serverConflictId: row.server_conflict_id,
    clientId: row.client_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    localData: JSON.parse(row.local_data_json),
    serverData: JSON.parse(row.server_data_json),
    localVersion: row.local_version,
    serverVersion: row.server_version,
    defaultStrategy: row.default_strategy,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function upsertLocalEntity(entityType, entityData) {
  const db = getDatabase();
  const scope = getLocalScope();
  const data = { ...entityData, offlinePending: false };
  const id = String(data.id || data._id || '');

  if (entityType === 'customer') {
    db.prepare(`
      INSERT INTO customers (
        server_id, organization_id, branch_id, name, phone, balance,
        payload_json, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(server_id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        balance = excluded.balance,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        deleted = 0
    `).run(
      id,
      scope.organizationId || data.organizationId || '',
      scope.branchId || data.branchId || '',
      data.name || '',
      data.phone || null,
      Number(data.balance ?? 0),
      JSON.stringify(data),
      data.updatedAt || new Date().toISOString(),
    );
    return;
  }

  if (entityType === 'supplier') {
    db.prepare(`
      INSERT INTO suppliers (
        server_id, organization_id, branch_id, name, phone, balance,
        payload_json, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(server_id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        balance = excluded.balance,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        deleted = 0
    `).run(
      id,
      scope.organizationId || data.organizationId || '',
      scope.branchId || data.branchId || '',
      data.name || '',
      data.phone || null,
      Number(data.balance ?? 0),
      JSON.stringify(data),
      data.updatedAt || new Date().toISOString(),
    );
  }
}

function saveOpenConflict(values) {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT id FROM sync_conflicts WHERE client_id = ? AND status = 'open'`)
    .get(values.clientId);

  if (existing) {
    db.prepare(`
      UPDATE sync_conflicts SET
        server_conflict_id = ?,
        entity_type = ?,
        entity_id = ?,
        operation = ?,
        local_data_json = ?,
        server_data_json = ?,
        local_version = ?,
        server_version = ?,
        default_strategy = ?
      WHERE id = ?
    `).run(
      values.serverConflictId,
      values.entityType,
      values.entityId,
      values.operation,
      values.localDataJson,
      values.serverDataJson,
      values.localVersion,
      values.serverVersion,
      values.defaultStrategy,
      existing.id,
    );
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO sync_conflicts (
      server_conflict_id, client_id, entity_type, entity_id, operation,
      local_data_json, server_data_json, local_version, server_version,
      default_strategy, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    values.serverConflictId,
    values.clientId,
    values.entityType,
    values.entityId,
    values.operation,
    values.localDataJson,
    values.serverDataJson,
    values.localVersion,
    values.serverVersion,
    values.defaultStrategy,
    new Date().toISOString(),
  );

  return result.lastInsertRowid;
}

export function recordConflictFromPushResult(result, queueRow) {
  const db = getDatabase();
  const payload = queueRow ? JSON.parse(queueRow.payload_json) : result.localData || {};
  const entityType = queueRow?.entity || 'unknown';
  const entityId = String(
    payload.customerId || payload.supplierId || payload.id || payload._id || '',
  );
  const serverData = result.serverData || {};

  saveOpenConflict({
    serverConflictId: result.conflictId || null,
    clientId: result.clientId,
    entityType,
    entityId: entityId || null,
    operation: queueRow?.operation || 'update',
    localDataJson: JSON.stringify(payload),
    serverDataJson: JSON.stringify(serverData),
    localVersion: result.localVersion || payload.baseVersion || 0,
    serverVersion: result.serverVersion || serverData.version || 0,
    defaultStrategy: result.defaultStrategy || 'manual_review',
  });

  db.prepare(`UPDATE sync_queue SET status = 'conflict', error_message = ? WHERE client_id = ?`).run(
    result.message || 'Sync conflict — review required',
    result.clientId,
  );
}

export function listOpenConflicts() {
  const rows = getDatabase()
    .prepare(`SELECT * FROM sync_conflicts WHERE status = 'open' ORDER BY id DESC LIMIT 200`)
    .all();
  return rows.map(rowToConflict);
}

export function countOpenConflicts() {
  return (
    getDatabase().prepare(`SELECT COUNT(*) as count FROM sync_conflicts WHERE status = 'open'`).get()
      ?.count || 0
  );
}

function finalizeQueueAfterResolution(clientId, resolution) {
  const db = getDatabase();
  if (resolution === 'server_wins') {
    db.prepare(`DELETE FROM sync_queue WHERE client_id = ?`).run(clientId);
    return;
  }

  const row = db.prepare(`SELECT payload_json FROM sync_queue WHERE client_id = ?`).get(clientId);
  if (row) {
    const payload = { ...JSON.parse(row.payload_json), forceApply: true };
    db.prepare(`
      UPDATE sync_queue
      SET status = 'pending', payload_json = ?, error_message = NULL
      WHERE client_id = ?
    `).run(JSON.stringify(payload), clientId);
  }
}

export async function resolveConflict(conflictId, strategy) {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM sync_conflicts WHERE id = ? AND status = 'open'`)
    .get(Number(conflictId) || conflictId);

  if (!row) {
    throw new Error('Conflict not found or already resolved');
  }

  const conflict = rowToConflict(row);
  let serverResult = null;

  if (conflict.serverConflictId) {
    serverResult = await apiFetch(`/sync/conflicts/${conflict.serverConflictId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ strategy }),
    });
  }

  if (strategy === 'server_wins') {
    upsertLocalEntity(conflict.entityType, conflict.serverData);
    finalizeQueueAfterResolution(conflict.clientId, 'server_wins');
  } else if (strategy === 'local_wins') {
    finalizeQueueAfterResolution(conflict.clientId, 'local_wins');
  } else {
    throw new Error('Unsupported resolution strategy');
  }

  db.prepare(`
    UPDATE sync_conflicts
    SET status = 'resolved', resolution = ?, resolved_at = ?
    WHERE id = ?
  `).run(strategy, new Date().toISOString(), row.id);

  return {
    conflictId: row.id,
    strategy,
    clientId: conflict.clientId,
    serverResult,
  };
}

export async function syncConflictsFromServer() {
  try {
    const response = await apiFetch('/sync/conflicts');
    const conflicts = response?.conflicts || [];

    for (const item of conflicts) {
      const clientId = item.clientId;
      if (!clientId) continue;

      saveOpenConflict({
        serverConflictId: String(item.id || item._id),
        clientId,
        entityType: item.entityType,
        entityId: item.entityId ? String(item.entityId) : null,
        operation: item.operation || 'update',
        localDataJson: JSON.stringify(item.localData || {}),
        serverDataJson: JSON.stringify(item.serverData || {}),
        localVersion: item.localVersion || 0,
        serverVersion: item.serverVersion || 0,
        defaultStrategy: item.defaultStrategy || 'manual_review',
      });

      const queueRow = getDatabase().prepare(`SELECT status FROM sync_queue WHERE client_id = ?`).get(clientId);
      if (queueRow?.status === 'pending') {
        getDatabase().prepare(`UPDATE sync_queue SET status = 'conflict' WHERE client_id = ?`).run(clientId);
      }
    }

    return { synced: conflicts.length };
  } catch {
    return { synced: 0 };
  }
}

export { apiFetch, upsertLocalEntity };
