import { useSuppliers } from '../context/users-context'  // Changed to useSuppliers
import { SuppliersActionDialog } from './users-action-dialog'  // Changed to SuppliersActionDialog
import { SuppliersDeleteDialog } from './users-delete-dialog'  // Changed to SuppliersDeleteDialog
import { UsersInviteDialog } from './users-invite-dialog'  // Adjusted for SuppliersInviteDialog
import SupplierImportDialog from './supplier-import-dialog'
import { SupplierAiScanDialog } from './supplier-ai-scan-dialog'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkAddSuppliers } from '@/stores/supplier.slice'

export default function SuppliersDialogs({ setFetch }: any) {
  const { open, setOpen, currentRow, setCurrentRow } = useSuppliers()  // Changed to useSuppliers
  const dispatch = useDispatch<AppDispatch>()

  const handleImport = async (
    suppliers: any[],
    options?: { duplicateStrategy?: 'skip' | 'update' | 'error' }
  ) => {
    // No toast and no dialog close here: the import dialog owns the reporting, and it
    // needs the per-row breakdown in the response to say which rows didn't make it.
    // Closing on success would also hide that summary before it could be read.
    const result = await dispatch(
      bulkAddSuppliers({ suppliers, duplicateStrategy: options?.duplicateStrategy })
    ).unwrap()
    setFetch((prev: boolean) => !prev)
    return result
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

      <SupplierAiScanDialog
        key='supplier-ai-scan'
        open={open === 'ai-scan'}
        onOpenChange={(isOpen) => setOpen(isOpen ? 'ai-scan' : null)}
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
