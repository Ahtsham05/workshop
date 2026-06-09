import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { useWhatsAppOptional } from '@/context/whatsapp-context'
import { cn } from '@/lib/utils'
import { CheckCircle2, MessageCircle } from 'lucide-react'

export function WhatsAppHeaderButton() {
  if (!WHATSAPP_UI_ENABLED) return null

  const wa = useWhatsAppOptional()
  if (!wa) return null

  const { isReady, openConnectionDialog } = wa

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={cn(
            'relative',
            isReady ? 'text-[#25D366] hover:bg-green-50' : 'text-muted-foreground',
          )}
          onClick={openConnectionDialog}
          aria-label='WhatsApp'
        >
          <MessageCircle className='h-5 w-5' />
          {isReady && (
            <span className='absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#25D366] ring-2 ring-background' />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isReady ? (
          <span className='flex items-center gap-1'>
            <CheckCircle2 className='h-3.5 w-3.5' /> WhatsApp Cloud API connected
          </span>
        ) : (
          'Connect WhatsApp Business (Meta Cloud API)'
        )}
      </TooltipContent>
    </Tooltip>
  )
}
