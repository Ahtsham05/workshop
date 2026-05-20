import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useGetBusinessWhatsAppStatusQuery,
  useGetWhatsAppCloudConfigQuery,
  useUpdateWhatsAppCloudConfigMutation,
  useConnectBusinessWhatsAppMutation,
  useDisconnectBusinessWhatsAppMutation,
  useClearBusinessWhatsAppSessionMutation,
  type WhatsAppProviderMode,
} from '@/stores/businessWhatsapp.api'
import { toast } from 'sonner'
import {
  MessageCircle,
  QrCode,
  CheckCircle2,
  XCircle,
  Loader2,
  WifiOff,
  AlertTriangle,
  Cloud,
} from 'lucide-react'
import ContentSection from '../components/content-section'

function WebStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; className: string; Icon: typeof WifiOff }> = {
    READY: {
      label: 'Local connected',
      className: 'bg-green-100 text-green-800 border-green-300',
      Icon: CheckCircle2,
    },
    QR_READY: {
      label: 'Scan QR code',
      className: 'bg-amber-100 text-amber-800 border-amber-300',
      Icon: QrCode,
    },
    LOADING: {
      label: 'Connecting…',
      className: 'bg-blue-100 text-blue-800 border-blue-300',
      Icon: Loader2,
    },
    AUTH_FAILURE: {
      label: 'Auth failed',
      className: 'bg-red-100 text-red-800 border-red-300',
      Icon: XCircle,
    },
    DISCONNECTED: {
      label: 'Not connected',
      className: 'bg-muted text-muted-foreground',
      Icon: WifiOff,
    },
    SERVERLESS_UNSUPPORTED: {
      label: 'Not available (serverless)',
      className: 'bg-orange-100 text-orange-800 border-orange-300',
      Icon: AlertTriangle,
    },
  }
  const cfg = map[state] ?? map.DISCONNECTED
  return (
    <Badge variant="outline" className={`gap-1.5 ${cfg.className}`}>
      <cfg.Icon className={`h-3.5 w-3.5 ${state === 'LOADING' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </Badge>
  )
}

export default function BusinessWhatsAppSettings() {
  const [pollInterval, setPollInterval] = useState(3000)
  const { data: status } = useGetBusinessWhatsAppStatusQuery(undefined, {
    pollingInterval: pollInterval,
  })
  const { data: cloudConfig } = useGetWhatsAppCloudConfigQuery()
  const [updateCloud, { isLoading: savingCloud }] = useUpdateWhatsAppCloudConfigMutation()

  const [provider, setProvider] = useState<WhatsAppProviderMode>('auto')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [apiVersion, setApiVersion] = useState('v21.0')

  useEffect(() => {
    if (!cloudConfig) return
    setProvider(cloudConfig.provider)
    setPhoneNumberId(cloudConfig.cloud.phoneNumberId || '')
    setApiVersion(cloudConfig.cloud.apiVersion || 'v21.0')
  }, [cloudConfig])

  useEffect(() => {
    const webState = status?.web?.state
    const cloudReady = status?.cloud?.configured
    if (cloudReady || webState === 'READY' || webState === 'AUTH_FAILURE' || webState === 'SERVERLESS_UNSUPPORTED') {
      setPollInterval(0)
    } else {
      setPollInterval(3000)
    }
  }, [status?.web?.state, status?.cloud?.configured])

  const [connect, { isLoading: connecting }] = useConnectBusinessWhatsAppMutation()
  const [disconnect, { isLoading: disconnecting }] = useDisconnectBusinessWhatsAppMutation()
  const [clearSession, { isLoading: clearing }] = useClearBusinessWhatsAppSessionMutation()

  const [pendingConnect, setPendingConnect] = useState(false)
  useEffect(() => {
    if (status?.web?.state && status.web.state !== 'DISCONNECTED') setPendingConnect(false)
  }, [status?.web?.state])

  const webState =
    pendingConnect && (!status?.web?.state || status.web.state === 'DISCONNECTED')
      ? 'LOADING'
      : (status?.web?.state ?? 'DISCONNECTED')

  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (webState === 'LOADING') {
      setLoadingElapsed(0)
      loadingTimerRef.current = setInterval(() => setLoadingElapsed((n) => n + 1), 1000)
    } else {
      setLoadingElapsed(0)
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current)
        loadingTimerRef.current = null
      }
    }
    return () => {
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
    }
  }, [webState])

  const handleSaveCloud = async () => {
    try {
      await updateCloud({
        provider,
        cloudPhoneNumberId: phoneNumberId.trim(),
        cloudApiVersion: apiVersion.trim() || 'v21.0',
        ...(accessToken.trim() ? { cloudAccessToken: accessToken.trim() } : {}),
      }).unwrap()
      setAccessToken('')
      toast.success('WhatsApp Cloud API settings saved')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'data' in e
          ? String((e as { data?: { message?: string } }).data?.message)
          : 'Could not save settings'
      toast.error(msg)
    }
  }

  const handleConnect = async () => {
    setPendingConnect(true)
    try {
      await connect().unwrap()
      toast.success('Local WhatsApp started. Scan the QR code.')
    } catch (e: unknown) {
      setPendingConnect(false)
      toast.error(e instanceof Error ? e.message : 'Could not start local WhatsApp')
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect().unwrap()
      toast.success('Local WhatsApp disconnected')
    } catch {
      toast.error('Could not disconnect')
    }
  }

  const handleClearSession = async () => {
    try {
      await clearSession().unwrap()
      toast.success('Session cleared. Connect again with a new QR code.')
    } catch {
      toast.error('Could not clear session')
    }
  }

  const cloudReady = status?.cloud?.configured
  const activeProvider = status?.activeProvider

  return (
    <ContentSection
      title="WhatsApp"
      desc="Send invoice PDFs via Meta WhatsApp Cloud API (recommended) or local WhatsApp Web (QR scan)."
    >
      <div className="space-y-6">
      <Card className="border-[#25D366]/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cloud className="h-5 w-5 text-[#25D366]" />
            WhatsApp Cloud API (official)
          </CardTitle>
          <CardDescription>
            Uses Meta&apos;s Business API — no QR scan, works on any server, sends real PDF
            attachments. Get credentials from{' '}
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Meta Developer Console
            </a>{' '}
            → WhatsApp → API Setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Cloud API</span>
            {cloudReady ? (
              <Badge className="bg-green-600">Configured</Badge>
            ) : (
              <Badge variant="secondary">Not configured</Badge>
            )}
            {activeProvider === 'cloud' && (
              <Badge variant="outline" className="border-green-500 text-green-700">
                Active for invoice PDFs
              </Badge>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Send method</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as WhatsAppProviderMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto — Cloud API first, then local QR</SelectItem>
                  <SelectItem value="cloud">Cloud API only</SelectItem>
                  <SelectItem value="web">Local QR only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-phone-id">Phone number ID</Label>
              <Input
                id="wa-phone-id"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="From Meta API Setup"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-api-version">API version</Label>
              <Input
                id="wa-api-version"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                placeholder="v21.0"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="wa-token">Permanent access token</Label>
              <Input
                id="wa-token"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={
                  cloudConfig?.cloud.hasAccessToken
                    ? '••••••••  (leave blank to keep current)'
                    : 'Paste token from Meta'
                }
                autoComplete="off"
              />
            </div>
          </div>

          <Button onClick={() => void handleSaveCloud()} disabled={savingCloud}>
            {savingCloud ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save Cloud API settings'
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            You can also set <code className="text-xs">WHATSAPP_CLOUD_ACCESS_TOKEN</code> and{' '}
            <code className="text-xs">WHATSAPP_CLOUD_PHONE_NUMBER_ID</code> in server{' '}
            <code className="text-xs">.env</code> instead of saving here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Local WhatsApp (QR — fallback)
          </CardTitle>
          <CardDescription>
            whatsapp-web.js on your server. Same session as School → WhatsApp. Use when Cloud API is
            not set up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Local status</span>
            <WebStateBadge state={webState} />
            {activeProvider === 'web' && (
              <Badge variant="outline" className="border-green-500 text-green-700">
                Active for invoice PDFs
              </Badge>
            )}
          </div>

          {webState === 'SERVERLESS_UNSUPPORTED' && !cloudReady && (
            <p className="text-sm text-muted-foreground">
              Local QR requires a VPS with Chrome. On serverless hosting, configure Cloud API above.
            </p>
          )}

          {webState === 'QR_READY' && status?.web?.qrImage && (
            <div className="flex flex-col items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm">
                WhatsApp → Linked devices → Link a device → scan:
              </p>
              <img
                src={status.web.qrImage}
                alt="WhatsApp QR code"
                className="h-56 w-56 rounded-md border bg-white p-2"
              />
            </div>
          )}

          {webState === 'LOADING' && (
            <p className="text-sm text-muted-foreground">
              Starting… {loadingElapsed > 0 ? `(${loadingElapsed}s)` : ''}
            </p>
          )}

          {webState === 'READY' && (
            <p className="text-sm text-green-700">Local WhatsApp is connected.</p>
          )}

          <Separator />

          <div className="flex flex-wrap gap-2">
            {webState !== 'READY' && webState !== 'SERVERLESS_UNSUPPORTED' && (
              <Button
                variant="outline"
                onClick={() => void handleConnect()}
                disabled={connecting || webState === 'LOADING'}
              >
                {connecting || webState === 'LOADING' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect (scan QR)'
                )}
              </Button>
            )}
            {(webState === 'READY' || webState === 'QR_READY' || webState === 'LOADING') && (
              <Button variant="outline" onClick={() => void handleDisconnect()} disabled={disconnecting}>
                Disconnect
              </Button>
            )}
            {(webState === 'AUTH_FAILURE' || webState === 'READY') && (
              <Button variant="destructive" onClick={() => void handleClearSession()} disabled={clearing}>
                Clear session
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            School bulk messaging:{' '}
            <Link to="/school/whatsapp" className="underline">
              School → WhatsApp
            </Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </ContentSection>
  )
}
