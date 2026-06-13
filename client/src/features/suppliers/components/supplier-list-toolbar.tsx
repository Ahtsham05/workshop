import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import type { SupplierListViewMode } from '../utils/supplier-list-view'

type Props = {
  searchInput: string
  onSearchChange: (value: string) => void
  viewMode: SupplierListViewMode
  onViewModeChange: (mode: SupplierListViewMode) => void
}

export function SupplierListToolbar({
  searchInput,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: Props) {
  const { t } = useLanguage()

  return (
    <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
      <div className='min-w-0 flex-1 max-w-md'>
        <Input
          autoFocus
          placeholder={t('search_suppliers')}
          className='h-9 w-full'
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={t('search_suppliers')}
        />
      </div>
      <div className='flex items-center gap-1 rounded-lg border p-1'>
        <span className='px-2 text-xs text-muted-foreground'>{t('view')}</span>
        <Button
          type='button'
          size='sm'
          variant={viewMode === 'cards' ? 'default' : 'ghost'}
          className='h-8 px-2.5'
          onClick={() => onViewModeChange('cards')}
          aria-label={t('view')}
          title='Cards'
        >
          <LayoutGrid className='h-4 w-4' />
        </Button>
        <Button
          type='button'
          size='sm'
          variant={viewMode === 'table' ? 'default' : 'ghost'}
          className='h-8 px-2.5'
          onClick={() => onViewModeChange('table')}
          aria-label={t('view')}
          title='Table'
        >
          <List className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
}
