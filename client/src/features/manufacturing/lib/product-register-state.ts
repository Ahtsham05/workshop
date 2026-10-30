import { useCallback, useState } from 'react'

/* Product-wise production register: the chosen products, whether they are added up as one
 * product line, and typed kg per pack — remembered in this browser (see
 * components/product-register-controls.tsx). */

const PRODUCTS_KEY = 'mfg-register-products'
const WEIGHTS_KEY = 'mfg-register-pack-weights'
const COMBINE_KEY = 'mfg-register-combine'
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
    () => readMap(WEIGHTS_KEY)
  )
  const [combine, setCombineState] = useState<boolean>(
    () => read<unknown>(COMBINE_KEY, false) === true
  )
  const setProductIds = useCallback((ids: string[]) => {
    const next = [...new Set(ids)].slice(0, MAX_REGISTER_PRODUCTS)
    setProductIdsState(next)
    write(PRODUCTS_KEY, next)
  }, [])
  const setPackWeight = useCallback(
    (key: string, kg: number | null) =>
      setPackWeightsState((prev) => withKg(prev, key, kg, WEIGHTS_KEY)),
    []
  )
  const setCombine = useCallback((value: boolean) => {
    setCombineState(value)
    write(COMBINE_KEY, value)
  }, [])
  return {
    productIds,
    setProductIds,
    packWeights,
    setPackWeight,
    combine,
    setCombine,
  }
}

const readMap = (key: string): Record<string, number> => {
  const map = read<unknown>(key, {})
  return map && typeof map === 'object' ? (map as Record<string, number>) : {}
}
const withKg = (
  prev: Record<string, number>,
  key: string,
  kg: number | null,
  storageKey: string
) => {
  const next = { ...prev }
  if (kg && kg > 0) next[key] = kg
  else delete next[key]
  write(storageKey, next)
  return next
}

/** "id=20,id:variant=5" (kg per pack) for the products on the register only. */
export const packWeightsParam = (
  weights: Record<string, number>,
  productIds: string[]
) =>
  Object.entries(weights)
    .filter(([key, kg]) => productIds.includes(key.split(':')[0]) && kg > 0)
    .map(([key, kg]) => `${key}=${kg}`)
    .join(',') || undefined
