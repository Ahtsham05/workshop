import { Header } from '@/components/layout/header'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
import { WhatsAppHeaderButton } from '@/components/whatsapp/whatsapp-header-button'
import { SyncStatusBadge } from '@/components/layout/sync-status-badge'
import { BranchIndicator } from '@/components/layout/branch-indicator'
import { HeaderClock } from '@/components/layout/header-clock'
import { ScreenCaptureButton } from '@/components/layout/screen-capture-button'

type AuthenticatedHeaderProps = {
  showSearch?: boolean
}

export function AuthenticatedHeader({ showSearch = true }: AuthenticatedHeaderProps) {
  return (
    // @container/header: the clock and camera size themselves against the header's own width (not the
    // viewport), because the sidebar opening/closing changes the room by 256px at the same viewport.
    <Header fixed className='@container/header'>
      <BranchIndicator />
      <HeaderClock />
      <div className='ml-auto flex items-center space-x-4'>
        <SyncStatusBadge />
        {/* Hidden on phones so the branch name gets the room (sm = 640px) */}
        {showSearch ? <Search className='hidden sm:inline-flex' /> : null}
        <WhatsAppHeaderButton className='hidden sm:inline-flex' />
        <ScreenCaptureButton className='hidden @min-[880px]/header:inline-flex' />
        <LanguageSwitch className='hidden sm:inline-flex' />
        <ThemeSwitch />
        <ProfileDropdown />
      </div>
    </Header>
  )
}
