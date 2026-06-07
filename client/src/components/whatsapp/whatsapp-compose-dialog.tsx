import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Loader2, Send } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  phone: string
  name?: string
  defaultMessage?: string
  isReady: boolean
  onConnect: () => void
  onSend: (phone: string, message: string) => Promise<boolean>
}

export function WhatsAppComposeDialog({
  open,
  onOpenChange,
  phone,
  name,
  defaultMessage,
  isReady,
  onConnect,
  onSend,
}: Props) {
  const [message, setMessage] = useState(defaultMessage || '')
  const [phoneValue, setPhoneValue] = useState(phone)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (open) {
      setMessage(defaultMessage || '')
      setPhoneValue(phone)
    }
  }, [open, phone, defaultMessage])

  const handleSend = async () => {
    if (!isReady) {
      onConnect()
      return
    }
    if (!phoneValue.trim() || !message.trim()) return
    setSending(true)
    const ok = await onSend(phoneValue.trim(), message.trim())
    setSending(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <span className='text-[#25D366]'>WhatsApp</span>
            {name ? ` — ${name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='wa-phone'>Phone number</Label>
            <Input id='wa-phone' value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='wa-message'>Message</Label>
            <Textarea
              id='wa-message'
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='Type your message…'
            />
          </div>
        </div>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type='button'
            className='bg-[#25D366] hover:bg-[#20bd5a] text-white gap-1.5'
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? <Loader2 className='h-4 w-4 animate-spin' /> : <Send className='h-4 w-4' />}
            {isReady ? 'Send' : 'Connect WhatsApp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
