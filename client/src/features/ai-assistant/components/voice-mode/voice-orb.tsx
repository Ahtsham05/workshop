import { Mic, Sparkles, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VoiceModeState } from '../../hooks/use-voice-mode'

const ICONS: Record<Exclude<VoiceModeState, 'closed'>, typeof Mic> = {
  listening: Mic,
  processing: Sparkles,
  speaking: Volume2,
}

/**
 * The big centered orb — a breathing mic while listening, a spinning sparkle while processing,
 * a gentle pulse while speaking. `level` (0..1, only meaningful while listening) drives a subtle
 * scale so the orb visibly reacts to the user's voice instead of animating on a fixed loop.
 */
export function VoiceOrb({
  state,
  level = 0,
  onClick,
}: {
  state: Exclude<VoiceModeState, 'closed'>
  level?: number
  onClick?: () => void
}) {
  const Icon = ICONS[state]
  const scale = state === 'listening' ? 1 + Math.min(level, 1) * 0.18 : 1

  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={onClick ? 'Tap to stop and send' : undefined}
      aria-label={onClick ? 'Tap to stop and send' : undefined}
      aria-hidden={onClick ? undefined : true}
      className={cn('relative flex h-32 w-32 items-center justify-center rounded-full', onClick && 'cursor-pointer')}
    >
      {state === 'listening' && (
        <>
          <span className='absolute inset-0 rounded-full bg-primary/15 motion-safe:animate-ping motion-safe:[animation-duration:2s]' />
          <span className='absolute inset-3 rounded-full bg-primary/10' />
        </>
      )}
      {state === 'processing' && (
        <span className='absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary motion-safe:animate-spin' />
      )}
      {state === 'speaking' && <span className='absolute inset-0 rounded-full bg-violet-500/15 motion-safe:animate-pulse' />}

      <span
        className='relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg transition-transform duration-100 ease-out'
        style={{ transform: `scale(${scale})` }}
      >
        <Icon className='h-8 w-8' />
      </span>
    </Wrapper>
  )
}
