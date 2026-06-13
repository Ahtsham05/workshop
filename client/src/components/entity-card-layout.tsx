import type { ComponentType, ReactNode } from 'react'
import { ChevronRight, Mail, MapPin, MessageCircle, Phone, Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type BalanceDisplay = {
  label: string
  amount: string
  className: string
}

const BALANCE_BADGE_STYLES: Record<string, string> = {
  'text-red-600': 'bg-red-50 text-red-700 border-red-200',
  'text-green-600': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'text-foreground': 'bg-muted text-muted-foreground border-border',
}

type ContactRowProps = {
  icon: typeof Phone
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
}

function ContactRow({ icon: Icon, children, onClick }: ContactRowProps) {
  return (
    <div
      className={cn('flex min-w-0 items-center gap-2', onClick && 'cursor-default')}
      onClick={onClick}
    >
      <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background ring-1 ring-border/70'>
        <Icon className='h-3 w-3 text-muted-foreground' />
      </span>
      <div className='min-w-0 flex-1 text-[13px] leading-snug text-foreground/90'>{children}</div>
    </div>
  )
}

type EntityCardLayoutProps = {
  header: ReactNode
  menu?: ReactNode
  email?: string
  phone?: string
  whatsapp?: ReactNode
  address?: string
  addressClassName?: string
  balance: BalanceDisplay
  actions?: ReactNode
  ledgerLabel: string
  onOpenLedger: () => void
}

export function EntityCardLayout({
  header,
  menu,
  email,
  phone,
  whatsapp,
  address,
  addressClassName,
  balance,
  actions,
  ledgerLabel,
  onOpenLedger,
}: EntityCardLayoutProps) {
  const badgeStyle = BALANCE_BADGE_STYLES[balance.className] || BALANCE_BADGE_STYLES['text-foreground']
  const hasContact = Boolean(email || phone || whatsapp || address)

  return (
    <Card className='group flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:border-primary/20 hover:shadow-md'>
      <CardHeader className='space-y-0 border-b border-border/40 bg-gradient-to-b from-muted/30 to-muted/10 px-3 py-3 [&_.font-medium]:text-sm [&_.font-medium]:font-semibold [&_.font-medium]:leading-snug'>
        <div className='flex items-start gap-1.5'>
          <button
            type='button'
            className='min-w-0 flex-1 text-left transition-colors hover:opacity-90'
            onClick={onOpenLedger}
          >
            {header}
          </button>
          {menu}
        </div>
      </CardHeader>

      <CardContent className='flex flex-1 flex-col gap-2.5 px-3 py-3'>
        {hasContact ? (
          <button
            type='button'
            className='space-y-1.5 rounded-lg border border-border/40 bg-muted/25 p-2.5 text-left transition-colors hover:bg-muted/40'
            onClick={onOpenLedger}
          >
            {email ? (
              <ContactRow icon={Mail}>
                <span className='truncate'>{email}</span>
              </ContactRow>
            ) : null}
            {phone ? (
              <ContactRow icon={Phone}>
                <span className='truncate'>{phone}</span>
              </ContactRow>
            ) : null}
            {whatsapp ? (
              <ContactRow icon={MessageCircle} onClick={(e) => e.stopPropagation()}>
                {whatsapp}
              </ContactRow>
            ) : null}
            {address ? (
              <ContactRow icon={MapPin}>
                <span className={cn('line-clamp-2', addressClassName)}>{address}</span>
              </ContactRow>
            ) : null}
          </button>
        ) : null}

        <button
          type='button'
          className='flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/25'
          onClick={onOpenLedger}
        >
          <Badge variant='outline' className={cn('shrink-0 px-2 py-0.5 text-xs font-semibold', badgeStyle)}>
            {balance.label}
          </Badge>
          <span className={cn('text-base font-bold tabular-nums tracking-tight', balance.className)}>
            {balance.amount}
          </span>
        </button>

        {actions ? <div className='mt-auto pt-0.5'>{actions}</div> : null}
      </CardContent>

      <CardFooter className='border-t border-border/40 bg-muted/10 px-3 py-2'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-8 w-full justify-between px-1.5 text-[13px] font-medium text-muted-foreground hover:text-primary'
          onClick={onOpenLedger}
        >
          <span>{ledgerLabel}</span>
          <ChevronRight className='h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5' />
        </Button>
      </CardFooter>
    </Card>
  )
}

type EntityActionButtonProps = {
  label: string
  icon?: ComponentType<{ className?: string }>
  onClick: (e: React.MouseEvent) => void
  variant?: 'primary' | 'outline'
  tone?: 'blue' | 'violet' | 'orange' | 'emerald'
}

const ICON_TONE_STYLES: Record<string, string> = {
  blue: 'text-blue-600',
  violet: 'text-violet-600',
  orange: 'text-orange-600',
  emerald: 'text-emerald-600',
}

export function EntityActionButton({
  label,
  icon: Icon,
  onClick,
  variant = 'outline',
  tone = 'blue',
}: EntityActionButtonProps) {
  const ActionIcon = Icon ?? Receipt

  return (
    <Button
      type='button'
      size='sm'
      variant={variant === 'primary' ? 'default' : 'outline'}
      className={cn(
        'h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-[13px] font-medium leading-snug shadow-none',
        variant === 'primary' && 'font-semibold',
        variant === 'outline' && 'border-border/70 bg-background text-foreground hover:border-primary/25 hover:bg-primary/5',
      )}
      onClick={onClick}
    >
      <ActionIcon
        className={cn(
          'mr-1.5 h-3.5 w-3.5 shrink-0',
          variant === 'primary' ? 'text-primary-foreground' : ICON_TONE_STYLES[tone],
        )}
      />
      <span>{label}</span>
    </Button>
  )
}

export function EntityActionGrid({
  primary,
  secondary,
}: {
  primary?: ReactNode
  secondary: ReactNode[]
}) {
  const hasOddSecondary = secondary.length % 2 === 1

  return (
    <div className='space-y-1.5'>
      {primary ? <div>{primary}</div> : null}
      {secondary.length > 0 ? (
        <div className='grid grid-cols-2 gap-1.5'>
          {secondary.map((child, index) => (
            <div
              key={index}
              className={cn(
                hasOddSecondary && index === secondary.length - 1 && 'col-span-2',
              )}
            >
              {child}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
