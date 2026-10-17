/**
 * Shape returned by GET /purchases/history and GET /invoices/history — the side-panel
 * history on the New Purchase / New Invoice screens (see
 * components/transaction-history-sheet.tsx). Both endpoints flatten their documents to this
 * one shape so a single panel renders either side: "party" is the supplier for purchases
 * and the customer for sales, "reference" is the vendor bill no. / bill no.
 */
export interface TransactionHistoryItem {
  productId: string | null
  name: string
  nameUrdu?: string
  sku?: string
  barcode?: string
  quantity: number
  unit?: string
  /** Purchase price (purchases) or unit sale price (sales). */
  price: number
  /** Purchases only — the selling price set while receiving the goods. */
  salePrice: number | null
  discountAmount: number
  taxAmount: number
  /** Line total, net of the line discount. */
  total: number
  batchNumber?: string
  imeiCount: number
}

export interface TransactionHistoryEntry {
  id: string
  invoiceNumber: string
  referenceNumber: string
  date: string
  partyId: string | null
  partyName: string
  type: string
  paymentMethod: string
  walletType?: string
  discount: number
  tax: number
  total: number
  paid: number
  remaining: number
  settlementStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid'
  notes?: string
  createdByName?: string
  totalQuantity: number
  items: TransactionHistoryItem[]
}

export interface TransactionHistoryResult {
  results: TransactionHistoryEntry[]
  limit: number
  /** More rows matched than were returned — the panel asks the user to narrow the range. */
  truncated: boolean
}

/** GET /purchases/navigate · /invoices/navigate — one saved document at a position, newest first. */
export interface RecordNavigationResult {
  total: number
  /** 0 = newest; null when the list is empty. */
  index: number | null
  id: string | null
  /** Invoice / bill number. */
  number: string | null
}

export interface RecordNavigationParams {
  index?: number
  order?: 'entered' | 'date'
  /** A document id — returns that one, at its own position. */
  around?: string
  supplier?: string
  customerId?: string
  type?: string
}

/** A saved document the one being saved may repeat — see server entryGuard.service.js. */
export interface PossibleDuplicate {
  id: string
  number: string
  partyBillNumber: string | null
  date: string
  amount: number
  itemCount: number
  enteredAt: string
  enteredBy: string | null
  reason: 'same_bill_number' | 'same_amount'
}
