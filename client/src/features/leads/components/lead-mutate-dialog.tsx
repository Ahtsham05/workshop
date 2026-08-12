import { useEffect, useState } from 'react'
import { AlertTriangle, Building2, Landmark, Mail, MapPin, Phone, Target, UserCog, Wallet2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'
import { useGetUsersQuery } from '@/stores/users.api'
import {
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useLazyCheckLeadDuplicatesQuery,
  type Lead,
  type LeadSource,
  type LeadUserRef,
} from '@/stores/lead.api'
import { SOURCES, SOURCE_LABELS } from '../utils/stage-config'

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  )
}

function IconInput({ icon: Icon, ...props }: { icon: React.ElementType } & React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-8" {...props} />
    </div>
  )
}

interface LeadMutateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead?: Lead | null
}

export function LeadMutateDialog({ open, onOpenChange, lead }: LeadMutateDialogProps) {
  const { t } = useLanguage()
  const isEdit = !!lead
  const [createLead, { isLoading: creating }] = useCreateLeadMutation()
  const [updateLead, { isLoading: updating }] = useUpdateLeadMutation()
  const [checkDuplicates, { data: duplicateData, isFetching: checkingDuplicates }] = useLazyCheckLeadDuplicatesQuery()
  // This dialog is mounted unconditionally by its parents (LeadsPage, LeadDetailSheet)
  // regardless of `open` — without `skip` here, every card click on the board would
  // fetch the full user directory just because LeadDetailSheet renders this component,
  // even though the rep dropdown is never seen unless Edit is actually clicked.
  const { data: usersData } = useGetUsersQuery({ limit: 200 }, { skip: !open })
  const isLoading = creating || updating

  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [address, setAddress] = useState('')
  const [source, setSource] = useState<LeadSource>('manual')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false)

  useEffect(() => {
    if (!open) return
    setDismissedDuplicates(false)
    if (lead) {
      setName(lead.name)
      setCompanyName(lead.companyName || '')
      setEmail(lead.email || '')
      setPhone(lead.phone || '')
      setWhatsapp(lead.whatsapp || '')
      setAddress(lead.address || '')
      setSource(lead.source)
      setEstimatedValue(lead.estimatedValue ? String(lead.estimatedValue) : '')
      const rep = lead.assignedTo as string | LeadUserRef
      setAssignedTo(typeof rep === 'string' ? rep : rep?.id || rep?._id || '')
    } else {
      setName('')
      setCompanyName('')
      setEmail('')
      setPhone('')
      setWhatsapp('')
      setAddress('')
      setSource('manual')
      setEstimatedValue('')
      setAssignedTo('')
    }
  }, [open, lead])

  const runDuplicateCheck = () => {
    if (!phone.trim() && !whatsapp.trim() && !email.trim()) return
    setDismissedDuplicates(false)
    checkDuplicates({
      phone: phone.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      email: email.trim() || undefined,
      excludeId: lead?._id || lead?.id,
    })
  }

  const duplicates = dismissedDuplicates ? [] : duplicateData?.duplicates || []

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('Lead name is required'))
      return
    }

    const payload = {
      name: name.trim(),
      companyName: companyName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      address: address.trim() || undefined,
      source,
      estimatedValue: estimatedValue ? Number(estimatedValue) : 0,
      assignedTo: assignedTo || undefined,
    }

    try {
      if (isEdit && lead) {
        await updateLead({ id: lead._id || lead.id, ...payload }).unwrap()
        toast.success(t('Lead updated'))
      } else {
        await createLead(payload).unwrap()
        toast.success(t('Lead created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(t('Failed to save lead'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </span>
            {isEdit ? t('Edit Lead') : t('New Lead')}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-0.5 py-1">
          <SectionLabel icon={UserCog}>{t('Contact Information')}</SectionLabel>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('Contact Name')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Ahmed Khan')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Company')}</Label>
              <IconInput icon={Building2} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('Phone')}</Label>
              <IconInput icon={Phone} value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={runDuplicateCheck} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('WhatsApp')}</Label>
              <IconInput icon={Phone} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} onBlur={runDuplicateCheck} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('Email')}</Label>
            <IconInput icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} onBlur={runDuplicateCheck} />
          </div>

          {!checkingDuplicates && duplicates.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('Possible duplicate — matching lead(s) already exist')}
              </p>
              <ul className="space-y-1">
                {duplicates.map((d) => (
                  <li key={d._id} className="text-xs text-muted-foreground">
                    {d.name}{d.companyName ? ` — ${d.companyName}` : ''} ({t(d.stage)})
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                onClick={() => setDismissedDuplicates(true)}
              >
                {t('This is a different lead — continue anyway')}
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('Address')}</Label>
            <IconInput icon={MapPin} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <Separator />
          <SectionLabel icon={Landmark}>{t('Pipeline Details')}</SectionLabel>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('Source')}</Label>
              <Select value={source} onValueChange={(v) => setSource(v as LeadSource)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{t(SOURCE_LABELS[s])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('Estimated Value')}</Label>
              <IconInput
                icon={Wallet2}
                type="number"
                min="0"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('Assigned Sales Rep')}</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t('Assign to me')} /></SelectTrigger>
              <SelectContent>
                {(usersData?.results || []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t('Saving...') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
