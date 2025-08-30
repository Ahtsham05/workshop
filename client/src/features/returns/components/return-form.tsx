import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { X, Plus, Minus, AlertCircle, ShoppingCart, Search } from 'lucide-react'
import { useCreateReturnMutation } from '@/stores/return.api'
import { useGetInvoicesQuery } from '@/stores/invoice.api'
import { CreateReturnRequest } from '../types'

interface ReturnFormItem {
  productId: string
  name: string
  image?: { url: string; publicId: string }
  originalQuantity: number
  returnedQuantity: number
  unitPrice: number
  cost: number
  reason: 'defective' | 'wrong_item' | 'customer_request' | 'damaged' | 'expired' | 'other'
  condition: 'new' | 'used' | 'damaged' | 'defective'
  restockable: boolean
}

interface ReturnFormData {
  originalInvoiceId: string
  originalInvoiceNumber: string
  customerId?: string
  customerName?: string
  walkInCustomerName?: string
  returnType: 'full_refund' | 'partial_refund' | 'exchange' | 'store_credit'
  refundMethod: 'cash' | 'card' | 'original_payment' | 'store_credit'
  returnReason: string
  notes: string
  receiptRequired: boolean
  receiptProvided: boolean
  restockingFee: number
  processingFee: number
  items: ReturnFormItem[]
}

interface ReturnFormProps {
  invoice?: any // Invoice data to pre-populate
  onSuccess?: () => void
  onCancel?: () => void
}

