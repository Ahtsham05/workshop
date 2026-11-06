import { useMemo } from 'react'
import { useGetRepairSettingsQuery } from '@/stores/mobile-shop.api'
import {
  useGetPurchasableCatalogQuery,
  type PurchaseCatalogItem,
} from '@/stores/purchaseCatalog.api'
import { filterAndRankBySearch } from '@/utils/urdu-text-utils'
import { categoriesOf } from './repair-meta'

/**
 * The branch catalog as repair parts: IMEI/serial items removed, and — once the shop has
 * picked its repair part categories — only products in those categories (unless `all`).
 */
export function usePartCatalog({
  skip = false,
  all = false,
}: { skip?: boolean; all?: boolean } = {}) {
  const { data: catalog = [], isLoading: catalogLoading } =
    useGetPurchasableCatalogQuery(undefined, { skip })
  const { data: settings, isLoading: settingsLoading } =
    useGetRepairSettingsQuery(undefined, { skip })

  const usable = useMemo(
    () => catalog.filter((c) => !c.trackImei && !c.trackSerial),
    [catalog]
  )
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>()
    usable.forEach((c) =>
      categoriesOf(c).forEach((n) => m.set(n, (m.get(n) ?? 0) + 1))
    )
    return m
  }, [usable])
  const partCategories = useMemo(
    () => settings?.partCategories ?? [],
    [settings]
  )
  const partSet = useMemo(
    () => new Set(partCategories.map((n) => n.toLowerCase())),
    [partCategories]
  )
  const configured = partSet.size > 0
  const repairOnly = configured && !all
  const pool = useMemo(
    () =>
      repairOnly
        ? usable.filter((c) =>
            categoriesOf(c).some((n) => partSet.has(n.toLowerCase()))
          )
        : usable,
    [usable, repairOnly, partSet]
  )

  const search = (q: string, limit = 40, from: PurchaseCatalogItem[] = pool) =>
    filterAndRankBySearch(from, q, (c) => [
      c.name,
      c.nameUrdu,
      c.barcode,
      c.brand?.name,
      c.category,
    ]).slice(0, limit)

  return {
    loading: catalogLoading || settingsLoading,
    settingsLoading,
    usable,
    pool,
    categoryCounts,
    partCategories,
    configured,
    repairOnly,
    search,
  }
}

/** The batch a quantity would come from (first with enough), for batch-tracked parts. */
export const batchFor = (item: PurchaseCatalogItem, qty: number) =>
  item.trackBatch ? item.batches?.find((b) => b.quantity >= qty) : undefined

export const availableOf = (item: PurchaseCatalogItem, qty: number) =>
  item.trackBatch ? (batchFor(item, qty)?.quantity ?? 0) : item.stockQuantity
