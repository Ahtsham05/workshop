import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { FileText, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetRecentActivitiesQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'

export function RecentActivities() {
  const { t } = useLanguage()
  const { data: activities, isLoading } = useGetRecentActivitiesQuery({ limit: 8 })

  const getIcon = (type: string) => {
    switch (type) {
      case 'invoice':
        return <FileText className='h-4 w-4' />
      case 'purchase':
        return <ShoppingCart className='h-4 w-4' />
      case 'payment':
        return <DollarSign className='h-4 w-4' />
      default:
        return <TrendingUp className='h-4 w-4' />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
        return 'default'
      case 'pending':
        return 'secondary'
      case 'cancelled':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  if (isLoading) {
    return (
      <Card className='col-span-1 lg:col-span-4'>
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
    <Card className='col-span-1 lg:col-span-4'>
      <CardHeader>
        <CardTitle>{t('Recent Activities')}</CardTitle>
        <CardDescription>{t('Latest transactions and updates')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {activities && activities.length > 0 ? (
            activities.map((activity) => (
              <div
                key={activity.id}
                className='flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors'
              >
                <div className='flex items-center gap-3'>
                  <div className='flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary'>
                    {getIcon(activity.type)}
                  </div>
                  <div>
                    <p className='text-sm font-medium'>{activity.description}</p>
                    <p className='text-xs text-muted-foreground'>
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-semibold'>
                    Rs{activity.amount.toLocaleString()}
                  </span>
                  <Badge variant={getStatusColor(activity.status)} className='text-xs'>
                    {t(activity.status)}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <div className='text-center py-8'>
              <FileText className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
              <p className='text-sm text-muted-foreground'>{t('No recent activities')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
