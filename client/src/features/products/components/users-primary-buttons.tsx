import { Button } from '@/components/ui/button'
import { useUsers } from '../context/users-context'
import { PlusCircle, Upload, Sparkles, Building2 } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'

export default function UsersPrimaryButtons() {
  const { setOpen } = useUsers()
  const { t } = useLanguage()

  return (
    <div className='flex gap-2'>
      <Can permission='createProducts'>
        <Button
          variant='outline'
          className='space-x-1'
          onClick={() => setOpen('import-master-products')}
        >
          <span>{t('import_from_other_branches')}</span> <Building2 size={18} />
        </Button>
      </Can>
      <Button
        variant='outline'
        className='space-x-1'
        onClick={() => setOpen('ai-scan')}
      >
        <span>{t('ai_scan')}</span> <Sparkles size={18} />
      </Button>
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
