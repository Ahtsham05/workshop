import { useCustomers } from '../context/users-context'
import { CustomersActionDialog } from './users-action-dialog'
import { CustomersDeleteDialog } from './users-delete-dialog'
import { UsersInviteDialog } from './users-invite-dialog'
import { CustomerImportDialog } from './customer-import-dialog'
import { CustomerAiScanDialog } from './customer-ai-scan-dialog'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkAddCustomers } from '@/stores/customer.slice'

export default function UsersDialogs({setFetch}:any) {
  const { open, setOpen, currentRow, setCurrentRow } = useCustomers()
  const dispatch = useDispatch<AppDispatch>()

  const handleImport = async (
    customers: any[],
    options?: { duplicateStrategy?: 'skip' | 'update' | 'error' }
  ) => {
    // The per-row breakdown in the response is what the import dialog turns into "row 14
    // could not be saved because…", so it's returned rather than swallowed. The AI card
    // scanner calls this too, without a strategy, and gets the server default.
    const result = await dispatch(
      bulkAddCustomers({ customers, duplicateStrategy: options?.duplicateStrategy })
    )

    if (result.meta.requestStatus !== 'fulfilled') {
      const payload = result.payload as { response?: { data?: { message?: string } }; message?: string } | undefined
      throw new Error(payload?.response?.data?.message || payload?.message || 'Import failed')
    }

    setFetch((prev: boolean) => !prev)
    return result.payload
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

      <CustomerAiScanDialog
        key='customer-ai-scan'
        open={open === 'ai-scan'}
        onOpenChange={() => setOpen('ai-scan')}
        onImport={handleImport}
      />
    </>
  )
}
