import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PaymentVoucherDialog } from './components/payment-voucher-dialog'
import { ReceiptVoucherDialog } from './components/receipt-voucher-dialog'
import { PaymentVoucherList } from './components/payment-voucher-list'
import { ReceiptVoucherList } from './components/receipt-voucher-list'

type VoucherTab = 'payments' | 'receipts'

export default function PaymentsAndReceiptsPage() {
  const [activeTab, setActiveTab] = useState<VoucherTab>('payments')
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Payments & Receipts</h1>
          <p className='text-muted-foreground'>Record and print standalone payment/receipt vouchers against a bank account.</p>
        </div>
        <Button onClick={() => (activeTab === 'payments' ? setPaymentDialogOpen(true) : setReceiptDialogOpen(true))}>
          <Plus className='mr-2 h-4 w-4' />
          {activeTab === 'payments' ? 'New Payment Voucher' : 'New Receipt Voucher'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VoucherTab)}>
        <TabsList>
          <TabsTrigger value='payments'>Payment Vouchers</TabsTrigger>
          <TabsTrigger value='receipts'>Receipt Vouchers</TabsTrigger>
        </TabsList>
        <TabsContent value='payments' className='mt-4'>
          <PaymentVoucherList />
        </TabsContent>
        <TabsContent value='receipts' className='mt-4'>
          <ReceiptVoucherList />
        </TabsContent>
      </Tabs>

      <PaymentVoucherDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} onCreated={() => setPaymentDialogOpen(false)} />
      <ReceiptVoucherDialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen} onCreated={() => setReceiptDialogOpen(false)} />
    </div>
  )
}
