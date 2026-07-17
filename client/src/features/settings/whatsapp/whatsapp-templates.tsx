import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Sparkles, CheckCircle2, XCircle, Clock3, PauseCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import {
  useGetSuggestedTemplatesQuery,
  useGetTemplatesQuery,
  useCreateTemplateMutation,
  useCheckTemplateStatusMutation,
  useSyncTemplatesMutation,
  type WhatsAppTemplate,
  type WhatsAppTemplateSuggestion,
} from '@/stores/whatsappCloud.api'

const STATUS_META: Record<
  WhatsAppTemplate['status'],
  { label: string; className: string; icon: React.ReactNode }
> = {
  APPROVED: {
    label: 'Approved',
    className: 'bg-green-100 text-green-800 border-green-300',
    icon: <CheckCircle2 className='h-3.5 w-3.5' />,
  },
  PENDING: {
    label: 'Pending review',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: <Clock3 className='h-3.5 w-3.5' />,
  },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800 border-red-300',
    icon: <XCircle className='h-3.5 w-3.5' />,
  },
  PAUSED: {
    label: 'Paused',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
    icon: <PauseCircle className='h-3.5 w-3.5' />,
  },
  DISABLED: {
    label: 'Disabled',
    className: 'text-muted-foreground',
    icon: <XCircle className='h-3.5 w-3.5' />,
  },
}