export function ReturnForm({ invoice, onSuccess, onCancel }: ReturnFormProps) {
  const [createReturn, { isLoading }] = useCreateReturnMutation()
  const { data: invoices } = useGetInvoicesQuery({})
  const [selectedInvoice, setSelectedInvoice] = useState(invoice || null)
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(!invoice)
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('')
  
  const [formData, setFormData] = useState<ReturnFormData>({
    originalInvoiceId: selectedInvoice?._id || '',
    originalInvoiceNumber: selectedInvoice?.invoiceNumber || '',
    customerId: selectedInvoice?.customerId || '',
    customerName: selectedInvoice?.customerName || '',
    walkInCustomerName: selectedInvoice?.walkInCustomerName || '',
    returnType: 'partial_refund',
    refundMethod: 'original_payment',
    returnReason: '',
    notes: '',
    receiptRequired: false,
    receiptProvided: false,
    restockingFee: 0,
    processingFee: 0,
    items: selectedInvoice?.items?.map((item: any) => ({
      productId: item.productId || item._id,
      name: item.name,
      image: item.image,
      originalQuantity: item.quantity,
      returnedQuantity: 1,
      unitPrice: item.price,
      cost: item.cost || 0,
      reason: 'customer_request' as const,
      condition: 'new' as const,
      restockable: true,
    })) || [],
  })

  const [totalReturnAmount, setTotalReturnAmount] = useState(0)

  // Calculate total return amount
  useEffect(() => {
    const total = formData.items.reduce((sum, item) => {
      return sum + (item.returnedQuantity * item.unitPrice)
    }, 0)
    setTotalReturnAmount(total)
  }, [formData.items])

  const finalRefundAmount = Math.max(0, totalReturnAmount - formData.restockingFee - formData.processingFee)

  const updateFormData = (updates: Partial<ReturnFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const updateItem = (index: number, updates: Partial<ReturnFormItem>) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], ...updates }
    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index)
    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const handleInvoiceSelect = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowInvoiceSearch(false)
    setFormData(prev => ({
      ...prev,
      originalInvoiceId: invoice._id,
      originalInvoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      walkInCustomerName: invoice.walkInCustomerName,
      items: invoice.items?.map((item: any) => ({
        productId: item.productId || item._id,
        name: item.name,
        image: item.image,
        originalQuantity: item.quantity,
        returnedQuantity: 1,
        unitPrice: item.price,
        cost: item.cost || 0,
        reason: 'customer_request' as const,
        condition: 'new' as const,
        restockable: true,
      })) || [],
    }))
  }

  const addManualItem = () => {
    const newItem: ReturnFormItem = {
      productId: '',
      name: '',
      originalQuantity: 1,
      returnedQuantity: 1,
      unitPrice: 0,
      cost: 0,
      reason: 'customer_request',
      condition: 'new',
      restockable: true,
    }
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }))
  }

  const filteredInvoices = invoices?.filter((inv: any) => 
    inv.invoiceNumber.toLowerCase().includes(invoiceSearchTerm.toLowerCase()) ||
    inv.customerName?.toLowerCase().includes(invoiceSearchTerm.toLowerCase()) ||
    inv.walkInCustomerName?.toLowerCase().includes(invoiceSearchTerm.toLowerCase())
  ) || []

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.items.length === 0) return
    if (!formData.returnReason.trim()) return

    try {
      const returnData: CreateReturnRequest = {
        ...formData,
        items: formData.items.map(item => ({
          productId: item.productId,
          name: item.name,
          image: item.image,
          originalQuantity: item.originalQuantity,
          returnedQuantity: item.returnedQuantity,
          unitPrice: item.unitPrice,
          cost: item.cost,
          reason: item.reason,
          condition: item.condition,
          restockable: item.restockable,
        })),
      }
      
      await createReturn(returnData).unwrap()
      onSuccess?.()
    } catch (error) {
      console.error('Failed to create return:', error)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Invoice Information */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showInvoiceSearch ? (
            <div className="space-y-4">
              <div>
                <Label>Search Invoice</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by invoice number or customer name..."
                    value={invoiceSearchTerm}
                    onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              {filteredInvoices.length > 0 && (
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {filteredInvoices.slice(0, 10).map((inv: any) => (
                    <div
                      key={inv._id}
                      className="p-3 border-b cursor-pointer hover:bg-muted"
                      onClick={() => handleInvoiceSelect(inv)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{inv.invoiceNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {inv.customerName || inv.walkInCustomerName || 'Walk-in Customer'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">${inv.totalAmount?.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowInvoiceSearch(false)
                    setFormData(prev => ({
                      ...prev,
                      originalInvoiceId: '',
                      originalInvoiceNumber: '',
                      customerId: '',
                      customerName: '',
                      walkInCustomerName: '',
                      items: [],
                    }))
                  }}
                >
                  Skip Invoice Selection
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Invoice Number</Label>
                <div className="flex gap-2">
                  <Input 
                    value={formData.originalInvoiceNumber} 
                    onChange={(e) => setFormData(prev => ({ ...prev, originalInvoiceNumber: e.target.value }))}
                    placeholder="Enter invoice number"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowInvoiceSearch(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <Label>Customer</Label>
                <Input
                  value={formData.customerName || formData.walkInCustomerName || ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    customerName: e.target.value,
                    walkInCustomerName: e.target.value 
                  }))}
                  placeholder="Enter customer name"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Details */}
      <Card>
        <CardHeader>
          <CardTitle>Return Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Return Type</Label>
              <Select 
                value={formData.returnType} 
                onValueChange={(value) => updateFormData({ returnType: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select return type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_refund">Full Refund</SelectItem>
                  <SelectItem value="partial_refund">Partial Refund</SelectItem>
                  <SelectItem value="exchange">Exchange</SelectItem>
                  <SelectItem value="store_credit">Store Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Refund Method</Label>
              <Select 
                value={formData.refundMethod} 
                onValueChange={(value) => updateFormData({ refundMethod: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select refund method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="original_payment">Original Payment Method</SelectItem>
                  <SelectItem value="store_credit">Store Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Return Reason</Label>
            <Textarea
              value={formData.returnReason}
              onChange={(e) => updateFormData({ returnReason: e.target.value })}
              placeholder="Enter the reason for return..."
              rows={3}
            />
          </div>

          <div>
            <Label>Additional Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => updateFormData({ notes: e.target.value })}
              placeholder="Enter any additional notes..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="receiptRequired"
                checked={formData.receiptRequired}
                onCheckedChange={(checked) => updateFormData({ receiptRequired: !!checked })}
              />
              <Label htmlFor="receiptRequired">Receipt Required</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="receiptProvided"
                checked={formData.receiptProvided}
                onCheckedChange={(checked) => updateFormData({ receiptProvided: !!checked })}
              />
              <Label htmlFor="receiptProvided">Receipt Provided</Label>
            </div>
          </div>
        </CardContent>
      </Card>

        {/* Return Items */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Return Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addManualItem}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Original Qty</TableHead>
                    <TableHead>Return Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Return Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Restock</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formData.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.image && (
                            <img 
                              src={item.image.url} 
                              alt={item.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          <Input
                            value={item.name}
                            onChange={(e) => updateItem(index, { name: e.target.value })}
                            placeholder="Product name"
                            className="min-w-40"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.originalQuantity}
                          onChange={(e) => updateItem(index, { originalQuantity: parseInt(e.target.value) || 1 })}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (item.returnedQuantity > 1) {
                                updateItem(index, { returnedQuantity: item.returnedQuantity - 1 })
                              }
                            }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            max={item.originalQuantity}
                            value={item.returnedQuantity}
                            onChange={(e) => updateItem(index, { returnedQuantity: parseInt(e.target.value) || 1 })}
                            className="w-16 text-center"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (item.returnedQuantity < item.originalQuantity) {
                                updateItem(index, { returnedQuantity: item.returnedQuantity + 1 })
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          ${(item.returnedQuantity * item.unitPrice).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={item.reason} 
                          onValueChange={(value) => updateItem(index, { reason: value as any })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="defective">Defective</SelectItem>
                            <SelectItem value="wrong_item">Wrong Item</SelectItem>
                            <SelectItem value="customer_request">Customer Request</SelectItem>
                            <SelectItem value="damaged">Damaged</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={item.condition} 
                          onValueChange={(value) => updateItem(index, { condition: value as any })}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="used">Used</SelectItem>
                            <SelectItem value="damaged">Damaged</SelectItem>
                            <SelectItem value="defective">Defective</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={item.restockable}
                          onCheckedChange={(checked) => updateItem(index, { restockable: !!checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {formData.items.length === 0 && (
              <div className="text-center py-8">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No items selected for return</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addManualItem}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Item
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fees and Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Fees and Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Restocking Fee ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.restockingFee}
                  onChange={(e) => updateFormData({ restockingFee: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label>Processing Fee ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.processingFee}
                  onChange={(e) => updateFormData({ processingFee: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Return Amount:</span>
                  <span>${totalReturnAmount.toFixed(2)}</span>
                </div>
                {formData.restockingFee > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Restocking Fee:</span>
                    <span>-${formData.restockingFee.toFixed(2)}</span>
                  </div>
                )}
                {formData.processingFee > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Processing Fee:</span>
                    <span>-${formData.processingFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Final Refund Amount:</span>
                  <span className="text-green-600">${finalRefundAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {finalRefundAmount < 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-700">
                  Warning: Fees exceed return amount. Customer may owe money.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || formData.items.length === 0}>
            {isLoading ? 'Creating Return...' : 'Create Return'}
          </Button>
        </div>
      </form>
    )
}
