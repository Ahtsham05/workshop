export interface ReturnItem {
  productId: string
  name: string
  image?: { url: string; publicId: string }
  originalQuantity: number
  returnedQuantity: number
  unitPrice: number
  cost: number
  returnAmount: number
  reason: 'defective' | 'wrong_item' | 'customer_request' | 'damaged' | 'expired' | 'other'
  condition: 'new' | 'used' | 'damaged' | 'defective'
  restockable: boolean
}

export interface Return {
  _id: string
  originalInvoiceId: string
  originalInvoiceNumber: string
  customerId?: string
  customerName?: string
  walkInCustomerName?: string
  returnNumber: string
  returnDate: string
  items: ReturnItem[]
  totalReturnAmount: number
  refundAmount: number
  restockingFee: number
  processingFee: number
  returnType: 'full_refund' | 'partial_refund' | 'exchange' | 'store_credit'
  refundMethod: 'cash' | 'card' | 'original_payment' | 'store_credit'
  status: 'pending' | 'approved' | 'rejected' | 'processed' | 'completed'
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  returnReason: string
  notes?: string
  receiptRequired: boolean
  receiptProvided: boolean
  inventoryAdjusted: boolean
  createdBy?: string
  processedBy?: string
  processedAt?: string
  createdAt: string
  updatedAt: string
}

export interface CreateReturnRequest {
  originalInvoiceId: string
  originalInvoiceNumber: string
  customerId?: string
  customerName?: string
  walkInCustomerName?: string
  items: Omit<ReturnItem, 'returnAmount'>[]
  returnType: 'full_refund' | 'partial_refund' | 'exchange' | 'store_credit'
  refundMethod: 'cash' | 'card' | 'original_payment' | 'store_credit'
  returnReason: string
  notes?: string
  receiptRequired?: boolean
  receiptProvided?: boolean
  restockingFee?: number
  processingFee?: number
}

export interface ReturnFilters {
  status?: 'pending' | 'approved' | 'rejected' | 'processed' | 'completed'
  returnType?: 'full_refund' | 'partial_refund' | 'exchange' | 'store_credit'
  customerId?: string
  originalInvoiceId?: string
  dateFrom?: string
  dateTo?: string
}

export interface ReturnStatistics {
  totalReturns: number
  totalReturnAmount: number
  totalRefundAmount: number
  avgReturnValue: number
  pendingReturns: number
  approvedReturns: number
  rejectedReturns: number
  completedReturns: number
}
