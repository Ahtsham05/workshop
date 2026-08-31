import { useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Upload, X, FileText, ExternalLink, Paperclip } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import type { PurchaseAttachment } from '../index'

interface PurchaseAttachmentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  attachments: PurchaseAttachment[]
  /** Shown in the header for context, e.g. the purchase's invoice number. */
  contextLabel?: string
  /** Shows the upload control and per-attachment remove buttons. */
  editable?: boolean
  uploading?: boolean
  onFilesSelected?: (files: FileList) => void
  onRemove?: (attachment: PurchaseAttachment) => void
}

const ACCEPT = 'image/*,application/pdf'

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Shared image/PDF attachment viewer — used read-only wherever a purchase's invoice
 * number is shown (purchase list, returns, PO receipts, supplier ledger) and editable
 * (upload + remove) on the New/Edit Purchase form via PurchaseAttachmentsField. */
export function PurchaseAttachmentsDialog({
  open,
  onOpenChange,
  attachments,
  contextLabel,
  editable = false,
  uploading = false,
  onFilesSelected,
  onRemove,
}: PurchaseAttachmentsDialogProps) {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            {t('attachments')}
            {contextLabel ? <span className="font-mono text-sm font-normal text-muted-foreground">— {contextLabel}</span> : null}
          </DialogTitle>
          <DialogDescription>
            {editable ? t('purchase_attachments_editable_hint') : t('purchase_attachments_view_hint')}
          </DialogDescription>
        </DialogHeader>

        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t('add_files')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('purchase_attachments_file_types_hint')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onFilesSelected?.(e.target.files)
                }
                if (e.target) e.target.value = ''
              }}
            />
          </div>
        )}

        {attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <Paperclip className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('no_attachments_yet')}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <div className="grid grid-cols-2 gap-3 pr-3 sm:grid-cols-3">
              {attachments.map((att) => (
                <div key={att.publicId} className="overflow-hidden rounded-lg border bg-muted/20">
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                    {att.fileType === 'pdf' ? (
                      <div className="flex h-28 flex-col items-center justify-center gap-1.5 bg-muted/40 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <span className="text-[11px] font-medium">PDF</span>
                      </div>
                    ) : (
                      <img src={att.url} alt={att.fileName || 'attachment'} className="h-28 w-full object-cover" />
                    )}
                  </a>
                  <div className="flex items-center justify-between gap-1 border-t bg-background/95 px-2 py-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium" title={att.fileName}>
                        {att.fileName || t('attachment')}
                      </p>
                      {att.fileSize ? (
                        <p className="text-[10px] text-muted-foreground">{formatFileSize(att.fileSize)}</p>
                      ) : null}
                    </div>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('view_attachments')}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onRemove?.(att)}
                        title={t('remove')}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
