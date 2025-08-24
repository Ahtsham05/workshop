import React from 'react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { setUser } from '../../stores/auth.slice'
import { useNavigate } from '@tanstack/react-router'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { fetchAllProducts } from '@/stores/product.slice'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import { fetchAllCutomers } from '@/stores/customer.slice'
import { fetchAllAccounts } from '@/stores/account.slice'

interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  fixed?: boolean
  ref?: React.Ref<HTMLElement>
}

export const Header = ({
  className,
  fixed,
  children,
  ...props
}: HeaderProps) => {
  const [offset, setOffset] = React.useState(0)
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const { state, isMobile } = useSidebar()

  React.useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    const user = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')
    if(user){
      dispatch(setUser({
        user,
        tokens: {
          accessToken,
          refreshToken
        }
      }))
      dispatch(fetchAllProducts({}))
      dispatch(fetchAllSuppliers({}))
      dispatch(fetchAllCutomers({}))
      dispatch(fetchAllAccounts({}))
      
    }else{
      navigate({
        to: "/sign-in", 
        search: { redirect: "/" },
        replace: true
      })
    }
    // Add scroll listener to the body
    document.addEventListener('scroll', onScroll, { passive: true })
    // Clean up the event listener on unmount
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  // Calculate sidebar width based on state
  const getSidebarWidth = () => {
    if (isMobile) return 0 // On mobile, sidebar doesn't affect header width
    return state === 'expanded' ? 256 : 0 // 16rem = 256px when expanded, 0 when collapsed
  }

  return (
    <header
      className={cn(
        'bg-background/95 flex h-16 items-center gap-3 p-4 sm:gap-4 border-b transition-all duration-200',
        fixed && 'header-fixed peer/header fixed top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        offset > 10 && fixed ? 'shadow-sm' : 'shadow-none',
        className
      )}
      {...props}
      style={{
        left: fixed ? `${getSidebarWidth()}px` : 'auto',
        width: fixed ? `calc(100% - ${getSidebarWidth()}px)` : 'auto'
      }}
    >
      <SidebarTrigger variant='outline' className='scale-125 sm:scale-100' />
      <Separator orientation='vertical' className='h-6' />
      {children}
    </header>
  )
}

Header.displayName = 'Header'
