import { useEffect } from 'react'
import { Loader2, MessageCircle, RefreshCw, Unplug, CheckCircle2 } from 'lucide-react'
import ContentSection from '../components/content-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useEmbeddedWhatsAppSignup } from '@/hooks/use-embedded-whatsapp-signup'
import {
  useDisconnectCloudMutation,
  useGetCloudConnectionQuery,
  useReconnectCloudMutation,
} from '@/stores/whatsappCloud.api'
import WhatsAppTemplatesPage from './whatsapp-templates'

export default function BusinessWhatsAppSettings() {
  const { data: connection, isLoading, refetch } = useGetCloudConnectionQuery()
  const { connect, isLoading: starting } = useEmbeddedWhatsAppSignup()
  const [reconnect, { isLoading: reconnecting }] = useReconnectCloudMutation()
  const [disconnect, { isLoading: disconnecting }] = useDisconnectCloudMutation()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      toast.success('WhatsApp Business connected successfully')
      refetch()
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('error')) {
      toast.error('WhatsApp connection failed')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [refetch])

  const connected = connection?.connected

  return (
    <ContentSection
      title='WhatsApp Business (Cloud API)'
      desc='Connect your own WhatsApp Business Account via Meta Embedded Signup. Official Cloud API — no QR scan required.'
    >
      <Tabs defaultValue='connection' className='space-y-4'>
        <TabsList>
          <TabsTrigger value='connection'>Connection</TabsTrigger>
          <TabsTrigger value='templates'>Templates</TabsTrigger>
        </TabsList>
        <TabsContent value='connection'>
      <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <MessageCircle className='h-5 w-5 text-[#25D366]' />
          Connection Status
        </CardTitle>
        <CardDescription>
          Each branch connects its own WABA and phone number. Messages are sent via Meta WhatsApp Cloud API.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
          {isLoading ? (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading…
            </div>
          ) : (
            <>
              <div className='flex flex-wrap items-center gap-3'>
                <span className='text-sm text-muted-foreground'>Status:</span>
                {connected ? (
                  <Badge className='bg-green-100 text-green-800 border-green-300 gap-1'>
                    <CheckCircle2 className='h-3.5 w-3.5' />
                    Connected
                  </Badge>
                ) : connection?.status === 'webhook_pending' ? (
                  <Badge variant='outline' className='gap-1'>
                    Webhook pending
                  </Badge>
                ) : (
                  <Badge variant='outline' className='gap-1 text-muted-foreground'>
                    Not connected
                  </Badge>
                )}
              </div>

              {connection?.displayPhoneNumber && (
                <div className='text-sm space-y-1'>
                  <p>
                    <span className='text-muted-foreground'>Number:</span> {connection.displayPhoneNumber}
                  </p>
                  {connection.verifiedName && (
                    <p>
                      <span className='text-muted-foreground'>Business:</span> {connection.verifiedName}
                    </p>
                  )}
                  {connection.webhookSubscribed != null && (
                    <p>
                      <span className='text-muted-foreground'>Webhook:</span>{' '}
                      {connection.webhookSubscribed ? 'Subscribed' : 'Not subscribed'}
                    </p>
                  )}
                </div>
              )}

              {connection?.lastError && (
                <p className='text-sm text-destructive'>{connection.lastError}</p>
              )}

              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  className='bg-[#25D366] hover:bg-[#20bd5a] text-white gap-2'
                  onClick={connect}
                  disabled={starting}
                >
                  {starting ? <Loader2 className='h-4 w-4 animate-spin' /> : <MessageCircle className='h-4 w-4' />}
                  {connected ? 'Reconnect via Meta' : 'Connect WhatsApp Business'}
                </Button>
                {connected && (
                  <>
                    <Button
                      type='button'
                      variant='outline'
                      className='gap-2'
                      onClick={() => reconnect().unwrap().then(() => toast.success('Reconnected')).catch(() => toast.error('Reconnect failed'))}
                      disabled={reconnecting}
                    >
                      <RefreshCw className={`h-4 w-4 ${reconnecting ? 'animate-spin' : ''}`} />
                      Reconnect Webhook
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      className='gap-2 text-destructive'
                      onClick={() => disconnect().unwrap().then(() => toast.success('Disconnected')).catch(() => toast.error('Disconnect failed'))}
                      disabled={disconnecting}
                    >
                      <Unplug className='h-4 w-4' />
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value='templates'>
          <WhatsAppTemplatesPage />
        </TabsContent>
      </Tabs>
    </ContentSection>
  )
}
