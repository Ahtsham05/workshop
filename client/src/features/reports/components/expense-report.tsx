import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGetExpenseReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface ExpenseReportProps {
  startDate: string
  endDate: string
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export const ExpenseReport = forwardRef<{ exportToExcel: () => void }, ExpenseReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetExpenseReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.categoryBreakdown || data.categoryBreakdown.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = data.categoryBreakdown.map((item) => ({
            [t('category')]: item._id,
            [t('count')]: item.expenseCount,
            [t('total_amount')]: item.totalAmount,
            [t('percentage')]: `${((item.totalAmount / (data.summary?.totalExpenses || 1)) * 100).toFixed(2)}%`,
          }))

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Expense Report')
          XLSX.writeFile(wb, `expense-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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

  const chartData = data?.categoryBreakdown?.map(item => ({
    name: item._id,
    value: item.totalAmount
  })) || []

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('total_expenses')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalExpenses || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('expense_count')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{data?.summary?.expenseCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('avg_expense')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.avgExpense || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('expense_by_category')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width='100%' height={400}>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                labelLine={false}
                label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                outerRadius={120}
                fill='#8884d8'
                dataKey='value'
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
)