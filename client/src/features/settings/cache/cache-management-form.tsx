import { useCallback, useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Loader2,
  RefreshCw,
  Trash2,
  Clock,
  HardDrive,
  Search,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
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
import { getElectronAPI } from '@/lib/sync/electron'
import type { CacheEntry, CacheSettings, CacheStats, OfflineBootstrapProgress } from '@/types/electron'

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function CacheManagementForm() {
  const electron = getElectronAPI()
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [settings, setSettings] = useState<CacheSettings | null>(null)
  const [entries, setEntries] = useState<CacheEntry[]>([])
  const [search, setSearch] = useState('')
  const [invalidatePrefix, setInvalidatePrefix] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<OfflineBootstrapProgress | null>(null)
  const [online, setOnline] = useState(true)

  const refresh = useCallback(async () => {
    if (!electron?.cache) {
      setLoading(false)
      return
    }

    try {
      const [nextStats, nextSettings, nextEntries] = await Promise.all([
        electron.cache.getStats(),
        electron.cache.getSettings(),
        electron.cache.list({ limit: 100, search }),
      ])
      setStats(nextStats)
      setSettings(nextSettings)
      setEntries(nextEntries)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load cache stats')
    } finally {
      setLoading(false)
    }
  }, [electron, search])

  useEffect(() => {
    if (!electron) return

    refresh()
    electron.getNetworkStatus().then((status) => setOnline(status.online))

    const unsubscribeNetwork = electron.onNetworkStatus((status) => setOnline(status.online))
    const unsubscribeProgress = electron.onOfflineBootstrapProgress((next) => {
      setProgress(next)
      if (next.phase === 'complete' || next.phase === 'error') {
        setBusy(null)
        refresh()
      }
    })

    return () => {
      unsubscribeNetwork()
      unsubscribeProgress()
    }
  }, [electron, refresh])

  const handleSaveSettings = async (partial: Partial<CacheSettings>) => {
    if (!electron?.cache || !settings) return
    const next = await electron.cache.saveSettings({ ...settings, ...partial })
    setSettings(next)
    toast.success('Cache settings saved')
    await refresh()
  }

  const runAction = async (key: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusy(key)
    try {
      await action()
      toast.success(successMessage)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  if (!electron) {
    return (
      <Alert>
        <AlertTitle>Desktop only</AlertTitle>
        <AlertDescription>Cache management is available in the desktop app only.</AlertDescription>
      </Alert>
    )
  }

  if (loading || !stats || !settings) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading cache statistics...
      </div>
    )
  }

  const progressPercent =
    progress?.total && progress.current
      ? Math.round((progress.current / progress.total) * 100)
      : progress?.phase === 'complete'
        ? 100
        : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total cached records</CardDescription>
            <CardTitle className="text-2xl">{stats.totalRecords.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Storage used</CardDescription>
            <CardTitle className="text-2xl">{stats.storageUsed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Oldest cache</CardDescription>
            <CardTitle className="text-base">
              {stats.oldestCacheAt
                ? formatDistanceToNow(new Date(stats.oldestCacheAt), { addSuffix: true })
                : 'None'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Newest cache</CardDescription>
            <CardTitle className="text-base">
              {stats.newestCacheAt
                ? formatDistanceToNow(new Date(stats.newestCacheAt), { addSuffix: true })
                : 'None'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cache TTL</CardTitle>
          <CardDescription>
            Expired entries are ignored offline and can be purged automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="cache-ttl-enabled">Enable TTL expiry</Label>
              <p className="text-sm text-muted-foreground">
                Default is {settings.defaultTtlHours} hours ({Math.round(settings.defaultTtlHours / 24)} days).
              </p>
            </div>
            <Switch
              id="cache-ttl-enabled"
              checked={settings.ttlEnabled}
              onCheckedChange={(checked) => handleSaveSettings({ ttlEnabled: checked })}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cache-ttl-hours">TTL (hours)</Label>
              <Input
                id="cache-ttl-hours"
                type="number"
                min={1}
                max={8760}
                value={settings.ttlHours}
                disabled={!settings.ttlEnabled}
                onChange={(event) =>
                  handleSaveSettings({ ttlHours: Number(event.target.value || settings.defaultTtlHours) })
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  runAction('purge', () => electron.cache!.purgeExpired(), 'Expired cache entries purged')
                }
                disabled={busy !== null}
              >
                {busy === 'purge' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="mr-2 h-4 w-4" />
                )}
                Purge expired ({stats.expiredRecords})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cache actions</CardTitle>
          <CardDescription>Refresh, clear, or rebuild the offline API cache.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!online ? (
            <Alert>
              <AlertTitle>Offline</AlertTitle>
              <AlertDescription>Refresh and rebuild require an internet connection.</AlertDescription>
            </Alert>
          ) : null}

          {progress && busy ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{progress.message || progress.label || 'Working...'}</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                runAction('refresh', () => electron.cache!.refreshAll(), 'Cached endpoints refreshed')
              }
              disabled={!online || busy !== null}
            >
              {busy === 'refresh' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh all
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                runAction('rebuild', () => electron.cache!.rebuild(), 'Cache rebuilt from server manifest')
              }
              disabled={!online || busy !== null}
            >
              {busy === 'rebuild' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Rebuild cache
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={busy !== null}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear cache
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all cached API data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes all offline GET responses. You will need to refresh or rebuild while online.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      runAction('clear', () => electron.cache!.clear(), 'Cache cleared')
                    }
                  >
                    Clear cache
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button type="button" variant="outline" onClick={refresh} disabled={busy !== null}>
              <HardDrive className="mr-2 h-4 w-4" />
              Reload stats
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invalidate cache</CardTitle>
          <CardDescription>Remove cached responses for a URL prefix such as `/invoices`.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            placeholder="/invoices"
            value={invalidatePrefix}
            onChange={(event) => setInvalidatePrefix(event.target.value)}
            className="max-w-sm"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!invalidatePrefix || busy !== null}
            onClick={() =>
              runAction(
                'invalidate',
                () => electron.cache!.invalidatePrefix(invalidatePrefix),
                `Invalidated cache for ${invalidatePrefix}`,
              )
            }
          >
            Invalidate prefix
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cached endpoints</CardTitle>
          <CardDescription>Recently cached GET responses used while offline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search URL or cache key"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') refresh()
              }}
            />
          </div>

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cached entries found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">URL</th>
                    <th className="py-2 pr-4">Version</th>
                    <th className="py-2 pr-4">Size</th>
                    <th className="py-2 pr-4">Updated</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.cacheKey} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{entry.url}</div>
                        <div className="text-xs text-muted-foreground">{entry.cacheKey}</div>
                      </td>
                      <td className="py-2 pr-4">
                        v{entry.version}
                        {entry.expired ? (
                          <Badge variant="destructive" className="ml-2">
                            Expired
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">{formatBytes(entry.sizeBytes)}</td>
                      <td className="py-2 pr-4">
                        {format(new Date(entry.updatedAt), 'PP p')}
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() =>
                            runAction(
                              `delete-${entry.cacheKey}`,
                              () => electron.cache!.invalidateKey(entry.cacheKey),
                              'Cache entry removed',
                            )
                          }
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
