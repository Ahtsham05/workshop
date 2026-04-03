import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import SalesReturnList from './components/sales-return-list'
import SalesReturnForm from './components/sales-return-form'

type View = 'list' | 'create'

export default function SalesReturnsPage() {
  const [view, setView] = useState<View>('list')

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
          <SalesReturnList onCreateNew={() => setView('create')} />
        ) : (
          <SalesReturnForm onBack={() => setView('list')} onSuccess={() => setView('list')} />
        )}
      </Main>
    </>
  )
}
