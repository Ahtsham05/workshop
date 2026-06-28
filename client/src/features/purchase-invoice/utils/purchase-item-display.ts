/**
 * Builds "Toshiba — 12" for a purchase line item that references a real variant,
 * or just "Toshiba" for a plain product line — same label shape as the purchasable
 * catalog (server/src/services/product.service.js's getPurchasableCatalog) and the
 * purchase panel's product picker. Used anywhere a saved Purchase's line items are
 * displayed (view modal, print receipt/A4) so two lines for the same product but
 * different variants aren't shown as indistinguishable duplicates. See
 * docs/architecture/universal-product-migration.md.
 */
export function getPurchaseItemDisplayName(item: any): string {
  const productName: string =
    (typeof item.product === 'object' && item.product?.name) || item.productName || item.name || 'Unknown Product'

  const variant = item.variantId
  if (variant && typeof variant === 'object' && variant.attributes) {
    const attributes = variant.attributes instanceof Map ? Object.fromEntries(variant.attributes) : variant.attributes
    const variantLabel = Object.values(attributes || {}).join(' / ')
    if (variantLabel) return `${productName} — ${variantLabel}`
  }

  return productName
}

export function getPurchaseItemBarcode(item: any): string | undefined {
  const variant = item.variantId
  if (variant && typeof variant === 'object' && variant.barcode) return variant.barcode
  return (typeof item.product === 'object' && item.product?.barcode) || item.barcode
}
