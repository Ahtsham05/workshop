import { useState, useRef, useEffect } from 'react'
import { useSearch } from '@tanstack/react-router'
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
import { useFeatureAccess } from '@/hooks/use-feature-access'
import { LockedFeatureCard } from '@/components/locked-feature-card'
import { getPlanLabel } from '@/lib/feature-access'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { normalizeBusinessType } from '@/lib/business-types'
import { SalesReport } from './components/sales-report'
import { PurchaseReport } from './components/purchase-report'
import { ProductReport } from './components/product-report'
import { CustomerReport } from './components/customer-report'
import { SupplierReport } from './components/supplier-report'
import { ExpenseReport } from './components/expense-report'
import { ProfitLossReport } from './components/profit-loss-report'
import { InventoryReport } from './components/inventory-report'
import { BatchExpiryReport } from './components/batch-expiry-report'
import { TaxReport } from './components/tax-report'
import { SalesReturnsReport } from './components/sales-returns-report'
import { PurchaseReturnsReport } from './components/purchase-returns-report'
import { LoadReport } from './components/load-report'
import { RepairReport } from './components/repair-report'
import { ServiceReport } from './components/service-report'
import { BillPaymentReport } from './components/bill-payment-report'
import { AgentBillReport } from './components/agent-bill-report'
import { AGENT_BILL_EMAIL } from '../mobile-shop/bill-payments'
import { RoiReport } from './components/roi-report'
import { SimSaleReport } from './components/sim-sale-report'
import { InstallmentReport } from './components/installment-report'
import { MyWalletReport } from './components/my-wallet-report'
import { ActivitySummaryReport } from './components/activity-summary-report'
import { SalesPurchaseSummaryReport } from './components/sales-purchase-summary-report'
import { CompleteReport } from './components/complete-report'

