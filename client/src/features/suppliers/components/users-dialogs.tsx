import { useSuppliers } from '../context/users-context'  // Changed to useSuppliers
import { SuppliersActionDialog } from './users-action-dialog'  // Changed to SuppliersActionDialog
import { SuppliersDeleteDialog } from './users-delete-dialog'  // Changed to SuppliersDeleteDialog
import { UsersInviteDialog } from './users-invite-dialog'  // Adjusted for SuppliersInviteDialog

export default function SuppliersDialogs({ setFetch }: any) {
  const { open, setOpen, currentRow, setCurrentRow } = useSuppliers()  // Changed to useSuppliers
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
