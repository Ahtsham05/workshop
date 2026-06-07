import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2, Power, RefreshCw, Send } from 'lucide-react'
import type { WhatsAppConnectionState } from '@/stores/whatsapp.api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: WhatsAppConnectionState
  qrImage: string | null
  onConnect: () => void
  onDisconnect: () => void
  onClearSession: () => void
  onRefresh: () => void
  onTest: () => void
}

function formatTimer(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function WhatsAppConnectionDialog({
  open,
  onOpenChange,
  state,
  qrImage,
  onConnect,
  onDisconnect,
  onClearSession,
  onRefresh,
  onTest,
}: Props) {
  const [qrTimer, setQrTimer] = useState(90)
  const connectRequestedRef = useRef(false)
  const isReady = state === 'READY'
  const isLoading = state === 'LOADING'
  const showQr = state === 'QR_READY' && qrImage

  useEffect(() => {
    if (!open || !showQr) {
      setQrTimer(90)
      return
    }
    setQrTimer(90)
    const id = setInterval(() => {
      setQrTimer((t) => {
        if (t <= 1) {
          onRefresh()
          return 90
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [open, showQr, qrImage, onRefresh])

  useEffect(() => {
    if (!open) {
      connectRequestedRef.current = false
      return
    }
    if (state === 'DISCONNECTED' && !connectRequestedRef.current) {
      connectRequestedRef.current = true
      onConnect()
    }
  }, [open, state, onConnect])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md p-0 overflow-hidden gap-0'>
        <DialogHeader className='bg-[#25D366] text-white px-5 py-4 space-y-0'>
          <DialogTitle className='text-white text-lg font-semibold flex items-center gap-2'>
            <svg viewBox='0 0 24 24' className='h-6 w-6 fill-white' aria-hidden>
              <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' />
            </svg>
            WhatsApp Connection
          </DialogTitle>
        </DialogHeader>

        <div className='px-5 py-4 space-y-4'>
          {!isReady && (
            <div className='flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'>
              <AlertTriangle className='h-4 w-4 shrink-0 mt-0.5' />
              <span>WhatsApp is not connected. Please scan the QR code with your phone.</span>
            </div>
          )}

          {isReady && (
            <div className='rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 text-center'>
              WhatsApp is connected and ready to send messages from your app.
            </div>
          )}

          {state === 'SERVERLESS_UNSUPPORTED' && (
            <div className='rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800'>
              WhatsApp QR connection requires a persistent server (Docker/VPS). It is not available on serverless hosting.
            </div>
          )}

          {isLoading && !showQr && (
            <div className='flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground'>
              <Loader2 className='h-10 w-10 animate-spin text-[#25D366]' />
              <p className='text-sm'>Starting WhatsApp…</p>
            </div>
          )}

          {showQr && (
            <div className='flex flex-col items-center gap-3'>
              <img src={qrImage} alt='WhatsApp QR code' className='w-56 h-56 border rounded-lg' />
              <p className='text-xs text-muted-foreground text-center'>
                Open WhatsApp on your phone → Linked devices → Link a device → Scan this code
              </p>
              <p className='text-xs text-muted-foreground'>QR refreshes in {formatTimer(qrTimer)}</p>
            </div>
          )}

          {state === 'AUTH_FAILURE' && (
            <p className='text-sm text-red-600 text-center'>
              Authentication failed. Clear session and scan again.
            </p>
          )}

          <div className='flex flex-wrap gap-2 justify-center pt-1'>
            <Button type='button' variant='outline' size='sm' onClick={onRefresh} className='gap-1.5'>
              <RefreshCw className='h-4 w-4' />
              Refresh
            </Button>
            <Button
              type='button'
              size='sm'
              className='gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white'
              onClick={onTest}
              disabled={!isReady}
            >
              <Send className='h-4 w-4' />
              Test
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onDisconnect}
              className='gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50'
              disabled={state === 'DISCONNECTED'}
            >
              <Power className='h-4 w-4' />
              Disconnect
            </Button>
          </div>

          {(state === 'AUTH_FAILURE' || state === 'DISCONNECTED') && (
            <div className='text-center'>
              <Button type='button' variant='ghost' size='sm' onClick={onClearSession} className='text-xs'>
                Clear saved session &amp; scan new QR
              </Button>
            </div>
          )}
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
