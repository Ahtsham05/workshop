import type { CustomerPaymentRecord } from '@/stores/customerPayment.api'
import type { SupplierPaymentRecord } from '@/stores/supplierPayment.api'

export const DIRECTION_LABELS: Record<string, string> = {
  payment: 'Payment',
  refund: 'Refund',
  return_credit: 'Return Credit',
}

export const DIRECTION_BADGE_CLASS: Record<string, string> = {
  payment: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  refund: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  return_credit: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
}

export const STATUS_LABELS: Record<string, string> = {
  posted: 'Posted',
  void: 'Void',
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  posted: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  void: 'bg-red-100 text-red-700 hover:bg-red-100',
}

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  wallet: 'Wallet',
}

export interface PaymentAllocationRow {
  id: string
  invoiceNumber: string
  invoiceTotal: number
  outstandingBefore: number
  amount: number
}

export interface PaymentHistoryRow {
  id: string
  action: string
  at: string
  byName?: string
  details?: string
  amount?: number
}

/** Everything the detail sheet and list show, in one kind-agnostic shape (a customer payment's
 *  `customerName` and a supplier payment's `supplierName` are both just the "party"). */
export interface PaymentSheetData {
  id: string
  paymentNumber: string
  partyName: string
  partyPhone?: string
  date: string
  amount: number
  paymentMethod: 'cash' | 'wallet'
  walletType?: string
  referenceNumber?: string
  notes?: string
  direction: 'payment' | 'refund' | 'return_credit'
  status: 'posted' | 'void'
  voidReason?: string
  allocatedTotal: number
  unappliedAmount: number
  allocations: PaymentAllocationRow[]
  history: PaymentHistoryRow[]
  createdByName?: string
  createdAt: string
}

const nameOf = (user?: { name?: string } | string) => (user && typeof user === 'object' ? user.name : undefined)

export const toCustomerPaymentSheetData = (payment: CustomerPaymentRecord): PaymentSheetData => {
  const customer = typeof payment.customer === 'object' ? payment.customer : undefined
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    partyName: customer?.name || payment.customerName || 'Unknown customer',
    partyPhone: customer?.phone,
    date: payment.paymentDate,
    amount: Number(payment.amount || 0),
    paymentMethod: payment.paymentMethod,
    walletType: payment.walletType,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    direction: payment.direction,
    status: payment.status,
    voidReason: payment.voidReason,
    allocatedTotal: Number(payment.allocatedTotal || 0),
    unappliedAmount: Number(payment.unappliedAmount || 0),
    allocations: (payment.allocations || []).map((a, index) => ({
      id: a.id ?? String(index),
      invoiceNumber: a.invoiceNumber,
      invoiceTotal: Number(a.invoiceTotal || 0),
      outstandingBefore: Number(a.outstandingBefore || 0),
      amount: Number(a.amount || 0),
    })),
    history: (payment.history || []).map((h, index) => ({
      id: h.id ?? String(index),
      action: h.action,
      at: h.at,
      byName: h.byName,
      details: h.details,
      amount: h.amount,
    })),
    createdByName: nameOf(payment.createdBy),
    createdAt: payment.createdAt,
  }
}

export const toSupplierPaymentSheetData = (payment: SupplierPaymentRecord): PaymentSheetData => {
  const supplier = typeof payment.supplier === 'object' ? payment.supplier : undefined
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    partyName: supplier?.name || payment.supplierName || 'Unknown supplier',
    partyPhone: supplier?.phone,
    date: payment.paymentDate,
    amount: Number(payment.amount || 0),
    paymentMethod: payment.paymentMethod,
    walletType: payment.walletType,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    direction: payment.direction,
    status: payment.status,
    voidReason: payment.voidReason,
    allocatedTotal: Number(payment.allocatedTotal || 0),
    unappliedAmount: Number(payment.unappliedAmount || 0),
    allocations: (payment.allocations || []).map((a, index) => ({
      id: a.id ?? String(index),
      invoiceNumber: a.invoiceNumber,
      invoiceTotal: Number(a.invoiceTotal || 0),
      outstandingBefore: Number(a.outstandingBefore || 0),
      amount: Number(a.amount || 0),
    })),
    history: (payment.history || []).map((h, index) => ({
      id: h.id ?? String(index),
      action: h.action,
      at: h.at,
      byName: h.byName,
      details: h.details,
      amount: h.amount,
    })),
    createdByName: nameOf(payment.createdBy),
    createdAt: payment.createdAt,
  }
}
