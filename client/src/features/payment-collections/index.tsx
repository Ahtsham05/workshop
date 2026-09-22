import { useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { PaymentStatCards } from './components/payment-stat-cards'
import { CustomerPaymentList } from './components/customer-payment-list'
import { SupplierPaymentList } from './components/supplier-payment-list'
import { usePaymentSummary } from './hooks/use-payment-summary'

type PaymentTab = 'customer' | 'supplier'

const activeTabClass = 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm'

export default function PaymentCollectionsPage() {
  const search = useSearch({ from: '/_authenticated/payment-collections' })
  const [activeTab, setActiveTab] = useState<PaymentTab>(search.tab === 'supplier' ? 'supplier' : 'customer')
  const summary = usePaymentSummary()

  // Seeded once from the URL a caller (the dashboard's Payments Received/Paid cards) landed
  // with — after that, filtering happens locally in each list, same as Payments & Receipts.
  const initialFilters = {
    startDate: search.startDate,
    endDate: search.endDate,
    direction: search.direction,
    status: search.status,
  }

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Customer & Supplier Payments</h1>
        <p className='text-muted-foreground'>
          Every payment collected from customers and paid to suppliers against invoices and purchase bills.
        </p>
      </div>

      <PaymentStatCards
        kind={activeTab}
        total={activeTab === 'customer' ? summary.customer.total : summary.supplier.total}
        month={activeTab === 'customer' ? summary.customer.month : summary.supplier.month}
        refunded={activeTab === 'customer' ? summary.customer.refunded : summary.supplier.refunded}
        voided={activeTab === 'customer' ? summary.customer.voided : summary.supplier.voided}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PaymentTab)}>
        <TabsList>
          <TabsTrigger value='customer' className={activeTabClass}>
            Payments Received ({summary.customer.total.count})
          </TabsTrigger>
          <TabsTrigger value='supplier' className={cn(activeTabClass, 'data-[state=active]:bg-rose-600')}>
            Payments Paid ({summary.supplier.total.count})
          </TabsTrigger>
        </TabsList>
        <TabsContent value='customer' className='mt-4'>
          <CustomerPaymentList initialFilters={initialFilters} />
        </TabsContent>
        <TabsContent value='supplier' className='mt-4'>
          <SupplierPaymentList initialFilters={initialFilters} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
