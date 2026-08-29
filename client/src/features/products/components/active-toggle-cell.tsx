import { useState } from 'react'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/switch'
import { AppDispatch } from '@/stores/store'
import { updateProduct } from '@/stores/product.slice'
import { productApi } from '@/stores/product.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { Product } from '../data/schema'

/** Inline Active/Inactive switch — flips immediately (reverts on failure), same spirit
 * as the row's Flag toggle. Imported products start inactive (see
 * product.service.js#bulkAddProducts) so this switch is how they get reviewed and
 * turned on. `onToggled` fires after a successful save so the parent list can re-sort
 * (the Products list sorts active-first/inactive-last — see index.tsx's
 * PRODUCTS_SORT_BY — which a purely local switch flip wouldn't otherwise reflect). */
export function ActiveToggleCell({ product, onToggled }: { product: Product; onToggled?: () => void }) {
  const dispatch = useDispatch<AppDispatch>()
  const [isActive, setIsActive] = useState(product.isActive !== false)
  const [saving, setSaving] = useState(false)
  const productId = product._id || product.id || ''

  const handleToggle = async (next: boolean) => {
    setIsActive(next)
    setSaving(true)
    try {
      await dispatch(updateProduct({ _id: productId, isActive: next })).unwrap()
      // getPurchasableCatalog (Invoice/Purchase/POS/Stock item pickers) is a separate
      // RTK Query cache from this plain updateProduct thunk — without this, an
      // already-open Invoice/Purchase tab keeps showing the product under its old
      // active status until something else happens to invalidate that cache. Same
      // pattern invoice.api.ts/purchase.api.ts/etc. already use after their own writes.
      dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
      dispatch(productApi.util.invalidateTags([{ type: 'Product', id: productId }]))
      toast.success(next ? 'Product activated' : 'Product deactivated')
      onToggled?.()
    } catch {
      setIsActive(!next)
      toast.error('Failed to update product status')
    } finally {
      setSaving(false)
    }
  }

  return <Switch checked={isActive} disabled={saving} onCheckedChange={handleToggle} />
}
