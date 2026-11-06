import { Link } from '@tanstack/react-router'
import { CurrentUserAvatar } from '@/components/user-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useLanguage } from '@/context/language-context'
import toast from 'react-hot-toast'
import { useGetBranchQuery } from '@/stores/branch.api'
import { Building2, Download, Mail, Phone, Settings, UserRound } from 'lucide-react'
import { WhatsAppLogo } from '@/components/support/whatsapp-logo'
import { useSupportContext } from '@/hooks/use-support-context'
import { SUPPORT, supportMailUrl, supportTelUrl, supportWhatsAppUrl } from '@/config/support'
import { usePWAInstall } from '@/hooks/use-pwa-install'
import { useLogout } from '@/hooks/use-logout'

export function ProfileDropdown({
  shortcuts,
}: {
  /** Header shortcuts hidden for lack of room (HeaderShortcutsMenu), listed here instead. */
  shortcuts?: React.ReactNode
} = {}) {
  const user = useSelector((state: any) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { t } = useLanguage()
  const { isInstallable, install } = usePWAInstall()
  const { logout: safeLogout } = useLogout()
  const supportCtx = useSupportContext()

  const logoutHandler = () => {
    void safeLogout()
  }

  const handleInstallApp = async () => {
    try {
      await install()
      toast.success('App installed! You can now access it from your home screen.')
    } catch {
      toast.error('Installation failed. Try again or use "Add to home screen".')
    }
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='relative h-8 w-8 rounded-full'
          aria-label={user?.name ? `Account: ${user.name}` : 'Account'}
        >
          <CurrentUserAvatar />
        </Button>
      </DropdownMenuTrigger>
      {/* data-html2canvas-ignore: the menu never shows in a screenshot taken from it. */}
      <DropdownMenuContent className='sidebar-popover-theme w-56' align='end' forceMount data-html2canvas-ignore>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex items-center gap-2'>
            <CurrentUserAvatar className='h-9 w-9' />
            <div className='grid min-w-0 flex-1 leading-tight'>
              <span className='truncate text-sm font-medium'>{user?.name}</span>
              <span className='text-muted-foreground truncate text-xs'>{user?.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branch ? (
          <>
            <DropdownMenuLabel className='font-normal'>
              <div className='flex flex-col space-y-1'>
                <div className='flex items-center gap-2'>
                  <Building2 className='h-3 w-3' />
                  <p className='text-sm leading-none font-medium'>{branch.name}</p>
                </div>
                {branch.email && (
                  <p className='text-muted-foreground text-xs leading-none'>
                    {branch.email}
                  </p>
                )}
                {branch.phone && (
                  <p className='text-muted-foreground text-xs leading-none'>
                    {branch.phone}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to='/profile'>
              <UserRound className='mr-2 h-4 w-4' />
              <span>My profile</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/settings'>
              <Settings className='mr-2 h-4 w-4' />
              {t('settings') || 'Settings'}
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          {isInstallable && (
            <DropdownMenuItem onClick={handleInstallApp}>
              <Download className='mr-2 h-4 w-4' />
              <span>Install App</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {/* Help & Support — every width (the header's Help button is hidden on phones). */}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className='text-muted-foreground px-2 py-1 text-xs font-normal'>
          Help &amp; Support
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <a href={supportWhatsAppUrl(supportCtx)} target='_blank' rel='noopener noreferrer'>
              <WhatsAppLogo className='mr-2 h-4 w-4 text-[#25D366]' />
              <span>WhatsApp support</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={supportTelUrl()}>
              <Phone className='mr-2 h-4 w-4' />
              <span>Call {SUPPORT.phoneDisplay}</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={supportMailUrl(supportCtx)}>
              <Mail className='mr-2 h-4 w-4' />
              <span className='truncate'>{SUPPORT.email}</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {shortcuts}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            logoutHandler()
          }}
        >
          {t('log_out')}
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
