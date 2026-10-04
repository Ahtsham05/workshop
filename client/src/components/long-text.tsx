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
  style?: React.CSSProperties
}

export default function LongText({
  children,
  className = '',
  contentClassName = '',
  style,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOverflown, setIsOverflown] = useState(false)
  const { language } = useLanguage()
  const isUrdu = language === 'ur'

  useEffect(() => {
    // Measured in one shared batch per frame — checking each cell on its own forces a
    // layout per cell, which made scrolling a long table stall.
    return scheduleOverflowCheck(ref.current, setIsOverflown)
  }, [])

  if (!isOverflown)
    return (
      <div ref={ref} style={style} className={cn('truncate', isUrdu ? 'text-right' : '', className)}>
        {children}
      </div>
    )

  return (
    <>
      <div className='hidden sm:block'>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div ref={ref} style={style} className={cn('truncate', isUrdu ? 'text-right' : '', className)}>
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
            <div ref={ref} style={style} className={cn('truncate', isUrdu ? 'text-right' : '', className)}>
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

// Every LongText mounting in the same tick shares one pass: all the layout reads first, then
// all the state writes, so the browser lays out once instead of once per cell.
const pendingChecks = new Map<HTMLDivElement, (overflown: boolean) => void>()
let checkFrame: number | null = null

function scheduleOverflowCheck(el: HTMLDivElement | null, apply: (overflown: boolean) => void) {
  if (!el) return undefined
  pendingChecks.set(el, apply)
  if (checkFrame === null) {
    checkFrame = requestAnimationFrame(() => {
      checkFrame = null
      const batch = Array.from(pendingChecks.entries())
      pendingChecks.clear()
      const results = batch.map(([node]) => (node.isConnected ? checkOverflow(node) : false))
      batch.forEach(([, cb], i) => cb(results[i]))
    })
  }
  return () => {
    pendingChecks.delete(el)
  }
}
