import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CloudDownload, CheckCircle2, Loader2, AlertCircle, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getElectronAPI } from '@/lib/sync/electron'
import type { OfflineBootstrapInfo, OfflineBootstrapProgress } from '@/types/electron'

function statusBadge(info: OfflineBootstrapInfo | null) {
  switch (info?.status) {
    case 'complete':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ready for offline use</Badge>
    case 'downloading':
      return <Badge variant="secondary">Downloading...</Badge>
    case 'failed':
      return <Badge variant="destructive">Download failed</Badge>
    default:
      return <Badge variant="outline">Not downloaded yet</Badge>
  }
}

export function OfflineModeForm() {
  const electron = getElectronAPI()
  const [bootstrapInfo, setBootstrapInfo] = useState<OfflineBootstrapInfo | null>(null)
  const [progress, setProgress] = useState<OfflineBootstrapProgress | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [online, setOnline] = useState(true)

  const refreshInfo = useCallback(async () => {
    if (!electron) return
    const info = await electron.sync.getOfflineBootstrapInfo()
    setBootstrapInfo(info)
  }, [electron])

  useEffect(() => {
    if (!electron) return

    refreshInfo()
    electron.getNetworkStatus().then((status) => setOnline(status.online))

    const unsubscribeNetwork = electron.onNetworkStatus((status) => setOnline(status.online))
    const unsubscribeProgress = electron.onOfflineBootstrapProgress((next) => {
      setProgress(next)
      if (next.phase === 'complete' || next.phase === 'error') {
        setDownloading(false)
        refreshInfo()
      }
    })

    return () => {
      unsubscribeNetwork()
      unsubscribeProgress()
    }
  }, [electron, refreshInfo])

  const handleDownload = async () => {
    if (!electron) return
    if (!online) {
      toast.error('Connect to the internet before downloading offline data')
      return
    }

    setDownloading(true)
    setProgress({ phase: 'preparing', message: 'Preparing...' })

    try {
      const result = await electron.sync.downloadOfflineData()
      toast.success('All data downloaded for offline use')
      setBootstrapInfo({
        status: 'complete',
        completedAt: result.completedAt,
        version: result.version,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed'
      toast.error(message)
      await refreshInfo()
    } finally {
      setDownloading(false)
    }
  }

  if (!electron) {
    return (
      <Alert>
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Desktop app only</AlertTitle>
        <AlertDescription>
          Offline data download is available in the Logix Plus desktop application.
        </AlertDescription>
      </Alert>
    )
  }

  const progressPercent =
    progress?.phase === 'complete'
      ? 100
      : progress?.current && progress?.total
        ? Math.round((progress.current / progress.total) * 100)
        : progress?.phase === 'preparing'
          ? 5
          : downloading
            ? 15
            : bootstrapInfo?.status === 'complete'
              ? 100
              : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {statusBadge(bootstrapInfo)}
        {bootstrapInfo?.completedAt && (
          <span className="text-sm text-muted-foreground">
            Last download: {format(new Date(bootstrapInfo.completedAt), 'PPpp')}
          </span>
        )}
        {bootstrapInfo?.version && (
          <span className="text-sm text-muted-foreground">Data version: v{bootstrapInfo.version}</span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Download your full business data to this device so you can use ERP, school, HR, and other modules
        without internet. Run this once while online, then work offline anytime.
      </p>

      {!online && (
        <Alert>
          <WifiOff className="h-4 w-4" />
          <AlertTitle>You are offline</AlertTitle>
          <AlertDescription>
            Connect to the internet to download or refresh offline data.
          </AlertDescription>
        </Alert>
      )}

      {(downloading || progress) && (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            {progress?.phase === 'complete' ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : progress?.phase === 'error' ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {progress?.message || 'Preparing...'}
          </div>
          <Progress value={progressPercent} />
          {progress?.phase === 'downloading' && progress.total ? (
            <p className="text-xs text-muted-foreground">
              Step {progress.current} of {progress.total}
              {progress.label ? ` · ${progress.label}` : ''}
            </p>
          ) : null}
          {progress?.phase === 'complete' && (
            <p className="text-xs text-muted-foreground">
              Cached {progress.cachedTotal ?? 0} API responses
              {(progress.failedTotal ?? 0) > 0 ? ` · ${progress.failedTotal} requests skipped` : ''}
            </p>
          )}
        </div>
      )}

      <Button
        type="button"
        onClick={handleDownload}
        disabled={downloading || !online}
        className="gap-2"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
        Download All Data For Offline Use
      </Button>

      {bootstrapInfo?.status === 'complete' && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-700" />
          <AlertTitle className="text-green-900">Offline mode ready</AlertTitle>
          <AlertDescription className="text-green-800">
            Your data is stored on this device. You can disconnect from the internet and continue working.
            Run download again anytime to refresh cached data.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
