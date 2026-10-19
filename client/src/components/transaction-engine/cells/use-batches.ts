import { useEffect, useState } from 'react'
import { useEngine } from '../engine-context'
import type { EntryBatch } from '../types'
import type { CellProps } from './cell-props'

/** A product's batches from the stock source (sync or async), refetched per product. */
export function useBatches(product: CellProps['row']['product']) {
  const { stock } = useEngine()
  const [batches, setBatches] = useState<EntryBatch[] | null>(null)
  useEffect(() => {
    if (!product || !stock.getBatches) {
      setBatches(null)
      return
    }
    let live = true
    Promise.resolve(stock.getBatches(product)).then((list) => {
      if (live) setBatches(list)
    })
    return () => {
      live = false
    }
    // The product object only changes when it's picked or re-linked to the live catalog,
    // never on other row edits — so this doesn't refetch on every keystroke.
  }, [product, stock])
  return batches
}
