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
import { usePermissions } from '@/context/permission-context'
import type { PermissionKey } from '@/lib/permission-registry'
import { SalesReport } from './components/sales-report'
import { PurchaseReport } from './components/purchase-report'
import { LedgerReport } from './components/ledger-report'
import { ProductReport } from './components/product-report'
import { CustomerReport } from './components/customer-report'
import { AgingReport } from './components/aging-report'
import { SupplierAgingReport } from './components/supplier-aging-report'
import { SupplierReport } from './components/supplier-report'
import { ExpenseReport } from './components/expense-report'
import { ProfitLossReport } from './components/profit-loss-report'
import { InventoryReport } from './components/inventory-report'
import { BatchExpiryReport } from './components/batch-expiry-report'
import { StockAdjustmentReport } from './components/stock-adjustment-report'
import { StockTransferReport } from './components/stock-transfer-report'
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
import { MobilePhoneReport } from './components/mobile-phone-report'
import { DailySalesSummaryReport } from './components/daily-sales-summary-report'
import { SalesmanCommissionReport } from './components/salesman-commission-report'
import { PartnerProfitShareReport } from './components/partner-profit-share-report'
import { BankPositionReport } from './components/bank-position-report'

// Maps a report tab to the granular RBAC permission that unlocks it. Tabs not
// listed here (broad summaries that mix several report domains, e.g. Activities,
// Final Report, Sale & Purchase) stay gated behind the general 'viewReports' key.
const REPORT_TAB_PERMISSIONS: Partial<Record<string, PermissionKey>> = {
  sales: 'viewSalesReports',
  'sales-returns': 'viewSalesReports',
  purchases: 'viewPurchaseReports',
  'purchase-returns': 'viewPurchaseReports',
  products: 'viewProductReports',
  customers: 'viewCustomerReports',
  aging: 'viewCustomerReports',
  suppliers: 'viewSupplierReports',
  'supplier-aging': 'viewSupplierReports',
  expenses: 'viewExpenseReports',
  stock: 'viewInventoryReports',
  'batch-expiry': 'viewInventoryReports',
  'stock-adjustments': 'viewInventoryReports',
  'stock-transfers': 'viewInventoryReports',
  load: 'viewLoadReports',
  'my-wallet': 'viewWalletReports',
  'bank-position': 'viewWalletReports',
  repair: 'viewRepairReports',
  services: 'viewServiceReports',
  'profit-loss': 'viewProfitLossReports',
  roi: 'viewProfitLossReports',
  'sim-sale': 'viewSimSaleReports',
  installments: 'viewInstallmentReports',
}

// Tabs shown only for mobile_shop organizations, mirrored from the `isMobileShop &&`
// guards on each TabsTrigger/TabsContent below.
const MOBILE_SHOP_ONLY_TABS = new Set([
  'daily-summary', 'complete', 'load', 'repair', 'services',
  'bill-payments', 'agent-bills', 'sim-sale', 'installments', 'mobile-phones',
])

// Display order, matching the TabsList below — used to pick a sensible default tab.
const TAB_ORDER = [
  'activities', 'summary', 'daily-summary', 'complete', 'sales', 'purchases', 'ledger',
  'salesman-commission', 'partner-profit-share', 'products', 'customers', 'aging',
  'suppliers', 'supplier-aging', 'expenses', 'stock', 'batch-expiry', 'stock-adjustments',
  'stock-transfers', 'tax', 'sales-returns', 'purchase-returns', 'load', 'my-wallet',
  'bank-position', 'repair', 'services', 'bill-payments', 'agent-bills', 'profit-loss',
  'roi', 'sim-sale', 'installments', 'mobile-phones',
]

