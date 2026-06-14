import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Cloud, CloudOff, RefreshCw, Upload } from 'lucide-react'
import { RootState } from '@/stores/store'
import { useSync } from '@/lib/sync/use-sync'
import { getElectronAPI } from '@/lib/sync/electron'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function SyncStatusBadge() {
  const { isElectron, online, status, configure, bootstrap, runSync } = useSync()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3000/v1'

  useEffect(() => {
    if (!isElectron || !user?.organizationId || !activeBranchId || !accessToken) return

    configure({
      apiBaseUrl,
      accessToken,
      branchId: activeBranchId,
      organizationId: user.organizationId,
      deviceName: 'Desktop POS',
    })
      .then(async () => {
        const electron = getElectronAPI()
        if (!electron) return

        const latest = await electron.sync.status()

        if (online && !latest.lastPullAt) {
          await bootstrap()
          return
        }
        if (online) {
          await runSync()
        }
      })
      .catch(() => {})
  }, [
    isElectron,
    user?.organizationId,
    activeBranchId,
    accessToken,
    apiBaseUrl,
    configure,
    bootstrap,
    runSync,
    online,
  ])

  if (!isElectron) return null

  const label = online ? 'Online' : 'Offline'
  const variant = online ? 'default' : 'secondary'
  const pending = status.pending
  const failed = status.failed
  const cachedCount =
    status.cacheCount ||
    status.productCount + status.customerCount + status.supplierCount

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <Badge variant={variant} className="gap-1">
              {online ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
              {label}
              {pending > 0 ? ` · ${pending} pending` : ''}
            </Badge>
            {online ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => runSync()}
                title="Sync now"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            ) : pending > 0 ? (
              <Upload className="h-4 w-4 text-muted-foreground" />
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">Desktop sync</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cached API responses: {status.cacheCount || 0} · Catalog — Products: {status.productCount} · Customers: {status.customerCount} · Categories: {status.categoryCount} · Suppliers: {status.supplierCount}
          </p>
          {!online && cachedCount > 0 && (
            <p className="text-xs mt-1">All modules use cached data while offline (ERP, school, HR, and more).</p>
          )}
          {!online && cachedCount === 0 && (
            <p className="text-xs mt-1">Go online once to download data for offline use.</p>
          )}
          {pending > 0 && (
            <p className="text-xs mt-1">{pending} change(s) waiting to upload when online.</p>
          )}
          {failed > 0 && (
            <p className="text-xs text-destructive mt-1">{failed} sync error(s). Check server logs.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
