import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { ExpenseReport } from '@/features/reports/components/expense-report'

function getLast30DaysRange() {
  const now = new Date()
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0),
    endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  }
}

export function ExpenseCategorySection({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const { t } = useLanguage()
  const [range, setRange] = useState(getLast30DaysRange)

  const queryStartDate = format(range.startDate, 'yyyy-MM-dd')
  const queryEndDate = format(range.endDate, 'yyyy-MM-dd')

  const applyLast30Days = () => setRange(getLast30DaysRange())

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>{t('expense_by_category')}</CardTitle>
            <CardDescription>{t('Click a category to view its details')}</CardDescription>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('start_date')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'w-[200px] justify-start text-left font-normal',
                      !range.startDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {range.startDate ? format(range.startDate, 'PPP') : t('pick_date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={range.startDate}
                    onSelect={(date) => {
                      if (!date) return
                      setRange((prev) => ({
                        ...prev,
                        startDate: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0),
                      }))
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('end_date')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'w-[200px] justify-start text-left font-normal',
                      !range.endDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {range.endDate ? format(range.endDate, 'PPP') : t('pick_date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={range.endDate}
                    onSelect={(date) => {
                      if (!date) return
                      setRange((prev) => ({
                        ...prev,
                        endDate: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
                      }))
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button variant="outline" size="sm" onClick={applyLast30Days}>
              {t('last_30_days')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ExpenseReport
          mode="categories"
          startDate={queryStartDate}
          endDate={queryEndDate}
          refreshTrigger={refreshTrigger}
        />
      </CardContent>
    </Card>
  )
}
