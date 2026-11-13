/**
 * The invoice-by-id endpoint populates customerId / items.variantId / items.batchId into
 * objects, while the edit form (features/invoice/index.tsx handleEdit) was written against
 * list rows that carry plain ids. Flatten the refs back to ids — keeping the populated
 * customer as `customer`, the shape list rows already use — so "Edit" works from any
 * screen that only has a fetched invoice.
 */
const idOf = (value: unknown): unknown => {
  if (value && typeof value === 'object') {
    const ref = value as { _id?: unknown; id?: unknown }
    const id = ref._id ?? ref.id
    return id != null ? String(id) : undefined
  }
  return value
}

export function normalizeInvoiceForEdit<T extends Record<string, any>>(invoice: T): T {
  if (!invoice) return invoice
  const populatedCustomer = invoice.customerId && typeof invoice.customerId === 'object' ? invoice.customerId : null
  return {
    ...invoice,
    customerId: idOf(invoice.customerId),
    ...(populatedCustomer ? { customer: invoice.customer ?? populatedCustomer } : {}),
    items: (invoice.items || []).map((item: any) => ({
      ...item,
      variantId: idOf(item.variantId),
      batchId: idOf(item.batchId),
      taxCategoryId: idOf(item.taxCategoryId),
    })),
  }
}
