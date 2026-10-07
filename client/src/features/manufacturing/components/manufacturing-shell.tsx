import { useEffect, useState } from 'react'
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import {
  ChevronDown,
  ClipboardList,
  Component,
  Factory,
  FileStack,
  Plus,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NAV_GROUPS, isSectionActive, type NavGroup } from '../lib/navigation'
import { CommandSearch } from './command-search'
import { ConfirmProvider } from './confirm-provider'

/** True when focus is in a field, so single-key shortcuts don't hijack typing. */
const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

/**
 * Module frame for every /manufacturing page: module identity, search and create on one
 * line, then two-level navigation — a short row of groups (plan → make → store → trace)
 * and the active group's sections. Everything stays reachable at every width; nothing
 * relies on a sideways scroll hiding half the menu.
 */
export default function ManufacturingShell() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const branchName = useBranchName()
  const { hasPermission } = usePermissions()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [searchOpen, setSearchOpen] = useState(false)

  const groups: NavGroup[] = NAV_GROUPS.map((g) => ({
    ...g,
    sections: g.sections.filter(
      (s) => !s.permission || hasPermission(s.permission)
    ),
  })).filter((g) => g.sections.length > 0)
  const activeGroup =
    groups.find((g) => g.sections.some((s) => isSectionActive(pathname, s))) ||
    groups[0]

  // "/" opens search from anywhere in the module (⌘K stays the app-wide palette).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      e.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const canOrders = hasPermission('manageProductionOrders')
  const canBoms = hasPermission('manageBoms')

  return (
    <ConfirmProvider>
      <div className='space-y-6 max-sm:space-y-5'>
        <header className='space-y-3'>
          <div className='flex items-center gap-3'>
            <div className='bg-muted text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border'>
              <Factory className='h-[18px] w-[18px]' aria-hidden />
            </div>
            <div className='min-w-0 flex-1'>
              <h1 className='truncate text-lg leading-tight font-semibold tracking-tight'>
                {t('Manufacturing')}
              </h1>
              {branchName && (
                <p className='text-muted-foreground truncate text-xs'>
                  {branchName}
                </p>
              )}
            </div>
            <Button
              variant='outline'
              onClick={() => setSearchOpen(true)}
              className='text-muted-foreground h-9 justify-start gap-2 font-normal max-sm:w-9 max-sm:justify-center max-sm:px-0 sm:w-64'
              aria-label={t('Search manufacturing')}
            >
              <Search className='h-4 w-4' />
              <span className='max-sm:hidden'>{t('Search…')}</span>
              <kbd className='bg-muted ml-auto rounded border px-1.5 font-mono text-[10px] max-sm:hidden'>
                /
              </kbd>
            </Button>
            {(canOrders || canBoms) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className='h-9 gap-1.5 max-sm:w-9 max-sm:px-0'>
                    <Plus className='h-4 w-4' />
                    <span className='max-sm:sr-only'>{t('New')}</span>
                    <ChevronDown className='h-3.5 w-3.5 opacity-70 max-sm:hidden' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-56'>
                  {canOrders && (
                    <DropdownMenuItem
                      onSelect={() =>
                        navigate({
                          to: '/manufacturing/production-orders' as never,
                          search: { new: true } as never,
                        })
                      }
                    >
                      <ClipboardList className='mr-2 h-4 w-4' />
                      {t('Production order')}
                    </DropdownMenuItem>
                  )}
                  {canOrders && (
                    <DropdownMenuItem
                      onSelect={() =>
                        navigate({
                          to: '/manufacturing/assembly-orders' as never,
                          search: { new: true } as never,
                        })
                      }
                    >
                      <Component className='mr-2 h-4 w-4' />
                      {t('Assembly order')}
                    </DropdownMenuItem>
                  )}
                  {canBoms && (
                    <DropdownMenuItem
                      onSelect={() =>
                        navigate({
                          to: '/manufacturing/boms' as never,
                          search: { new: true } as never,
                        })
                      }
                    >
                      <FileStack className='mr-2 h-4 w-4' />
                      {t('Bill of materials')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <nav aria-label={t('Manufacturing')} className='space-y-3'>
            <div className='border-b'>
              <ul className='-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none] max-sm:gap-4'>
                {groups.map((g) => {
                  const active = g.id === activeGroup?.id
                  return (
                    <li key={g.id} className='shrink-0'>
                      <Link
                        to={g.sections[0].to as never}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'focus-visible:ring-ring inline-flex h-10 items-center border-b-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                          active
                            ? 'border-foreground text-foreground'
                            : 'text-muted-foreground hover:text-foreground border-transparent'
                        )}
                      >
                        {t(g.label)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
            {activeGroup && activeGroup.sections.length > 1 && (
              <ul className='-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0'>
                {activeGroup.sections.map((s) => {
                  const active = isSectionActive(pathname, s)
                  const Icon = s.icon
                  return (
                    <li key={s.to} className='shrink-0'>
                      <Link
                        to={s.to as never}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 max-sm:h-9',
                          active
                            ? 'bg-muted text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                      >
                        <Icon className='h-3.5 w-3.5' aria-hidden />
                        {t(s.label)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </nav>
        </header>

        <Outlet />
      </div>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </ConfirmProvider>
  )
}
