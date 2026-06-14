import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Database,
  Cloud,
  HardDrive,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { getElectronAPI } from '@/lib/sync/electron'
import type { DatabaseHealth, LocalDatabaseStatus } from '@/types/electron'

function modeBadge(status: LocalDatabaseStatus | null) {
  if (!status) return null
  if (status.mode === 'local') {
    return (
      <Badge variant="secondary" className="gap-1">
        <HardDrive className="h-3 w-3" /> Local MongoDB
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Cloud className="h-3 w-3" /> Cloud (Atlas)
    </Badge>
  )
}

export function LocalDatabaseForm() {
  const electron = getElectronAPI()
  const [status, setStatus] = useState<LocalDatabaseStatus | null>(null)
  const [health, setHealth] = useState<DatabaseHealth | null>(null)
  const [mode, setMode] = useState<'local' | 'cloud'>('cloud')
  const [localMongoUrl, setLocalMongoUrl] = useState('mongodb://127.0.0.1:27017/logixplus')
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [installGuide, setInstallGuide] = useState<Record<string, { title: string; steps: string[] }>>({})

  const refreshStatus = useCallback(async () => {
    if (!electron?.database) {
      setLoading(false)
      return
    }

    try {
      const nextStatus = await electron.database.getStatus()
      setStatus(nextStatus)
      setMode(nextStatus.mode === 'local' ? 'local' : 'cloud')
      setLocalMongoUrl(nextStatus.localMongoUrl || nextStatus.defaultLocalMongoUrl)

      if (nextStatus.embeddedServerRunning) {
        const token = localStorage.getItem('accessToken') || undefined
        const branchId = localStorage.getItem('activeBranchId') || undefined
        try {
          const nextHealth = await electron.database.getHealth({ accessToken: token, branchId })
          setHealth(nextHealth)
        } catch {
          setHealth(null)
        }
      } else {
        setHealth(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load database status')
    } finally {
      setLoading(false)
    }
  }, [electron])

  useEffect(() => {
    if (!electron?.database) return

    refreshStatus()
    electron.database.getInstallGuide().then(setInstallGuide).catch(() => {})

    const unsubscribe = electron.onDatabaseSetupRequired?.((payload) => {
      setStatus(payload)
      setMode(payload.mode === 'local' ? 'local' : 'cloud')
    })

    return () => unsubscribe?.()
  }, [electron, refreshStatus])

  const handleTestConnection = async () => {
    if (!electron?.database) return

    setTesting(true)
    try {
      const result = await electron.database.testLocal(localMongoUrl)
      if (result.reachable) {
        toast.success(`MongoDB is reachable at ${result.host}:${result.port}`)
      } else {
        toast.error(`MongoDB is not reachable at ${result.host}:${result.port}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!electron?.database) return

    setSaving(true)
    try {
      const nextStatus = await electron.database.saveConfig({
        mode,
        localMongoUrl: mode === 'local' ? localMongoUrl : undefined,
      })
      setStatus(nextStatus)
      toast.success('Database configuration saved and server restarted')
      await refreshStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleRestart = async () => {
    if (!electron?.database) return

    setRestarting(true)
    try {
      await electron.database.restartServer()
      toast.success('Embedded server restarted')
      await refreshStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restart server')
    } finally {
      setRestarting(false)
    }
  }

  if (!electron) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Desktop only</AlertTitle>
        <AlertDescription>Local database setup is available in the desktop app only.</AlertDescription>
      </Alert>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading database status...
      </div>
    )
  }

  const platformGuide =
    installGuide[window.navigator.platform.includes('Win') ? 'win32' : 'linux'] ||
    installGuide.linux

  return (
    <div className="space-y-6">
      {status?.needsSetup ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Local MongoDB setup required</AlertTitle>
          <AlertDescription>
            This device is configured for local MongoDB, but the database service is not running.
            Install MongoDB, start the service, then test and save your connection below.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {modeBadge(status)}
        {status?.localMongoReachable === true ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">MongoDB reachable</Badge>
        ) : null}
        {status?.localMongoReachable === false ? (
          <Badge variant="destructive">MongoDB unreachable</Badge>
        ) : null}
        {status?.embeddedServerRunning ? (
          <Badge variant="outline">API running</Badge>
        ) : (
          <Badge variant="secondary">API stopped</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deployment mode</CardDescription>
            <CardTitle className="text-lg capitalize">{status?.mode || 'cloud'}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {status?.activeMongoUrl ? `Active URL: ${status.activeMongoUrl}` : 'No active connection'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Database health</CardDescription>
            <CardTitle className="text-lg">
              {health?.connected ? 'Connected' : 'Not connected'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            {health?.latency != null ? <div>Latency: {health.latency} ms</div> : null}
            {health?.storageUsed ? <div>Storage: {health.storageUsed}</div> : null}
            {health?.database ? <div>Database: {health.database}</div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last configured</CardDescription>
            <CardTitle className="text-lg">
              {status?.configuredAt
                ? formatDistanceToNow(new Date(status.configuredAt), { addSuffix: true })
                : 'Never'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Use local MongoDB for fully offline shops without internet dependency.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Database setup wizard</CardTitle>
          <CardDescription>
            Choose cloud MongoDB Atlas or a local MongoDB instance on this PC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as 'local' | 'cloud')}
            className="grid gap-4 md:grid-cols-2"
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
              <RadioGroupItem value="cloud" id="db-mode-cloud" className="mt-1" />
              <div>
                <div className="font-medium">Cloud MongoDB (Atlas)</div>
                <p className="text-sm text-muted-foreground">
                  Default for online shops. Requires internet to sync with Atlas.
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
              <RadioGroupItem value="local" id="db-mode-local" className="mt-1" />
              <div>
                <div className="font-medium">Local MongoDB</div>
                <p className="text-sm text-muted-foreground">
                  Fully offline operation using MongoDB on this computer.
                </p>
              </div>
            </label>
          </RadioGroup>

          {mode === 'local' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-mongo-url">Local connection string</Label>
                <Input
                  id="local-mongo-url"
                  value={localMongoUrl}
                  onChange={(event) => setLocalMongoUrl(event.target.value)}
                  placeholder="mongodb://127.0.0.1:27017/logixplus"
                />
              </div>

              {platformGuide ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{platformGuide.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                      {platformGuide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {mode === 'local' ? (
              <Button type="button" variant="secondary" onClick={handleTestConnection} disabled={testing}>
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Test connection
              </Button>
            ) : null}
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save &amp; restart server
            </Button>
            <Button type="button" variant="outline" onClick={handleRestart} disabled={restarting}>
              {restarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Restart server
            </Button>
            <Button type="button" variant="ghost" onClick={refreshStatus}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
