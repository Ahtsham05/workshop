import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { GitMerge, Loader2, RefreshCw, Server, Laptop } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getElectronAPI } from '@/lib/sync/electron'
import type { SyncConflictRecord } from '@/types/electron'

const COMPARE_FIELDS = [
  'name',
  'nameUrdu',
  'phone',
  'whatsapp',
  'email',
  'address',
  'balance',
] as const

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function ConflictCompare({
  localData,
  serverData,
}: {
  localData: Record<string, unknown>
  serverData: Record<string, unknown>
}) {
  const fields = COMPARE_FIELDS.filter(
    (field) => field in localData || field in serverData,
  )

  if (fields.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(localData, null, 2)}
        </pre>
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(serverData, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-medium">Field</th>
            <th className="py-2 pr-4 font-medium">
              <span className="inline-flex items-center gap-1">
                <Laptop className="h-3.5 w-3.5" /> Local
              </span>
            </th>
            <th className="py-2 font-medium">
              <span className="inline-flex items-center gap-1">
                <Server className="h-3.5 w-3.5" /> Server
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const localValue = formatValue(localData[field])
            const serverValue = formatValue(serverData[field])
            const changed = localValue !== serverValue
            return (
              <tr key={field} className="border-b last:border-0">
                <td className="py-2 pr-4 capitalize text-muted-foreground">{field}</td>
                <td className={`py-2 pr-4 ${changed ? 'font-medium text-amber-700' : ''}`}>
                  {localValue}
                </td>
                <td className={`py-2 ${changed ? 'font-medium text-blue-700' : ''}`}>
                  {serverValue}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function SyncConflictsForm() {
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadConflicts = useCallback(async () => {
    const electron = getElectronAPI()
    if (!electron) {
      setConflicts([])
      setLoading(false)
      return
    }

    try {
      const items = await electron.sync.getConflicts()
      setConflicts(items)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load conflicts')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadConflicts()
    const electron = getElectronAPI()
    const unsubscribe = electron?.onSyncStatusChanged?.(() => {
      loadConflicts()
    })
    return () => unsubscribe?.()
  }, [loadConflicts])

  const handleRefresh = async () => {
    const electron = getElectronAPI()
    if (!electron) return

    setRefreshing(true)
    try {
      await electron.sync.syncConflictsFromServer()
      await loadConflicts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh conflicts')
      setRefreshing(false)
    }
  }

  const handleResolve = async (conflictId: number, strategy: 'server_wins' | 'local_wins') => {
    const electron = getElectronAPI()
    if (!electron) return

    setResolvingId(conflictId)
    try {
      await electron.sync.resolveConflict(conflictId, strategy)
      toast.success(
        strategy === 'server_wins'
          ? 'Kept the server version'
          : 'Applied your local changes',
      )
      await loadConflicts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resolve conflict')
    } finally {
      setResolvingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading conflicts...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {conflicts.length === 0
              ? 'No open sync conflicts.'
              : `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} need review.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {conflicts.length === 0 ? (
        <Alert>
          <GitMerge className="h-4 w-4" />
          <AlertTitle>All clear</AlertTitle>
          <AlertDescription>
            Conflicts appear here when the same customer or supplier was edited on this device and
            on the server before sync completed.
          </AlertDescription>
        </Alert>
      ) : (
        conflicts.map((conflict) => (
          <Card key={conflict.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg capitalize">
                    {conflict.entityType} conflict
                  </CardTitle>
                  <CardDescription>
                    {conflict.operation} · local v{conflict.localVersion} vs server v
                    {conflict.serverVersion}
                    {conflict.createdAt
                      ? ` · ${formatDistanceToNow(new Date(conflict.createdAt), { addSuffix: true })}`
                      : ''}
                  </CardDescription>
                </div>
                <Badge variant="outline">{conflict.defaultStrategy.replace('_', ' ')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ConflictCompare
                localData={conflict.localData}
                serverData={conflict.serverData}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={resolvingId === conflict.id}
                  onClick={() => handleResolve(conflict.id, 'server_wins')}
                >
                  {resolvingId === conflict.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="mr-2 h-4 w-4" />
                  )}
                  Keep server version
                </Button>
                <Button
                  disabled={resolvingId === conflict.id}
                  onClick={() => handleResolve(conflict.id, 'local_wins')}
                >
                  {resolvingId === conflict.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Laptop className="mr-2 h-4 w-4" />
                  )}
                  Use my changes
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
