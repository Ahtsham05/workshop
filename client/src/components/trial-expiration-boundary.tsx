import { useEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { AlertTriangle, Lock } from 'lucide-react'
import { useGetBillingSummaryQuery, type BillingSummary } from '@/stores/billing.api'
import { isElectronApp } from '@/lib/sync/electron'

/** Height reserved for the trial/subscription top banner (sidebar + main content offset). */
export const APP_TOP_BANNER_HEIGHT = '4.5rem'

interface TrialExpirationBoundaryProps {
  children: React.ReactNode
}

const fmt = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' }).format(new Date(value))
    : ''

type Banner = { tone: 'danger' | 'warning'; title: string; body: string; cta: string }

/**
 * Which banner (if any) the account state calls for. A lapsed plan is NEVER a lockout:
 * the whole app stays usable for viewing and exporting, the server refuses new records
 * with a clear message, and this banner explains why and links to renewal.
 */
function bannerFor(s: BillingSummary): Banner | null {
  const planName = s.plan.key === 'trial' ? 'free trial' : `${s.plan.name} plan`
  if (s.mode === 'readOnly') {
    return {
      tone: 'danger',
      title: `Your ${planName} has ended — the account is read-only`,
      body: 'You can still view and export all your data. Renew to create invoices and records again.',
      cta: 'Renew now',
    }
  }
  if (s.status === 'gracePeriod' || s.status === 'pastDue') {
    return {
      tone: 'warning',
      title: s.status === 'pastDue' ? 'Your card payment failed' : `Your ${planName} period has ended`,
      body: `Everything keeps working until ${fmt(s.graceEndsAt)}, then the account becomes read-only.`,
      cta: s.status === 'pastDue' ? 'Update payment' : 'Renew now',
    }
  }
  // Card subscriptions renew themselves; only warn when nothing will renew automatically.
  const willNotRenew = s.status === 'trialing' || s.status === 'canceled' || s.paymentSource === 'manual'
  if (willNotRenew && s.daysRemaining != null && s.daysRemaining > 0 && s.daysRemaining <= 7) {
    return {
      tone: 'warning',
      title: `Your ${planName} ends in ${s.daysRemaining} day${s.daysRemaining === 1 ? '' : 's'}`,
      body: `It ends on ${fmt(s.currentPeriodEnd)}. ${s.status === 'trialing' ? 'Choose a plan' : 'Renew'} to avoid interruption.`,
      cta: s.status === 'trialing' ? 'Choose a plan' : 'Renew now',
    }
  }
  return null
}

/**
 * Publish the banner's real height as --app-top-banner-height (the sidebar and header offset
 * themselves by it). Measured rather than fixed: on a phone the text wraps to several lines
 * and a constant height would let the banner cover the app header.
 */
function useAppTopBannerOffset(active: boolean, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = document.documentElement
    const el = ref.current
    if (!active || !el) {
      root.style.removeProperty('--app-top-banner-height')
      return
    }
    const apply = () => root.style.setProperty('--app-top-banner-height', `${el.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-top-banner-height')
    }
  }, [active, ref])
}

export function TrialExpirationBoundary({ children }: TrialExpirationBoundaryProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  const skip = offline || (isElectronApp() && localStorage.getItem('offlineMode') === 'true')
  const { data: summary } = useGetBillingSummaryQuery(undefined, {
    skip,
    // Re-check now and then so a banner appears/disappears without a reload.
    pollingInterval: 15 * 60 * 1000,
    refetchOnFocus: true,
  })

  const banner = !skip && summary ? bannerFor(summary) : null
  // The billing page shows the same information in full — no need for the banner there.
  const show = Boolean(banner) && !pathname.startsWith('/settings/billing')
  const bannerRef = useRef<HTMLDivElement>(null)
  useAppTopBannerOffset(show, bannerRef)

  if (!show || !banner) return <div>{children}</div>

  const danger = banner.tone === 'danger'
  return (
    <div className='min-h-svh'>
      <div
        ref={bannerRef}
        role='alert'
        className={`fixed inset-x-0 top-0 z-[60] flex w-full items-start gap-3 border-b px-4 py-3 ${
          danger ? 'border-red-500 bg-red-950' : 'border-amber-500 bg-amber-950'
        }`}
      >
        {danger ? (
          <Lock className='mt-0.5 h-5 w-5 shrink-0 text-red-400' />
        ) : (
          <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-500' />
        )}
        <div className='min-w-0 flex-1'>
          <p className={`text-sm font-semibold ${danger ? 'text-red-100' : 'text-amber-100'}`}>{banner.title}</p>
          <p className={`mt-1 text-xs ${danger ? 'text-red-50' : 'text-amber-50'}`}>
            {banner.body}{' '}
            <Link to='/settings/billing' className='font-semibold whitespace-nowrap underline hover:text-white'>
              {banner.cta}
            </Link>
          </p>
        </div>
      </div>
      <div className='min-h-svh' style={{ paddingTop: 'var(--app-top-banner-height, 0px)' }}>
        {children}
      </div>
    </div>
  )
}
