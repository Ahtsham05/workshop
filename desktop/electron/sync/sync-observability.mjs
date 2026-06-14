import fs from 'fs';
import { dialog } from 'electron';
import { listSyncLogs } from './sync-processor.mjs';
import { getSyncDashboard, listFailedSyncItems, listDeadLetterItems } from './sync-dashboard.mjs';

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function logsToCsv(logs) {
  const header = 'id,type,module,status,message,details,created_at';
  const rows = logs.map((log) =>
    [
      log.id,
      csvEscape(log.type),
      csvEscape(log.module),
      csvEscape(log.status),
      csvEscape(log.message),
      csvEscape(log.details ? JSON.stringify(log.details) : ''),
      csvEscape(log.createdAt),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function buildSyncLogsExport({ format = 'json', limit = 1000 } = {}) {
  const logs = listSyncLogs(limit);
  const exportedAt = new Date().toISOString();

  if (format === 'csv') {
    return logsToCsv(logs);
  }

  return JSON.stringify(
    {
      exportedAt,
      dashboard: getSyncDashboard(),
      failedItems: listFailedSyncItems(100),
      deadLetterItems: listDeadLetterItems(100),
      logs,
    },
    null,
    2,
  );
}

export async function saveSyncLogsExport({ format = 'json', limit = 1000 } = {}) {
  const ext = format === 'csv' ? 'csv' : 'json';
  const result = await dialog.showSaveDialog({
    title: 'Export sync logs',
    defaultPath: `sync-logs-${new Date().toISOString().slice(0, 10)}.${ext}`,
    filters: [{ name: format === 'csv' ? 'CSV' : 'JSON', extensions: [ext] }],
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  const content = buildSyncLogsExport({ format, limit });
  fs.writeFileSync(result.filePath, content, 'utf8');

  return {
    saved: true,
    path: result.filePath,
    format,
    bytes: Buffer.byteLength(content, 'utf8'),
    logCount: listSyncLogs(limit).length,
  };
}
