import type { CartLine, PaymentMethod, SaleType } from '../types'
import { computeDiscountAmount, type DiscountType } from '@/lib/discount'

export type FastBillCustomer = {
  id: string
  name: string
} | null

type BuildPayloadArgs = {
  cart: CartLine[]
  customer: FastBillCustomer
  walkInCustomerName: string
  saleType: SaleType
  paymentMethod: PaymentMethod
  walletType: string
  // Optional second payment leg — e.g. paid partly cash, partly via a bank account.
  // Always the opposite bucket from `paymentMethod` (enforced by the UI), see
  // components/split-payment-fields.tsx.
  splitPaymentMethod?: 'cash' | 'wallet'
  splitWalletType?: string
  splitPaidAmount?: number
  discountType: DiscountType
  discountValue: number
  paidAmount: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Net-of-item-discount subtotal — the resolved Rs value each line actually contributes. */
export function computeCartSubtotal(cart: CartLine[]): number {
  return round2(
    cart.reduce((sum, line) => {
      const gross = line.unitPrice * line.quantity
      const discountAmount = computeDiscountAmount(gross, line.discountType, line.discountValue)
      return sum + (gross - discountAmount)
    }, 0),
  )
}

/** Sum of every line's resolved Rs item discount. */
export function computeCartItemDiscountTotal(cart: CartLine[]): number {
  return round2(
    cart.reduce((sum, line) => {
      const gross = line.unitPrice * line.quantity
      return sum + computeDiscountAmount(gross, line.discountType, line.discountValue)
    }, 0),
  )
}

/** Builds the POST /invoices body — same shape the detailed Invoice form posts. */
export function buildInvoicePayload({
  cart,
  customer,
  walkInCustomerName,
  saleType,
  paymentMethod,
  walletType,
  splitPaymentMethod,
  splitWalletType,
  splitPaidAmount,
  discountType,
  discountValue,
  paidAmount,
}: BuildPayloadArgs) {
  const subtotal = computeCartSubtotal(cart)
  const discount = computeDiscountAmount(subtotal, discountType, discountValue)
  const total = round2(Math.max(0, subtotal - discount))

  const items = cart.map((line) => {
    const gross = round2(line.unitPrice * line.quantity)
    const discountAmount = computeDiscountAmount(gross, line.discountType, line.discountValue)
    const netSubtotal = round2(gross - discountAmount)
    return {
      productId: line.productId,
      variantId: line.variantId,
      batchId: line.batchId,
      batchNumber: line.batchNumber,
      batchAllocations: line.batchAllocations,
      name: line.name,
      nameUrdu: line.nameUrdu,
      quantity: line.quantity,
      unit: line.unit,
      stockQuantity: line.quantity,
      unitPrice: line.unitPrice,
      cost: line.cost,
      subtotal: netSubtotal,
      profit: round2(netSubtotal - line.cost * line.quantity),
      discountType: line.discountType || 'fixed',
      discountValue: line.discountValue || 0,
      discountAmount: round2(discountAmount),
      imeis: line.imeis || [],
    }
  })

  const totalProfit = round2(items.reduce((sum, item) => sum + item.profit, 0))
  const totalCost = round2(items.reduce((sum, item) => sum + item.cost * item.quantity, 0))

  // The split leg is an independent amount that ADDS to the primary Paid Amount, not
  // carved out of it — see split-payment-fields.tsx. A plain cash sale with no split is
  // always fully collected (server also enforces this via Invoice.finalize()); credit
  // sales and any split-active sale trust the primary+split sum the cashier entered.
  const splitAmount = splitPaymentMethod ? Math.max(0, Number(splitPaidAmount || 0)) : 0
  const paidForInvoice = saleType === 'credit' || splitPaymentMethod
    ? round2(Math.max(0, paidAmount || 0) + splitAmount)
    : total

  return {
    items,
    customerId: customer ? customer.id : 'walk-in',
    customerName: customer ? customer.name : undefined,
    walkInCustomerName: customer ? undefined : walkInCustomerName || 'Walk-in Customer',
    type: saleType === 'credit' ? 'credit' : 'cash',
    paymentMethod,
    walletType: paymentMethod === 'wallet' ? (walletType || '') : undefined,
    splitPaymentMethod,
    splitWalletType: splitPaymentMethod === 'wallet' ? (splitWalletType || '') : undefined,
    splitPaidAmount: splitAmount,
    subtotal,
    tax: 0,
    discountType,
    discountValue,
    discount,
    total,
    totalProfit,
    totalCost,
    paidAmount: paidForInvoice,
    language: 'en',
  }
}
