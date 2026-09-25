import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

/**
 * The auth screens use taller fields with a leading icon — they carry the whole page,
 * unlike the dense fields inside the app. Everything else (focus ring, colours) still
 * comes from the shared Input.
 */

const ICON_CLASSES =
  'text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'

interface AuthInputProps extends React.ComponentProps<typeof Input> {
  icon: LucideIcon
}

export function AuthInput({ icon: Icon, className, ...props }: AuthInputProps) {
  return (
    <div className='relative'>
      <Icon className={ICON_CLASSES} aria-hidden />
      {/* No mic on a login screen — it is noise next to an email box. */}
      <Input showVoiceInput={false} className={cn('h-11 pl-9', className)} {...props} />
    </div>
  )
}

interface AuthPasswordInputProps
  extends React.ComponentProps<typeof PasswordInput> {
  icon: LucideIcon
}

export function AuthPasswordInput({
  icon: Icon,
  className,
  ...props
}: AuthPasswordInputProps) {
  return (
    <div className='relative'>
      <Icon className={cn(ICON_CLASSES, 'z-10')} aria-hidden />
      <PasswordInput inputClassName={cn('h-11 pl-9 pr-10', className)} {...props} />
    </div>
  )
}
