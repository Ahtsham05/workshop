import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useLanguage } from '@/context/language-context'

interface Props {
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

export default function LongText({
  children,
  className = '',
  contentClassName = '',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOverflown, setIsOverflown] = useState(false)
  const { language } = useLanguage()
  const isUrdu = language === 'ur'

  useEffect(() => {
    if (checkOverflow(ref.current)) {
      setIsOverflown(true)
      return
    }

    setIsOverflown(false)
  }, [])

  if (!isOverflown)
    return (
      <div ref={ref} className={cn('truncate', isUrdu ? 'text-right' : '', className)}>
        {children}
      </div>
    )

  return (
    <>
      <div className='hidden sm:block'>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div ref={ref} className={cn('truncate', isUrdu ? 'text-right' : '', className)}>
                {children}
              </div>
            </TooltipTrigger>
            <TooltipContent className={isUrdu ? 'text-right' : ''}>
              <p className={cn(contentClassName, isUrdu ? 'text-right' : '')}>{children}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className='sm:hidden'>
        <Popover>
          <PopoverTrigger asChild>
            <div ref={ref} className={cn('truncate', isUrdu ? 'text-right' : '', className)}>
              {children}
            </div>
          </PopoverTrigger>
          <PopoverContent className={cn('w-fit', isUrdu ? 'text-right' : '', contentClassName)}>
            <p className={isUrdu ? 'text-right' : ''}>{children}</p>
          </PopoverContent>
        </Popover>
      </div>
    </>
  )
}

const checkOverflow = (textContainer: HTMLDivElement | null) => {
  if (textContainer) {
    return (
      textContainer.offsetHeight < textContainer.scrollHeight ||
      textContainer.offsetWidth < textContainer.scrollWidth
    )
  }
  return false
}
