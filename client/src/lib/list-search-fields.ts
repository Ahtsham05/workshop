/** Comma-separated Mongo field names for paginated list search ($or regex). Keep in sync with models. */
export const LIST_SEARCH_FIELDS = {
  customer: 'name,nameUrdu',
  supplier: 'name,nameUrdu',
  category: 'name,nameUrdu',
  product: 'name,nameUrdu,barcode',
  purchase: 'invoiceNumber',
  purchaseOrder: 'orderNumber',
} as const
