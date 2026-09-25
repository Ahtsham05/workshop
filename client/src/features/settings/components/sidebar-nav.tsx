import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { IconSearch } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SettingsNavLink {
  href: string
  title: string
  icon: JSX.Element
}

export interface SettingsNavGroup {
  /** Section heading, e.g. "Business". */
  label: string
  items: SettingsNavLink[]
}

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  groups: SettingsNavGroup[]
}

const ACTIVE_ATTR = 'data-settings-active'

function linkClasses(isActive: boolean) {
  return cn(
    'relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-muted text-foreground font-medium'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
  )
}

/**
 * Settings navigation. Twenty-odd pages is too many for one flat list, so they are
 * grouped by what they are about, with a filter for going straight to one by name.
 *
 * Three shapes, one source of truth:
 *  - phone: a select (groups become optgroup labels)
 *  - tablet: one horizontal strip, groups separated by a rule
 *  - desktop: the grouped column
 */
export default function SidebarNav({ className, groups, ...props }: SidebarNavProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [val, setVal] = useState(pathname ?? '/settings')
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // The tablet strip scrolls sideways and the desktop column scrolls down, so the page
  // you are actually on can start out off-screen. Bring it into view.
  useEffect(() => {
    const active = rootRef.current?.querySelector(`[${ACTIVE_ATTR}='true']`)
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest', inline: 'center' })
    }
  }, [pathname])

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.title.toLowerCase().includes(needle) ||
            group.label.toLowerCase().includes(needle)
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, query])

  const handleSelect = (href: string) => {
    setVal(href)
    navigate({ to: href })
  }

  return (
    <div ref={rootRef} className='contents'>
      {/* Phone */}
      <div className='p-1 md:hidden'>
        <Select value={val} onValueChange={handleSelect}>
          <SelectTrigger className='h-12 sm:w-48'>
            <SelectValue placeholder='Settings' />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.href} value={item.href}>
                    <div className='flex gap-x-4 px-2 py-1'>
                      <span className='scale-125'>{item.icon}</span>
                      <span className='text-md'>{item.title}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tablet: one scrolling strip — headings would cost more room than they buy here */}
      <nav
        className='hidden w-full items-center gap-1 overflow-x-auto pt-1 pb-2 md:flex lg:hidden'
        aria-label='Settings sections'
      >
        {groups.map((group, index) => (
          <div key={group.label} className='flex items-center gap-1'>
            {index > 0 && <span className='bg-border mx-1 h-5 w-px shrink-0' aria-hidden />}
            {group.items.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                {...{ [ACTIVE_ATTR]: String(pathname === item.href) }}
                className={cn(linkClasses(pathname === item.href), 'w-auto shrink-0 whitespace-nowrap')}
              >
                {item.icon}
                {item.title}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Desktop: the grouped column */}
      <div className='hidden h-full min-h-0 flex-col lg:flex'>
        <div className='relative shrink-0 px-1 pb-3'>
          <IconSearch
            size={15}
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2'
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search settings…'
            aria-label='Search settings'
            className='h-9 pl-8'
          />
        </div>

        <nav
          className={cn('min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-4', className)}
          aria-label='Settings sections'
          {...props}
        >
          {filteredGroups.map((group) => (
            <div key={group.label} className='space-y-1'>
              <p className='text-muted-foreground px-3 text-xs font-semibold tracking-wider uppercase'>
                {group.label}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  {...{ [ACTIVE_ATTR]: String(pathname === item.href) }}
                  className={linkClasses(pathname === item.href)}
                >
                  {item.icon}
                  <span className='truncate'>{item.title}</span>
                </Link>
              ))}
            </div>
          ))}

          {filteredGroups.length === 0 && (
            <p className='text-muted-foreground px-3 py-6 text-sm'>
              No settings match “{query.trim()}”.
            </p>
          )}
        </nav>
      </div>
    </div>
  )
}
