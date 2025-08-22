import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCategories } from '../context/categories-context'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { deleteCategory } from '@/stores/category.slice'
import { toast } from 'sonner'
import { useState } from 'react'
import { useLanguage } from '@/context/language-context'

interface CategoriesDeleteDialogProps {
  setFetch: (fetch: boolean) => void
}

export function CategoriesDeleteDialog({ setFetch }: CategoriesDeleteDialogProps) {
  const { state, dispatch: contextDispatch } = useCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!state.currentCategory) return

    setIsDeleting(true)
    try {
      await reduxDispatch(deleteCategory(state.currentCategory.id)).unwrap()
      toast.success(t('category_deleted_successfully'))
      contextDispatch({ type: 'SET_DELETE_OPEN', payload: false })
      contextDispatch({ type: 'SET_CATEGORY', payload: null })
      setFetch(true)
    } catch (error) {
      toast.error(t('category_deletion_failed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    contextDispatch({ type: 'SET_DELETE_OPEN', payload: false })
    contextDispatch({ type: 'SET_CATEGORY', payload: null })
  }

  return (
    <AlertDialog open={state.deleteOpen} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('delete_category')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('delete_category_confirmation')} <strong>{state.currentCategory?.name}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? t('deleting') : t('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
