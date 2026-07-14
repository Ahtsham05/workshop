import type { PrintInvoiceData } from '@/features/invoice/utils/print-utils'
import type { CartLine, PaymentMethod } from '../types'
import { computeCartSubtotal } from './build-invoice-payload'
import type { FastBillCustomer } from './build-invoice-payload'

type BuildReceiptArgs = {
  invoiceNumber: string
  cart: CartLine[]
  customer: FastBillCustomer
  walkInCustomerName: string
  paymentMethod: PaymentMethod
  discount: number
  paidAmount: number
}

export function buildReceiptData({
  invoiceNumber,
  cart,
  customer,
  walkInCustomerName,
  paymentMethod,
  discount,
  paidAmount,
}: BuildReceiptArgs): PrintInvoiceData {
  const subtotal = computeCartSubtotal(cart)
  const total = Math.max(0, subtotal - discount)
  const isCredit = paymentMethod === 'credit'
  const paid = isCredit ? paidAmount : total

  return {
    invoiceNumber,
    items: cart.map((line) => ({
      name: line.name,
      nameUrdu: line.nameUrdu,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      subtotal: Math.round(line.unitPrice * line.quantity * 100) / 100,
    })),
    customerName: customer ? customer.name : walkInCustomerName || 'Walk-in Customer',
    walkInCustomerName: customer ? undefined : walkInCustomerName || 'Walk-in Customer',
    type: isCredit ? 'credit' : 'cash',
    subtotal,
    tax: 0,
    discount,
    total,
    paidAmount: paid,
    balance: Math.max(0, total - paid),
  }
}
