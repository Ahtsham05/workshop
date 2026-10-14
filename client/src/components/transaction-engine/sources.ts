import { useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { imeiApi } from '@/stores/imei.api'
import { productApi } from '@/stores/product.api'
import {
  useGetPurchasableCatalogQuery,
  type PurchaseCatalogItem,
} from '@/stores/purchaseCatalog.api'
import type { AppDispatch } from '@/stores/store'
import {
  buildProductIndex,
  lookupInIndex,
  lookupNameInIndex,
  rankProducts,
} from './search'
import type { EntryProduct, ProductSource, StockSource } from './types'

/*
 * Default data sources built on the app's existing APIs — no new product, stock or
 * warehouse system. The product catalog is the same `/products/purchasable` list the
 * invoice and purchase screens load: fetched once (RTK Query cache, refreshed when stock
 * moves) and searched in memory, so typing never hits the server.
 */

export function catalogItemToProduct(item: PurchaseCatalogItem): EntryProduct {
  return {
    key: item.id,
    productId: item.productId,
    variantId: item.variantId ?? null,
    name: item.name,
    subtitle:
      [item.variantLabel, item.brand?.name, item.barcode]
        .filter(Boolean)
        .join(' · ') || undefined,
    code: item.barcode,
    unit: item.unit,
    cost: item.cost ?? null,
    price: item.price ?? null,
    stock: item.stockQuantity ?? null,
    trackBatch: !!(item.trackBatch || item.trackExpiry),
    trackSerial: !!(item.trackImei || item.trackSerial),
    imageUrl: item.image?.url,
    raw: item,
  }
}

/** Products from the branch catalog (variants as their own rows). */
export function useCatalogProductSource(): ProductSource & {
  products: EntryProduct[]
} {
  const dispatch = useDispatch<AppDispatch>()
  const { data, isLoading } = useGetPurchasableCatalogQuery()
  const products = useMemo(() => (data || []).map(catalogItemToProduct), [data])
  const index = useMemo(() => buildProductIndex(products), [products])
  const byKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products]
  )
  const byProductId = useMemo(() => {
    const map = new Map<string, EntryProduct>()
    products.forEach((p) => {
      if (!p.variantId && !map.has(p.productId)) map.set(p.productId, p)
    })
    return map
  }, [products])

  return useMemo(
    () => ({
      products,
      loading: isLoading,
      search: (query, limit) => rankProducts(index, query, limit),
      lookupName: (name) => lookupNameInIndex(index, name),
      getByKey: (key) => byKey.get(key) ?? null,
      lookupCode: async (code) => {
        const local = lookupInIndex(index, code)
        if (local) return local
        // Not a catalog barcode — the server also matches SKUs and variant codes.
        try {
          const res = await dispatch(
            productApi.endpoints.lookupProductByCode.initiate(code.trim())
          ).unwrap()
          const id = res?.product
            ? String(res.product.id || res.product._id || '')
            : ''
          return (id && byProductId.get(id)) || null
        } catch {
          return null
        }
      },
    }),
    [products, isLoading, index, byKey, byProductId, dispatch]
  )
}

/** Batches from the catalog, in-stock serials from the IMEI API, branches as warehouses. */
export function useCatalogStockSource(): StockSource {
  const dispatch = useDispatch<AppDispatch>()
  const { data: branches } = useGetMyBranchesQuery()
  return useMemo(
    () => ({
      warehouses: (branches || []).map((b) => ({ id: b.id, name: b.name })),
      getBatches: (product) => {
        const item = product.raw as PurchaseCatalogItem | undefined
        return (item?.batches || [])
          .filter((b) => b.quantity > 0)
          .map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            quantity: b.quantity,
            expiryDate: b.expiryDate ?? null,
            cost: b.costPerUnit ?? null,
          }))
      },
      getSerials: async (product, { batchId, search }) => {
        const records = await dispatch(
          imeiApi.endpoints.getAvailableImeis.initiate({
            productId: product.productId,
            ...(batchId ? { batchId } : {}),
            ...(search ? { search } : {}),
          })
        ).unwrap()
        return records.map((r) => ({
          id: r.id,
          serial: r.imei,
          batchId:
            typeof r.batchId === 'object' && r.batchId
              ? r.batchId.id
              : ((r.batchId as string | null) ?? null),
        }))
      },
    }),
    [branches, dispatch]
  )
}
