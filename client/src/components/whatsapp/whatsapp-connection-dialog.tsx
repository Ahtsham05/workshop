import { Link } from '@tanstack/react-router'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, Settings, Unplug } from 'lucide-react'
import { useEmbeddedWhatsAppSignup } from '@/hooks/use-embedded-whatsapp-signup'

type CloudConnection = {
  connected?: boolean
  displayPhoneNumber?: string
  verifiedName?: string
  webhookSubscribed?: boolean
  phoneRegistered?: boolean
  status?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  isReady: boolean
  connection?: CloudConnection | null
  onDisconnect: () => void
  disconnecting?: boolean
}

export function WhatsAppConnectionDialog({
  open,
  onOpenChange,
  isReady,
  connection,
  onDisconnect,
  disconnecting,
}: Props) {
  const { connect, isLoading: connecting } = useEmbeddedWhatsAppSignup()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md p-0 overflow-hidden gap-0'>
        <DialogHeader className='bg-[#25D366] text-white px-5 py-4 space-y-0'>
          <DialogTitle className='text-white text-lg font-semibold flex items-center gap-2'>
            <MessageCircle className='h-6 w-6' />
            WhatsApp Business (Cloud API)
          </DialogTitle>
        </DialogHeader>

        <div className='px-5 py-4 space-y-4'>
          {isReady ? (
            <div className='rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800 space-y-2'>
              <div className='flex items-center gap-2 font-medium'>
                <CheckCircle2 className='h-4 w-4' />
                Connected via Meta Cloud API
              </div>
              {connection?.displayPhoneNumber && (
                <p>Number: {connection.displayPhoneNumber}</p>
              )}
              {connection?.verifiedName && <p>Business: {connection.verifiedName}</p>}
            </div>
          ) : null}

          {isReady && connection?.phoneRegistered === false && (
            <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 space-y-1'>
              <div className='flex items-center gap-2 font-medium'>
                <AlertTriangle className='h-4 w-4' />
                Number not registered for sending
              </div>
              <p>
                This number is connected but Meta hasn't finished registering it for the Cloud
                API — messages will appear to send but won't reach customers. Click{' '}
                <span className='font-medium'>Reconnect via Meta</span> below to complete
                registration.
              </p>
            </div>
          )}

          {!isReady && (
            <div className='space-y-3 text-sm text-muted-foreground'>
              <p>
                Connect your own WhatsApp Business Account using Meta Embedded Signup — the same
                official method used by AiSensy, WATI, and Interakt.
              </p>
              <p>No QR scan. No WhatsApp Web automation.</p>
            </div>
          )}

          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              className='bg-[#25D366] hover:bg-[#20bd5a] text-white gap-2'
              onClick={connect}
              disabled={connecting}
            >
              {connecting ? <Loader2 className='h-4 w-4 animate-spin' /> : <MessageCircle className='h-4 w-4' />}
              {isReady ? 'Reconnect via Meta' : 'Connect WhatsApp Business'}
            </Button>
            {isReady && (
              <Button
                type='button'
                variant='outline'
                className='gap-2 text-destructive'
                onClick={onDisconnect}
                disabled={disconnecting}
              >
                <Unplug className='h-4 w-4' />
                Disconnect
              </Button>
            )}
            <Button type='button' variant='ghost' asChild className='gap-2'>
              <Link to='/settings/whatsapp'>
                <Settings className='h-4 w-4' />
                Settings
              </Link>
            </Button>
          </div>
        </div>

        <DialogFooter className='px-5 py-3 border-t bg-muted/30'>
          <Button type='button' variant='secondary' onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
