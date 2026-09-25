import { Link } from '@tanstack/react-router'
import {
  ChevronsUpDown,
  LogOut,
  Settings,
  UserRound,
} from 'lucide-react'
import { CurrentUserAvatar } from '@/components/user-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useSelector } from 'react-redux'
import { useLanguage } from '@/context/language-context'
import { useLogout } from '@/hooks/use-logout'

export function NavUser() {
  const auth = useSelector((state: any) => state.auth?.data?.user)
  const { isMobile } = useSidebar()
  const { t } = useLanguage()
  const { logout: handleLogout } = useLogout()

  const logoutHandler = () => {
    void handleLogout()
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <CurrentUserAvatar className='h-8 w-8 rounded-lg' fallbackClassName='rounded-lg' />
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-semibold'>{auth?.name}</span>
                <span className='truncate text-xs text-sidebar-foreground/65'>
                  {auth?.email}
                </span>
              </div>
              <ChevronsUpDown className='ml-auto size-4' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='sidebar-popover-theme w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            side={isMobile ? 'bottom' : 'right'}
            align='end'
            sideOffset={4}
          >
            <DropdownMenuLabel className='p-0 font-normal'>
              <div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
                <CurrentUserAvatar className='h-8 w-8 rounded-lg' fallbackClassName='rounded-lg' />
                <div className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-semibold'>{auth?.name}</span>
                  <span className='truncate text-xs'>{auth?.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to='/profile'>
                  <UserRound className='mr-2 h-4 w-4' />
                  My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to='/settings'>
                  <Settings className='mr-2 h-4 w-4' />
                  {t('settings') || 'Settings'}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                logoutHandler()
              }}
            >
              <LogOut />
              {t('log_out') || 'Log out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
