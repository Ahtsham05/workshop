import { useSelector } from 'react-redux'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { RootState } from '@/stores/store'

function initialsFromName(name: string, email?: string | null): string {
  const trimmed = String(name ?? '').trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      const a = parts[0]?.[0]
      const b = parts[parts.length - 1]?.[0]
      if (a && b) return `${a}${b}`.toUpperCase()
    }
    return trimmed.slice(0, 2).toUpperCase()
  }
  const local = String(email ?? '').trim().split('@')[0]
  return local ? local.slice(0, 2).toUpperCase() : '?'
}

/** Eight readable tints; the same person always lands on the same one. */
const FALLBACK_TONES = [
  'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
]

function toneFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return FALLBACK_TONES[Math.abs(hash) % FALLBACK_TONES.length]
}

interface UserAvatarProps {
  name?: string | null
  email?: string | null
  photoUrl?: string | null
  className?: string
  fallbackClassName?: string
}

/**
 * A person's picture, with initials on a stable colour as the fallback. Used
 * everywhere a user is shown so one photo change is reflected app-wide.
 */
export function UserAvatar({
  name,
  email,
  photoUrl,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const url = photoUrl?.trim()
  const seed = String(name || email || '')
  const initials = initialsFromName(name ?? '', email)

  return (
    <Avatar className={cn('h-8 w-8', className)}>
      {url ? (
        <AvatarImage src={url} alt={name || 'Profile photo'} className='object-cover' />
      ) : null}
      <AvatarFallback
        delayMs={url ? 120 : 0}
        className={cn('text-xs font-semibold', toneFor(seed), fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

/** The signed-in user's avatar — reads the session directly, takes no props. */
export function CurrentUserAvatar({
  className,
  fallbackClassName,
}: {
  className?: string
  fallbackClassName?: string
}) {
  const user = useSelector((state: RootState) => state.auth.data?.user)

  return (
    <UserAvatar
      name={user?.name}
      email={user?.email}
      photoUrl={user?.photo?.url}
      className={className}
      fallbackClassName={fallbackClassName}
    />
  )
}
