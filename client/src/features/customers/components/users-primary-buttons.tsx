import { Button } from '@/components/ui/button'
import { useCustomers } from '../context/users-context'
import { PlusCircle } from 'lucide-react'

export default function UsersPrimaryButtons() {
  const { setOpen } = useCustomers()
  return (
    <div className='flex gap-2'>
      {/* <Button
        variant='outline'
        className='space-x-1'
        onClick={() => setOpen('invite')}
      >
        <span>Invite User</span> <IconMailPlus size={18} />
      </Button> */}
      <Button className='space-x-1' onClick={() => setOpen('add')}>
        <span>Add Customers</span> <PlusCircle size={18} />
      </Button>
    </div>
  )
}
