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
