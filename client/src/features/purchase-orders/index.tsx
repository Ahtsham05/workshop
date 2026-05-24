import { useState } from 'react'

import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

import PurchaseOrderList from './components/purchase-order-list'
import PurchaseOrderForm from './components/purchase-order-form'
import ReceiveItemsDialog from './components/receive-items-dialog'
import PurchaseOrderDetailsDialog from './components/purchase-order-details-dialog'

import type { PurchaseOrder } from '@/stores/purchaseOrder.api'

type View = 'list' | 'form'

export default function PurchaseOrdersPage() {
  const [view, setView] = useState<View>('list')
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
    setView('list')
  }

  return (
    <>
      <Header>
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
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
          />
        )}
      </Main>

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
