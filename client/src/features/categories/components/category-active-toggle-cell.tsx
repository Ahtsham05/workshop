import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { AppDispatch } from '@/stores/store'
import { updateCategory, type Category } from '@/stores/category.slice'
import { usePermissions } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'

/** Inline Active/Inactive switch — flips immediately (reverts on failure), matching
 * Products' ActiveToggleCell. Deactivating a category hides it (and its sub-categories)
 * from the Add/Edit Product pickers without touching any product that already
 * references it — see product picker filtering in users-action-dialog.tsx. */
export function CategoryActiveToggleCell({ category }: { category: Category }) {
  const dispatch = useDispatch<AppDispatch>()
  const { hasExplicitPermission } = usePermissions()
  const { t } = useLanguage()
  const canEdit = hasExplicitPermission('editCategories')
  const [isActive, setIsActive] = useState(category.isActive !== false)
  const [saving, setSaving] = useState(false)

  if (!canEdit) {
    return (
      <Badge variant={isActive ? 'default' : 'outline'} className="capitalize">
        {isActive ? t('active') : t('inactive')}
      </Badge>
    )
  }

  const handleToggle = async (next: boolean) => {
    setIsActive(next)
    setSaving(true)
    try {
      await dispatch(updateCategory({ id: category.id, isActive: next })).unwrap()
      toast.success(next ? t('category_activated') : t('category_deactivated'))
    } catch {
      setIsActive(!next)
      toast.error(t('category_status_update_failed'))
    } finally {
      setSaving(false)
    }
  }

  return <Switch checked={isActive} disabled={saving} onCheckedChange={handleToggle} />
}
