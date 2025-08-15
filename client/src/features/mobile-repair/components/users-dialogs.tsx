import { useMobileRepair } from '../context/users-context'
import { MobileRepairActionDialog } from './users-action-dialog'
import { MobileRepairDeleteDialog } from './users-delete-dialog'

interface Props {
  setFetch: any
}

export default function MobileRepairDialogs({ setFetch }: Props) {
  const { open, setOpen, currentRow, setCurrentRow } = useMobileRepair()

  return (
    <>
      <MobileRepairActionDialog
        setFetch={setFetch}
        key="mobileRepair-add"
        open={open === 'add'}
        onOpenChange={() => setOpen('add')}
      />

      {currentRow && (
        <>
          <MobileRepairActionDialog
            key={`mobileRepair-edit-${currentRow?._id}`}
            setFetch={setFetch}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />

          <MobileRepairDeleteDialog
            key={`mobileRepair-delete-${currentRow?._id}`}
            open={open === 'delete'}
            setFetch={setFetch}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}
