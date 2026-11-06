import { useState } from 'react'
import { Check, Copy, Headset, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useSupportContext } from '@/hooks/use-support-context'
import {
  SUPPORT,
  supportMailUrl,
  supportTelUrl,
  supportWhatsAppUrl,
} from '@/config/support'
import { WhatsAppLogo } from './whatsapp-logo'

/**
 * Header "Help & Support": WhatsApp (primary), call and email for the Logix Plus team.
 * On phones the header has no room — the same three options are in the profile menu.
 */
export function SupportButton({ className }: { className?: string }) {
  const ctx = useSupportContext()
  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Green pill with a pulsing halo + a short shake every few seconds, so a new user
            spots where help is. Icon-only on narrow headers, "Support" label when there is room. */}
        <button
          type='button'
          className={cn(
            'group relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-2',
            'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/30',
            'transition hover:from-emerald-600 hover:to-green-700 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none',
            '@min-[1100px]/header:px-3',
            className,
          )}
          title='Help & Support — WhatsApp, call or email us'
          aria-label='Help and support'
        >
          {/* Pulsing halo (stops when motion is reduced). */}
          <span aria-hidden='true' className='pointer-events-none absolute inset-0 rounded-full bg-emerald-400 motion-safe:animate-[support-halo_2s_ease-out_infinite]' />
          <Headset className='relative size-4 motion-safe:animate-[support-wiggle_6s_ease-in-out_infinite]' />
          <span className='relative hidden text-xs font-semibold @min-[1100px]/header:inline'>Support</span>
          {/* Small blinking "live" badge. */}
          <span aria-hidden='true' className='absolute -top-0.5 -right-0.5 flex size-2.5'>
            <span className='absolute inline-flex size-full rounded-full bg-white motion-safe:animate-pulse' />
            <span className='relative inline-flex size-2.5 rounded-full border-2 border-white bg-amber-400' />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0'
        data-html2canvas-ignore
      >
        <div className='flex items-start gap-3 border-b bg-gradient-to-br from-emerald-50 to-background px-4 py-4 dark:from-emerald-950/40'>
          <span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm'>
            <Headset className='size-5' />
          </span>
          <div className='min-w-0'>
            <p className='text-sm font-semibold'>Need help? We're here for you</p>
            <p className='mt-0.5 text-xs text-muted-foreground'>
              Setup, training or any question — talk directly to the {SUPPORT.company} team.
            </p>
          </div>
        </div>

        <div className='space-y-3 p-4'>
          <a
            href={supportWhatsAppUrl(ctx)}
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-3 rounded-lg bg-[#25D366] px-4 py-3 text-white shadow-sm transition hover:bg-[#1ebe5b] focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:outline-none'
          >
            <WhatsAppLogo className='size-6 shrink-0' />
            <span className='min-w-0 flex-1'>
              <span className='block text-sm font-semibold'>Chat on WhatsApp</span>
              <span className='block text-xs text-white/90'>Fastest way to reach us</span>
            </span>
            <span className='text-xs font-medium whitespace-nowrap'>{SUPPORT.phoneDisplay}</span>
          </a>

          <div className='divide-y rounded-lg border'>
            <ContactRow
              icon={<Phone className='size-4' />}
              label='Call us'
              value={SUPPORT.phoneDisplay}
              href={supportTelUrl()}
              copyValue={SUPPORT.phoneDisplay.replace(/\s/g, '')}
            />
            <ContactRow
              icon={<Mail className='size-4' />}
              label='Email us'
              value={SUPPORT.email}
              href={supportMailUrl(ctx)}
              copyValue={SUPPORT.email}
            />
          </div>

          <p className='text-center text-[11px] text-muted-foreground'>
            Your business name is added to the message, so we can help you faster.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ContactRow({
  icon,
  label,
  value,
  href,
  copyValue,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href: string
  copyValue: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the value is on screen to select by hand */
    }
  }
  return (
    <div className='flex items-center gap-3 px-3 py-2.5'>
      <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
        {icon}
      </span>
      <a href={href} className='min-w-0 flex-1 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'>
        <span className='block text-xs text-muted-foreground'>{label}</span>
        <span className='block truncate text-sm font-medium'>{value}</span>
      </a>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-8 shrink-0'
        onClick={copy}
        title={copied ? 'Copied' : `Copy ${label === 'Call us' ? 'number' : 'email'}`}
        aria-label={copied ? 'Copied' : `Copy ${value}`}
      >
        {copied ? <Check className='size-4 text-emerald-600' /> : <Copy className='size-4' />}
      </Button>
    </div>
  )
}
