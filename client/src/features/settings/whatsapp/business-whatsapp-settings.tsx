import { useState } from 'react'
import ContentSection from '../components/content-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWhatsApp } from '@/context/whatsapp-context'
import { MessageCircle, QrCode, CheckCircle2, WifiOff, Loader2 } from 'lucide-react'

export default function WhatsAppSettingsPage() {
  const { state, isReady, openConnectionDialog } = useWhatsApp()
  const [opening, setOpening] = useState(false)

  const handleOpen = () => {
    setOpening(true)
    openConnectionDialog()
    setTimeout(() => setOpening(false), 500)
  }

  return (
    <ContentSection
      title='WhatsApp'
      desc='Connect your WhatsApp by scanning a QR code — no official API required. Once connected, send messages and invoices from anywhere in the app.'
    >
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <MessageCircle className='h-5 w-5 text-[#25D366]' />
            WhatsApp Connection
          </CardTitle>
          <CardDescription>
            Uses WhatsApp Web (QR scan). Messages are sent from your linked phone number, just like the POS system.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center gap-3'>
            <span className='text-sm text-muted-foreground'>Status:</span>
            {isReady ? (
              <Badge className='bg-green-100 text-green-800 border-green-300 gap-1'>
                <CheckCircle2 className='h-3.5 w-3.5' />
                Connected
              </Badge>
            ) : state === 'LOADING' || state === 'QR_READY' ? (
              <Badge variant='outline' className='gap-1'>
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
                {state === 'QR_READY' ? 'Scan QR code' : 'Connecting…'}
              </Badge>
            ) : (
              <Badge variant='outline' className='gap-1 text-muted-foreground'>
                <WifiOff className='h-3.5 w-3.5' />
                Not connected
              </Badge>
            )}
          </div>

          <ul className='text-sm text-muted-foreground list-disc pl-5 space-y-1'>
            <li>Scan once — session stays connected across restarts</li>
            <li>Send messages to customers, suppliers, and parents from the app</li>
            <li>Send invoice PDFs directly from print view</li>
            <li>School orgs: bulk messaging and fee alerts on the School WhatsApp page</li>
          </ul>

          <Button
            type='button'
            className='bg-[#25D366] hover:bg-[#20bd5a] text-white gap-2'
            onClick={handleOpen}
            disabled={opening}
          >
            <QrCode className='h-4 w-4' />
            {isReady ? 'Manage Connection' : 'Connect WhatsApp'}
          </Button>
        </CardContent>
      </Card>
    </ContentSection>
  )
}
