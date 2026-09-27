import { useState } from 'react'
import { Keyboard, Layers } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useLanguage } from '@/context/language-context'
import { BulkTransferPanel } from './bulk-transfer-panel'

interface QuickBulkTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Changes on every open, so each open starts a fresh transfer. */
  sessionKey: number
  /** "Transfer stock" on a product: start with it on the first row. */
  initialProductId?: string
}

/**
 * Quick Stock Transfer's form: the full Bulk Transfer (any number of products, batches and
 * serials, one destination) in a large dialog over whatever screen the person is on — the
 * same panel the Stock Transfer page uses, so both behave identically.
 *
 * An unsent transfer is never thrown away silently: clicking outside does nothing, and
 * closing with products entered asks first.
 */
export function QuickBulkTransferDialog({ open, onOpenChange, sessionKey, initialProductId }: QuickBulkTransferDialogProps) {
  const { t } = useLanguage()
  const [dirty, setDirty] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogContent
          className='flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-[min(97vw,1400px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(97vw,1400px)]'
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className='shrink-0 gap-1 border-b px-4 py-3 text-left sm:px-6'>
            <DialogTitle className='flex items-center gap-2 text-base'>
              <Layers className='size-4 text-primary' />
              {t('New stock transfer')}
            </DialogTitle>
            <DialogDescription className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <span>{t('Send one or many products to another branch in a single transfer.')}</span>
              <span className='hidden items-center gap-1 text-xs md:inline-flex'>
                <Keyboard className='size-3.5' />
                {t('Type to find a product · Enter picks it · Enter again for the next one')}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className='min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6'>
            {open && (
              <BulkTransferPanel
                key={sessionKey}
                variant='dialog'
                initialProductId={initialProductId}
                onDirtyChange={setDirty}
                onDone={() => {
                  setDirty(false)
                  onOpenChange(false)
                }}
                onCancel={requestClose}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('Discard this transfer?')}
        desc={t('The products you added have not been sent. Closing will discard them.')}
        confirmText={t('Discard')}
        cancelBtnText={t('Keep editing')}
        destructive
        handleConfirm={() => {
          setConfirmDiscard(false)
          setDirty(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}
