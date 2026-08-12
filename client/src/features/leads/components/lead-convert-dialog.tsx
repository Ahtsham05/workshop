import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'
import { useConvertLeadMutation, type Lead } from '@/stores/lead.api'

interface LeadConvertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
  onConverted?: () => void
}

export function LeadConvertDialog({ open, onOpenChange, lead, onConverted }: LeadConvertDialogProps) {
  const { t } = useLanguage()
  const [convertLead, { isLoading }] = useConvertLeadMutation()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [forceCreateNew, setForceCreateNew] = useState(false)

  useEffect(() => {
    if (!open || !lead) return
    setName(lead.companyName || lead.name)
    setPhone(lead.phone || '')
    setWhatsapp(lead.whatsapp || '')
    setEmail(lead.email || '')
    setAddress(lead.address || '')
    setForceCreateNew(false)
  }, [open, lead])

  if (!lead) return null

  const handleConvert = async () => {
    try {
      const result = await convertLead({
        id: lead._id || lead.id,
        name: name.trim(),
        phone: phone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        forceCreateNew,
      }).unwrap()

      if (result.alreadyConverted) {
        toast.info(t('This lead was already converted'))
      } else if (result.linkedExisting) {
        toast.success(t('Linked to an existing matching customer'))
      } else {
        toast.success(t('Customer created from lead'))
      }
      onOpenChange(false)
      onConverted?.()
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Failed to convert lead'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
              <UserPlus className="h-4 w-4 text-emerald-600" />
            </span>
            {t('Convert to Customer')}
          </DialogTitle>
          <DialogDescription>
            {t('Review the details before creating a customer record. The lead itself is kept as a permanent history record — its communications and quotations stay linked and viewable.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('Customer Name')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('Phone')}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('WhatsApp')}</Label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('Email')}</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('Address')}</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleConvert} disabled={isLoading || !name.trim()} className="w-full">
            {isLoading ? t('Converting...') : t('Convert to Customer')}
          </Button>
          {!forceCreateNew && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setForceCreateNew(true)}
            >
              {t('A matching customer might already exist — click here to always create a new one instead')}
            </button>
          )}
          {forceCreateNew && (
            <p className="text-xs text-amber-600">{t('Will always create a brand-new customer, even if one with the same phone/email already exists.')}</p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
