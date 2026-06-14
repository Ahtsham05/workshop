import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { format, formatDistanceToNow } from 'date-fns'
import {
  RefreshCw,
  RotateCcw,
  Trash2,
  Database,
  Loader2,
  WifiOff,
  Cloud,
  CloudOff,
  AlertCircle,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Progress } from '@/components/ui/progress'
import { getElectronAPI } from '@/lib/sync/electron'
import type {
  OfflineBootstrapProgress,
  SyncDashboard,
  SyncDeadLetterItems,
  SyncFailedItems,
  SyncLogEntry,
} from '@/types/electron'

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return 'Never'
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true })
  } catch {
    return 'Unknown'
  }
}

function syncStateBadge(dashboard: SyncDashboard | null, online: boolean) {
  if (dashboard?.syncState === 'syncing') {
    return <Badge variant="secondary">Syncing...</Badge>
  }
  if (!online) {
    return (
      <Badge variant="outline" className="gap-1">
        <CloudOff className="h-3 w-3" /> Offline
      </Badge>
    )
  }
  if (
    dashboard?.syncState === 'error' ||
    (dashboard?.failedRequests ?? 0) > 0 ||
    (dashboard?.openConflicts ?? 0) > 0
  ) {
    return <Badge variant="destructive">Needs attention</Badge>
  }
  if (dashboard?.offlineActive) {
    return (
      <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
        <Cloud className="h-3 w-3" /> Active
      </Badge>
    )
  }
  return <Badge variant="outline">Online</Badge>
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  )
}

