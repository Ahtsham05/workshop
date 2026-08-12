import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { AlarmClock, Check, Clock, Layers, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { Reminder, ReminderPriority } from '@/stores/reminder.api'

const PRIORITY_ACCENT: Record<
  ReminderPriority,
  { ring: string; iconBg: string; glowA: string; glowB: string; badge: string; label: string }
> = {
  low: {
    ring: 'bg-slate-400/40',
    iconBg: 'from-slate-400 to-slate-600',
    glowA: 'bg-slate-500/25',
    glowB: 'bg-slate-600/20',
    badge: 'bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/30',
    label: 'Low',
  },
  medium: {
    ring: 'bg-blue-400/40',
    iconBg: 'from-blue-400 to-indigo-600',
    glowA: 'bg-blue-500/25',
    glowB: 'bg-indigo-600/20',
    badge: 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/30',
    label: 'Medium',
  },
  high: {
    ring: 'bg-amber-400/40',
    iconBg: 'from-amber-400 to-orange-600',
    glowA: 'bg-amber-500/25',
    glowB: 'bg-orange-600/20',
    badge: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/30',
    label: 'High',
  },
  urgent: {
    ring: 'bg-red-400/40',
    iconBg: 'from-red-400 to-rose-600',
    glowA: 'bg-red-500/30',
    glowB: 'bg-rose-600/20',
    badge: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-400/30',
    label: 'Urgent',
  },
}

const SNOOZE_PRESETS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
]

function useTicker() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

interface ReminderAlarmSplashProps {
  reminder: Reminder
  queueLength: number
  onSnooze: (minutes: number) => void | Promise<void>
  onComplete: () => void | Promise<void>
}

export function ReminderAlarmSplash({ reminder, queueLength, onSnooze, onComplete }: ReminderAlarmSplashProps) {
  const { t } = useLanguage()
  const now = useTicker()
  const [busy, setBusy] = useState<'snooze' | 'complete' | null>(null)
  const accent = PRIORITY_ACCENT[reminder.priority]

  const handleSnooze = async (minutes: number) => {
    setBusy('snooze')
    try {
      await onSnooze(minutes)
    } finally {
      setBusy(null)
    }
  }

  const handleComplete = async () => {
    setBusy('complete')
    try {
      await onComplete()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t('Reminder alarm')}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950 animate-in fade-in duration-300"
    >
      {/* Atmospheric glow — priority-tinted, purely decorative */}
      <div className={cn('pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl [animation-duration:5s]', accent.glowA, 'animate-pulse')} />
      <div className={cn('pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full blur-3xl [animation-duration:7s]', accent.glowB, 'animate-pulse')} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.6)_100%)]" />

      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/70 shadow-[0_0_80px_-12px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
        <div className={cn('h-1 w-full bg-gradient-to-r', accent.iconBg)} />

        <div className="p-8 text-center">
          <p className={cn('text-xs font-semibold uppercase tracking-[0.25em] animate-pulse', accent.badge.includes('red') ? 'text-red-300' : 'text-white/50')}>
            {t('Alarm')}
          </p>

          <div className="relative mx-auto my-6 flex h-24 w-24 items-center justify-center">
            <span className={cn('absolute inset-0 rounded-full animate-ping [animation-duration:1.8s]', accent.ring)} />
            <span className={cn('absolute inset-1.5 rounded-full animate-ping [animation-duration:1.8s] [animation-delay:0.4s]', accent.ring)} />
            <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br shadow-lg', accent.iconBg)}>
              <AlarmClock className="h-8 w-8 text-white drop-shadow" />
            </div>
          </div>

          <p className="font-mono text-sm font-medium tracking-[0.2em] text-white/40">{format(now, 'p')}</p>

          <h2 className="mt-3 text-balance text-3xl font-bold leading-tight text-white">{reminder.title}</h2>
          {reminder.description && (
            <p className="mt-2 text-sm leading-relaxed text-white/60">{reminder.description}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className={cn('rounded-full px-3 py-1 text-xs font-medium', accent.badge)}>
              {t(accent.label)}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs text-white/50 ring-1 ring-inset ring-white/10">
              <Clock className="h-3 w-3" />
              {format(new Date(reminder.dueAt), 'PPP p')}
            </span>
          </div>

          {queueLength > 1 && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
              <Layers className="h-3 w-3" />
              +{queueLength - 1} {t('more reminder(s) waiting')}
            </div>
          )}

          <div className="mt-8 space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {SNOOZE_PRESETS.map((preset) => (
                <Button
                  key={preset.minutes}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => handleSnooze(preset.minutes)}
                  className="gap-1.5 rounded-full border-white/15 bg-white/5 text-white/90 transition-all hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
                >
                  {busy === 'snooze' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 opacity-70" />
                  )}
                  {preset.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="lg"
              disabled={busy !== null}
              onClick={handleComplete}
              className="w-full gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition-transform hover:scale-[1.02] hover:from-emerald-400 hover:to-teal-400"
            >
              {busy === 'complete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t('Done')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
