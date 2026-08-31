import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-context'
import { useUploadPurchaseAttachmentMutation, useDeletePurchaseAttachmentMutation } from '@/stores/purchase.api'
import { PurchaseAttachmentsDialog } from './purchase-attachments-dialog'
import type { PurchaseAttachment } from '../index'

interface PurchaseAttachmentsFieldProps {
  attachments: PurchaseAttachment[]
  onChange: (attachments: PurchaseAttachment[]) => void
  contextLabel?: string
}

/** "Attachments" button for the New/Edit Purchase form — uploads immediately to
 * Cloudinary (same pattern as image-upload.tsx: upload first, then just carry the
 * returned {url, publicId} in form state) so the purchase's own create/update payload
 * only ever needs to send the resulting array, never a file. */
export function PurchaseAttachmentsField({ attachments, onChange, contextLabel }: PurchaseAttachmentsFieldProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [uploadAttachment, { isLoading: uploading }] = useUploadPurchaseAttachmentMutation()
  const [deleteAttachment] = useDeletePurchaseAttachmentMutation()

  const handleFilesSelected = async (files: FileList) => {
    const fileList = Array.from(files)
    const results = await Promise.allSettled(fileList.map((file) => uploadAttachment(file).unwrap()))

    const uploaded: PurchaseAttachment[] = []
    let failedCount = 0
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        uploaded.push(result.value)
      } else {
        failedCount += 1
      }
    })

    if (uploaded.length > 0) {
      onChange([...attachments, ...uploaded])
    }
    if (failedCount > 0) {
      toast.error(`${t('attachment_upload_failed')} (${failedCount})`)
    }
  }

  const handleRemove = async (attachment: PurchaseAttachment) => {
    // Optimistic — the array is local form state either way, so remove it immediately;
    // the Cloudinary cleanup call is best-effort and shouldn't block the UI on failure.
    onChange(attachments.filter((a) => a.publicId !== attachment.publicId))
    try {
      await deleteAttachment(attachment.publicId).unwrap()
    } catch {
      // Non-fatal — an orphaned Cloudinary file isn't worth blocking the user over.
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Paperclip className="h-4 w-4" />
        {t('attachments')}
        {attachments.length > 0 ? ` (${attachments.length})` : ''}
      </Button>

      <PurchaseAttachmentsDialog
        open={open}
        onOpenChange={setOpen}
        attachments={attachments}
        contextLabel={contextLabel}
        editable
        uploading={uploading}
        onFilesSelected={handleFilesSelected}
        onRemove={handleRemove}
      />
    </>
  )
}
