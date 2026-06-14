export type OfflineBootstrapInfo = {
  status: 'not_started' | 'downloading' | 'complete' | 'failed' | string
  completedAt: string | null
  version: string | null
}

export type OfflineBootstrapProgress = {
  phase: 'preparing' | 'downloading' | 'complete' | 'error'
  step?: string
  label?: string
  current?: number
  total?: number
  message?: string
  completedAt?: string
  cachedTotal?: number
  failedTotal?: number
}

export type SyncDashboard = {
  syncState: 'idle' | 'syncing' | 'error' | string
  offlineActive: boolean
  pendingRequests: number
  failedRequests: number
  queueSize: number
  entityPending: number
  entityFailed: number
  entityProcessing?: number
  entityDeadLetter?: number
  httpPending: number
  httpFailed: number
  httpProcessing?: number
  httpDeadLetter?: number
  cacheCount: number
  productCount: number
  customerCount: number
  categoryCount: number
  supplierCount: number
  lastPullAt: string | null
  lastPushAt: string | null
  lastSuccessAt: string | null
  lastFailedAt: string | null
  lastFailedMessage: string | null
  lastNetworkRecoveryAt?: string | null
  deviceId: string | null
  openConflicts?: number
  offlineBootstrap?: OfflineBootstrapInfo
}

export type SyncFailedItems = {
  entityItems: Array<{
    client_id: string
    entity: string
    operation: string
    error_message: string | null
    retry_count?: number
    next_retry_at?: string | null
    failed_at?: string | null
    created_at: string
  }>
  httpItems: Array<{
    client_id: string
    method: string
    path: string
    error_message: string | null
    retry_count?: number
    next_retry_at?: string | null
    failed_at?: string | null
    created_at: string
  }>
}

export type SyncDeadLetterItems = {
  entityItems: Array<{
    client_id: string
    entity: string
    operation: string
    error_message: string | null
    retry_count?: number
    dead_letter_at?: string | null
    created_at: string
  }>
  httpItems: Array<{
    client_id: string
    method: string
    path: string
    error_message: string | null
    retry_count?: number
    dead_letter_at?: string | null
    created_at: string
  }>
}

export type SyncLogEntry = {
  id: number
  type: string
  module: string
  status: string
  message: string
  details: Record<string, unknown> | null
  createdAt: string
}

export type DatabaseHealth = {
  connected: boolean
  latency: number | null
  storageUsed: string | null
  mode: 'local' | 'cloud' | 'unknown' | string
  database?: string | null
  host?: string | null
}

export type BackupSettings = {
  destinationPath: string
  schedule: 'off' | 'daily' | 'weekly' | 'monthly'
  enabled: boolean
  lastBackupAt: string | null
  lastBackupPath: string | null
  maxBackups: number
  defaultBackupDir: string
}

export type BackupManifest = {
  formatVersion: number
  label?: string | null
  appVersion: string
  createdAt: string
  organizationId: string
  branchId: string
  sqliteSchemaVersion: number
  databaseMode: string
  includesMongo: boolean
  mongoNote?: string | null
  stats?: {
    entityPending: number
    entityFailed: number
    httpPending: number
    httpFailed: number
    cacheCount: number
    openConflicts: number
    queueSize: number
  }
  files?: Array<{ path: string; size: number }>
}

export type BackupRecord = {
  fileName: string
  path: string
  size: number
  createdAt: string
  organizationId: string | null
  branchId: string | null
  includesMongo: boolean
  stats: BackupManifest['stats'] | null
  valid: boolean
}

export type BackupPreview = {
  valid: boolean
  manifest: BackupManifest
  files: Array<{ path: string; size: number; compressedSize?: number }>
  warnings?: string[]
  fileName: string
  path: string
  size: number
}

export type CacheSettings = {
  ttlHours: number
  ttlEnabled: boolean
  defaultTtlHours: number
}

