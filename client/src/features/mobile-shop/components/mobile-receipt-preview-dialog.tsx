import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { MobileReceiptData } from '@/features/mobile-shop/components/mobile-shop-receipt'
import { printMobileShopReceipt } from '@/features/mobile-shop/utils/mobile-shop-print-utils'
import type { Organization } from '@/stores/organization.api'

type MobileReceiptPreviewDialogProps = {
  receipt: MobileReceiptData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  organization?: Organization | null
  invoiceNote?: string | null
}

export function MobileReceiptPreviewDialog({
  receipt,
  open,
  onOpenChange,
  organization,
  invoiceNote,
}: MobileReceiptPreviewDialogProps) {
  const handlePrint = () => {
    if (!receipt) return
    printMobileShopReceipt(receipt, organization, invoiceNote)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{receipt?.title ?? 'Receipt preview'}</DialogTitle>
        </DialogHeader>
        {receipt ? (
          <div className='space-y-3 rounded-md border bg-muted/20 p-4 text-sm'>
            {receipt.reference ? (
              <div className='flex justify-between gap-4'>
                <span className='text-muted-foreground'>Reference</span>
                <span className='font-medium'>{receipt.reference}</span>
              </div>
            ) : null}
            {receipt.issuedAt ? (
              <div className='flex justify-between gap-4'>
                <span className='text-muted-foreground'>Date</span>
                <span>{receipt.issuedAt}</span>
              </div>
            ) : null}
            {receipt.subtitle ? (
              <p className='text-muted-foreground border-b pb-2'>{receipt.subtitle}</p>
            ) : null}
            <div className='space-y-2'>
              <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Printed for customer</p>
              {receipt.lines
                .filter((line) => !line.previewOnly)
                .map((line) => (
                  <div key={line.label} className='flex justify-between gap-4 border-b border-dashed pb-1 last:border-0'>
                    <span className='text-muted-foreground'>{line.label}</span>
                    <span className='max-w-[60%] text-right font-medium'>{line.value}</span>
                  </div>
                ))}
            </div>
            {receipt.lines.some((line) => line.previewOnly) ? (
              <div className='space-y-2 border-t pt-3'>
                <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                  Internal (preview only — not printed)
                </p>
                {receipt.lines
                  .filter((line) => line.previewOnly)
                  .map((line) => (
                    <div key={line.label} className='flex justify-between gap-4 border-b border-dashed pb-1 last:border-0 text-muted-foreground'>
                      <span>{line.label}</span>
                      <span className='max-w-[60%] text-right'>{line.value}</span>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type='button' onClick={handlePrint} disabled={!receipt}>
            <Printer className='mr-2 h-4 w-4' />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
