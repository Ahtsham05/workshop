import { useState } from 'react'
import { usePermissions } from '@/context/permission-context'
import PurchaseReturnList from './components/purchase-return-list'
import PurchaseReturnForm from './components/purchase-return-form'
import type { SalesReturn } from '@/stores/returns.api'

type View = 'list' | 'create'

export default function PurchaseReturnsPage() {
  // Create-only roles get just the form (see sales-returns/index.tsx).
  const canViewList = usePermissions().hasExplicitPermission('viewPurchaseReturns')
  const [view, setView] = useState<View>(canViewList ? 'list' : 'create')
  const [formKey, setFormKey] = useState(0)
  const [prefillSalesReturn, setPrefillSalesReturn] = useState<SalesReturn | null>(null)

  const handleConvertSalesReturn = (sr: SalesReturn) => {
    setPrefillSalesReturn(sr)
    setView('create')
  }

  const handleBack = () => {
    setPrefillSalesReturn(null)
    if (canViewList) setView('list')
    else setFormKey((k) => k + 1)
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
            key={formKey}
            onBack={handleBack}
            onSuccess={handleBack}
            prefillSalesReturn={prefillSalesReturn}
          />
        )}
    </>
  )
}
