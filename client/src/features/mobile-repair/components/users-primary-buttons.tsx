import { Button } from '@/components/ui/button'
import { useMobileRepair } from '../context/users-context'
import { PlusCircle } from 'lucide-react'

export default function MobileRepairPrimaryButtons() {
  const { setOpen } = useMobileRepair()
  return (
    <div className="flex gap-2">
      <Button className="space-x-1" onClick={() => setOpen('add')}>
        <span>Add Mobile Repair</span> <PlusCircle size={18} />
      </Button>
    </div>
  )
}
