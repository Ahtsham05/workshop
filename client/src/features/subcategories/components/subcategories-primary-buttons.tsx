import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useSubCategories } from '../context/subcategories-context'
import { useLanguage } from '@/context/language-context'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface SubCategoriesPrimaryButtonsProps {
  hasCategories: boolean
  defaultCategoryId?: string | null
}

export default function SubCategoriesPrimaryButtons({ hasCategories, defaultCategoryId }: SubCategoriesPrimaryButtonsProps) {
  const { dispatch } = useSubCategories()
  const { t } = useLanguage()

  const handleAddSubCategory = () => {
    dispatch({ type: 'SET_SUBCATEGORY', payload: null })
    dispatch({ type: 'SET_DEFAULT_CATEGORY_ID', payload: defaultCategoryId ?? null })
    dispatch({ type: 'SET_OPEN', payload: true })
  }

  const button = (
    <Button onClick={handleAddSubCategory} size="sm" className="h-9" disabled={!hasCategories}>
      <Plus className="mr-2 h-4 w-4" />
      {t('add_subcategory')}
    </Button>
  )

  if (hasCategories) {
    return <div className="flex items-center space-x-2">{button}</div>
  }

  return (
    <div className="flex items-center space-x-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent>{t('create_category_first_hint')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
