import { Link, useNavigate } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { logout } from '@/stores/auth.slice'
import { useLanguage } from '@/context/language-context'
import toast from 'react-hot-toast'
import { useGetBranchQuery } from '@/stores/branch.api'
import { Building2 } from 'lucide-react'

export function ProfileDropdown() {
  const user = useSelector((state: any) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { t } = useLanguage()
  
  const logoutHandler = async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    await dispatch(logout({refreshToken})).then(()=>{
      toast.success(t('logout_success'))
      navigate({ 
        to: '/sign-in', 
        search: { redirect: "/" },
        replace: true 
      })
    })
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
          <Avatar className='h-8 w-8'>
            <AvatarImage src='/avatars/01.png' alt='@shadcn' />
            <AvatarFallback>SN</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' forceMount>
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
        ) : (
          <>
            <DropdownMenuLabel className='font-normal'>
              <div className='flex flex-col space-y-1'>
                <p className='text-sm leading-none font-medium'>{user?.name}</p>
                <p className='text-muted-foreground text-xs leading-none'>
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to='/settings'>
              {t('profile')}
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/settings'>
              {t('billing')}
              <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/settings'>
              {t('settings')}
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>{t('new_team')}</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logoutHandler}>
          {t('log_out')}
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
