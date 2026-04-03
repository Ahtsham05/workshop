import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
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
      <Header>
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
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
      </Main>
    </>
  )
}
