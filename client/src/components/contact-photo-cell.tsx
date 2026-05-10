'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { User } from 'lucide-react'

export type ContactPicture = { url?: string | null; publicId?: string | null } | null | undefined

function initialsFromName(name: string): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]?.[0]
    const b = parts[parts.length - 1]?.[0]
    if (a && b) return `${a}${b}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

interface ContactPhotoCellProps {
  picture?: ContactPicture
  name: string
  className?: string
}

/** Compact avatar for customer/supplier tables — image or initials fallback. */
export function ContactPhotoCell({ picture, name, className }: ContactPhotoCellProps) {
  const url = picture?.url?.trim()
  const initials = initialsFromName(name)

  return (
    <Avatar
      className={cn(
        'h-9 w-9 shrink-0 rounded-full border-0 bg-muted/50 shadow-none ring-0',
        className,
      )}
    >
      {url ? (
        <AvatarImage src={url} alt='' className='size-full rounded-full object-cover' />
      ) : null}
      <AvatarFallback
        delayMs={url ? 120 : 0}
        className='rounded-full bg-gradient-to-br from-sky-100 to-sky-200/90 text-[10px] font-semibold text-sky-800 dark:from-sky-950/80 dark:to-sky-900/60 dark:text-sky-200'
      >
        {initials || <User className='h-4 w-4 opacity-70' aria-hidden />}
      </AvatarFallback>
    </Avatar>
  )
}
