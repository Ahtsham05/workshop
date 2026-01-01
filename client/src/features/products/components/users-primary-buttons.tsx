import { Button } from '@/components/ui/button'
import { useUsers } from '../context/users-context'
import { PlusCircle, Upload } from 'lucide-react'
import { useLanguage } from '@/context/language-context'

export default function UsersPrimaryButtons() {
  const { setOpen } = useUsers()
  const { t } = useLanguage()
  
  return (
    <div className='flex gap-2'>
      <Button 
        variant='outline' 
        className='space-x-1' 
        onClick={() => setOpen('import')}
      >
        <span>{t('import_excel')}</span> <Upload size={18} />
      </Button>
      <Button className='space-x-1' onClick={() => setOpen('add')}>
        <span>{t('add_product')}</span> <PlusCircle size={18} />
      </Button>
    </div>
  )
}
