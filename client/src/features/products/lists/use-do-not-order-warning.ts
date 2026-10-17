import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useGetDoNotOrderProductsQuery } from '@/stores/productList.api'

/**
 * Purchase / Purchase Order screens: warn the moment a product on a "Do not order" list
 * is picked (discontinued, slow, being phased out). A warning only — the line is still
 * added, since only the person ordering knows if this time is the exception.
 */
export function useDoNotOrderWarning() {
  const { data } = useGetDoNotOrderProductsQuery()
  const flagsRef = useRef(data)
  flagsRef.current = data
  return useCallback((productId: string | undefined, productName?: string) => {
    if (!productId) return
    const flag = flagsRef.current?.[productId]
    if (!flag) return
    toast.warning(`“${productName || 'This product'}” is on your “${flag.listName}” list`, {
      description: flag.note || 'It was marked not to be ordered again. Check before buying it.',
      duration: 8000,
    })
  }, [])
}
