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
import { useBrands } from '../context/brands-context'
import { useDeleteBrandMutation } from '@/stores/brand.api'
import toast from 'react-hot-toast'

export function BrandsDeleteDialog() {
  const { state, dispatch: contextDispatch } = useBrands()
  const [deleteBrand, { isLoading: isDeleting }] = useDeleteBrandMutation()

  const handleClose = () => {
    contextDispatch({ type: 'SET_DELETE_OPEN', payload: false })
    contextDispatch({ type: 'SET_BRAND', payload: null })
  }

  const handleDelete = async () => {
    if (!state.currentBrand) return
    const id = state.currentBrand._id || state.currentBrand.id || ''
    try {
      await deleteBrand(id).unwrap()
      toast.success(`Brand "${state.currentBrand.name}" deleted`)
      handleClose()
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to delete brand')
    }
  }

  return (
    <AlertDialog open={state.deleteOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete brand?</AlertDialogTitle>
          <AlertDialogDescription>
            This marks <strong>{state.currentBrand?.name}</strong> as inactive (soft delete) — it
            won't show up for new products, but existing products keep their brand reference and
            keep working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
