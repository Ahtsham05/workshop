import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ListPrintButtonProps = {
  onClick: () => void
  title?: string
  className?: string
}

export function ListPrintButton({
  onClick,
  title = 'View & print receipt',
  className,
}: ListPrintButtonProps) {
  return (
    <Button
      type='button'
      size='icon'
      variant='ghost'
      className={className ?? 'h-8 w-8'}
      onClick={onClick}
      title={title}
    >
      <Printer className='h-4 w-4' />
    </Button>
  )
}
