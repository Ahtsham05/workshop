import { useState } from 'react'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/switch'
import { AppDispatch } from '@/stores/store'
import { updateSupplier } from '@/stores/supplier.slice'
import { Supplier } from '../data/schema'

/** Inline Active/Inactive switch — flips immediately (reverts on failure). `onToggled`
 * fires after a successful save so the parent list can re-sort/re-navigate (the
 * Suppliers list sorts active-first/inactive-last and jumps to the last page on
 * deactivate — see index.tsx). */
export function ActiveToggleCell({ supplier, onToggled }: { supplier: Supplier; onToggled?: (next: boolean) => void }) {
  const dispatch = useDispatch<AppDispatch>()
  const [isActive, setIsActive] = useState(supplier.isActive !== false)
  const [saving, setSaving] = useState(false)
  const supplierId = supplier._id || supplier.id || ''

  const handleToggle = async (next: boolean) => {
    setIsActive(next)
    setSaving(true)
    try {
      await dispatch(updateSupplier({ _id: supplierId, isActive: next })).unwrap()
      toast.success(next ? 'Supplier activated' : 'Supplier deactivated')
      onToggled?.(next)
    } catch {
      setIsActive(!next)
      toast.error('Failed to update supplier status')
    } finally {
      setSaving(false)
    }
  }

  return <Switch checked={isActive} disabled={saving} onCheckedChange={handleToggle} />
}
