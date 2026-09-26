import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { useGetBillingSummaryQuery } from '@/stores/billing.api'
import ContentSection from '../components/content-section'
import { PaymentHistory } from './payment-history'
import { PlanGrid } from './plan-grid'
import { StatusCard } from './status-card'

/** After Polar redirects back, the webhook may land a few seconds later — poll briefly. */
function useCheckoutReturn(refetch: () => void) {
  const handled = useRef(false)
  useEffect(() => {
    if (handled.current) return
    const params = new URLSearchParams(window.location.search)
    const result = params.get('checkout')
    if (!result) return
    handled.current = true
    params.delete('checkout')
    params.delete('checkout_id')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)

    if (result === 'canceled') {
      toast('Checkout canceled — nothing was charged.')
      return
    }
    toast.success('Payment received. Activating your plan…')
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      refetch()
      if (tries >= 6) window.clearInterval(timer)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [refetch])
}

export default function SettingsBilling() {
  const { data: summary, isLoading, isError, refetch } = useGetBillingSummaryQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  })
  useCheckoutReturn(refetch)

  return (
    <ContentSection title='Billing & plan' desc='Your plan, what it includes, how much of it you use, and how you pay.'>
      {/* w-0 + min-w-full: fill the panel but contribute no min-content width, so the payment
          history table scrolls inside its card instead of stretching the settings panel past
          the screen on phones (the panel is a flex item with min-width:auto). */}
      <div className='w-0 min-w-full space-y-6 pb-6'>
        {isLoading && (
          <div className='space-y-4'>
            <Skeleton className='h-40 w-full' />
            <Skeleton className='h-64 w-full' />
          </div>
        )}
        {isError && <p className='text-destructive text-sm'>Could not load billing details. Please refresh.</p>}
        {summary && (
          <>
            <StatusCard summary={summary} />
            <PlanGrid key={`${summary.routing.country}-${summary.hasCardSubscription}`} summary={summary} />
            {summary.isOwner && summary.routing.allowed.includes('manual') && <PaymentHistory />}
          </>
        )}
      </div>
    </ContentSection>
  )
}
