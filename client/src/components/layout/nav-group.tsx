import { ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Badge } from '../ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { NavCollapsible, NavItem, NavLink, type NavGroup } from './types'
import { useLanguage } from '@/context/language-context'
import { NoTranslate } from '@/components/no-translate'

export function NavGroup({ title, items }: NavGroup) {
  const { state } = useSidebar()
  const { t } = useLanguage()
  const href = useLocation({ select: (location) => location.href })
  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        <NoTranslate>{title}</NoTranslate>
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const key = `${item.title}-${item.url}`
          // Use original title as is (already properly capitalized)
          const displayTitle = item.title
          
          if (!item.items)
            return <SidebarMenuLink 
              key={key} 
              item={{ ...item, title: displayTitle }} 
              href={href} 
            />

          if (state === 'collapsed')
            return (
              <SidebarMenuCollapsedDropdown 
                key={key} 
                item={{ ...item, title: displayTitle }} 
                href={href} 
              />
            )

          return <SidebarMenuCollapsible 
            key={key} 
            item={{ ...item, title: displayTitle }} 
            href={href} 
          />
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

const NavBadge = ({ children }: { children: ReactNode }) => (
  <Badge className='rounded-full px-1 py-0 text-xs'>{children}</Badge>
)

const SidebarMenuLink = ({ item, href }: { item: NavLink; href: string }) => {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
      >
        <Link className='h-12' to={item.url} onClick={() => setOpenMobile(false)}>
          {item.icon && <item.icon />}
          <NoTranslate>
            <span className='h-10 flex items-center'>{item.title}</span>
          </NoTranslate>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

const SidebarMenuCollapsible = ({
  item,
  href,
}: {
  item: NavCollapsible
  href: string
}) => {
  const { setOpenMobile } = useSidebar()
  const { t } = useLanguage()
  return (
    <Collapsible
      asChild
      defaultOpen={checkIsActive(href, item, true)}
      className='group/collapsible'
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className='h-12' tooltip={item.title}>
            {item.icon && <item.icon />}
            <NoTranslate>
              <span className='h-10 flex items-center'>{item.title}</span>
            </NoTranslate>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className='CollapsibleContent'>
          <SidebarMenuSub>
            {item.items.map((subItem) => {
              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={checkIsActive(href, subItem)}
                    className='h-12'
                  >
                    <Link to={subItem.url} onClick={() => setOpenMobile(false)}>
                      {subItem.icon && <subItem.icon />}
                      <NoTranslate>
                        <span className='h-10 flex items-center'>{subItem.title}</span>
                      </NoTranslate>
                      {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

const SidebarMenuCollapsedDropdown = ({
  item,
  href,
}: {
  item: NavCollapsible
  href: string
}) => {
  const { t } = useLanguage()
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={checkIsActive(href, item)}
          >
            {item.icon && <item.icon />}
            <NoTranslate>
              <span className='h-10 flex items-center'>{item.title}</span>
            </NoTranslate>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='right' align='start' sideOffset={4}>
          <DropdownMenuLabel>
            {item.title} {item.badge ? `(${item.badge})` : ''}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => {
            return (
              <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
                <Link
                  to={sub.url}
                  className={`${checkIsActive(href, sub) ? 'bg-secondary' : ''}`}
                >
                  {sub.icon && <sub.icon />}
                  <NoTranslate>
                    <span className='h-10 flex items-center max-w-52 text-wrap'>{sub.title}</span>
                  </NoTranslate>
                  {sub.badge && (
                    <span className='ml-auto text-xs'>{sub.badge}</span>
                  )}
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  return (
    href === item.url || // /endpint?search=param
    href.split('?')[0] === item.url || // endpoint
    !!item?.items?.filter((i) => i.url === href).length || // if child nav is active
    (mainNav &&
      href.split('/')[1] !== '' &&
      href.split('/')[1] === item?.url?.split('/')[1])
  )
}