export default function ReportsPage() {
  const { t } = useLanguage()
  const search = useSearch({ from: '/_authenticated/reports' })
  const { canAccess, planType } = useFeatureAccess()
  const { hasPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const isMobileShop = normalizeBusinessType(org?.businessType || user?.businessType) === 'mobile_shop'
  const now = new Date()

  // RBAC gate — independent of the subscription-plan gate (`canAccess`) applied per-tab below.
  const isTabVisible = (tab: string): boolean => {
    if (MOBILE_SHOP_ONLY_TABS.has(tab) && !isMobileShop) return false
    if (tab === 'agent-bills' && user?.email !== AGENT_BILL_EMAIL) return false
    return hasPermission(REPORT_TAB_PERMISSIONS[tab] ?? 'viewReports')
  }

  const defaultTab = TAB_ORDER.find(isTabVisible) ?? 'sales'

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
  const [activeTab, setActiveTab] = useState(
    search.tab && isTabVisible(search.tab) ? search.tab : defaultTab
  )
  const exportRef = useRef<{ exportToExcel: () => void }>(null)
  const queryStartDate = format(startDate, 'yyyy-MM-dd')
  const queryEndDate = format(endDate, 'yyyy-MM-dd')

  useEffect(() => {
    if (search.tab) setActiveTab(isTabVisible(search.tab) ? search.tab : defaultTab)
    const nextStart = parseSearchDate(search.startDate, false)
    const nextEnd = parseSearchDate(search.endDate, true)
    if (nextStart) setStartDate(nextStart)
    if (nextEnd) setEndDate(nextEnd)
    // isTabVisible/defaultTab intentionally excluded — they're recomputed fresh every
    // render (not memoized), so including them would re-fire this effect on every
    // render and re-create the startDate/endDate objects, causing a render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {/* capitalize: several tab labels come from shared i18n keys (t('sales'),
              t('purchases'), etc.) whose dictionary values are lowercase elsewhere in
              the app — rather than touch those shared keys, which are used well beyond
              this tab bar, a CSS transform on the shared TabsList inherits to every
              TabsTrigger below it and normalizes them here only. */}
          <TabsList className='inline-flex h-auto flex-wrap gap-1 rounded-lg bg-muted p-1 min-w-full capitalize sm:min-w-0'>
            {isTabVisible('activities') && (
              <TabsTrigger value='activities' className='text-xs sm:text-sm px-2 sm:px-3'>Activities</TabsTrigger>
            )}
            {isTabVisible('summary') && (
              <TabsTrigger value='summary' className='text-xs sm:text-sm px-2 sm:px-3'>Summary</TabsTrigger>
            )}
            {isMobileShop && isTabVisible('daily-summary') && (
              <TabsTrigger value='daily-summary' className='text-xs sm:text-sm px-2 sm:px-3'>Daily Summary</TabsTrigger>
            )}
            {isMobileShop && isTabVisible('complete') && (
              <TabsTrigger value='complete' className='text-xs sm:text-sm px-2 sm:px-3'>Final Report</TabsTrigger>
            )}
            {isTabVisible('sales') && (
              <TabsTrigger value='sales' className='text-xs sm:text-sm px-2 sm:px-3'>{t('sales')}</TabsTrigger>
            )}
            {isTabVisible('purchases') && (
              <TabsTrigger value='purchases' className='text-xs sm:text-sm px-2 sm:px-3'>{t('purchases')}</TabsTrigger>
            )}
            {isTabVisible('ledger') && (
              <TabsTrigger value='ledger' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Sale & Purchase')}</TabsTrigger>
            )}
            {isTabVisible('salesman-commission') && (
              <TabsTrigger value='salesman-commission' className='text-xs sm:text-sm px-2 sm:px-3'>Salesman Commission</TabsTrigger>
            )}
            {isTabVisible('partner-profit-share') && (
              <TabsTrigger value='partner-profit-share' className='text-xs sm:text-sm px-2 sm:px-3'>Partners</TabsTrigger>
            )}
            {isTabVisible('products') && (
              <TabsTrigger value='products' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Products')}</TabsTrigger>
            )}
            {isTabVisible('customers') && (
              <TabsTrigger value='customers' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Customers')}</TabsTrigger>
            )}
            {isTabVisible('aging') && (
              <TabsTrigger value='aging' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Customer Aging')}</TabsTrigger>
            )}
            {isTabVisible('suppliers') && (
              <TabsTrigger value='suppliers' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Suppliers')}</TabsTrigger>
            )}
            {isTabVisible('supplier-aging') && (
              <TabsTrigger value='supplier-aging' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Supplier Aging')}</TabsTrigger>
            )}
            {isTabVisible('expenses') && (
              <TabsTrigger value='expenses' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Expenses')}</TabsTrigger>
            )}
            {isTabVisible('stock') && (
              <TabsTrigger value='stock' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Stock')}</TabsTrigger>
            )}
            {isTabVisible('batch-expiry') && (
              <TabsTrigger value='batch-expiry' className='text-xs sm:text-sm px-2 sm:px-3'>Batch &amp; Expiry</TabsTrigger>
            )}
            {isTabVisible('stock-adjustments') && (
              <TabsTrigger value='stock-adjustments' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Stock Adjustments')}</TabsTrigger>
            )}
            {isTabVisible('stock-transfers') && (
              <TabsTrigger value='stock-transfers' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Stock Transfers')}</TabsTrigger>
            )}
            {isTabVisible('tax') && (
              <TabsTrigger value='tax' className='text-xs sm:text-sm px-2 sm:px-3'>{t('tax')}</TabsTrigger>
            )}
            {isTabVisible('sales-returns') && (
              <TabsTrigger value='sales-returns' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Sales Returns')}</TabsTrigger>
            )}
            {isTabVisible('purchase-returns') && (
              <TabsTrigger value='purchase-returns' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Purchase Returns')}</TabsTrigger>
            )}
            {isMobileShop && canAccess('load') && isTabVisible('load') && (
              <TabsTrigger value='load' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Load')}</TabsTrigger>
            )}
            {canAccess('wallet') && isTabVisible('my-wallet') && (
              <TabsTrigger value='my-wallet' className='text-xs sm:text-sm px-2 sm:px-3'>Bank Accounts</TabsTrigger>
            )}
            {canAccess('wallet') && isTabVisible('bank-position') && (
              <TabsTrigger value='bank-position' className='text-xs sm:text-sm px-2 sm:px-3'>Bank &amp; Cash Position</TabsTrigger>
            )}
            {isMobileShop && canAccess('repair') && isTabVisible('repair') && (
              <TabsTrigger value='repair' className='text-xs sm:text-sm px-2 sm:px-3'>{t('Repairing')}</TabsTrigger>
            )}
            {isMobileShop && isTabVisible('services') && (
              <TabsTrigger value='services' className='text-xs sm:text-sm px-2 sm:px-3'>Services</TabsTrigger>
            )}
            {isMobileShop && canAccess('bill_payment') && isTabVisible('bill-payments') && (
              <TabsTrigger value='bill-payments' className='text-xs sm:text-sm px-2 sm:px-3'>Bill Payments</TabsTrigger>
            )}
            {isMobileShop && user?.email === AGENT_BILL_EMAIL && isTabVisible('agent-bills') && (
              <TabsTrigger value='agent-bills' className='text-xs sm:text-sm px-2 sm:px-3'>Agent Bills</TabsTrigger>
            )}
            {canAccess('profit_loss') && isTabVisible('profit-loss') && (
              <TabsTrigger value='profit-loss' className='text-xs sm:text-sm px-2 sm:px-3'>{t('profit_loss')}</TabsTrigger>
            )}
            {canAccess('roi') && isTabVisible('roi') && (
              <TabsTrigger value='roi' className='text-xs sm:text-sm px-2 sm:px-3'>ROI</TabsTrigger>
            )}
            {isMobileShop && isTabVisible('sim-sale') && (
              <TabsTrigger value='sim-sale' className='text-xs sm:text-sm px-2 sm:px-3'>Sim Sale</TabsTrigger>
            )}
            {isMobileShop && isTabVisible('installments') && (
              <TabsTrigger value='installments' className='text-xs sm:text-sm px-2 sm:px-3'>Installments</TabsTrigger>
            )}
            {isMobileShop && isTabVisible('mobile-phones') && (
              <TabsTrigger value='mobile-phones' className='text-xs sm:text-sm px-2 sm:px-3'>Mobile Phone</TabsTrigger>
            )}
          </TabsList>
        </div>

        {isTabVisible('activities') && (
          <TabsContent value='activities' className='mt-6'>
            <SalesPurchaseSummaryReport ref={activeTab === 'activities' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('summary') && (
          <TabsContent value='summary' className='mt-6'>
            <ActivitySummaryReport ref={activeTab === 'summary' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && isTabVisible('daily-summary') && (
          <TabsContent value='daily-summary' className='mt-6'>
            <DailySalesSummaryReport ref={activeTab === 'daily-summary' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && isTabVisible('complete') && (
          <TabsContent value='complete' className='mt-6'>
            <CompleteReport ref={activeTab === 'complete' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('sales') && (
          <TabsContent value='sales' className='mt-6'>
            <SalesReport ref={activeTab === 'sales' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} isMobileShop={isMobileShop} />
          </TabsContent>
        )}

        {isTabVisible('purchases') && (
          <TabsContent value='purchases' className='mt-6'>
            <PurchaseReport ref={activeTab === 'purchases' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('ledger') && (
          <TabsContent value='ledger' className='mt-6'>
            <LedgerReport ref={activeTab === 'ledger' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('salesman-commission') && (
          <TabsContent value='salesman-commission' className='mt-6'>
            <SalesmanCommissionReport ref={activeTab === 'salesman-commission' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('partner-profit-share') && (
          <TabsContent value='partner-profit-share' className='mt-6'>
            <PartnerProfitShareReport ref={activeTab === 'partner-profit-share' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('products') && (
          <TabsContent value='products' className='mt-6'>
            <ProductReport ref={activeTab === 'products' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('customers') && (
          <TabsContent value='customers' className='mt-6'>
            <CustomerReport ref={activeTab === 'customers' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('aging') && (
          <TabsContent value='aging' className='mt-6'>
            <AgingReport ref={activeTab === 'aging' ? exportRef : null} />
          </TabsContent>
        )}

        {isTabVisible('suppliers') && (
          <TabsContent value='suppliers' className='mt-6'>
            <SupplierReport ref={activeTab === 'suppliers' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('supplier-aging') && (
          <TabsContent value='supplier-aging' className='mt-6'>
            <SupplierAgingReport ref={activeTab === 'supplier-aging' ? exportRef : null} />
          </TabsContent>
        )}

        {isTabVisible('expenses') && (
          <TabsContent value='expenses' className='mt-6'>
            <ExpenseReport ref={activeTab === 'expenses' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('profit-loss') && (
          <TabsContent value='profit-loss' className='mt-6'>
            {canAccess('profit_loss')
              ? <ProfitLossReport ref={activeTab === 'profit-loss' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='Profit & Loss Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        {isTabVisible('stock') && (
          <TabsContent value='stock' className='mt-6'>
            <InventoryReport ref={activeTab === 'stock' ? exportRef : null} />
          </TabsContent>
        )}

        {isTabVisible('batch-expiry') && (
          <TabsContent value='batch-expiry' className='mt-6'>
            <BatchExpiryReport ref={activeTab === 'batch-expiry' ? exportRef : null} />
          </TabsContent>
        )}

        {isTabVisible('stock-adjustments') && (
          <TabsContent value='stock-adjustments' className='mt-6'>
            <StockAdjustmentReport ref={activeTab === 'stock-adjustments' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('stock-transfers') && (
          <TabsContent value='stock-transfers' className='mt-6'>
            <StockTransferReport ref={activeTab === 'stock-transfers' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('tax') && (
          <TabsContent value='tax' className='mt-6'>
            <TaxReport ref={activeTab === 'tax' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('sales-returns') && (
          <TabsContent value='sales-returns' className='mt-6'>
            <SalesReturnsReport ref={activeTab === 'sales-returns' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('purchase-returns') && (
          <TabsContent value='purchase-returns' className='mt-6'>
            <PurchaseReturnsReport ref={activeTab === 'purchase-returns' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && canAccess('load') && isTabVisible('load') && (
          <TabsContent value='load' className='mt-6'>
            <LoadReport ref={activeTab === 'load' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('my-wallet') && (
          <TabsContent value='my-wallet' className='mt-6'>
            {canAccess('wallet')
              ? <MyWalletReport ref={activeTab === 'my-wallet' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='My Wallet Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        {isTabVisible('bank-position') && (
          <TabsContent value='bank-position' className='mt-6'>
            {canAccess('wallet')
              ? <BankPositionReport ref={activeTab === 'bank-position' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='Bank & Cash Position Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        {isMobileShop && isTabVisible('repair') && (
          <TabsContent value='repair' className='mt-6'>
            {canAccess('repair')
              ? <RepairReport ref={activeTab === 'repair' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='Repair Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        {isMobileShop && isTabVisible('services') && (
          <TabsContent value='services' className='mt-6'>
            <ServiceReport ref={activeTab === 'services' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && canAccess('bill_payment') && isTabVisible('bill-payments') && (
          <TabsContent value='bill-payments' className='mt-6'>
            <BillPaymentReport ref={activeTab === 'bill-payments' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && user?.email === AGENT_BILL_EMAIL && isTabVisible('agent-bills') && (
          <TabsContent value='agent-bills' className='mt-6'>
            <AgentBillReport ref={activeTab === 'agent-bills' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isTabVisible('roi') && (
          <TabsContent value='roi' className='mt-6'>
            {canAccess('roi')
              ? <RoiReport ref={activeTab === 'roi' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
              : <LockedFeatureCard featureName='ROI Report' currentPlan={getPlanLabel(planType)} />}
          </TabsContent>
        )}

        {isMobileShop && isTabVisible('sim-sale') && (
          <TabsContent value='sim-sale' className='mt-6'>
            <SimSaleReport ref={activeTab === 'sim-sale' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && isTabVisible('installments') && (
          <TabsContent value='installments' className='mt-6'>
            <InstallmentReport ref={activeTab === 'installments' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}

        {isMobileShop && isTabVisible('mobile-phones') && (
          <TabsContent value='mobile-phones' className='mt-6'>
            <MobilePhoneReport ref={activeTab === 'mobile-phones' ? exportRef : null} startDate={queryStartDate} endDate={queryEndDate} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