export function SyncDashboardForm() {
  const electron = getElectronAPI()
  const [dashboard, setDashboard] = useState<SyncDashboard | null>(null)
  const [failedItems, setFailedItems] = useState<SyncFailedItems | null>(null)
  const [deadLetterItems, setDeadLetterItems] = useState<SyncDeadLetterItems | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([])
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildProgress, setRebuildProgress] = useState<OfflineBootstrapProgress | null>(null)

  const refresh = useCallback(async () => {
    if (!electron) return
    const [nextDashboard, nextFailed, nextDeadLetter, nextLogs] = await Promise.all([
      electron.sync.getDashboard(),
      electron.sync.getFailedItems(),
      electron.sync.getDeadLetterItems(),
      electron.sync.getLogs(30),
    ])
    setDashboard(nextDashboard)
    setFailedItems(nextFailed)
    setDeadLetterItems(nextDeadLetter)
    setSyncLogs(nextLogs)
  }, [electron])

  useEffect(() => {
    if (!electron) return

    refresh()
    electron.getNetworkStatus().then((status) => setOnline(status.online))

    const unsubscribeNetwork = electron.onNetworkStatus((status) => setOnline(status.online))
    const unsubscribeSync = electron.onSyncStatusChanged((next) => {
      setDashboard(next)
      electron.sync.getFailedItems().then(setFailedItems)
      electron.sync.getDeadLetterItems().then(setDeadLetterItems)
      electron.sync.getLogs(30).then(setSyncLogs)
    })
    const unsubscribeRebuild = electron.onOfflineBootstrapProgress((progress) => {
      setRebuildProgress(progress)
      if (progress.phase === 'complete' || progress.phase === 'error') {
        setRebuilding(false)
        refresh()
      }
    })

    const timer = setInterval(refresh, 5000)

    return () => {
      unsubscribeNetwork()
      unsubscribeSync()
      unsubscribeRebuild()
      clearInterval(timer)
    }
  }, [electron, refresh])

  const handleSyncNow = async () => {
    if (!electron) return
    if (!online) {
      toast.error('Connect to the internet to sync')
      return
    }

    setSyncing(true)
    try {
      const result = await electron.sync.run()
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        toast.error(String(result.error))
      } else {
        toast.success('Sync completed')
      }
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleRetryFailed = async () => {
    if (!electron) return
    try {
      const result = await electron.sync.retryFailed()
      toast.success(`${result.retried} failed item(s) queued for retry`)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Retry failed')
    }
  }

  const handleClearQueue = async (includePending: boolean) => {
    if (!electron) return
    try {
      const result = await electron.sync.clearQueue({ includePending })
      toast.success(`${result.cleared} queue item(s) cleared`)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clear queue failed')
    }
  }

  const handleRebuildCache = async () => {
    if (!electron) return
    if (!online) {
      toast.error('Connect to the internet to rebuild cache')
      return
    }

    setRebuilding(true)
    setRebuildProgress({ phase: 'preparing', message: 'Preparing...' })
    try {
      await electron.sync.rebuildCache()
      toast.success('Cache rebuilt successfully')
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rebuild failed')
    } finally {
      setRebuilding(false)
    }
  }

  if (!electron) {
    return (
      <Alert>
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Desktop app only</AlertTitle>
        <AlertDescription>
          The synchronization dashboard is available in the Logix Plus desktop application.
        </AlertDescription>
      </Alert>
    )
  }

  const totalCached =
    (dashboard?.cacheCount ?? 0) +
    (dashboard?.productCount ?? 0) +
    (dashboard?.customerCount ?? 0) +
    (dashboard?.supplierCount ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {syncStateBadge(dashboard, online)}
        <span className="text-sm text-muted-foreground">
          Offline status: {dashboard?.offlineActive ? 'Active' : 'Not ready'}
          {dashboard?.lastNetworkRecoveryAt
            ? ` · Network restored ${formatRelativeTime(dashboard.lastNetworkRecoveryAt)}`
            : ''}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Pending requests"
          value={dashboard?.pendingRequests ?? 0}
          hint="Waiting to upload when online"
        />
        <StatCard
          label="Failed requests"
          value={dashboard?.failedRequests ?? 0}
          hint={`Retrying: ${(dashboard?.entityFailed ?? 0) + (dashboard?.httpFailed ?? 0)} · Dead letter: ${(dashboard?.entityDeadLetter ?? 0) + (dashboard?.httpDeadLetter ?? 0)}`}
        />
        <StatCard
          label="Processing"
          value={(dashboard?.entityProcessing ?? 0) + (dashboard?.httpProcessing ?? 0)}
          hint="Currently uploading in batches"
        />
        <StatCard
          label="Open conflicts"
          value={dashboard?.openConflicts ?? 0}
          hint="Same record edited on device and server"
        />
        <StatCard
          label="Cached records"
          value={totalCached.toLocaleString()}
          hint={`${dashboard?.cacheCount ?? 0} API responses cached`}
        />
        <StatCard
          label="Queue size"
          value={dashboard?.queueSize ?? 0}
          hint={`Entity ${dashboard?.entityPending ?? 0} · HTTP ${dashboard?.httpPending ?? 0}`}
        />
        <StatCard
          label="Last successful sync"
          value={formatRelativeTime(dashboard?.lastSuccessAt || dashboard?.lastPushAt)}
          hint={
            dashboard?.lastSuccessAt
              ? format(new Date(dashboard.lastSuccessAt), 'PPpp')
              : undefined
          }
        />
        <StatCard
          label="Last failed sync"
          value={formatRelativeTime(dashboard?.lastFailedAt)}
          hint={dashboard?.lastFailedMessage || undefined}
        />
      </div>

      {(dashboard?.openConflicts ?? 0) > 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sync conflicts need review</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {dashboard?.openConflicts} record
              {(dashboard?.openConflicts ?? 0) === 1 ? '' : 's'} were changed on this device and on
              the server before sync completed.
            </p>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to="/settings/sync-conflicts">Review conflicts</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current sync state</CardTitle>
          <CardDescription>
            {dashboard?.syncState === 'syncing'
              ? 'Uploading local changes and refreshing cached data...'
              : dashboard?.syncState === 'error'
                ? 'The last sync attempt encountered an error.'
                : online
                  ? 'System is ready to sync.'
                  : 'Working from local cache while offline.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleSyncNow} disabled={syncing || !online} className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync Now
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleRetryFailed}
            disabled={(dashboard?.failedRequests ?? 0) === 0}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Retry Failed
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Clear Queue
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear sync queue</AlertDialogTitle>
                <AlertDialogDescription>
                  Choose what to remove from the local sync queue. Pending items that have not
                  uploaded yet can also be deleted permanently.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleClearQueue(false)}>
                  Clear failed only
                </AlertDialogAction>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => handleClearQueue(true)}
                >
                  Clear all pending + failed
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            type="button"
            variant="outline"
            onClick={handleRebuildCache}
            disabled={rebuilding || !online}
            className="gap-2"
          >
            {rebuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Rebuild Cache
          </Button>
        </CardContent>
      </Card>

      {rebuilding && rebuildProgress && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rebuilding cache</CardTitle>
            <CardDescription>{rebuildProgress.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress
              value={
                rebuildProgress.phase === 'complete'
                  ? 100
                  : rebuildProgress.current && rebuildProgress.total
                    ? Math.round((rebuildProgress.current / rebuildProgress.total) * 100)
                    : 20
              }
            />
          </CardContent>
        </Card>
      )}

      {(failedItems?.entityItems.length || failedItems?.httpItems.length) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Failed sync items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {failedItems?.entityItems.map((item) => (
              <div key={item.client_id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">
                  {item.entity}.{item.operation}
                </div>
                <div className="text-muted-foreground">{item.error_message || 'Unknown error'}</div>
                {item.next_retry_at ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    Retry {formatRelativeTime(item.next_retry_at)} · attempt {item.retry_count ?? 0}
                  </div>
                ) : null}
              </div>
            ))}
            {failedItems?.httpItems.map((item) => (
              <div key={item.client_id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">
                  {item.method} {item.path}
                </div>
                <div className="text-muted-foreground">{item.error_message || 'Unknown error'}</div>
                {item.next_retry_at ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    Retry {formatRelativeTime(item.next_retry_at)} · attempt {item.retry_count ?? 0}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(deadLetterItems?.entityItems.length || deadLetterItems?.httpItems.length) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Dead letter queue
            </CardTitle>
            <CardDescription>
              Items that exceeded {5} retries with exponential backoff. Use Retry Failed to re-queue them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deadLetterItems?.entityItems.map((item) => (
              <div key={item.client_id} className="rounded-md border border-destructive/30 p-3 text-sm">
                <div className="font-medium">
                  {item.entity}.{item.operation}
                </div>
                <div className="text-muted-foreground">{item.error_message || 'Unknown error'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Dead letter {item.dead_letter_at ? formatRelativeTime(item.dead_letter_at) : 'recently'}
                </div>
              </div>
            ))}
            {deadLetterItems?.httpItems.map((item) => (
              <div key={item.client_id} className="rounded-md border border-destructive/30 p-3 text-sm">
                <div className="font-medium">
                  {item.method} {item.path}
                </div>
                <div className="text-muted-foreground">{item.error_message || 'Unknown error'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Dead letter {item.dead_letter_at ? formatRelativeTime(item.dead_letter_at) : 'recently'}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {syncLogs.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Sync logs</CardTitle>
              <CardDescription>Recent sync engine activity for troubleshooting.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await electron?.sync.exportLogs({ format: 'json', limit: 1000 })
                  if (result?.saved) {
                    toast.success(`Exported sync diagnostics to ${result.path}`)
                  }
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Export JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await electron?.sync.exportLogs({ format: 'csv', limit: 1000 })
                  if (result?.saved) {
                    toast.success(`Exported ${result.logCount ?? 0} log rows to ${result.path}`)
                  }
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await electron?.sync.clearLogs()
                  toast.success('Sync logs cleared')
                  refresh()
                }}
              >
                Clear logs
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-72 overflow-auto space-y-2">
            {syncLogs.map((log) => (
              <div key={log.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{log.module}</Badge>
                  <Badge variant={log.status === 'error' || log.status === 'dead_letter' ? 'destructive' : 'secondary'}>
                    {log.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.createdAt), 'PP p')}
                  </span>
                </div>
                <div className="mt-1">{log.message}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
