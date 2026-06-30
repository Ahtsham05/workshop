import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2, Plus, Smartphone, Trash2, Wifi, WifiOff } from 'lucide-react'
import ContentSection from '../components/content-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useGetDevicesQuery,
  useRegisterDeviceMutation,
  useDeleteDeviceMutation,
  type SmsDevice,
} from '@/stores/smsGateway.api'

function DeviceCard({ device, onDelete }: { device: SmsDevice; onDelete: () => void }) {
  const copyToken = () => {
    navigator.clipboard.writeText(device.token)
    toast.success('Token copied to clipboard')
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`mt-0.5 rounded-full p-1.5 ${device.isOnline ? 'bg-green-100' : 'bg-gray-100'}`}>
          <Smartphone className={`h-4 w-4 ${device.isOnline ? 'text-green-600' : 'text-gray-400'}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{device.deviceName}</span>
            {device.isOnline ? (
              <Badge className="bg-green-100 text-green-800 border-green-300 gap-1 text-xs">
                <Wifi className="h-3 w-3" /> Online
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                <WifiOff className="h-3 w-3" /> Offline
              </Badge>
            )}
          </div>
          {device.phoneNumber && (
            <p className="text-xs text-muted-foreground mt-0.5">SIM: {device.phoneNumber}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Sent today: <span className="font-medium">{device.smsSentToday}</span> &nbsp;·&nbsp; Total: <span className="font-medium">{device.smsSentTotal}</span>
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono truncate max-w-[220px]">{device.token}</code>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={copyToken}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      <Button size="icon" variant="ghost" className="shrink-0 text-destructive hover:text-destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default function SmsGatewaySettings() {
  const { data: devices = [], isLoading, refetch } = useGetDevicesQuery()
  const [registerDevice, { isLoading: registering }] = useRegisterDeviceMutation()
  const [deleteDevice, { isLoading: deleting }] = useDeleteDeviceMutation()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [simSlot, setSimSlot] = useState('0')
  const [newToken, setNewToken] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!deviceName.trim()) { toast.error('Device name is required'); return }
    try {
      const result = await registerDevice({ deviceName: deviceName.trim(), phoneNumber: phoneNumber.trim(), simSlot: parseInt(simSlot) || 0 }).unwrap()
      setNewToken(result.token)
      setDeviceName('')
      setPhoneNumber('')
      setSimSlot('0')
    } catch {
      toast.error('Failed to register device')
    }
  }

  const handleDelete = async (deviceId: string) => {
    try {
      await deleteDevice(deviceId).unwrap()
      toast.success('Device removed')
    } catch {
      toast.error('Failed to remove device')
    }
  }

  const handleDialogClose = () => {
    setShowAddDialog(false)
    setNewToken(null)
    setDeviceName('')
    setPhoneNumber('')
    setSimSlot('0')
  }

  return (
    <ContentSection
      title="SMS Gateway"
      desc="Send SMS from your own Android phone's SIM. Install the SMS Gateway app on your phone, then add a device here to get the token."
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Connected Devices
              </CardTitle>
              <CardDescription className="mt-1">
                Each device pairs with a SIM card and sends SMS when triggered from anywhere in the app.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-2 shrink-0" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Device
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading devices…
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No devices registered yet.</p>
              <p className="text-xs mt-1">Add a device to start sending SMS from your phone.</p>
            </div>
          ) : (
            devices.map((device) => (
              <DeviceCard key={device.deviceId} device={device} onDelete={() => handleDelete(device.deviceId)} />
            ))
          )}
        </CardContent>
      </Card>

      {/* How to install guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">1.</span> Click <strong>Add Device</strong> above and give your phone a name</p>
          <p><span className="font-medium text-foreground">2.</span> Copy the generated token</p>
          <p><span className="font-medium text-foreground">3.</span> Install the <strong>SMS Gateway APK</strong> on your Android phone (from the <code className="text-xs bg-muted px-1 py-0.5 rounded">sms-gateway-app/</code> folder in the project)</p>
          <p><span className="font-medium text-foreground">4.</span> Open the app → Settings → enter your server URL and paste the token</p>
          <p><span className="font-medium text-foreground">5.</span> Tap Connect — your phone is now a live SMS gateway</p>
          <p><span className="font-medium text-foreground">6.</span> From anywhere in the app (invoices, fee alerts, etc.) you can now send SMS via your SIM</p>
        </CardContent>
      </Card>

      {/* Add Device Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) handleDialogClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{newToken ? 'Device Token' : 'Add SMS Gateway Device'}</DialogTitle>
          </DialogHeader>

          {newToken ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Copy this token and paste it into the SMS Gateway app on your Android phone. Keep it safe — it won't be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted p-3 rounded-lg break-all font-mono">{newToken}</code>
                <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(newToken); toast.success('Copied!') }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={handleDialogClose}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Device Name</Label>
                <Input placeholder="My Android Phone" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone Number (optional)</Label>
                <Input placeholder="03001234567" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>SIM Slot</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={simSlot}
                  onChange={(e) => setSimSlot(e.target.value)}
                >
                  <option value="0">SIM 1 (default)</option>
                  <option value="1">SIM 2</option>
                </select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleDialogClose}>Cancel</Button>
                <Button onClick={handleAdd} disabled={registering}>
                  {registering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Generate Token
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ContentSection>
  )
}
