import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  isElectron: true,
  getNetworkStatus: () => ipcRenderer.invoke('network:status'),
  onNetworkStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('network:status', handler);
    return () => ipcRenderer.removeListener('network:status', handler);
  },
  sync: {
    configure: (config) => ipcRenderer.invoke('sync:configure', config),
    status: () => ipcRenderer.invoke('sync:status'),
    pull: (opts) => ipcRenderer.invoke('sync:pull', opts),
    push: () => ipcRenderer.invoke('sync:push'),
    run: (opts) => ipcRenderer.invoke('sync:run', opts),
    bootstrap: () => ipcRenderer.invoke('sync:bootstrap'),
    queue: (op) => ipcRenderer.invoke('sync:queue', op),
    downloadOfflineData: () => ipcRenderer.invoke('sync:download-offline-data'),
    getOfflineBootstrapInfo: () => ipcRenderer.invoke('sync:offline-bootstrap-info'),
    getDashboard: () => ipcRenderer.invoke('sync:dashboard'),
    getFailedItems: () => ipcRenderer.invoke('sync:failed-items'),
    getDeadLetterItems: () => ipcRenderer.invoke('sync:dead-letter-items'),
    getLogs: (limit) => ipcRenderer.invoke('sync:logs', limit),
    clearLogs: () => ipcRenderer.invoke('sync:clear-logs'),
    exportLogs: (opts) => ipcRenderer.invoke('sync:export-logs', opts),
    retryFailed: () => ipcRenderer.invoke('sync:retry-failed'),
    clearQueue: (opts) => ipcRenderer.invoke('sync:clear-queue', opts),
    rebuildCache: () => ipcRenderer.invoke('sync:rebuild-cache'),
    getConflicts: () => ipcRenderer.invoke('sync:conflicts'),
    resolveConflict: (conflictId, strategy) =>
      ipcRenderer.invoke('sync:resolve-conflict', { conflictId, strategy }),
    syncConflictsFromServer: () => ipcRenderer.invoke('sync:sync-conflicts-from-server'),
  },
  database: {
    getStatus: () => ipcRenderer.invoke('database:status'),
    getSettings: () => ipcRenderer.invoke('database:settings'),
    testLocal: (url) => ipcRenderer.invoke('database:test-local', url),
    saveConfig: (config) => ipcRenderer.invoke('database:save-config', config),
    getHealth: (opts) => ipcRenderer.invoke('database:health', opts),
    restartServer: () => ipcRenderer.invoke('database:restart-server'),
    getInstallGuide: () => ipcRenderer.invoke('database:install-guide'),
  },
  backup: {
    getSettings: () => ipcRenderer.invoke('backup:settings'),
    saveSettings: (settings) => ipcRenderer.invoke('backup:save-settings', settings),
    pickDestination: () => ipcRenderer.invoke('backup:pick-destination'),
    pickFile: () => ipcRenderer.invoke('backup:pick-file'),
    list: (destinationPath) => ipcRenderer.invoke('backup:list', destinationPath),
    create: (opts) => ipcRenderer.invoke('backup:create', opts),
    validate: (zipPath) => ipcRenderer.invoke('backup:validate', zipPath),
    preview: (zipPath) => ipcRenderer.invoke('backup:preview', zipPath),
    restore: (zipPath) => ipcRenderer.invoke('backup:restore', zipPath),
  },
  cache: {
    getStats: () => ipcRenderer.invoke('cache:stats'),
    getSettings: () => ipcRenderer.invoke('cache:settings'),
    saveSettings: (settings) => ipcRenderer.invoke('cache:save-settings', settings),
    list: (opts) => ipcRenderer.invoke('cache:list', opts),
    purgeExpired: () => ipcRenderer.invoke('cache:purge-expired'),
    invalidatePrefix: (prefix) => ipcRenderer.invoke('cache:invalidate-prefix', prefix),
    invalidateKey: (cacheKey) => ipcRenderer.invoke('cache:invalidate-key', cacheKey),
    clear: () => ipcRenderer.invoke('cache:clear'),
    refreshAll: () => ipcRenderer.invoke('cache:refresh-all'),
    rebuild: () => ipcRenderer.invoke('cache:rebuild'),
  },
  onDatabaseSetupRequired: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('database:setup-required', handler);
    return () => ipcRenderer.removeListener('database:setup-required', handler);
  },
  onOfflineBootstrapProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('offline-bootstrap:progress', handler);
    return () => ipcRenderer.removeListener('offline-bootstrap:progress', handler);
  },
  onSyncStatusChanged: (callback) => {
    const handler = (_event, dashboard) => callback(dashboard);
    ipcRenderer.on('sync:status-changed', handler);
    return () => ipcRenderer.removeListener('sync:status-changed', handler);
  },
  secure: {
    encrypt: (plaintext) => ipcRenderer.invoke('secure:encrypt', plaintext),
    decrypt: (stored) => ipcRenderer.invoke('secure:decrypt', stored),
    status: () => ipcRenderer.invoke('secure:status'),
  },
  http: {
    offlineRequest: (payload) => ipcRenderer.invoke('http:offline-request', payload),
    cacheResponse: (payload) => ipcRenderer.invoke('http:cache-response', payload),
    mergeResponse: (payload) => ipcRenderer.invoke('http:merge-response', payload),
  },
  db: {
    products: (search) => ipcRenderer.invoke('db:products', search),
    customers: (search) => ipcRenderer.invoke('db:customers', search),
    categories: (search) => ipcRenderer.invoke('db:categories', search),
    suppliers: (search) => ipcRenderer.invoke('db:suppliers', search),
    meta: (key) => ipcRenderer.invoke('db:meta', key),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
