import { useCallback, useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Archive,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Usb,
  Cloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { getElectronAPI } from '@/lib/sync/electron'
import type { BackupManifest, BackupPreview, BackupRecord, BackupSettings } from '@/types/electron'

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function BackupRestoreForm() {
  const electron = getElectronAPI()
  const [settings, setSettings] = useState<BackupSettings | null>(null)
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restorePath, setRestorePath] = useState<string | null>(null)
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!electron?.backup) {
      setLoading(false)
      return
    }

    try {
      const nextSettings = await electron.backup.getSettings()
      setSettings(nextSettings)
      const nextBackups = await electron.backup.list(nextSettings.destinationPath)
      setBackups(nextBackups)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load backup settings')
    } finally {
      setLoading(false)
    }
  }, [electron])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handlePickDestination = async () => {
    if (!electron?.backup) return
    const dir = await electron.backup.pickDestination()
    if (!dir) return
    const nextSettings = await electron.backup.saveSettings({ destinationPath: dir })
    setSettings(nextSettings)
    await refresh()
  }

  const handleSaveSettings = async (partial: Partial<BackupSettings>) => {
    if (!electron?.backup || !settings) return
    const nextSettings = await electron.backup.saveSettings({
      ...settings,
      ...partial,
    })
    setSettings(nextSettings)
    toast.success('Backup settings saved')
  }

  const handleCreateBackup = async () => {
    if (!electron?.backup || !settings?.destinationPath) return

    setCreating(true)
    try {
      const result = await electron.backup.create({ destinationPath: settings.destinationPath })
      toast.success(`Backup created: ${result.fileName}`)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup failed')
    } finally {
      setCreating(false)
    }
  }

  const handlePickRestoreFile = async () => {
    if (!electron?.backup) return

    try {
      const zipPath = await electron.backup.pickFile()
      if (!zipPath) return
      const nextPreview = await electron.backup.preview(zipPath)
      setPreview(nextPreview)
      setRestorePath(zipPath)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid backup file')
      setPreview(null)
      setRestorePath(null)
    }
  }

  const handleRestore = async () => {
    if (!electron?.backup || !restorePath) return

    setRestoring(true)
    try {
      const result = await electron.backup.restore(restorePath)
      toast.success('Backup restored successfully')
      setConfirmRestoreOpen(false)
      setPreview(null)
      setRestorePath(null)
      if (result.safetyBackupPath) {
        toast.message(`Safety backup saved at ${result.safetyBackupPath}`)
      }
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  if (!electron) {
    return (
      <Alert>
        <AlertTitle>Desktop only</AlertTitle>
        <AlertDescription>Backup and restore is available in the desktop app only.</AlertDescription>
      </Alert>
    )
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading backup settings...
      </div>
    )
  }

  const manifest = preview?.manifest as BackupManifest | undefined

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Backup folder</CardDescription>
            <CardTitle className="text-sm break-all">{settings.destinationPath}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" size="sm" onClick={handlePickDestination}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Choose folder
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stored backups</CardDescription>
            <CardTitle className="text-2xl">{backups.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Local folder, USB drive, or network share paths are supported.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last backup</CardDescription>
            <CardTitle className="text-lg">
              {settings.lastBackupAt
                ? formatDistanceToNow(new Date(settings.lastBackupAt), { addSuffix: true })
                : 'Never'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground break-all">
            {settings.lastBackupPath || 'No backup created yet'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic backups</CardTitle>
          <CardDescription>
            Schedule daily, weekly, or monthly backups to your chosen folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="auto-backup">Enable scheduled backups</Label>
              <p className="text-sm text-muted-foreground">Runs while the desktop app is open.</p>
            </div>
            <Switch
              id="auto-backup"
              checked={settings.enabled}
              onCheckedChange={(checked) => handleSaveSettings({ enabled: checked })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select
                value={settings.schedule}
                onValueChange={(value) =>
                  handleSaveSettings({ schedule: value as BackupSettings['schedule'] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-backups">Keep latest backups</Label>
              <Input
                id="max-backups"
                type="number"
                min={1}
                max={100}
                value={settings.maxBackups}
                onChange={(event) =>
                  handleSaveSettings({ maxBackups: Number(event.target.value || 10) })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create backup now</CardTitle>
          <CardDescription>
            Includes SQLite cache, sync queues, conflicts, desktop config, and local MongoDB when
            available.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleCreateBackup} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
            Create backup
          </Button>
          <Button type="button" variant="outline" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh list
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent backups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups found in the selected folder.</p>
          ) : (
            backups.map((backup) => (
              <div
                key={backup.path}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <div className="font-medium">{backup.fileName}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(backup.createdAt), 'PPpp')} · {formatBytes(backup.size)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {backup.valid ? (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> Valid
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Invalid</Badge>
                  )}
                  {backup.includesMongo ? (
                    <Badge variant="secondary" className="gap-1">
                      <HardDrive className="h-3 w-3" /> MongoDB
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restore backup</CardTitle>
          <CardDescription>
            Select a backup file, review its contents, then restore safely. A safety backup is
            created automatically before restore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handlePickRestoreFile}>
              <Usb className="mr-2 h-4 w-4" />
              Select backup file
            </Button>
            {restorePath ? (
              <Button type="button" onClick={() => setConfirmRestoreOpen(true)} disabled={restoring}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore selected backup
              </Button>
            ) : null}
          </div>

          {preview && manifest ? (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{manifest.organizationId}</Badge>
                <Badge variant="outline">{manifest.branchId}</Badge>
                <Badge variant="secondary">{manifest.databaseMode}</Badge>
                {manifest.includesMongo ? <Badge>MongoDB included</Badge> : null}
              </div>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <div>Created: {format(new Date(manifest.createdAt), 'PPpp')}</div>
                <div>App version: {manifest.appVersion}</div>
                <div>Pending queue: {manifest.stats?.queueSize ?? 0}</div>
                <div>Cached records: {manifest.stats?.cacheCount ?? 0}</div>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">Files in backup</div>
                <div className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {preview.files.map((file) => (
                    <div key={file.path} className="flex justify-between gap-3 py-0.5">
                      <span>{file.path}</span>
                      <span>{formatBytes(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {preview.warnings?.length ? (
                <Alert>
                  <Cloud className="h-4 w-4" />
                  <AlertTitle>Backup notes</AlertTitle>
                  <AlertDescription>{preview.warnings.join(' ')}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRestoreOpen} onOpenChange={setConfirmRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the local SQLite database, desktop configuration, and local MongoDB
              data (if included). A safety backup of your current data will be created first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}>
              {restoring ? 'Restoring...' : 'Restore backup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
