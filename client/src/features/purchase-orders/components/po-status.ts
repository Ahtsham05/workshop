import type { PurchaseOrderStatus } from '@/stores/purchaseOrder.api'

// Badge colours + labels for a purchase order's status — shared by the list and the form.
export const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  sent: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  partial: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  completed: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  cancelled: 'bg-rose-100 text-rose-700 hover:bg-rose-100',
}

export const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
