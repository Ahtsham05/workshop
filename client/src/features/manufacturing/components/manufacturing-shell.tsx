import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
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
 * Frame for every /manufacturing page. There is no module header or tab row: each page
 * opens on its own title, and the app sidebar's Manufacturing group is the navigation.
 * "/" still opens the module search (sections from lib/navigation.ts, orders, BOMs…).
 *
 * Every first-level page (/manufacturing/<page>) gets a "← Dashboard" link above its
 * title. Deeper pages (an order, a voucher, a new entry) already link back to their own
 * list, so they don't get a second one.
 */
export default function ManufacturingShell() {
  const { t } = useLanguage()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [searchOpen, setSearchOpen] = useState(false)
  const depth = pathname.replace(/\/+$/, '').split('/').length - 2
  const showBack = depth === 1

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

  return (
    <ConfirmProvider>
      {showBack && (
        <nav
          aria-label={t('Breadcrumb')}
          className='text-muted-foreground mb-4 flex items-center gap-1.5 text-sm'
        >
          <Link
            to={'/manufacturing' as never}
            aria-label={t('Back to manufacturing dashboard')}
            className='hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2'
          >
            <ArrowLeft className='h-3.5 w-3.5' aria-hidden />
            {t('Dashboard')}
          </Link>
        </nav>
      )}
      <Outlet />
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </ConfirmProvider>
  )
}
