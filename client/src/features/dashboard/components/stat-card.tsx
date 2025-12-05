import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface StatCardProps {
  title: string
  value: string | number
  change?: number
  icon: React.ReactNode
  trend?: 'up' | 'down'
  description?: string
  isLoading?: boolean
  valuePrefix?: string
  valueSuffix?: string
}

export function StatCard({
  title,
  value,
  change,
  icon,
  trend,
  description,
  isLoading,
  valuePrefix = '',
  valueSuffix = '',
}: StatCardProps) {
  const isPositive = trend === 'up' || (change !== undefined && change >= 0)
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            <Skeleton className='h-4 w-24' />
          </CardTitle>
          <Skeleton className='h-4 w-4 rounded' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-8 w-32 mb-2' />
          <Skeleton className='h-3 w-40' />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='hover:shadow-md transition-shadow'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <div className='text-muted-foreground'>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>
          {valuePrefix}{typeof value === 'number' ? value.toLocaleString() : value}{valueSuffix}
        </div>
        {(change !== undefined || description) && (
          <div className='flex items-center gap-2 text-xs text-muted-foreground mt-1'>
            {change !== undefined && (
              <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? (
                  <TrendingUp className='h-3 w-3' />
                ) : (
                  <TrendingDown className='h-3 w-3' />
                )}
                <span className='font-medium'>
                  {Math.abs(change).toFixed(1)}%
                </span>
              </div>
            )}
            {description && <span>{description}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