export default function ReportsPage() {
  const { t } = useLanguage()
  const search = useSearch({ from: '/_authenticated/reports' })
  const { canAccess, planType } = useFeatureAccess()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const isMobileShop = normalizeBusinessType(org?.businessType || user?.businessType) === 'mobile_shop'
  const now = new Date()

  const parseSearchDate = (value: string | undefined, endOfDay: boolean) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const [year, month, day] = value.split('-').map(Number)
    return endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0)
  }

  const [startDate, setStartDate] = useState<Date>(() => {
    return (
      parseSearchDate(search.startDate, false) ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0)
    )
  })
  const [endDate, setEndDate] = useState<Date>(() => {
    return (
      parseSearchDate(search.endDate, true) ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    )
  })
  const [activeTab, setActiveTab] = useState(search.tab || 'sales')
  const exportRef = useRef<{ exportToExcel: () => void }>(null)
  const queryStartDate = format(startDate, 'yyyy-MM-dd')
  const queryEndDate = format(endDate, 'yyyy-MM-dd')

  useEffect(() => {
    if (search.tab) setActiveTab(search.tab)
    const nextStart = parseSearchDate(search.startDate, false)
    const nextEnd = parseSearchDate(search.endDate, true)
    if (nextStart) setStartDate(nextStart)
    if (nextEnd) setEndDate(nextEnd)
  }, [search.tab, search.startDate, search.endDate])

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
    <div className='space-y-6 p-6 min-w-0 max-w-full'>
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
                    onSelect={(date) => {
                      if (!date) return
                      setStartDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0))
                    }}
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
                    onSelect={(date) => {
                      if (!date) return
                      setEndDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999))
                    }}
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
            <TabsTrigger value='activities' className='text-xs sm:text-sm px-2 sm:px-3'>Activities</TabsTrigger>
            <TabsTrigger value='summary' className='text-xs sm:text-sm px-2 sm:px-3'>Summary</TabsTrigger>
            {isMobileShop && (
              <TabsTrigger value='complete' className='text-xs sm:text-sm px-2 sm:px-3'>Final Report</TabsTrigger>
            )}
            <TabsTrigger value='sales' className='text-xs sm:text-sm px-2 sm:px-3'>{t('sales')}</TabsTrigger>
            <TabsTrigger value='purchases' className='text-xs sm:text-sm px-2 sm:px-3'>{t('purchases')}</TabsTrigger>
            <TabsTrigger value='products' className='text-xs sm:text-sm px-2 sm:px-3'>{t('products')}</TabsTrigger>
            <TabsTrigger value='customers' className='text-xs sm:text-sm px-2 sm:px-3'>{t('customers')}</TabsTrigger>
            <TabsTrigger value='suppliers' className='text-xs sm:text-sm px-2 sm:px-3'>{t('suppliers')}</TabsTrigger>
            <TabsTrigger value='expenses' className='text-xs sm:text-sm px-2 sm:px-3'>{t('expenses')}</TabsTrigger>
            <TabsTrigger value='inventory' className='text-xs sm:text-sm px-2 sm:px-3'>{t('inventory')}</TabsTrigger>
            <TabsTrigger value='batch-expiry' className='text-xs sm:text-sm px-2 sm:px-3'>Batch &amp; Expiry</TabsTrigger>
            <TabsTrigger value='tax' className='text-xs sm:text-sm px-2 sm:px-3'>{t('tax')}</TabsTrigger>
            <TabsTrigger value='sales-returns' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Sales Returns')}</TabsTrigger>
            <TabsTrigger value='purchase-returns' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Purchase Returns')}</TabsTrigger>
            {isMobileShop && canAccess('load') && (
              <TabsTrigger value='load' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Load')}</TabsTrigger>
            )}
            {canAccess('wallet') && (
              <TabsTrigger value='my-wallet' className='text-xs sm:text-sm px-2 sm:px-3'>Wallets</TabsTrigger>
            )}
            {isMobileShop && canAccess('repair') && (
              <TabsTrigger value='repair' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Repairing')}</TabsTrigger>
            )}
            {isMobileShop && (
              <TabsTrigger value='services' className='text-xs sm:text-sm px-2 sm:px-3'>Services</TabsTrigger>
            )}
            {isMobileShop && canAccess('bill_payment') && (
              <TabsTrigger value='bill-payments' className='text-xs sm:text-sm px-2 sm:px-3'>Bill Payments</TabsTrigger>
            )}
            {isMobileShop && user?.email === AGENT_BILL_EMAIL && (
              <TabsTrigger value='agent-bills' className='text-xs sm:text-sm px-2 sm:px-3'>Agent Bills</TabsTrigger>
            )}
            {canAccess('profit_loss') && (
              <TabsTrigger value='profit-loss' className='text-xs sm:text-sm px-2 sm:px-3'>{t('profit_loss')}</TabsTrigger>
            )}
            {canAccess('roi') && (
              <TabsTrigger value='roi' className='text-xs sm:text-sm px-2 sm:px-3'>ROI</TabsTrigger>
            )}
            {isMobileShop && (
              <TabsTrigger value='sim-sale' className='text-xs sm:text-sm px-2 sm:px-3'>Sim Sale</TabsTrigger>
            )}
            {isMobileShop && (
              <TabsTrigger value='installments' className='text-xs sm:text-sm px-2 sm:px-3'>Installments</TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value='activities' className='mt-6'>
          <SalesPurchaseSummaryReport ref={activeTab === 'activities' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='summary' className='mt-6'>
          <ActivitySummaryReport ref={activeTab === 'summary' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        {isMobileShop && (
          <TabsContent value='complete' className='mt-6'>
            <CompleteReport ref={activeTab === 'complete' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        <TabsContent value='sales' className='mt-6'>
          <SalesReport ref={activeTab === 'sales' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='purchases' className='mt-6'>
          <PurchaseReport ref={activeTab === 'purchases' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='products' className='mt-6'>
          <ProductReport ref={activeTab === 'products' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='customers' className='mt-6'>
          <CustomerReport ref={activeTab === 'customers' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='suppliers' className='mt-6'>
          <SupplierReport ref={activeTab === 'suppliers' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='expenses' className='mt-6'>
          <ExpenseReport ref={activeTab === 'expenses' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='profit-loss' className='mt-6'>
          {canAccess('profit_loss')
            ? <ProfitLossReport ref={activeTab === 'profit-loss' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
            : <LockedFeatureCard featureName='Profit & Loss Report' currentPlan={getPlanLabel(planType)} />}
        </TabsContent>

        <TabsContent value='inventory' className='mt-6'>
          <InventoryReport ref={activeTab === 'inventory' ? exportRef : null} />
        </TabsContent>

        <TabsContent value='batch-expiry' className='mt-6'>
          <BatchExpiryReport ref={activeTab === 'batch-expiry' ? exportRef : null} />
        </TabsContent>

        <TabsContent value='tax' className='mt-6'>
          <TaxReport ref={activeTab === 'tax' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='sales-returns' className='mt-6'>
          <SalesReturnsReport ref={activeTab === 'sales-returns' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        <TabsContent value='purchase-returns' className='mt-6'>
          <PurchaseReturnsReport ref={activeTab === 'purchase-returns' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
        </TabsContent>

        {isMobileShop && (
          <TabsContent value='load' className='mt-6'>
            {canAccess('load')
              ? <LoadReport ref={activeTab === 'load' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='Load Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        <TabsContent value='my-wallet' className='mt-6'>
          {canAccess('wallet')
            ? <MyWalletReport ref={activeTab === 'my-wallet' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
            : <LockedFeatureCard featureName='My Wallet Report' currentPlan={getPlanLabel(planType)} />}
        </TabsContent>

        {isMobileShop && (
          <TabsContent value='repair' className='mt-6'>
            {canAccess('repair')
              ? <RepairReport ref={activeTab === 'repair' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='Repair Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        {isMobileShop && (
          <TabsContent value='services' className='mt-6'>
            <ServiceReport ref={activeTab === 'services' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && (
          <TabsContent value='bill-payments' className='mt-6'>
            {canAccess('bill_payment')
              ? <BillPaymentReport ref={activeTab === 'bill-payments' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='Bill Payments Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        {isMobileShop && user?.email === AGENT_BILL_EMAIL && (
          <TabsContent value='agent-bills' className='mt-6'>
            <AgentBillReport ref={activeTab === 'agent-bills' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        <TabsContent value='roi' className='mt-6'>
          {canAccess('roi')
            ? <RoiReport ref={activeTab === 'roi' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
            : <LockedFeatureCard featureName='ROI Report' currentPlan={getPlanLabel(planType)} />}
        </TabsContent>

        {isMobileShop && (
          <TabsContent value='sim-sale' className='mt-6'>
            <SimSaleReport ref={activeTab === 'sim-sale' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && (
          <TabsContent value='installments' className='mt-6'>
            <InstallmentReport ref={activeTab === 'installments' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
