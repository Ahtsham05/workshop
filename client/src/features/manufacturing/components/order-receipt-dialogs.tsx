import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  useGetProductionOrderQuery,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { ReceiptPrefill } from '../lib/use-finished-goods-receipt'
import { InspectOutputDialog } from './execution-dialogs'
import { ReceiveFinishedGoodsDialog } from './receive-finished-goods-dialog'
import { ReverseOutputDialog } from './reverse-output-dialog'

export type OrderReceiptAction =
  | { kind: 'receive'; orderId: string }
  | { kind: 'inspect'; orderId: string; output: ProductionOutput }
  | { kind: 'reverse'; orderId: string; output: ProductionOutput }

/**
 * The finished-goods dialogs a production order page offers — receive, inspect, reverse —
 * opened from anywhere that only knows the order id (the Finished Goods page): loads the
 * order, then shows the very same dialog. Reversing can go straight on to receiving again,
 * and units sent to QC can be inspected right after, as on the order page.
 */
export function OrderReceiptDialogs({
  action,
  onClose,
  onInspect,
}: {
  action: OrderReceiptAction
  onClose: () => void
  /**
   * "Inspect now" on the success toast of units sent to QC. The toast outlives this
   * dialog, so the caller (which stays mounted) opens the inspection.
   */
  onInspect?: (output: ProductionOutput) => void
}) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  // Receiving again straight after a reversal (with the reversed receipt's packs).
  const [receiveAgain, setReceiveAgain] = useState<ReceiptPrefill | null>(null)
  const { data: order, refetch } = useGetProductionOrderQuery(action.orderId)
  // The reverse dialog closes itself just before it asks to receive again — hold the
  // close one tick so "Reverse & receive again" can keep this host open.
  const receivingAgain = useRef(false)

  if (!order) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className='flex items-center justify-center gap-2 py-10 sm:max-w-sm'>
          <DialogTitle className='sr-only'>{t('Loading')}</DialogTitle>
          <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
          <span className='text-muted-foreground text-sm'>
            {t('Loading order…')}
          </span>
        </DialogContent>
      </Dialog>
    )
  }

  if (receiveAgain || action.kind === 'receive') {
    return (
      <ReceiveFinishedGoodsDialog
        order={order}
        prefill={receiveAgain || undefined}
        onClose={onClose}
        onInspect={hasPermission('inspectProduction') ? onInspect : undefined}
      />
    )
  }
  if (action.kind === 'inspect') {
    return (
      <InspectOutputDialog
        order={order}
        output={action.output}
        onClose={onClose}
      />
    )
  }
  return (
    <ReverseOutputDialog
      order={order}
      output={action.output}
      canReopen={hasPermission('manageProductionOrders')}
      onClose={() =>
        queueMicrotask(() => {
          if (!receivingAgain.current) onClose()
        })
      }
      onReceiveAgain={async (prefill) => {
        receivingAgain.current = true
        // Receive on the reopened order, with its WIP restored and the packs filled in.
        await refetch()
        setReceiveAgain(prefill)
      }}
    />
  )
}
