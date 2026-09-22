import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { PaymentVoucherDialog } from './components/payment-voucher-dialog'
import { ReceiptVoucherDialog } from './components/receipt-voucher-dialog'
import { PaymentVoucherList } from './components/payment-voucher-list'
import { ReceiptVoucherList } from './components/receipt-voucher-list'
import { VoucherStatCards } from './components/voucher-stat-cards'
import { useVoucherSummary } from './hooks/use-voucher-summary'

type VoucherTab = 'payments' | 'receipts'

const activeTabClass = 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm'

export default function PaymentsAndReceiptsPage() {
  const { hasExplicitPermission } = usePermissions()
  const canManage = hasExplicitPermission('managePaymentVouchers')
  const [activeTab, setActiveTab] = useState<VoucherTab>('payments')
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const summary = useVoucherSummary()

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Payments & Receipts</h1>
          <p className='text-muted-foreground'>Record and print standalone payment/receipt vouchers against a bank account.</p>
        </div>
        {canManage ? (
          <Button onClick={() => (activeTab === 'payments' ? setPaymentDialogOpen(true) : setReceiptDialogOpen(true))}>
            <Plus className='mr-2 h-4 w-4' />
            {activeTab === 'payments' ? 'New Payment Voucher' : 'New Receipt Voucher'}
          </Button>
        ) : null}
      </div>

      <VoucherStatCards
        kind={activeTab === 'payments' ? 'payment' : 'receipt'}
        total={activeTab === 'payments' ? summary.payment.total : summary.receipt.total}
        month={activeTab === 'payments' ? summary.payment.month : summary.receipt.month}
        cashBank={summary.cashBank}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VoucherTab)}>
        <TabsList>
          <TabsTrigger value='payments' className={activeTabClass}>
            Payment Vouchers ({summary.payment.total.count})
          </TabsTrigger>
          <TabsTrigger value='receipts' className={cn(activeTabClass, 'data-[state=active]:bg-emerald-600')}>
            Receipt Vouchers ({summary.receipt.total.count})
          </TabsTrigger>
        </TabsList>
        <TabsContent value='payments' className='mt-4'>
          <PaymentVoucherList onCreateVoucher={canManage ? () => setPaymentDialogOpen(true) : undefined} />
        </TabsContent>
        <TabsContent value='receipts' className='mt-4'>
          <ReceiptVoucherList onCreateVoucher={canManage ? () => setReceiptDialogOpen(true) : undefined} />
        </TabsContent>
      </Tabs>

      <PaymentVoucherDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} onCreated={() => setPaymentDialogOpen(false)} />
      <ReceiptVoucherDialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen} onCreated={() => setReceiptDialogOpen(false)} />
    </div>
  )
}
