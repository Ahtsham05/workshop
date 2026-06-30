import { useState } from 'react'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useSendSmsMutation } from '@/stores/smsGateway.api'

type Props = {
  phone?: string | null
  name?: string
  defaultMessage?: string
  size?: 'sm' | 'icon' | 'default'
  variant?: 'ghost' | 'outline' | 'default'
  className?: string
  showLabel?: boolean
}

function buildDefaultMessage(name?: string) {
  return name ? `Dear ${name},\n` : ''
}

export function SmsSendButton({
  phone,
  name,
  defaultMessage,
  size = 'icon',
  variant = 'ghost',
  className,
  showLabel = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sendSms, { isLoading }] = useSendSmsMutation()

  const number = (phone || '').trim()
  if (!number) return null

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setMessage(defaultMessage ?? buildDefaultMessage(name))
    setOpen(true)
  }

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Please type a message')
      return
    }
    try {
      await sendSms({ to: number, message: message.trim(), source: 'manual' }).unwrap()
      toast.success(`SMS sent to ${name || number}`)
      setOpen(false)
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to send SMS — is a device connected?')
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            size={size}
            variant={variant}
            className={cn(
              'text-blue-500 hover:text-blue-600 hover:bg-blue-50',
              showLabel && 'gap-1.5 px-2',
              className,
            )}
            onClick={handleOpen}
          >
            <MessageSquare className='h-4 w-4 shrink-0' />
            {showLabel ? <span className='text-xs'>SMS</span> : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Send SMS</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md' onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <MessageSquare className='h-4 w-4 text-blue-500' />
              Send SMS{name ? ` to ${name}` : ''}
            </DialogTitle>
          </DialogHeader>

          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <Label>Message</Label>
              <span className='text-xs text-muted-foreground'>{number}</span>
            </div>
            <Textarea
              rows={5}
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='Type your message…'
            />
            <p className='text-xs text-muted-foreground text-right'>{message.length} chars</p>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isLoading || !message.trim()}>
              {isLoading ? (
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
              ) : (
                <Send className='h-4 w-4 mr-2' />
              )}
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
