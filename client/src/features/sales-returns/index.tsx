import { useState } from 'react'
import SalesReturnList from './components/sales-return-list'
import SalesReturnForm from './components/sales-return-form'

type View = 'list' | 'create'

export default function SalesReturnsPage() {
  const [view, setView] = useState<View>('list')

  return (
    <>
{view === 'list' ? (
          <SalesReturnList onCreateNew={() => setView('create')} />
        ) : (
          <SalesReturnForm onBack={() => setView('list')} onSuccess={() => setView('list')} />
        )}
    </>
  )
}
