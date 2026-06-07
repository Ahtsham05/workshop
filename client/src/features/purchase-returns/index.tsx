import { useState } from 'react'
import PurchaseReturnList from './components/purchase-return-list'
import PurchaseReturnForm from './components/purchase-return-form'
import type { SalesReturn } from '@/stores/returns.api'

type View = 'list' | 'create'

export default function PurchaseReturnsPage() {
  const [view, setView] = useState<View>('list')
  const [prefillSalesReturn, setPrefillSalesReturn] = useState<SalesReturn | null>(null)

  const handleConvertSalesReturn = (sr: SalesReturn) => {
    setPrefillSalesReturn(sr)
    setView('create')
  }

  const handleBack = () => {
    setPrefillSalesReturn(null)
    setView('list')
  }

  return (
    <>
{view === 'list' ? (
          <PurchaseReturnList
            onCreateNew={() => { setPrefillSalesReturn(null); setView('create') }}
            onConvertSalesReturn={handleConvertSalesReturn}
          />
        ) : (
          <PurchaseReturnForm
            onBack={handleBack}
            onSuccess={handleBack}
            prefillSalesReturn={prefillSalesReturn}
          />
        )}
    </>
  )
}
