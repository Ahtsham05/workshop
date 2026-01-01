import { useCustomers } from '../context/users-context'
import { CustomersActionDialog } from './users-action-dialog'
import { CustomersDeleteDialog } from './users-delete-dialog'
import { UsersInviteDialog } from './users-invite-dialog'
import { CustomerImportDialog } from './customer-import-dialog'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkAddCustomers } from '@/stores/customer.slice'

export default function UsersDialogs({setFetch}:any) {
  const { open, setOpen, currentRow, setCurrentRow } = useCustomers()
  const dispatch = useDispatch<AppDispatch>()

  const handleImport = async (customers: any[]) => {
    try {
      const result = await dispatch(bulkAddCustomers({ customers }))
      
      if (result.meta.requestStatus === 'fulfilled') {
        setFetch((prev: boolean) => !prev)
        return Promise.resolve()
      } else {
        throw new Error(result.payload || 'Import failed')
      }
    } catch (error) {
      console.error('Import error:', error)
      throw error
    }
  }
  return (
    <>
      <CustomersActionDialog
        setFetch={setFetch}
        key='user-add'
        open={open === 'add'}
        onOpenChange={() => setOpen('add')}
      />

      <UsersInviteDialog
        key='user-invite'
        open={open === 'invite'}
        onOpenChange={() => setOpen('invite')}
      />

      {currentRow && (
        <>
          <CustomersActionDialog
            key={`user-edit-${currentRow?._id}`}
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

          <CustomersDeleteDialog
            key={`user-delete-${currentRow?._id}`}
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

      <CustomerImportDialog
        key='customer-import'
        open={open === 'import'}
        onOpenChange={() => setOpen('import')}
        onImport={handleImport}
      />
    </>
  )
}
