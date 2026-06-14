import { useCallback, useEffect, useState } from 'react'
import { getElectronAPI, isElectronApp } from '@/lib/sync/electron'
import type { NetworkStatus, SyncStatus } from '@/types/electron'

const DEFAULT_STATUS: SyncStatus = {
  pending: 0,
  failed: 0,
  productCount: 0,
  customerCount: 0,
  categoryCount: 0,
  supplierCount: 0,
  lastPullAt: null,
  lastPushAt: null,
  deviceId: null,
}

export function useSync() {
  const electron = getElectronAPI()
  const [online, setOnline] = useState(true)
  const [status, setStatus] = useState<SyncStatus>(DEFAULT_STATUS)
  const [bootstrapped, setBootstrapped] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!electron) return
    try {
      const next = await electron.sync.status()
      setStatus(next)
      if (next.lastPullAt) {
        setBootstrapped(true)
      }
    } catch {
      // ignore
    }
  }, [electron])

  const configure = useCallback(
    async (config: {
      apiBaseUrl?: string
      accessToken?: string
      branchId?: string
      organizationId?: string
      deviceName?: string
    }) => {
      if (!electron) return
      await electron.sync.configure(config)
      await refreshStatus()
    },
    [electron, refreshStatus],
  )

  const bootstrap = useCallback(async () => {
    if (!electron) return
    await electron.sync.bootstrap()
    setBootstrapped(true)
    await refreshStatus()
  }, [electron, refreshStatus])

  const runSync = useCallback(async () => {
    if (!electron || !online) return
    await electron.sync.run()
    await refreshStatus()
  }, [electron, online, refreshStatus])

  useEffect(() => {
    if (!electron) return

    let cancelled = false
    electron.getNetworkStatus().then((s: NetworkStatus) => {
      if (!cancelled) setOnline(s.online)
    })

    const unsubscribe = electron.onNetworkStatus((s: NetworkStatus) => {
      setOnline(s.online)
      if (s.online) {
        electron.sync.run().then(() => refreshStatus()).catch(() => {})
      }
    })

    refreshStatus()
    const timer = setInterval(refreshStatus, 30_000)

    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(timer)
    }
  }, [electron, refreshStatus])

  return {
    isElectron: isElectronApp(),
    online,
    status,
    bootstrapped,
    configure,
    bootstrap,
    runSync,
    refreshStatus,
    queue: electron?.sync.queue,
    listLocalProducts: electron?.db.products,
    listLocalCustomers: electron?.db.customers,
    listLocalCategories: electron?.db.categories,
    listLocalSuppliers: electron?.db.suppliers,
  }
}
