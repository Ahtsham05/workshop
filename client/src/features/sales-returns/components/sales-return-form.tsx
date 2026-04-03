import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useGetInvoicesQuery } from '@/stores/invoice.api'
import { useCreateSalesReturnMutation } from '@/stores/returns.api'

interface ReturnItem {
  productId: string
  name: string
  quantity: number
  maxQuantity: number
  price: number
  total: number
}

interface SalesReturnFormProps {
  onBack: () => void
  onSuccess: () => void
}

export default function SalesReturnForm({ onBack, onSuccess }: SalesReturnFormProps) {
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [refundMethod, setRefundMethod] = useState<'cash' | 'jazzcash' | 'easypaisa' | 'adjustment'>('cash')
  const [reason, setReason] = useState('')
  const [damageDescription, setDamageDescription] = useState('')

  const [createSalesReturn, { isLoading }] = useCreateSalesReturnMutation()

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(invoiceSearch), 400)
    return () => clearTimeout(timer)
  }, [invoiceSearch])

  const { data: invoicesData } = useGetInvoicesQuery(
    { search: debouncedSearch, limit: 10 },
    { skip: !debouncedSearch }
  )

  const handleSelectInvoice = (invoice: any) => {
    setSelectedInvoice(invoice)
    setInvoiceSearch('')
    // Pre-fill items from the invoice
    const items: ReturnItem[] = (invoice.items || []).map((item: any) => ({
      productId: item.productId || item.product?._id || item.product?.id,
      name: item.name || item.product?.name || 'Unknown',
      quantity: 1,
      maxQuantity: item.quantity,
      price: item.unitPrice ?? item.price ?? 0,
      total: item.unitPrice ?? item.price ?? 0,
    }))
    setReturnItems(items)
  }

  const updateQuantity = (index: number, delta: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const newQty = Math.min(Math.max(1, item.quantity + delta), item.maxQuantity)
        return { ...item, quantity: newQty, total: newQty * item.price }
      })
    )
  }

  const removeItem = (index: number) => {
    setReturnItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalAmount = returnItems.reduce((sum, item) => sum + item.total, 0)

  const handleSubmit = async () => {
    if (!selectedInvoice) {
      toast.error('Please select an invoice')
      return
    }
    if (returnItems.length === 0) {
      toast.error('No items selected for return')
      return
    }

    const payload = {
      invoiceId: selectedInvoice._id || selectedInvoice.id,
      customerId: selectedInvoice.customerId || null,
      customerName:
        selectedInvoice.customerName ||
        selectedInvoice.walkInCustomerName ||
        selectedInvoice.customer?.name,
      items: returnItems.map(({ productId, name, quantity, price, total }) => ({
        productId,
        name,
        quantity,
        price,
        total,
      })),
      totalAmount,
      refundMethod,
      reason,
      damageDescription,
    }

    try {
      await createSalesReturn(payload).unwrap()
      toast.success('Sales return created successfully')
      onSuccess()
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create return')
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' onClick={onBack}>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <h2 className='text-2xl font-bold'>Create Sales Return</h2>
      </div>

      {/* Invoice Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Invoice</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!selectedInvoice ? (
            <div className='relative'>
              <Input
                placeholder='Search by invoice number, customer name...'
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
              />
              {invoicesData?.results && invoicesData.results.length > 0 && invoiceSearch && (
                <div className='absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg'>
                  {invoicesData.results.map((inv: any) => (
                    <button
                      key={inv._id || inv.id}
                      className='w-full px-4 py-2 text-left text-sm hover:bg-muted'
                      onClick={() => handleSelectInvoice(inv)}
                    >
                      <span className='font-medium'>{inv.invoiceNumber}</span>
                      {' — '}
                      <span className='text-muted-foreground'>
                        {inv.customerName || inv.walkInCustomerName || inv.customer?.name || 'Walk-in'}
                      </span>
                      {' — '}
                      <span>PKR {(inv.total ?? 0).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <p className='font-medium'>{selectedInvoice.invoiceNumber}</p>
                <p className='text-sm text-muted-foreground'>
                  {selectedInvoice.customerName ||
                    selectedInvoice.walkInCustomerName ||
                    selectedInvoice.customer?.name ||
                    'Walk-in Customer'}
                </p>
                <p className='text-sm'>Total: PKR {(selectedInvoice.total ?? 0).toLocaleString()}</p>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setSelectedInvoice(null)
                  setReturnItems([])
                }}
              >
                Change
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Items */}
      {returnItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Return Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Max Qty</TableHead>
                  <TableHead>Return Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.maxQuantity}</TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-7 w-7'
                          onClick={() => updateQuantity(index, -1)}
                        >
                          <Minus className='h-3 w-3' />
                        </Button>
                        <span className='w-8 text-center'>{item.quantity}</span>
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-7 w-7'
                          onClick={() => updateQuantity(index, 1)}
                        >
                          <Plus className='h-3 w-3' />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>PKR {item.price.toLocaleString()}</TableCell>
                    <TableCell>PKR {item.total.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 text-destructive'
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className='h-3 w-3' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className='mt-4 text-right text-lg font-semibold'>
              Total Return: PKR {totalAmount.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refund Details */}
      {selectedInvoice && (
        <Card>
          <CardHeader>
            <CardTitle>Refund Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label>Refund Method</Label>
                <Select
                  value={refundMethod}
                  onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='cash'>Cash</SelectItem>
                    <SelectItem value='jazzcash'>JazzCash</SelectItem>
                    <SelectItem value='easypaisa'>EasyPaisa</SelectItem>
                    <SelectItem value='adjustment'>Credit Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label>Reason (optional)</Label>
                <Input
                  placeholder='e.g. Defective item'
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            <div className='space-y-2'>
              <Label>Damage Description (optional)</Label>
              <Textarea
                placeholder='Describe any damage or condition...'
                value={damageDescription}
                onChange={(e) => setDamageDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className='flex justify-end gap-3'>
              <Button variant='outline' onClick={onBack}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading || returnItems.length === 0}>
                {isLoading ? 'Submitting...' : 'Submit Return'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
