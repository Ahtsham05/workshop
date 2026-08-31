import { useState } from 'react'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useUpdateBrandMutation, type Brand } from '@/stores/brand.api'
import { usePermissions } from '@/context/permission-context'

/** Inline Active/Inactive switch — flips immediately (reverts on failure), same spirit
 * as Products' ActiveToggleCell. Brand has no `isActive` boolean; it uses the same
 * `status: 'active' | 'inactive'` field the soft-delete flow already flips, so toggling
 * off here is equivalent to the "Delete" action in the row menu — just reversible. */
export function BrandActiveToggleCell({ brand }: { brand: Brand }) {
  const { hasExplicitPermission } = usePermissions()
  const canEdit = hasExplicitPermission('editBrands')
  const [updateBrand] = useUpdateBrandMutation()
  const [isActive, setIsActive] = useState(brand.status !== 'inactive')
  const [saving, setSaving] = useState(false)
  const brandId = brand._id || brand.id || ''

  if (!canEdit) {
    return (
      <Badge variant={isActive ? 'default' : 'outline'} className="capitalize">
        {isActive ? 'active' : 'inactive'}
      </Badge>
    )
  }

  const handleToggle = async (next: boolean) => {
    setIsActive(next)
    setSaving(true)
    try {
      await updateBrand({ brandId, data: { status: next ? 'active' : 'inactive' } }).unwrap()
      toast.success(next ? 'Brand activated' : 'Brand deactivated')
    } catch {
      setIsActive(!next)
      toast.error('Failed to update brand status')
    } finally {
      setSaving(false)
    }
  }

  return <Switch checked={isActive} disabled={saving} onCheckedChange={handleToggle} />
}
