import { useUsers } from '../context/users-context'
import { UsersActionDialog } from './users-action-dialog'
import { UsersDeleteDialog } from './users-delete-dialog'
import { UsersInviteDialog } from './users-invite-dialog'
import { ProductImportDialog } from './product-import-dialog'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkAddProducts } from '@/stores/product.slice'

export default function UsersDialogs({setFetch}:any) {
  const { open, setOpen, currentRow, setCurrentRow } = useUsers()
  const dispatch = useDispatch<AppDispatch>()

  const handleImport = async (products: any[]) => {
    try {
      const result = await dispatch(bulkAddProducts({ products }))
      
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
      <UsersActionDialog
        setFetch={setFetch}
        key='user-add'
        open={open === 'add'}
        onOpenChange={() => setOpen('add')}
      />

      <ProductImportDialog
        key='product-import'
        open={open === 'import'}
        onOpenChange={() => setOpen('import')}
        onImport={handleImport}
      />

      <UsersInviteDialog
        key='user-invite'
        open={open === 'invite'}
        onOpenChange={() => setOpen('invite')}
      />

      {currentRow && (
        <>
          <UsersActionDialog
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

          <UsersDeleteDialog
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
    </>
  )
}
