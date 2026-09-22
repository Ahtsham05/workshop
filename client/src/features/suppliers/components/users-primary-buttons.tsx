import { Button } from '@/components/ui/button'
import { useSuppliers } from '../context/users-context'
import { PlusCircle, Upload, Sparkles } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'

export default function UsersPrimaryButtons() {
  const { setOpen } = useSuppliers()
  const { t } = useLanguage()
  // Phones: the three buttons need ~395px and ran off the right edge of a 375px screen (dragging the
  // whole page sideways). Below 640px the two secondary buttons share a row and "Add" gets the full
  // width under them; from 640px up this is the same single row as before.
  return (
    <div className='flex gap-2 max-sm:grid max-sm:w-full max-sm:grid-cols-2'>
      {/* <Button
        variant='outline'
        className='space-x-1'
        onClick={() => setOpen('invite')}
      >
        <span>Invite User</span> <IconMailPlus size={18} />
      </Button> */}
      <Can permission="createSuppliers">
        <Button
          variant='outline'
          className='space-x-1 max-sm:px-3'
          onClick={() => setOpen('ai-scan')}
        >
          <span>{t('ai_scan')}</span> <Sparkles size={18} />
        </Button>
        <Button
          variant='outline'
          className='space-x-1 max-sm:px-3'
          onClick={() => setOpen('import')}
        >
          <span>{t('import_excel')}</span> <Upload size={18} />
        </Button>
        <Button className='space-x-1 max-sm:col-span-2' onClick={() => setOpen('add')}>
          <span>{t('add_supplier')}</span> <PlusCircle size={18} />
        </Button>
      </Can>
    </div>
  )
}
