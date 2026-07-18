import { IconSearch } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useSearch } from '@/context/search-context'
import { useLanguage } from '@/context/language-context'
import { Button } from './ui/button'

interface Props {
  className?: string
  type?: React.HTMLInputTypeAttribute
  placeholder?: string
}

export function Search({ className = '', placeholder }: Props) {
  const { setOpen } = useSearch()
  const { t } = useLanguage()
  
  // Use translation for placeholder if not provided
  const searchPlaceholder = placeholder || t('search')
  return (
    <Button
      variant='outline'
      size='icon'
      className={cn(
        'bg-muted/25 text-muted-foreground hover:bg-muted/50 relative h-8 w-8 shrink-0 justify-center rounded-md text-sm font-normal shadow-none sm:w-full sm:flex-1 sm:justify-start sm:pr-12 md:w-40 md:flex-none lg:w-56 xl:w-64',
        className
      )}
      onClick={() => setOpen(true)}
    >
      <IconSearch
        aria-hidden='true'
        className='sm:absolute sm:top-1/2 sm:left-1.5 sm:-translate-y-1/2'
      />
      <span className='ml-3 hidden sm:inline'>{searchPlaceholder}</span>
      <kbd className='bg-muted pointer-events-none absolute top-[0.3rem] right-[0.3rem] hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none sm:flex'>
        <span className='text-xs'>⌘</span>K
      </kbd>
    </Button>
  )
}
