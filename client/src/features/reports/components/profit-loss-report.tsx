import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGetProfitLossReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface ProfitLossReportProps {
  startDate: string
  endDate: string
}

export const ProfitLossReport = forwardRef<{ exportToExcel: () => void }, ProfitLossReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetProfitLossReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = [
            { [t('category')]: t('revenue_section'), [t('amount')]: '' },
            { [t('category')]: t('total_revenue'), [t('amount')]: data.revenue?.totalRevenue || 0 },
            { [t('category')]: t('cost_of_goods_sold'), [t('amount')]: -(data.revenue?.costOfGoodsSold || 0) },
            { [t('category')]: t('gross_profit'), [t('amount')]: data.revenue?.grossProfit || 0 },
            { [t('category')]: '', [t('amount')]: '' },
            { [t('category')]: t('expenses_section'), [t('amount')]: '' },
            { [t('category')]: t('total_expenses'), [t('amount')]: -(data.expenses?.totalExpenses || 0) },
            { [t('category')]: '', [t('amount')]: '' },
            { [t('category')]: t('net_profit'), [t('amount')]: data.netProfit?.amount || 0 },
          ]

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'P&L Report')
          XLSX.writeFile(wb, `profit-loss-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }))

  if (isLoading) return <Skeleton className='h-[400px] w-full' />

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

  const isProfit = (data?.netProfit?.amount || 0) >= 0

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('revenue_section')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex justify-between items-center'>
            <span className='text-lg font-medium'>{t('total_revenue')}</span>
            <span className='text-2xl font-bold'>{formatCurrency(data?.revenue?.totalRevenue || 0)}</span>
          </div>
          <div className='flex justify-between items-center'>
            <span className='text-muted-foreground'>{t('cost_of_goods_sold')}</span>
            <span className='text-lg'>- {formatCurrency(data?.revenue?.costOfGoodsSold || 0)}</span>
          </div>
          <div className='border-t pt-4'>
            <div className='flex justify-between items-center'>
              <span className='text-lg font-medium'>{t('gross_profit')}</span>
              <span className='text-2xl font-bold text-green-600'>
                {formatCurrency(data?.revenue?.grossProfit || 0)}
              </span>
            </div>
            <div className='text-sm text-muted-foreground mt-1 text-right'>
              {t('margin')}: {data?.revenue?.grossProfitMargin?.toFixed(2) || 0}%
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('expenses_section')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex justify-between items-center'>
            <span className='text-lg font-medium'>{t('total_expenses')}</span>
            <span className='text-2xl font-bold text-red-600'>
              {formatCurrency(data?.expenses?.totalExpenses || 0)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className={isProfit ? 'border-green-500' : 'border-red-500'}>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            {isProfit ? (
              <TrendingUp className='h-5 w-5 text-green-500' />
            ) : (
              <TrendingDown className='h-5 w-5 text-red-500' />
            )}
            {t('net_profit_loss')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex justify-between items-center'>
            <span className='text-2xl font-bold'>{t('net_profit')}</span>
            <span className={`text-3xl font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data?.netProfit?.amount || 0)}
            </span>
          </div>
          <div className='text-sm text-muted-foreground mt-2 text-right'>
            {t('net_margin')}: {data?.netProfit?.margin?.toFixed(2) || 0}%
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
)