export type CacheStats = {
  totalRecords: number
  expiredRecords: number
  storageBytes: number
  storageUsed: string
  oldestCacheAt: string | null
  newestCacheAt: string | null
  settings: CacheSettings
}

export type CacheEntry = {
  cacheKey: string
  method: string
  url: string
  statusCode: number
  version: number
  expiresAt: string | null
  updatedAt: string
  sizeBytes: number
  expired: boolean
}

export type LocalDatabaseStatus = {
  mode: 'local' | 'cloud' | string
  localMongoUrl: string
  activeMongoUrl: string | null
  localMongoReachable: boolean | null
  host: string | null
  port: number | null
  database: string | null
  embeddedServerRunning: boolean
  needsSetup: boolean
  setupCompleted: boolean
  configuredAt: string | null
  serverEnvPath: string | null
  defaultLocalMongoUrl: string
}

export type SyncConflictRecord = {
  id: number
  serverConflictId: string | null
  clientId: string
  entityType: string
  entityId: string | null
  operation: string
  localData: Record<string, unknown>
  serverData: Record<string, unknown>
  localVersion: number
  serverVersion: number
  defaultStrategy: string
  status: string
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
}

export type SyncStatus = {
  pending: number
  failed: number
  productCount: number
  customerCount: number
  categoryCount: number
  supplierCount: number
  httpPending?: number
  httpFailed?: number
  cacheCount?: number
  lastPullAt: string | null
  lastPushAt: string | null
  deviceId: string | null
  offlineBootstrap?: OfflineBootstrapInfo
}

export type NetworkStatus = {
  online: boolean
}

export type SyncQueueOperation = {
  clientId: string
  entity: 'invoice' | 'purchase' | 'customer' | 'supplier'
  operation: 'create' | 'update'
  payload: Record<string, unknown>
}

