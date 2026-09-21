import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUsers } from '../context/users-context'
import { Link } from '@tanstack/react-router'
import { PlusCircle, Upload, Building2, ChevronDown, TrendingUp } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'

export default function UsersPrimaryButtons() {
  const { setOpen } = useUsers()
  const { t } = useLanguage()

  return (
    <div className='flex gap-2'>
      {/* Entry point to the Price Update Center — supplier price lists (WhatsApp / PDF / Excel). */}
      <Can permission='managePriceUpdates'>
        <Button asChild variant='outline' className='gap-1.5'>
          <Link to='/price-updates'>
            <TrendingUp className='h-4 w-4' />
            {t('Update Prices')}
          </Link>
        </Button>
      </Can>
      <Can permission='createProducts'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' className='gap-1.5'>
              <Upload className='h-4 w-4' />
              {t('Import / Export')}
              <ChevronDown className='h-3.5 w-3.5 opacity-60' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => setOpen('import')}>
              <Upload className='mr-2 h-4 w-4' />
              {t('import_excel')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen('import-master-products')}>
              <Building2 className='mr-2 h-4 w-4' />
              {t('import_from_other_branches')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button className='gap-1.5' onClick={() => setOpen('add')}>
          <PlusCircle className='h-4 w-4' />
          {t('add_product')}
        </Button>
      </Can>
    </div>
  )
}
