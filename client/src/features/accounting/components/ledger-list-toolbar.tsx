import type { ReactNode } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import type { LedgerListViewMode } from '../utils/ledger-list-view'

type Props = {
  searchInput: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  viewMode: LedgerListViewMode
  onViewModeChange: (mode: LedgerListViewMode) => void
  actions?: ReactNode
}

export function LedgerListToolbar({
  searchInput,
  onSearchChange,
  searchPlaceholder,
  viewMode,
  onViewModeChange,
  actions,
}: Props) {
  const { t } = useLanguage()

  return (
    <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
      <div className='min-w-0 flex-1 max-w-md'>
        <Input
          placeholder={searchPlaceholder}
          className='h-9 w-full'
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={searchPlaceholder}
        />
      </div>
      <div className='flex flex-wrap items-center gap-2'>
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
        {actions}
      </div>
    </div>
  )
}
