import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getElectronAPI, isElectronApp } from '@/lib/sync/electron'
import type { LocalDatabaseStatus } from '@/types/electron'

export function LocalDatabaseSetupBanner() {
  const [status, setStatus] = useState<LocalDatabaseStatus | null>(null)

  useEffect(() => {
    if (!isElectronApp()) return

    const electron = getElectronAPI()
    if (!electron?.database) return

    electron.database.getStatus().then(setStatus).catch(() => {})

    const unsubscribe = electron.onDatabaseSetupRequired?.((payload) => {
      setStatus(payload)
    })

    return () => unsubscribe?.()
  }, [])

  if (!status?.needsSetup) {
    return null
  }

  return (
    <Alert variant="destructive" className="mx-3 mt-3 shrink-0">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Local MongoDB is not running</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          This device is set up for offline-only use, but MongoDB is not reachable. Complete the
          setup wizard to continue with full functionality.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link to="/settings/local-database">Open setup wizard</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
