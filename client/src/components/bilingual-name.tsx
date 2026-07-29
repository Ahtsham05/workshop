'use client'

import { cn } from '@/lib/utils'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'

export interface BilingualNameProps {
  primary: string
  secondary?: string | null
  className?: string
  primaryClassName?: string
  secondaryClassName?: string
  /** Single line with ellipsis instead of the default wrap — for tight spaces like a
   * dense table/list row where a long name must not push sibling content around. */
  truncate?: boolean
}

/** English plus optional Urdu on one row (wraps when needed, or truncates with `truncate`). */
export function BilingualName({
  primary,
  secondary,
  className,
  primaryClassName,
  secondaryClassName,
  truncate = false,
}: BilingualNameProps) {
  const u = secondary?.trim()
  return (
    <div
      className={cn(
        'min-w-0 flex items-center',
        truncate ? 'flex-row flex-nowrap gap-x-1.5' : 'flex-row flex-wrap gap-x-2 gap-y-0.5',
        className,
      )}
    >
      <span
        className={cn(
          getTextClasses(primary, truncate ? 'min-w-0 flex-1 truncate font-medium' : 'shrink-0 font-medium'),
          primaryClassName,
        )}
        title={primary}
      >
        {primary}
      </span>
      {u ? (
        <span
          className={cn(
            'min-w-0 truncate rtl',
            truncate && 'shrink-0 max-w-[40%]',
            getUrduSecondaryNameClasses(u),
            secondaryClassName,
          )}
          dir='rtl'
          title={u}
        >
          {u}
        </span>
      ) : null}
    </div>
  )
}
