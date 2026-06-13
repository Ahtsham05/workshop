export type SyncStatus = {
  pending: number
  failed: number
  productCount: number
  customerCount: number
  lastPullAt: string | null
  lastPushAt: string | null
  deviceId: string | null
}

export type NetworkStatus = {
  online: boolean
}

export type SyncQueueOperation = {
  clientId: string
  entity: string
  operation: string
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
  }
  db: {
    products: (search?: string) => Promise<Record<string, unknown>[]>
    customers: () => Promise<Record<string, unknown>[]>
    meta: (key: string) => Promise<string>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
