import { useRef, useState } from 'react'
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Plus,
  Printer,
  Trash2,
  Upload,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  useAddOrderDocumentLinkMutation,
  useGetMaterialIssuesQuery,
  useGetOrderDocumentUrlMutation,
  useGetOutputsQuery,
  useGetProductionReceiptsQuery,
  useGetScrapRecordsQuery,
  useRemoveOrderDocumentMutation,
  useUploadOrderDocumentMutation,
  type OrderDocument,
  type OrderDocumentCategory,
  type ProductionOrder,
} from '@/stores/manufacturing.api'
import type { RootState } from '@/stores/store'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Panel } from '../../components/page'
import { useConfirm } from '../../lib/confirm'
import { fmtDate, fmtQty } from '../../lib/constants'
import { printJobCard } from '../../lib/job-card-print'

const CATEGORY_LABELS: Record<OrderDocumentCategory, string> = {
  drawing: 'Drawing',
  specification: 'Specification',
  work_instruction: 'Work instruction',
  quality: 'Quality record',
  certificate: 'Certificate',
  photo: 'Photo',
  other: 'Other',
}
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

const fmtBytes = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DocumentsTab({
  order,
  canAttach,
  canManage,
  branchName,
}: {
  order: ProductionOrder
  canAttach: boolean
  canManage: boolean
  branchName?: string
}) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const me = useSelector((s: RootState) => s.auth.data?.user?.id) as
    | string
    | undefined
  const [adding, setAdding] = useState(false)
  const [getUrl] = useGetOrderDocumentUrlMutation()
  const [removeDoc] = useRemoveOrderDocumentMutation()
  const docs = [...(order.documents || [])].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt)
  )

  const open = async (doc: OrderDocument) => {
    // Open the tab synchronously (pop-up blockers), then point it at the signed URL.
    const w = window.open('', '_blank')
    try {
      const { url } = await getUrl({
        orderId: order.id,
        documentId: doc._id,
      }).unwrap()
      if (w) {
        w.opener = null
        w.location.href = url
      } else window.location.assign(url)
    } catch (err) {
      w?.close()
      toast.error(getErrorMessage(err, t('Could not open the document')))
    }
  }

  const remove = async (doc: OrderDocument) => {
    const ok = await confirm({
      title: t('Remove “{{n}}”?').replace('{{n}}', doc.title),
      description:
        doc.kind === 'file'
          ? t('The file is deleted from storage. This cannot be undone.')
          : t('The link is removed from this order.'),
      confirmText: t('Remove'),
      destructive: true,
    })
    if (!ok) return
    try {
      await removeDoc({ orderId: order.id, documentId: doc._id }).unwrap()
      toast.success(t('Document removed'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not remove the document')))
    }
  }

  return (
    <div className='space-y-4'>
      <Panel
        flush
        title={t('Attachments')}
        description={t(
          'Drawings, specifications, work instructions, QC certificates and photos for this order.'
        )}
        action={
          canAttach ? (
            <Button size='sm' onClick={() => setAdding(true)}>
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              {t('Add document')}
            </Button>
          ) : undefined
        }
      >
        {docs.length === 0 ? (
          <div className='text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-sm'>
            <Paperclip className='h-5 w-5' />
            {t('Nothing attached yet.')}
          </div>
        ) : (
          <ul className='divide-y'>
            {docs.map((doc) => {
              const Icon =
                doc.kind === 'link'
                  ? Link2
                  : doc.mimeType?.startsWith('image/')
                    ? ImageIcon
                    : FileText
              const mayRemove =
                canManage || (canAttach && !!me && doc.uploadedBy === me)
              return (
                <li
                  key={doc._id}
                  className='flex items-center gap-3 px-5 py-3 max-sm:px-4'
                >
                  <div className='bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'>
                    <Icon className='h-4 w-4' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <button
                        type='button'
                        onClick={() => open(doc)}
                        className='truncate text-left text-sm font-medium hover:underline'
                      >
                        {doc.title}
                      </button>
                      <Badge
                        variant='outline'
                        className='h-5 px-1.5 text-[10px] font-normal'
                      >
                        {t(CATEGORY_LABELS[doc.category] || 'Other')}
                      </Badge>
                    </div>
                    <div className='text-muted-foreground truncate text-xs'>
                      {[
                        doc.kind === 'link'
                          ? safeHost(doc.url)
                          : [
                              doc.mimeType === 'application/pdf'
                                ? 'PDF'
                                : doc.mimeType?.split('/')[1]?.toUpperCase(),
                              fmtBytes(doc.bytes),
                            ]
                              .filter(Boolean)
                              .join(' · '),
                        doc.uploadedByName,
                        fmtDate(doc.uploadedAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    aria-label={t('Open {{n}}').replace('{{n}}', doc.title)}
                    onClick={() => open(doc)}
                  >
                    <ExternalLink className='h-4 w-4' />
                  </Button>
                  {mayRemove && (
                    <Button
                      variant='ghost'
                      size='icon'
                      className='text-muted-foreground hover:text-destructive h-8 w-8'
                      aria-label={t('Remove {{n}}').replace('{{n}}', doc.title)}
                      onClick={() => remove(doc)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <ProductionRecords order={order} branchName={branchName} />

      {adding && (
        <AddDocumentDialog order={order} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}

const safeHost = (url?: string) => {
  try {
    return url ? new URL(url).host : ''
  } catch {
    return url || ''
  }
}

/** The documents the system itself produced for this order. */
function ProductionRecords({
  order,
  branchName,
}: {
  order: ProductionOrder
  branchName?: string
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const q = { productionOrderId: order.id, limit: 100 }
  const { data: issues } = useGetMaterialIssuesQuery(q)
  const { data: outputs } = useGetOutputsQuery(q)
  const { data: receipts } = useGetProductionReceiptsQuery(q)
  const { data: scrap } = useGetScrapRecordsQuery(q)

  type Row = {
    key: string
    number: string
    type: string
    date: string
    summary: string
  }
  const rows: Row[] = [
    ...(issues?.results || []).map((d) => ({
      key: `i-${d.id}`,
      number: d.issueNumber,
      type: d.kind === 'return' ? t('Material return') : t('Material issue'),
      date: d.issueDate,
      summary: `${d.lines.length} ${t('line(s)')} · ${formatMoney(d.totalCost)}`,
    })),
    ...(outputs?.results || []).map((d) => ({
      key: `o-${d.id}`,
      number: d.outputNumber,
      type: t('Output report'),
      date: d.reportedAt,
      summary:
        d.status === 'inspected'
          ? `${fmtQty(d.producedQuantity)} ${d.unit} · ${fmtQty(d.goodQuantity)} ${t('good')}, ${fmtQty(d.rejectedQuantity)} ${t('rejected')}`
          : `${fmtQty(d.producedQuantity)} ${d.unit} · ${t('awaiting QC')}`,
    })),
    ...(receipts?.results || []).map((d) => ({
      key: `r-${d.id}`,
      number: d.receiptNumber,
      type: t('Finished goods receipt'),
      date: d.receiptDate,
      summary: `+${fmtQty(d.quantity)} ${d.unit} · ${formatMoney(d.totalCost)}`,
    })),
    ...(scrap?.results || []).map((d) => ({
      key: `s-${d.id}`,
      number: d.scrapNumber,
      type: t('Scrap note'),
      date: d.scrapDate,
      summary: `${d.productName} · ${fmtQty(d.quantity)} ${d.unit} · ${formatMoney(d.totalCost)}`,
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return (
    <Panel
      flush
      title={t('Production records')}
      description={t(
        'Generated as the order runs — each one is also in the stock ledger.'
      )}
      action={
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            if (!printJobCard(order, { branchName, t }))
              toast.error(
                t('Allow pop-ups for this site to print the job card')
              )
          }}
        >
          <Printer className='mr-1.5 h-3.5 w-3.5' />
          {t('Print job card')}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className='text-muted-foreground p-6 text-center text-sm'>
          {t(
            'No records yet — they appear as materials are issued and output is reported.'
          )}
        </p>
      ) : (
        <ul className='divide-y'>
          {rows.map((r) => (
            <li
              key={r.key}
              className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm max-sm:px-4 sm:grid-cols-[8rem_10rem_minmax(0,1fr)_6rem]'
            >
              <span className='font-mono text-xs'>{r.number}</span>
              <span className='text-muted-foreground text-xs sm:order-none'>
                {r.type}
              </span>
              <span className='col-span-2 truncate text-xs sm:col-span-1'>
                {r.summary}
              </span>
              <span className='text-muted-foreground hidden text-right text-xs sm:block'>
                {fmtDate(r.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AddDocumentDialog({
  order,
  onClose,
}: {
  order: ProductionOrder
  onClose: () => void
}) {
  const { t } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState<OrderDocumentCategory>('drawing')
  const [upload, { isLoading: uploading }] = useUploadOrderDocumentMutation()
  const [addLink, { isLoading: linking }] = useAddOrderDocumentLinkMutation()

  const pick = (f: File | null) => {
    if (!f) return
    if (f.size > MAX_BYTES) {
      toast.error(t('The file is too large (max 10 MB)'))
      return
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    if (f.type.startsWith('image/')) setCategory('photo')
  }

  const submit = async () => {
    try {
      if (mode === 'file') {
        if (!file) return toast.error(t('Choose a file to upload'))
        await upload({
          orderId: order.id,
          file,
          title: title.trim() || undefined,
          category,
        }).unwrap()
      } else {
        if (!title.trim()) return toast.error(t('Give the link a title'))
        if (!/^https?:\/\/\S+$/i.test(url.trim()))
          return toast.error(
            t('Enter a full web address starting with https://')
          )
        await addLink({
          orderId: order.id,
          title: title.trim(),
          url: url.trim(),
          category,
        }).unwrap()
      }
      toast.success(t('Document added'))
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not add the document')))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Add document')}</DialogTitle>
          <DialogDescription>
            {t(
              'Upload a PDF or image (up to 10 MB), or link to anything else — a CAD file, a shared folder.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'file' | 'link')}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='file'>
              <Upload className='mr-1.5 h-3.5 w-3.5' />
              {t('Upload file')}
            </TabsTrigger>
            <TabsTrigger value='link'>
              <Link2 className='mr-1.5 h-3.5 w-3.5' />
              {t('Add link')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className='grid gap-4'>
          {mode === 'file' ? (
            <div
              role='button'
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileRef.current?.click()
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                pick(e.dataTransfer.files?.[0] || null)
              }}
              className={cn(
                'hover:bg-muted/40 focus-visible:ring-ring flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed p-6 text-center text-sm outline-none focus-visible:ring-2',
                file && 'border-solid'
              )}
            >
              <Upload className='text-muted-foreground h-5 w-5' />
              {file ? (
                <>
                  <span className='font-medium break-all'>{file.name}</span>
                  <span className='text-muted-foreground text-xs'>
                    {fmtBytes(file.size)} · {t('click to change')}
                  </span>
                </>
              ) : (
                <>
                  <span>{t('Drop a file here or click to choose')}</span>
                  <span className='text-muted-foreground text-xs'>
                    PDF, JPG, PNG, WEBP · 10 MB
                  </span>
                </>
              )}
              <input
                ref={fileRef}
                type='file'
                accept={ACCEPT}
                className='hidden'
                onChange={(e) => pick(e.target.files?.[0] || null)}
              />
            </div>
          ) : (
            <div className='grid gap-1.5'>
              <Label htmlFor='doc-url'>{t('Web address')}</Label>
              <Input
                id='doc-url'
                type='url'
                inputMode='url'
                placeholder='https://'
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}
          <div className='grid gap-1.5'>
            <Label htmlFor='doc-title'>{t('Title')}</Label>
            <Input
              id='doc-title'
              value={title}
              placeholder={
                mode === 'file' ? t('Defaults to the file name') : ''
              }
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('Category')}</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as OrderDocumentCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as OrderDocumentCategory[]).map(
                  (c) => (
                    <SelectItem key={c} value={c}>
                      {t(CATEGORY_LABELS[c])}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={uploading || linking}>
            {uploading ? t('Uploading…') : t('Add document')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
