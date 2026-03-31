import { ReactNode } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { LanguageSwitch } from '@/components/language-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

interface MobilePageShellProps {
  title: string
  description: string
  children: ReactNode
}

export function MobilePageShell({ title, description, children }: MobilePageShellProps) {
  return (
    <>
      <Header>
        <div className='ml-auto flex items-center space-x-4'>
          <Search />
          <LanguageSwitch />
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-6'>
          <h1 className='text-3xl font-bold tracking-tight'>{title}</h1>
          <p className='text-muted-foreground'>{description}</p>
        </div>
        {children}
      </Main>
    </>
  )
}