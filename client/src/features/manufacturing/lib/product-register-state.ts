import { useCallback, useState } from 'react'

/* Product-wise production register: the chosen product line and typed kg per pack,
 * remembered in this browser (see components/product-register-controls.tsx). */

const PRODUCTS_KEY = 'mfg-register-products'
const WEIGHTS_KEY = 'mfg-register-pack-weights'
export const MAX_REGISTER_PRODUCTS = 12

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — the choice just isn't remembered */
  }
}

/** Selected product ids and typed pack weights, remembered per browser. */
export function useProductRegisterState() {
  const [productIds, setProductIdsState] = useState<string[]>(() => {
    const ids = read<unknown>(PRODUCTS_KEY, [])
    return Array.isArray(ids)
      ? ids
          .filter((v): v is string => typeof v === 'string')
          .slice(0, MAX_REGISTER_PRODUCTS)
      : []
  })
  const [packWeights, setPackWeightsState] = useState<Record<string, number>>(
    () => {
      const map = read<unknown>(WEIGHTS_KEY, {})
      return map && typeof map === 'object'
        ? (map as Record<string, number>)
        : {}
    }
  )
  const setProductIds = useCallback((ids: string[]) => {
    const next = [...new Set(ids)].slice(0, MAX_REGISTER_PRODUCTS)
    setProductIdsState(next)
    write(PRODUCTS_KEY, next)
  }, [])
  const setPackWeight = useCallback((key: string, kg: number | null) => {
    setPackWeightsState((prev) => {
      const next = { ...prev }
      if (kg && kg > 0) next[key] = kg
      else delete next[key]
      write(WEIGHTS_KEY, next)
      return next
    })
  }, [])
  return { productIds, setProductIds, packWeights, setPackWeight }
}

/** "id=20,id:variant=5" for the products on the register only. */
export const packWeightsParam = (
  weights: Record<string, number>,
  productIds: string[]
) =>
  Object.entries(weights)
    .filter(([key, kg]) => productIds.includes(key.split(':')[0]) && kg > 0)
    .map(([key, kg]) => `${key}=${kg}`)
    .join(',') || undefined