function StatusBadge({ status }: { status: WhatsAppTemplate['status'] }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING
  return (
    <Badge variant='outline' className={`gap-1 ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </Badge>
  )
}

export default function WhatsAppTemplatesPage() {
  const { data: suggestionsData, isLoading: suggestionsLoading } = useGetSuggestedTemplatesQuery()
  const { data: templatesData, isLoading: templatesLoading, refetch: refetchTemplates } = useGetTemplatesQuery()
  const [createTemplate] = useCreateTemplateMutation()
  const [checkStatus] = useCheckTemplateStatusMutation()
  const [syncTemplates, { isLoading: syncing }] = useSyncTemplatesMutation()
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<WhatsAppTemplateSuggestion | null>(null)

  const suggestions = suggestionsData?.suggestions ?? []
  const templates = templatesData?.results ?? []

  const handleCheckStatus = async (id: string) => {
    setCheckingId(id)
    try {
      await checkStatus(id).unwrap()
      toast.success('Approval status refreshed')
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to check status')
    } finally {
      setCheckingId(null)
    }
  }

  const handleSync = async () => {
    try {
      const result = await syncTemplates().unwrap()
      toast.success(`Synced ${result.synced} template(s) from Meta`)
      refetchTemplates()
    } catch (e: any) {
      toast.error(e?.data?.message || 'Sync failed')
    }
  }

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Sparkles className='h-5 w-5 text-[#25D366]' />
            Suggested Templates
          </CardTitle>
          <CardDescription>
            Based on your business type. Customize the wording, keep the {'{{'}1{'}}'} placeholders intact, and
            submit for Meta approval.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {suggestionsLoading ? (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading…
            </div>
          ) : suggestions.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No suggestions for your business type.</p>
          ) : (
            suggestions.map((s) => (
              <div
                key={s.name}
                className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3'
              >
                <div className='space-y-1 min-w-0'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <span className='font-medium'>{s.name}</span>
                    <Badge variant='outline'>{s.category}</Badge>
                    {s.alreadyCreated && s.status && <StatusBadge status={s.status} />}
                  </div>
                  <p className='text-sm text-muted-foreground'>{s.bodyText}</p>
                </div>
                <Button
                  type='button'
                  variant={s.alreadyCreated ? 'outline' : 'default'}
                  className={s.alreadyCreated ? '' : 'bg-[#25D366] hover:bg-[#20bd5a] text-white shrink-0'}
                  onClick={() => setEditing(s)}
                >
                  {s.alreadyCreated ? 'Resubmit' : 'Customize & Submit'}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Templates</CardTitle>
          <CardDescription>Templates submitted for this WhatsApp Business Account.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <Button type='button' variant='outline' size='sm' className='gap-2' onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync from Meta
          </Button>

          {templatesLoading ? (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading…
            </div>
          ) : templates.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No templates yet — submit one above.</p>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Variables</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className='font-medium'>{t.name}</TableCell>
                      <TableCell>{t.category}</TableCell>
                      <TableCell>{t.language}</TableCell>
                      <TableCell>{t.variableCount}</TableCell>
                      <TableCell>
                        <div className='space-y-1'>
                          <StatusBadge status={t.status} />
                          {t.status === 'REJECTED' && t.rejectionReason && (
                            <p className='text-xs text-destructive'>{t.rejectionReason}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          onClick={() => handleCheckStatus(t.id)}
                          disabled={checkingId === t.id}
                        >
                          {checkingId === t.id ? (
                            <Loader2 className='h-3.5 w-3.5 animate-spin' />
                          ) : (
                            <RefreshCw className='h-3.5 w-3.5' />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateEditDialog
        suggestion={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={async (payload) => {
          try {
            await createTemplate(payload).unwrap()
            toast.success(
              payload.headerFormat === 'DOCUMENT'
                ? 'Template submitted to Meta for approval. Once approved, invoice PDFs can be sent any time — even outside the 24h window.'
                : 'Template submitted to Meta for approval',
            )
            setEditing(null)
          } catch (e: any) {
            toast.error(e?.data?.message || 'Template submission failed')
          }
        }}
      />
    </div>
  )
}

/** Reads a File as a base64 string (no data: URL prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function TemplateEditDialog({
  suggestion,
  onOpenChange,
  onSubmit,
}: {
  suggestion: WhatsAppTemplateSuggestion | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: {
    name: string
    language: string
    category: string
    bodyText: string
    internalCategory: string
    headerFormat?: 'DOCUMENT'
    headerSampleBase64?: string
    headerSampleMimeType?: string
  }) => Promise<void>
}) {
  const [bodyText, setBodyText] = useState('')
  const [category, setCategory] = useState('UTILITY')
  const [language, setLanguage] = useState('en')
  const [submitting, setSubmitting] = useState(false)
  const [sampleFile, setSampleFile] = useState<File | null>(null)

  const expectedVariables = suggestion?.variableCount ?? 0
  const needsSampleDocument = Boolean(suggestion?.hasDocumentHeader)

  useEffect(() => {
    if (suggestion) {
      setBodyText(suggestion.bodyText)
      setCategory(suggestion.category)
      setLanguage(suggestion.language || 'en')
      setSampleFile(null)
    }
  }, [suggestion])

  const open = Boolean(suggestion)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setBodyText('')
      setCategory('UTILITY')
      setLanguage('en')
      setSampleFile(null)
    }
    onOpenChange(next)
  }

  const currentVariableCount = (bodyText.match(/\{\{\s*\d+\s*\}\}/g) || []).length
  const variablesMismatch = expectedVariables > 0 && currentVariableCount !== expectedVariables

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Customize “{suggestion?.name}”</DialogTitle>
          <DialogDescription>
            Edit the wording freely, but keep the {'{{'}n{'}}'} placeholders — Meta uses them to insert values like
            names, amounts, or dates when the message is sent.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          {needsSampleDocument && (
            <div className='space-y-1.5'>
              <Label htmlFor='tpl-sample-doc'>Sample PDF</Label>
              <Input
                id='tpl-sample-doc'
                type='file'
                accept='application/pdf'
                onChange={(e) => setSampleFile(e.target.files?.[0] || null)}
              />
              <p className='text-xs text-muted-foreground'>
                Any representative invoice PDF works — Meta uses it to review the layout, not the exact content.
                Once approved, this template lets you send real invoice PDFs any time, even outside the 24h window.
              </p>
            </div>
          )}
          <div className='space-y-1.5'>
            <Label htmlFor='tpl-body'>Message body</Label>
            <Textarea
              id='tpl-body'
              rows={4}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
            {variablesMismatch && (
              <p className='text-xs text-destructive'>
                Expected {expectedVariables} placeholder(s) ({'{{'}1{'}}'}…{'{{'}
                {expectedVariables}
                {'}}'}), found {currentVariableCount}.
              </p>
            )}
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='UTILITY'>Utility</SelectItem>
                  <SelectItem value='MARKETING'>Marketing</SelectItem>
                  <SelectItem value='AUTHENTICATION'>Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='tpl-lang'>Language code</Label>
              <Input id='tpl-lang' value={language} onChange={(e) => setLanguage(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type='button'
            className='bg-[#25D366] hover:bg-[#20bd5a] text-white'
            disabled={submitting || !bodyText.trim() || variablesMismatch || (needsSampleDocument && !sampleFile)}
            onClick={async () => {
              if (!suggestion) return
              setSubmitting(true)
              try {
                const headerSampleBase64 = sampleFile ? await fileToBase64(sampleFile) : undefined
                await onSubmit({
                  name: suggestion.name,
                  language,
                  category,
                  bodyText: bodyText.trim(),
                  internalCategory: suggestion.internalCategory,
                  ...(needsSampleDocument
                    ? { headerFormat: 'DOCUMENT' as const, headerSampleBase64, headerSampleMimeType: sampleFile?.type }
                    : {}),
                })
              } finally {
                setSubmitting(false)
              }
            }}
          >
            {submitting ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Submit for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
