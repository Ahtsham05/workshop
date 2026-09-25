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
import { Building2, Download, Settings, UserRound } from 'lucide-react'
import { usePWAInstall } from '@/hooks/use-pwa-install'
import { useLogout } from '@/hooks/use-logout'

export function ProfileDropdown() {
  const user = useSelector((state: any) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { t } = useLanguage()
  const { isInstallable, install } = usePWAInstall()
  const { logout: safeLogout } = useLogout()

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
      <DropdownMenuContent className='sidebar-popover-theme w-56' align='end' forceMount>
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
