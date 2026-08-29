import { useState } from 'react'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/switch'
import { AppDispatch } from '@/stores/store'
import { updateCustomer } from '@/stores/customer.slice'
import { Customer } from '../data/schema'

/** Inline Active/Inactive switch — flips immediately (reverts on failure). `onToggled`
 * fires after a successful save so the parent list can re-sort/re-navigate (the
 * Customers list sorts active-first/inactive-last and jumps to the last page on
 * deactivate — see index.tsx). */
export function ActiveToggleCell({ customer, onToggled }: { customer: Customer; onToggled?: (next: boolean) => void }) {
  const dispatch = useDispatch<AppDispatch>()
  const [isActive, setIsActive] = useState(customer.isActive !== false)
  const [saving, setSaving] = useState(false)
  const customerId = customer._id || customer.id || ''

  const handleToggle = async (next: boolean) => {
    setIsActive(next)
    setSaving(true)
    try {
      await dispatch(updateCustomer({ _id: customerId, isActive: next })).unwrap()
      toast.success(next ? 'Customer activated' : 'Customer deactivated')
      onToggled?.(next)
    } catch {
      setIsActive(!next)
      toast.error('Failed to update customer status')
    } finally {
      setSaving(false)
    }
  }

  return <Switch checked={isActive} disabled={saving} onCheckedChange={handleToggle} />
}
