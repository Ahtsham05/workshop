import { Header } from '@/components/layout/header'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'

type AuthenticatedHeaderProps = {
  showSearch?: boolean
}

export function AuthenticatedHeader({ showSearch = true }: AuthenticatedHeaderProps) {
  return (
    <Header fixed>
      <div className='ml-auto flex items-center space-x-4'>
        {showSearch ? <Search /> : null}
        <LanguageSwitch />
        <ThemeSwitch />
        <ProfileDropdown />
      </div>
    </Header>
  )
}
