import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

export default function UsersPrimaryButtons() {
  const navigate = useNavigate()
  const addPurchase = () => {
    navigate({ to: '/purchase-add', replace: true })
  }
  return (
    <div className='flex gap-2'>
      {/* <Button
        variant='outline'
        className='space-x-1'
        onClick={() => setOpen('invite')}
      >
        <span>Invite User</span> <IconMailPlus size={18} />
      </Button> */}
      <Button className='space-x-1' onClick={() => addPurchase()}>
        <span>Add Purchase</span> <PlusCircle size={18} />
      </Button>
    </div>
  )
}
