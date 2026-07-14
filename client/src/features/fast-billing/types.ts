import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'

export type CartLine = {
  key: string
  productId: string
  variantId?: string
  name: string
  nameUrdu?: string
  barcode?: string
  unit?: string
  unitPrice: number
  cost: number
  quantity: number
  stockQuantity: number
  image?: { url: string; publicId: string }
}

export type PaymentMethod = 'cash' | 'card' | 'credit'

export function cartLineKey(item: Pick<PurchaseCatalogItem, 'productId' | 'variantId'>): string {
  return item.variantId ? `${item.productId}:${item.variantId}` : item.productId
}

export function catalogItemToCartLine(item: PurchaseCatalogItem, quantity = 1, unitPrice?: number): CartLine {
  return {
    key: cartLineKey(item),
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    nameUrdu: item.nameUrdu,
    barcode: item.barcode,
    unit: item.unit,
    unitPrice: unitPrice ?? item.price,
    cost: item.cost,
    quantity,
    stockQuantity: item.stockQuantity,
    image: item.image,
  }
}
