import { useState } from 'react'
import { usePermissions } from '@/context/permission-context'
import SalesReturnList from './components/sales-return-list'
import SalesReturnForm from './components/sales-return-form'

type View = 'list' | 'create'

export default function SalesReturnsPage() {
  // A role that may create returns but not see the list just gets the form; finishing or
  // cancelling starts a fresh one instead of going back to a list it can't load.
  const canViewList = usePermissions().hasExplicitPermission('viewSalesReturns')
  const [view, setView] = useState<View>(canViewList ? 'list' : 'create')
  const [formKey, setFormKey] = useState(0)
  const done = () => (canViewList ? setView('list') : setFormKey((k) => k + 1))

  return (
    <>
{view === 'list' ? (
          <SalesReturnList onCreateNew={() => setView('create')} />
        ) : (
          <SalesReturnForm key={formKey} onBack={done} onSuccess={done} />
        )}
    </>
  )
}
