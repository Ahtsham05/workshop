import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
// import { Badge } from '@/components/ui/badge'
import { Users, TrendingUp, Phone } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetTopCustomersQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDistanceToNow } from 'date-fns'

export function TopCustomers() {
  const { t } = useLanguage()
  const { data: topCustomers, isLoading } = useGetTopCustomersQuery({ limit: 5 })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-4 w-48 mt-2' />
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className='h-16 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5 text-blue-500' />
          {t('Top Customers')}
        </CardTitle>
        <CardDescription>{t('Most valuable customers this month')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {topCustomers && topCustomers.length > 0 ? (
            topCustomers.map((customer) => (
              <div
                key={customer.id}
                className='flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors'
              >
                <div className='flex items-center gap-3'>
                  <div className='flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white font-bold text-sm'>
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-medium truncate'>{customer.name}</p>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      {customer.phone && (
                        <>
                          <Phone className='h-3 w-3' />
                          <span>{customer.phone}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className='text-right'>
                  <p className='text-sm font-semibold'>Rs{customer.totalAmount.toLocaleString()}</p>
                  <p className='text-xs text-muted-foreground'>
                    {customer.totalPurchases} {t('purchases')}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {formatDistanceToNow(new Date(customer.lastPurchase), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className='text-center py-8'>
              <Users className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
              <p className='text-sm text-muted-foreground'>{t('No customer data available')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
