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
        'h-9 w-9 shrink-0 rounded-xl border border-border/70 bg-muted/40 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08]',
        className,
      )}
    >
      {url ? <AvatarImage src={url} alt='' className='object-cover' /> : null}
      <AvatarFallback
        delayMs={url ? 120 : 0}
        className='rounded-xl bg-gradient-to-br from-muted to-muted/80 text-xs font-semibold text-muted-foreground'
      >
        {initials || <User className='h-4 w-4 opacity-70' aria-hidden />}
      </AvatarFallback>
    </Avatar>
  )
}
