import type { CartLine, PaymentMethod } from '../types'

export type FastBillCustomer = {
  id: string
  name: string
} | null

type BuildPayloadArgs = {
  cart: CartLine[]
  customer: FastBillCustomer
  walkInCustomerName: string
  paymentMethod: PaymentMethod
  discount: number
  paidAmount: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeCartSubtotal(cart: CartLine[]): number {
  return round2(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))
}

/** Builds the POST /invoices body — same shape the detailed Invoice form posts. */
export function buildInvoicePayload({
  cart,
  customer,
  walkInCustomerName,
  paymentMethod,
  discount,
  paidAmount,
}: BuildPayloadArgs) {
  const subtotal = computeCartSubtotal(cart)
  const total = round2(Math.max(0, subtotal - discount))

  const items = cart.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    name: line.name,
    nameUrdu: line.nameUrdu,
    quantity: line.quantity,
    unit: line.unit,
    stockQuantity: line.quantity,
    unitPrice: line.unitPrice,
    cost: line.cost,
    subtotal: round2(line.unitPrice * line.quantity),
    profit: round2((line.unitPrice - line.cost) * line.quantity),
  }))

  return {
    items,
    customerId: customer ? customer.id : 'walk-in',
    customerName: customer ? customer.name : undefined,
    walkInCustomerName: customer ? undefined : walkInCustomerName || 'Walk-in Customer',
    type: paymentMethod === 'credit' ? 'credit' : 'cash',
    paymentMethod: paymentMethod === 'credit' ? 'cash' : paymentMethod,
    subtotal,
    tax: 0,
    discount,
    total,
    paidAmount: paymentMethod === 'credit' ? paidAmount : total,
    language: 'en',
  }
}
