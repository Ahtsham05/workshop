import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Paperclip } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { PurchaseAttachmentsDialog } from './purchase-attachments-dialog'
import type { PurchaseAttachment } from '../index'

interface PurchaseAttachmentsButtonProps {
  attachments?: PurchaseAttachment[] | null
  contextLabel?: string
  variant?: 'outline' | 'ghost' | 'secondary'
  size?: 'sm' | 'default'
  className?: string
  /** Paperclip + count only, no label — for dense row-action bars (matches the other
   * icon-only buttons in those rows). */
  iconOnly?: boolean
}

/** Read-only "View Attachments" trigger — dropped in wherever a purchase's invoice
 * number is shown (list rows, details dialogs, purchase returns, PO receipts, supplier
 * ledger) so a scanned invoice is reachable from any of those without granting edit
 * access there. Renders nothing when there's nothing attached, so it doesn't clutter
 * every row in lists where most purchases have no attachments. */
export function PurchaseAttachmentsButton({
  attachments,
  contextLabel,
  variant = 'outline',
  size = 'sm',
  className,
  iconOnly = false,
}: PurchaseAttachmentsButtonProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const list = attachments || []

  if (list.length === 0) return null

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? 'sm' : size}
        title={iconOnly ? `${t('view_attachments')} (${list.length})` : undefined}
        className={
          iconOnly
            ? `relative h-8 w-8 p-0 ${className || ''}`
            : className ? `gap-1.5 ${className}` : 'gap-1.5'
        }
        onClick={() => setOpen(true)}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {iconOnly ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {list.length}
          </span>
        ) : (
          <>{t('view_attachments')} ({list.length})</>
        )}
      </Button>

      <PurchaseAttachmentsDialog
        open={open}
        onOpenChange={setOpen}
        attachments={list}
        contextLabel={contextLabel}
      />
    </>
  )
}
