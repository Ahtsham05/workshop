import { useMemo, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { RestaurantShell } from '@/features/restaurant/shell'
import { useGetOrdersQuery, useGetRestaurantStatsQuery } from '@/stores/restaurant.api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useReactToPrint } from 'react-to-print'
import { EndOfDaySummary } from '@/features/restaurant/print-templates'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'

export default function RestaurantReportsPage() {
  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    error: ordersErr,
    refetch: refetchOrders,
  } = useGetOrdersQuery({ limit: 200 })
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErr,
    refetch: refetchStats,
  } = useGetRestaurantStatsQuery()
  const { data: org } = useGetMyOrganizationQuery()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: 'Day sheet' })

  const pageLoading = ordersLoading || statsLoading
  const pageError = ordersError || statsError
  const errorMessage = formatQueryError(
    ordersError ? ordersErr : statsError ? statsErr : undefined,
  )
  const showReports = !pageLoading && !pageError

  const paidToday = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return orders.filter(
      (o) =>
        o.status === 'paid' &&
        o.paidAt &&
        new Date(o.paidAt) >= start,
    )
  }, [orders])

  const revenue = paidToday.reduce((s, o) => s + (o.total || 0), 0)

  return (
    <RestaurantShell
      title='Service reports'
      description='Shift-friendly summaries — export tickets for audits or franchise packs.'
    >
      {pageError ? (
        <Alert variant='destructive' className='mb-6'>
          <AlertTriangle />
          <AlertTitle>Reports unavailable</AlertTitle>
          <AlertDescription className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <span>{errorMessage}</span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='shrink-0 border-destructive/40 bg-background'
              onClick={() => {
                void refetchOrders()
                void refetchStats()
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {pageLoading && !pageError ? (
        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <Skeleton className='h-5 w-40' />
            </CardHeader>
            <CardContent className='space-y-3'>
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-3/4' />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className='h-5 w-32' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-9 w-36' />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showReports ? (
        <>
          <div className='grid gap-4 md:grid-cols-2'>
            <Card className='border-border/80 shadow-sm'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base'>Today at a glance</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <Row label='Orders (live)' value={String(stats?.todayOrders ?? '—')} />
                <Row label='Open covers' value={String(stats?.openOrders ?? '—')} />
                <Row label='Paid revenue (API)' value={formatMoney(stats?.todayRevenue ?? 0)} />
                <Row label='Paid tickets (client roll-up)' value={String(paidToday.length)} />
                <Row label='Roll-up revenue' value={formatMoney(revenue)} />
              </CardContent>
            </Card>
            <Card className='border-border/80 shadow-sm'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base'>Print pack</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  Manager copy includes covers count and tendered revenue snapshot for the trading day.
                </p>
                <Button variant='outline' onClick={() => setTimeout(() => handlePrint(), 40)}>
                  Print day sheet
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className='mt-6 border-border/80 shadow-sm'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Recent tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b text-left text-muted-foreground'>
                      <th className='pb-2 pr-4'>#</th>
                      <th className='pb-2 pr-4'>Table</th>
                      <th className='pb-2 pr-4'>Source</th>
                      <th className='pb-2 pr-4'>Status</th>
                      <th className='pb-2'>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 40).map((o) => (
                      <tr key={o.id} className='border-b border-border/60'>
                        <td className='py-2 pr-4 font-mono text-xs'>{o.orderNumber}</td>
                        <td className='py-2 pr-4'>{o.tableLabel || '—'}</td>
                        <td className='py-2 pr-4'>{o.source}</td>
                        <td className='py-2 pr-4'>{o.status}</td>
                        <td className='py-2'>{formatMoney(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {pageLoading && !pageError ? (
        <Card className='mt-6'>
          <CardHeader>
            <Skeleton className='h-5 w-36' />
          </CardHeader>
          <CardContent>
            <Skeleton className='h-32 w-full' />
          </CardContent>
        </Card>
      ) : null}

      <div className='hidden'>
        <div ref={printRef}>
          <EndOfDaySummary
            date={new Date().toLocaleDateString()}
            totalOrders={stats?.todayOrders ?? orders.length}
            revenue={stats?.todayRevenue ?? revenue}
            venueName={org?.name || 'Restaurant'}
            invoiceNote={branchData?.invoiceNote}
          />
        </div>
      </div>
    </RestaurantShell>
  )
}

function formatQueryError(err: unknown) {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { message?: string } }).data
    if (data?.message && typeof data.message === 'string') return data.message
  }
  if (err && typeof err === 'object' && 'error' in err) {
    const e = (err as { error?: string }).error
    if (typeof e === 'string') return e
  }
  return 'Could not load restaurant data. Check your connection and try again.'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex justify-between gap-4'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-medium'>{value}</span>
    </div>
  )
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'PKR' })
}
