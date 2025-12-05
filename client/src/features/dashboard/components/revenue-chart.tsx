import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useState } from 'react'
import { useLanguage } from '@/context/language-context'
import { useGetRevenueDataQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'

export function RevenueChart() {
  const { t } = useLanguage()
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week')
  const { data: revenueData, isLoading } = useGetRevenueDataQuery({ period })

  if (isLoading) {
    return (
      <Card className='col-span-1 lg:col-span-4'>
        <CardHeader>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-4 w-48 mt-2' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[350px] w-full' />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='col-span-1 lg:col-span-4'>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle>{t('revenue_overview')}</CardTitle>
            <CardDescription>{t('revenue_chart_description')}</CardDescription>
          </div>
          <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
            <SelectTrigger className='w-[120px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='day'>{t('Today')}</SelectItem>
              <SelectItem value='week'>{t('This Week')}</SelectItem>
              <SelectItem value='month'>{t('This Month')}</SelectItem>
              <SelectItem value='year'>{t('This Year')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className='pl-2'>
        <ResponsiveContainer width='100%' height={350}>
          <BarChart data={revenueData}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis 
              dataKey='date' 
              stroke='#888888'
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke='#888888'
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `Rs${value}`}
            />
            <Tooltip 
              formatter={(value: any) => `Rs${value.toLocaleString()}`}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Legend />
            <Bar 
              dataKey='revenue' 
              fill='#3b82f6' 
              radius={[8, 8, 0, 0]}
              name={t('Revenue')}
            />
            <Bar 
              dataKey='profit' 
              fill='#10b981' 
              radius={[8, 8, 0, 0]}
              name={t('Profit')}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
