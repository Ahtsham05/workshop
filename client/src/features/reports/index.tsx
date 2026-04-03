import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Download, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { SalesReport } from './components/sales-report'
import { PurchaseReport } from './components/purchase-report'
import { ProductReport } from './components/product-report'
import { CustomerReport } from './components/customer-report'
import { SupplierReport } from './components/supplier-report'
import { ExpenseReport } from './components/expense-report'
import { ProfitLossReport } from './components/profit-loss-report'
import { InventoryReport } from './components/inventory-report'
import { TaxReport } from './components/tax-report'
import { SalesReturnsReport } from './components/sales-returns-report'
import { PurchaseReturnsReport } from './components/purchase-returns-report'
import { LoadReport } from './components/load-report'
import { RepairReport } from './components/repair-report'
import { BillPaymentReport } from './components/bill-payment-report'
import { RoiReport } from './components/roi-report'

export default function ReportsPage() {
  const { t } = useLanguage()
  const now = new Date()
  const [startDate, setStartDate] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0))
  const [endDate, setEndDate] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999))
  const [activeTab, setActiveTab] = useState('sales')
  const exportRef = useRef<{ exportToExcel: () => void }>(null)

  const handleRefresh = () => {
    window.location.reload()
  }

  const handleExport = () => {
    if (exportRef.current?.exportToExcel) {
      exportRef.current.exportToExcel()
    } else {
      toast.error(t('Export not available'))
    }
  }

  return (
    <div className='space-y-6 p-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('reports')}</h1>
          <p className='text-muted-foreground'>{t('reports_description')}</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={handleRefresh}>
            <RefreshCw className='mr-2 h-4 w-4' />
            {t('refresh')}
          </Button>
          <Button variant='outline' size='sm' onClick={handleExport}>
            <Download className='mr-2 h-4 w-4' />
            {t('export')}
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle>{t('date_range')}</CardTitle>
          <CardDescription>{t('select_date_range_for_reports')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex  flex-col sm:flex-row gap-4 items-center'>
            <div className='flex flex-col gap-2'>
              <label className='text-sm font-medium'>{t('start_date')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'w-[240px] justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {startDate ? format(startDate, 'PPP') : <span>{t('pick_date')}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className='flex flex-col gap-2'>
              <label className='text-sm font-medium'>{t('end_date')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'w-[240px] justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {endDate ? format(endDate, 'PPP') : <span>{t('pick_date')}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className='flex gap-2 mt-7'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  const now = new Date()
                  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
                  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
                  setStartDate(startOfDay)
                  setEndDate(endOfDay)
                }}
              >
                {t('today')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  const now = new Date()
                  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
                  const startOfLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0)
                  setStartDate(startOfLastWeek)
                  setEndDate(endOfDay)
                }}
              >
                {t('last_7_days')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  const now = new Date()
                  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
                  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0)
                  setStartDate(startOfLastMonth)
                  setEndDate(endOfDay)
                }}
              >
                {t('last_30_days')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className='overflow-x-auto pb-1'>
          <TabsList className='inline-flex h-auto flex-wrap gap-1 rounded-lg bg-muted p-1 min-w-full sm:min-w-0'>
            <TabsTrigger value='sales' className='text-xs sm:text-sm px-2 sm:px-3'>{t('sales')}</TabsTrigger>
            <TabsTrigger value='purchases' className='text-xs sm:text-sm px-2 sm:px-3'>{t('purchases')}</TabsTrigger>
            <TabsTrigger value='products' className='text-xs sm:text-sm px-2 sm:px-3'>{t('products')}</TabsTrigger>
            <TabsTrigger value='customers' className='text-xs sm:text-sm px-2 sm:px-3'>{t('customers')}</TabsTrigger>
            <TabsTrigger value='suppliers' className='text-xs sm:text-sm px-2 sm:px-3'>{t('suppliers')}</TabsTrigger>
            <TabsTrigger value='expenses' className='text-xs sm:text-sm px-2 sm:px-3'>{t('expenses')}</TabsTrigger>
            <TabsTrigger value='profit-loss' className='text-xs sm:text-sm px-2 sm:px-3'>{t('profit_loss')}</TabsTrigger>
            <TabsTrigger value='inventory' className='text-xs sm:text-sm px-2 sm:px-3'>{t('inventory')}</TabsTrigger>
            <TabsTrigger value='tax' className='text-xs sm:text-sm px-2 sm:px-3'>{t('tax')}</TabsTrigger>
            <TabsTrigger value='sales-returns' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Sales Returns')}</TabsTrigger>
            <TabsTrigger value='purchase-returns' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Purchase Returns')}</TabsTrigger>
            <TabsTrigger value='load' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Load')}</TabsTrigger>
            <TabsTrigger value='repair' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Repairing')}</TabsTrigger>
            <TabsTrigger value='bill-payments' className='text-xs sm:text-sm px-2 sm:px-3'>Bill Payments</TabsTrigger>
            <TabsTrigger value='roi' className='text-xs sm:text-sm px-2 sm:px-3'>ROI</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='sales' className='mt-6'>
          <SalesReport ref={activeTab === 'sales' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='purchases' className='mt-6'>
          <PurchaseReport ref={activeTab === 'purchases' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='products' className='mt-6'>
          <ProductReport ref={activeTab === 'products' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='customers' className='mt-6'>
          <CustomerReport ref={activeTab === 'customers' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='suppliers' className='mt-6'>
          <SupplierReport ref={activeTab === 'suppliers' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='expenses' className='mt-6'>
          <ExpenseReport ref={activeTab === 'expenses' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='profit-loss' className='mt-6'>
          <ProfitLossReport ref={activeTab === 'profit-loss' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='inventory' className='mt-6'>
          <InventoryReport ref={activeTab === 'inventory' ? exportRef : null} />
        </TabsContent>

        <TabsContent value='tax' className='mt-6'>
          <TaxReport ref={activeTab === 'tax' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='sales-returns' className='mt-6'>
          <SalesReturnsReport ref={activeTab === 'sales-returns' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='purchase-returns' className='mt-6'>
          <PurchaseReturnsReport ref={activeTab === 'purchase-returns' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='load' className='mt-6'>
          <LoadReport ref={activeTab === 'load' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='repair' className='mt-6'>
          <RepairReport ref={activeTab === 'repair' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='bill-payments' className='mt-6'>
          <BillPaymentReport ref={activeTab === 'bill-payments' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>

        <TabsContent value='roi' className='mt-6'>
          <RoiReport ref={activeTab === 'roi' ? exportRef : null} startDate={startDate.toISOString()} endDate={endDate.toISOString()} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
