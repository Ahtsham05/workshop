'use client'

import { cn } from '@/lib/utils'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'

export interface BilingualNameProps {
  primary: string
  secondary?: string | null
  className?: string
  primaryClassName?: string
  secondaryClassName?: string
}

/** English plus optional Urdu on one row (wraps when needed). */
export function BilingualName({
  primary,
  secondary,
  className,
  primaryClassName,
  secondaryClassName,
}: BilingualNameProps) {
  const u = secondary?.trim()
  return (
    <div className={cn('min-w-0 flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5', className)}>
      <span className={cn(getTextClasses(primary, 'shrink-0 font-medium'), primaryClassName)} title={primary}>
        {primary}
      </span>
      {u ? (
        <span
          className={cn('min-w-0 truncate rtl', getUrduSecondaryNameClasses(u), secondaryClassName)}
          dir='rtl'
          title={u}
        >
          {u}
        </span>
      ) : null}
    </div>
  )
}
