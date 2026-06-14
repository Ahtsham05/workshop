import { getDatabase } from '../db/database.mjs';
import { getCacheSettings } from './cache-settings.mjs';
import {
  buildCacheKey,
  normalizePath,
  setCachedResponse,
  shouldCacheRequest,
} from './http-offline.mjs';
import { clearApiCache, rebuildCache } from './sync-dashboard.mjs';
import { apiFetch } from './conflicts.mjs';

function cacheKeyToUrl(cacheKey) {
  const separator = String(cacheKey).indexOf(':');
  if (separator === -1) return normalizePath(cacheKey);
  return normalizePath(String(cacheKey).slice(separator + 1));
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export {
  getCacheSettings,
  saveCacheSettings,
} from './cache-settings.mjs';

export function purgeExpiredCache() {
  const now = new Date().toISOString();
  const result = getDatabase()
    .prepare(`DELETE FROM api_cache WHERE expires_at IS NOT NULL AND expires_at <= ?`)
    .run(now);
  return { purged: result.changes || 0 };
}

export function getCacheStats() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const expiredRow = db
    .prepare(`SELECT COUNT(*) as count FROM api_cache WHERE expires_at IS NOT NULL AND expires_at <= ?`)
    .get(now);
  const expiredRecords = expiredRow?.count || 0;

  purgeExpiredCache();
  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM api_cache`).get();
  const sizeRow = db
    .prepare(`SELECT SUM(length(response_json)) as bytes FROM api_cache`)
    .get();
  const oldestRow = db
    .prepare(`SELECT updated_at FROM api_cache ORDER BY updated_at ASC LIMIT 1`)
    .get();
  const newestRow = db
    .prepare(`SELECT updated_at FROM api_cache ORDER BY updated_at DESC LIMIT 1`)
    .get();

  return {
    totalRecords: totalRow?.count || 0,
    expiredRecords,
    storageBytes: sizeRow?.bytes || 0,
    storageUsed: formatBytes(sizeRow?.bytes || 0),
    oldestCacheAt: oldestRow?.updated_at || null,
    newestCacheAt: newestRow?.updated_at || null,
    settings: getCacheSettings(),
  };
}

export function listCacheEntries({ limit = 50, offset = 0, search = '' } = {}) {
  const db = getDatabase();
  const query = String(search || '').trim();
  const like = `%${query}%`;

  const rows = query
    ? db
        .prepare(
          `SELECT cache_key, method, url, status_code, version, expires_at, updated_at,
                  length(response_json) as size_bytes
           FROM api_cache
           WHERE cache_key LIKE ? OR IFNULL(url, '') LIKE ?
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(like, like, limit, offset)
    : db
        .prepare(
          `SELECT cache_key, method, url, status_code, version, expires_at, updated_at,
                  length(response_json) as size_bytes
           FROM api_cache
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(limit, offset);

  const now = Date.now();
  return rows.map((row) => ({
    cacheKey: row.cache_key,
    method: row.method,
    url: row.url || cacheKeyToUrl(row.cache_key),
    statusCode: row.status_code,
    version: row.version || 1,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    sizeBytes: row.size_bytes || 0,
    expired: row.expires_at ? new Date(row.expires_at).getTime() <= now : false,
  }));
}

export function invalidateCacheByPrefix(prefix) {
  const normalized = normalizePath(prefix);
  const like = `${normalized}%`;
  const result = getDatabase()
    .prepare(`DELETE FROM api_cache WHERE IFNULL(url, '') LIKE ? OR cache_key LIKE ?`)
    .run(like, `%:${like}`);
  return { invalidated: result.changes || 0 };
}

export function invalidateCacheKey(cacheKey) {
  const result = getDatabase().prepare(`DELETE FROM api_cache WHERE cache_key = ?`).run(cacheKey);
  return { invalidated: result.changes || 0 };
}

export function clearAllCache() {
  return clearApiCache();
}

export async function refreshAllCache(onProgress) {
  purgeExpiredCache();

  const rows = getDatabase()
    .prepare(`SELECT DISTINCT IFNULL(url, '') as url, method FROM api_cache WHERE url IS NOT NULL AND url != ''`)
    .all();

  let refreshed = 0;
  let failed = 0;
  const total = rows.length;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    onProgress?.({
      phase: 'downloading',
      current: index + 1,
      total,
      message: `Refreshing ${row.url}`,
    });

    if (!shouldCacheRequest(row.method || 'GET', row.url)) {
      continue;
    }

    try {
      const data = await apiFetch(row.url.startsWith('/') ? row.url : `/${row.url}`);
      setCachedResponse(buildCacheKey(row.method || 'GET', row.url), row.method || 'GET', 200, data);
      refreshed += 1;
    } catch {
      failed += 1;
    }
  }

  return { refreshed, failed, total };
}

export async function rebuildAllCache(onProgress) {
  return rebuildCache(onProgress);
}

export { formatBytes as formatCacheBytes };
