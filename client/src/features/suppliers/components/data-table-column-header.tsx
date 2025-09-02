import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretSortIcon,
  EyeNoneIcon,
} from '@radix-ui/react-icons'
import { Column } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/context/language-context'

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const { t, language } = useLanguage();
  const isUrdu = language === 'ur';
  
  if (!column.getCanSort()) {
    return <div className={cn(className, isUrdu && 'text-left')}>{title}</div>
  }

  return (
    <div className={cn('flex items-center', isUrdu ? 'space-x-reverse space-x-2' : 'space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              'data-[state=open]:bg-accent h-8', 
              isUrdu ? '-mr-3' : '-ml-3'
            )}
          >
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDownIcon className={isUrdu ? 'mr-2 h-4 w-4' : 'ml-2 h-4 w-4'} />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUpIcon className={isUrdu ? 'mr-2 h-4 w-4' : 'ml-2 h-4 w-4'} />
            ) : (
              <CaretSortIcon className={isUrdu ? 'mr-2 h-4 w-4' : 'ml-2 h-4 w-4'} />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isUrdu ? 'end' : 'start'}>
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUpIcon className={cn(
              'text-muted-foreground/70 h-3.5 w-3.5',
              isUrdu ? 'ml-2' : 'mr-2'
            )} />
            {t('asc')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDownIcon className={cn(
              'text-muted-foreground/70 h-3.5 w-3.5',
              isUrdu ? 'ml-2' : 'mr-2'
            )} />
            {t('desc')}
          </DropdownMenuItem>
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeNoneIcon className={cn(
                  'text-muted-foreground/70 h-3.5 w-3.5',
                  isUrdu ? 'ml-2' : 'mr-2'
                )} />
                {t('hide')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
