import { Header } from '@/components/layout/header'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
import { WhatsAppHeaderButton } from '@/components/whatsapp/whatsapp-header-button'
import { SyncStatusBadge } from '@/components/layout/sync-status-badge'

type AuthenticatedHeaderProps = {
  showSearch?: boolean
}

export function AuthenticatedHeader({ showSearch = true }: AuthenticatedHeaderProps) {
  return (
    <Header fixed>
      <div className='ml-auto flex items-center space-x-4'>
        <SyncStatusBadge />
        {showSearch ? <Search /> : null}
        <WhatsAppHeaderButton />
        <LanguageSwitch />
        <ThemeSwitch />
        <ProfileDropdown />
      </div>
    </Header>
  )
}
