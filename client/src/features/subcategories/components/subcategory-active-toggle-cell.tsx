import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { AppDispatch } from '@/stores/store'
import { updateSubCategory, type SubCategory } from '@/stores/subCategory.slice'
import { usePermissions } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'

/** Inline Active/Inactive switch — same pattern as CategoryActiveToggleCell/Products'
 * ActiveToggleCell. Deactivating a sub-category hides it from the Add/Edit Product
 * picker without touching any product that already references it. */
export function SubCategoryActiveToggleCell({ subCategory }: { subCategory: SubCategory }) {
  const dispatch = useDispatch<AppDispatch>()
  const { hasExplicitPermission } = usePermissions()
  const { t } = useLanguage()
  const canEdit = hasExplicitPermission('editCategories')
  const [isActive, setIsActive] = useState(subCategory.isActive !== false)
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
      await dispatch(updateSubCategory({ id: subCategory.id, isActive: next })).unwrap()
      toast.success(next ? t('subcategory_activated') : t('subcategory_deactivated'))
    } catch {
      setIsActive(!next)
      toast.error(t('subcategory_status_update_failed'))
    } finally {
      setSaving(false)
    }
  }

  return <Switch checked={isActive} disabled={saving} onCheckedChange={handleToggle} />
}
