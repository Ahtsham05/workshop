import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

import PurchaseOrderList from './components/purchase-order-list'
import PurchaseOrderForm from './components/purchase-order-form'
import ReceiveItemsDialog from './components/receive-items-dialog'
import PurchaseOrderDetailsDialog from './components/purchase-order-details-dialog'

import type { PurchaseOrder } from '@/stores/purchaseOrder.api'

type View = 'list' | 'form'

export default function PurchaseOrdersPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as {
    prefillItems?: { productId: string; variantId?: string; quantity: number }[]
    supplierId?: string
  }
  const hasPrefill = Boolean(search.prefillItems && search.prefillItems.length > 0)

  const [view, setView] = useState<View>(hasPrefill ? 'form' : 'list')
  const [editing, setEditing] = useState<PurchaseOrder | null>(null)
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null)

  const handleCreate = () => {
    setEditing(null)
    setView('form')
  }

  const handleEdit = (po: PurchaseOrder) => {
    setEditing(po)
    setView('form')
  }

  const handleBackToList = () => {
    setEditing(null)
    // Drop prefillItems from the URL once we leave the form so a refresh/back doesn't re-apply them.
    navigate({ to: '/purchase-orders', search: {}, replace: true })
    setView('list')
  }

  return (
    <>
{view === 'list' ? (
          <PurchaseOrderList
            onCreate={handleCreate}
            onEdit={handleEdit}
            onView={(po) => setViewing(po)}
            onReceive={(po) => setReceiving(po)}
          />
        ) : (
          <PurchaseOrderForm
            onBack={handleBackToList}
            onSaved={handleBackToList}
            editing={editing}
            prefillItems={hasPrefill ? search.prefillItems : undefined}
            prefillSupplierId={hasPrefill ? search.supplierId : undefined}
          />
        )}

      <ReceiveItemsDialog
        open={!!receiving}
        order={receiving}
        onClose={() => setReceiving(null)}
        onReceived={() => setReceiving(null)}
      />

      <PurchaseOrderDetailsDialog
        open={!!viewing}
        order={viewing}
        onClose={() => setViewing(null)}
      />
    </>
  )
}