export type ElectronAPI = {
  isElectron: boolean
  getNetworkStatus: () => Promise<NetworkStatus>
  onNetworkStatus: (callback: (status: NetworkStatus) => void) => () => void
  sync: {
    configure: (config: {
      apiBaseUrl?: string
      accessToken?: string
      branchId?: string
      organizationId?: string
      deviceName?: string
    }) => Promise<{ ok: boolean }>
    status: () => Promise<SyncStatus>
    pull: (opts?: { bootstrap?: boolean }) => Promise<unknown>
    push: () => Promise<unknown>
    run: (opts?: { bootstrap?: boolean }) => Promise<unknown>
    bootstrap: () => Promise<unknown>
    queue: (op: SyncQueueOperation) => Promise<void>
    downloadOfflineData: () => Promise<{
      ok: boolean
      completedAt: string
      version: string
      cachedTotal: number
      failedTotal: number
    }>
    getOfflineBootstrapInfo: () => Promise<OfflineBootstrapInfo>
    getDashboard: () => Promise<SyncDashboard>
    getFailedItems: () => Promise<SyncFailedItems>
    getDeadLetterItems: () => Promise<SyncDeadLetterItems>
    getLogs: (limit?: number) => Promise<SyncLogEntry[]>
    clearLogs: () => Promise<{ cleared: number }>
    exportLogs: (opts?: {
      format?: 'json' | 'csv'
      limit?: number
    }) => Promise<{
      saved: boolean
      path?: string
      format?: string
      bytes?: number
      logCount?: number
    }>
    retryFailed: () => Promise<{ retried: number }>
    clearQueue: (opts?: { includePending?: boolean }) => Promise<{ cleared: number }>
    rebuildCache: () => Promise<{
      ok: boolean
      completedAt: string
      version: string
      cachedTotal: number
      failedTotal: number
    }>
    getConflicts: () => Promise<SyncConflictRecord[]>
    resolveConflict: (
      conflictId: number,
      strategy: 'server_wins' | 'local_wins',
    ) => Promise<{ conflictId: number; strategy: string; clientId: string }>
    syncConflictsFromServer: () => Promise<{ synced: number }>
  }
  database?: {
    getStatus: () => Promise<LocalDatabaseStatus>
    getSettings: () => Promise<Record<string, unknown>>
    testLocal: (url?: string) => Promise<{
      reachable: boolean
      host: string
      port: number
      database: string
      url: string
    }>
    saveConfig: (config: {
      mode: 'local' | 'cloud'
      localMongoUrl?: string
    }) => Promise<LocalDatabaseStatus>
    getHealth: (opts?: { accessToken?: string; branchId?: string }) => Promise<DatabaseHealth>
    restartServer: () => Promise<LocalDatabaseStatus>
    getInstallGuide: () => Promise<Record<string, { title: string; steps: string[] }>>
  }
  onDatabaseSetupRequired?: (callback: (status: LocalDatabaseStatus) => void) => () => void
  backup?: {
    getSettings: () => Promise<BackupSettings>
    saveSettings: (settings: Partial<BackupSettings>) => Promise<BackupSettings>
    pickDestination: () => Promise<string | null>
    pickFile: () => Promise<string | null>
    list: (destinationPath?: string) => Promise<BackupRecord[]>
    create: (opts?: { destinationPath?: string; label?: string }) => Promise<{
      path: string
      fileName: string
      size: number
      manifest: BackupManifest
    }>
    validate: (zipPath: string) => Promise<{
      valid: boolean
      manifest: BackupManifest
      files: BackupPreview['files']
      warnings?: string[]
    }>
    preview: (zipPath: string) => Promise<BackupPreview>
    restore: (zipPath: string) => Promise<{
      restored: boolean
      restoredFrom: string
      safetyBackupPath: string
      manifest: BackupManifest
      mongoRestore: { restored: boolean; reason: string }
    }>
  }
  cache?: {
    getStats: () => Promise<CacheStats>
    getSettings: () => Promise<CacheSettings>
    saveSettings: (settings: Partial<CacheSettings>) => Promise<CacheSettings>
    list: (opts?: { limit?: number; offset?: number; search?: string }) => Promise<CacheEntry[]>
    purgeExpired: () => Promise<{ purged: number }>
    invalidatePrefix: (prefix: string) => Promise<{ invalidated: number }>
    invalidateKey: (cacheKey: string) => Promise<{ invalidated: number }>
    clear: () => Promise<{ cleared: number }>
    refreshAll: () => Promise<{ refreshed: number; failed: number; total: number }>
    rebuild: () => Promise<{
      ok: boolean
      completedAt: string
      version: string
      cachedTotal: number
      failedTotal: number
    }>
  }
  onOfflineBootstrapProgress: (callback: (progress: OfflineBootstrapProgress) => void) => () => void
  onSyncStatusChanged: (callback: (dashboard: SyncDashboard) => void) => () => void
  secure?: {
    encrypt: (plaintext: string) => Promise<string>
    decrypt: (stored: string) => Promise<string>
    status: () => Promise<{ available: boolean }>
  }
  http: {
    offlineRequest: (payload: {
      method?: string
      path: string
      body?: unknown
    }) => Promise<{ status: number; data: unknown; offline?: boolean; cached?: boolean; queued?: boolean }>
    cacheResponse: (payload: {
      method?: string
      path: string
      status?: number
      data?: unknown
    }) => Promise<{ ok: boolean; skipped?: boolean }>
    mergeResponse: (payload: {
      method?: string
      path: string
      data: unknown
    }) => Promise<unknown>
  }
  db: {
    products: (search?: string) => Promise<Record<string, unknown>[]>
    customers: (search?: string) => Promise<Record<string, unknown>[]>
    categories: (search?: string) => Promise<Record<string, unknown>[]>
    suppliers: (search?: string) => Promise<Record<string, unknown>[]>
    meta: (key: string) => Promise<string>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
