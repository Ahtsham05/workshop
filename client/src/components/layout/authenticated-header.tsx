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
import { NotepadButton } from '@/components/layout/notepad-button'
import { CalculatorButton } from '@/components/layout/calculator-button'
import { ChatHeaderButton } from '@/components/layout/chat-header-button'
import { BackgroundTasksIndicator } from '@/components/layout/background-tasks-indicator'
import { QuickTransferButton } from '@/components/layout/quick-transfer-button'
import { HeaderShortcutsMenu } from '@/components/layout/header-shortcuts-menu'
import { useScreenCapture } from '@/hooks/use-screen-capture'

type AuthenticatedHeaderProps = {
  showSearch?: boolean
}

export function AuthenticatedHeader({ showSearch = true }: AuthenticatedHeaderProps) {
  // One screen-capture state (it owns global keyboard shortcuts): the camera button and the
  // profile menu's screenshot / record rows both use it.
  const capture = useScreenCapture()
  return (
    // @container/header: the clock and camera size themselves against the header's own width (not the
    // viewport), because the sidebar opening/closing changes the room by 256px at the same viewport.
    <Header fixed className='@container/header'>
      <BranchIndicator />
      <HeaderClock />
      <div className='ml-auto flex items-center space-x-4'>
        <SyncStatusBadge />
        {/* Only visible while something is finishing in the background (or just finished). */}
        <BackgroundTasksIndicator />
        {/* Hidden on phones so the branch name gets the room (sm = 640px) */}
        {showSearch ? <Search className='hidden sm:inline-flex' /> : null}
        <WhatsAppHeaderButton className='hidden sm:inline-flex' />
        {/* Always visible, phones included — jotting something down is the one tool
            you never want to hunt for in a menu. */}
        {/* Team chat with its unread count — phones included, a message from another branch is never hunted for. */}
        <ChatHeaderButton />
        <NotepadButton />
        {/* Business calculator (also Ctrl+Alt+C). On phones it is in the profile menu. */}
        <CalculatorButton className='hidden sm:inline-flex' />
        {/* Stock Transfer from any screen, without leaving it (also Ctrl+Alt+S). From 640px
            up only: on phones it would squeeze out the branch name — there it is in the
            profile menu, the dashboard's quick links and each product's menu. */}
        <QuickTransferButton className='hidden sm:inline-flex' />
        <ScreenCaptureButton capture={capture} className='hidden @min-[880px]/header:inline-flex' />
        <LanguageSwitch className='hidden sm:inline-flex' />
        <ThemeSwitch />
        {/* Whatever the header hides for room shows in the profile menu instead. */}
        <ProfileDropdown shortcuts={<HeaderShortcutsMenu capture={capture} />} />
      </div>
    </Header>
  )
}
