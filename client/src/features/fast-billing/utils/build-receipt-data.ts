import type { PrintInvoiceData } from '@/features/invoice/utils/print-utils'
import type { CartLine, SaleType } from '../types'
import { computeCartSubtotal } from './build-invoice-payload'
import type { FastBillCustomer } from './build-invoice-payload'
import { computeDiscountAmount, type DiscountType } from '@/lib/discount'

type BuildReceiptArgs = {
  invoiceNumber: string
  cart: CartLine[]
  customer: FastBillCustomer
  walkInCustomerName: string
  saleType: SaleType
  discountType: DiscountType
  discountValue: number
  paidAmount: number
  splitPaymentMethod?: 'cash' | 'wallet'
  splitPaidAmount?: number
}

export function buildReceiptData({
  invoiceNumber,
  cart,
  customer,
  walkInCustomerName,
  saleType,
  discountType,
  discountValue,
  paidAmount,
  splitPaymentMethod,
  splitPaidAmount,
}: BuildReceiptArgs): PrintInvoiceData {
  const subtotal = computeCartSubtotal(cart)
  const discount = computeDiscountAmount(subtotal, discountType, discountValue)
  const total = Math.max(0, subtotal - discount)
  const isCredit = saleType === 'credit'
  const splitAmount = splitPaymentMethod ? Math.max(0, Number(splitPaidAmount || 0)) : 0
  const paid = isCredit || splitPaymentMethod ? Math.max(0, (paidAmount || 0) + splitAmount) : total

  return {
    invoiceNumber,
    items: cart.map((line) => {
      const gross = Math.round(line.unitPrice * line.quantity * 100) / 100
      const discountAmount = computeDiscountAmount(gross, line.discountType, line.discountValue)
      return {
        name: line.name,
        nameUrdu: line.nameUrdu,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        subtotal: Math.round((gross - discountAmount) * 100) / 100,
        discountAmount,
      }
    }),
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
