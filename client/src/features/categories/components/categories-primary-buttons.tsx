import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useCategories } from '../context/categories-context'
import { useLanguage } from '@/context/language-context'

export default function CategoriesPrimaryButtons() {
  const { dispatch } = useCategories()
  const { t } = useLanguage()

  const handleAddCategory = () => {
    dispatch({ type: 'SET_CATEGORY', payload: null })
    dispatch({ type: 'SET_OPEN', payload: true })
  }

  return (
    <div className="flex items-center space-x-2">
      <Button onClick={handleAddCategory} size="sm" className="h-8">
        <Plus className="mr-2 h-4 w-4" />
        {t('add_category')}
      </Button>
    </div>
  )
}
