import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  Building2,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserPlus,
  MessageCircle,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'
import { toast } from 'sonner'
import { CommunicationLogPanel } from '@/features/accounting/components/communication-log-panel'
import {
  useGetLeadTimelineQuery,
  useDeleteLeadMutation,
  type Lead,
  type LeadUserRef,
} from '@/stores/lead.api'
import { STAGE_COLUMN_STYLES, STAGE_LABELS, SOURCE_LABELS, formatCurrency } from '../utils/stage-config'
import { LeadActivityTimeline } from './lead-activity-timeline'
import { LeadMutateDialog } from './lead-mutate-dialog'
import { LeadConvertDialog } from './lead-convert-dialog'
import { LeadQuotationDialog } from './lead-quotation-dialog'

function repName(assignedTo: Lead['assignedTo']): string {
  if (!assignedTo) return '—'
  if (typeof assignedTo === 'string') return assignedTo
  return (assignedTo as LeadUserRef).name || '—'
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?'
}

interface LeadDetailSheetProps {
  lead: Lead | null
  onOpenChange: (open: boolean) => void
}

export function LeadDetailSheet({ lead, onOpenChange }: LeadDetailSheetProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const open = !!lead
  const id = lead?._id || lead?.id || ''

  const { data: timeline, isLoading: timelineLoading } = useGetLeadTimelineQuery(id, { skip: !id })
  const [deleteLead, { isLoading: isDeleting }] = useDeleteLeadMutation()

  const [editOpen, setEditOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [viewQuotationId, setViewQuotationId] = useState<string | null>(null)

  if (!lead) return null

  const style = STAGE_COLUMN_STYLES[lead.stage]
  const quotationEvents = (timeline?.events || []).filter((e) => e.kind === 'quotation')
  const isConverted = !!lead.convertedCustomerId

  const handleDelete = async () => {
    try {
      await deleteLead(id).unwrap()
      toast.success(t('Lead deleted'))
      setDeleteConfirmOpen(false)
      onOpenChange(false)
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Failed to delete lead'))
    }
  }

  const handleCreateQuotation = () => {
    navigate({
      to: '/invoice',
      search: { view: 'create', type: 'quotation', leadId: id, leadName: lead.companyName || lead.name },
    })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <div className={cn('h-1.5 w-full shrink-0', style.dot)} />
          <SheetHeader className="space-y-3 border-b pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className={cn('h-11 w-11 shrink-0 ring-2 ring-offset-2 ring-offset-background', style.ring)}>
                  <AvatarFallback className={cn('font-semibold', style.iconWrap)}>{initials(lead.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-lg">{lead.name}</SheetTitle>
                  {lead.companyName && (
                    <SheetDescription className="flex items-center gap-1 truncate">
                      <Building2 className="h-3.5 w-3.5" />
                      {lead.companyName}
                    </SheetDescription>
                  )}
                </div>
              </div>
              <Badge className={cn('shrink-0', style.badge)}>{t(STAGE_LABELS[lead.stage])}</Badge>
            </div>

            {isConverted && (
              <div className="rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                {t('Converted to customer — this lead is now a read-only history record.')}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Can permission="editLeads">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={isConverted}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  {t('Edit')}
                </Button>
              </Can>
              {lead.stage === 'won' && !isConverted && (
                <Can permission="convertLeads">
                  <Button size="sm" onClick={() => setConvertOpen(true)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    {t('Convert to Customer')}
                  </Button>
                </Can>
              )}
              <Can permission="deleteLeads">
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteConfirmOpen(true)} disabled={isConverted}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {t('Delete')}
                </Button>
              </Can>
            </div>
          </SheetHeader>

          <div className="space-y-4 p-4">
            {(lead.phone || lead.whatsapp || lead.email || lead.address) && (
              <div className="flex flex-wrap gap-1.5">
                {lead.phone && (
                  <span className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {lead.phone}
                  </span>
                )}
                {lead.whatsapp && (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <MessageCircle className="h-3 w-3" />
                    {lead.whatsapp}
                  </span>
                )}
                {lead.email && (
                  <span className="flex max-w-full items-center gap-1.5 truncate rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    {lead.email}
                  </span>
                )}
                {lead.address && (
                  <span className="flex max-w-full items-center gap-1.5 truncate rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {lead.address}
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Estimated Value')}</p>
                <p className="mt-0.5 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(lead.estimatedValue)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Source')}</p>
                <p className="mt-0.5 font-medium">{t(SOURCE_LABELS[lead.source])}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Assigned To')}</p>
                <p className="mt-0.5 font-medium">{repName(lead.assignedTo)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Created')}</p>
                <p className="mt-0.5 font-medium">{format(new Date(lead.createdAt), 'PP')}</p>
              </div>
            </div>

            {lead.stage === 'lost' && lead.lostReason && (
              <div className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-400">
                {t('Lost reason')}: {lead.lostReason}
              </div>
            )}

            <Tabs defaultValue="timeline">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="timeline">{t('Timeline')}</TabsTrigger>
                <TabsTrigger value="communications">{t('Communications')}</TabsTrigger>
                <TabsTrigger value="quotations">{t('Quotations')}</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="pt-4">
                <LeadActivityTimeline events={timeline?.events || []} isLoading={timelineLoading} />
              </TabsContent>

              <TabsContent value="communications" className="pt-4">
                <CommunicationLogPanel relatedType="Lead" relatedId={id} relatedName={lead.name} />
              </TabsContent>

              <TabsContent value="quotations" className="space-y-3 pt-4">
                <Can permission="createInvoices">
                  <Button size="sm" variant="outline" onClick={handleCreateQuotation}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t('Create Quotation')}
                  </Button>
                </Can>
                {quotationEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground opacity-60" />
                    </span>
                    <p className="text-xs text-muted-foreground">{t('No quotations yet')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {quotationEvents.map((event, idx) => {
                      const data = event.data as { _id?: string; invoiceNumber?: string; total?: number; status?: string } | undefined
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => data?._id && setViewQuotationId(data._id)}
                          className="flex w-full items-center justify-between rounded-lg border p-2.5 text-sm text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            {data?.invoiceNumber}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground">{formatCurrency(data?.total || 0)}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <LeadMutateDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <LeadConvertDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} />
      <LeadQuotationDialog
        invoiceId={viewQuotationId}
        onOpenChange={(v) => !v && setViewQuotationId(null)}
        leadName={lead.companyName || lead.name}
        leadPhone={lead.phone}
        leadWhatsapp={lead.whatsapp}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Lead')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This lead and its communications and follow-ups will be permanently removed. This cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('Deleting...') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
