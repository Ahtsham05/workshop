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
import { useSubCategories } from '../context/subcategories-context'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { deleteSubCategory } from '@/stores/subCategory.slice'
import { toast } from 'sonner'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { useLanguage } from '@/context/language-context'

interface SubCategoriesDeleteDialogProps {
  setFetch: Dispatch<SetStateAction<boolean>>
}

export function SubCategoriesDeleteDialog({ setFetch }: SubCategoriesDeleteDialogProps) {
  const { state, dispatch: contextDispatch } = useSubCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!state.currentSubCategory) return

    setIsDeleting(true)
    try {
      await reduxDispatch(deleteSubCategory(state.currentSubCategory.id)).unwrap()
      toast.success(t('subcategory_deleted_successfully'))
      contextDispatch({ type: 'SET_DELETE_OPEN', payload: false })
      contextDispatch({ type: 'SET_SUBCATEGORY', payload: null })
      setFetch((previous) => !previous)
    } catch (error) {
      toast.error(t('subcategory_deletion_failed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    contextDispatch({ type: 'SET_DELETE_OPEN', payload: false })
    contextDispatch({ type: 'SET_SUBCATEGORY', payload: null })
  }

  return (
    <AlertDialog open={state.deleteOpen} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('delete_subcategory')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('delete_subcategory_confirmation')} <strong>{state.currentSubCategory?.name}</strong>?
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
