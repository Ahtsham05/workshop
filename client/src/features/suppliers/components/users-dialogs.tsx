import { useSuppliers } from '../context/users-context'  // Changed to useSuppliers
import { SuppliersActionDialog } from './users-action-dialog'  // Changed to SuppliersActionDialog
import { SuppliersDeleteDialog } from './users-delete-dialog'  // Changed to SuppliersDeleteDialog
import { UsersInviteDialog } from './users-invite-dialog'  // Adjusted for SuppliersInviteDialog
import SupplierImportDialog from './supplier-import-dialog'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkAddSuppliers } from '@/stores/supplier.slice'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-context'

export default function SuppliersDialogs({ setFetch }: any) {
  const { open, setOpen, currentRow, setCurrentRow } = useSuppliers()  // Changed to useSuppliers
  const dispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const handleImport = async (suppliers: any[]) => {
    try {
      const result = await dispatch(bulkAddSuppliers({ suppliers })).unwrap()
      
      toast.success(
        t('import_successful') || 'Import successful',
        {
          description: `${result.insertedCount} ${t('suppliers_plural')} ${t('imported_successfully')}`
        }
      )
      
      setFetch(true)
      setOpen(null)
    } catch (error: any) {
      console.error('Import error:', error)
      toast.error(
        t('error_importing_suppliers') || 'Error importing suppliers',
        {
          description: error.message || t('please_try_again')
        }
      )
    }
  }

  return (
    <>
      <SuppliersActionDialog
        setFetch={setFetch}
        key='supplier-add'
        open={open === 'add'}
        onOpenChange={() => setOpen('add')}
      />

      <UsersInviteDialog
        key='supplier-invite'
        open={open === 'invite'}
        onOpenChange={() => setOpen('invite')}
      />

      <SupplierImportDialog
        key='supplier-import'
        open={open === 'import'}
        onClose={() => setOpen(null)}
        onImport={handleImport}
      />

      {currentRow && (
        <>
          <SuppliersActionDialog
            key={`supplier-edit-${currentRow?._id}`}
            setFetch={setFetch}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />

          <SuppliersDeleteDialog
            key={`supplier-delete-${currentRow?._id}`}
            open={open === 'delete'}
            setFetch={setFetch}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}
