import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { playBeep } from '@/features/fast-billing/utils/beep'
import { useRemindersFeed } from './use-reminders-feed'
import {
  useCompleteReminderMutation,
  useSnoozeReminderMutation,
  type Reminder,
} from '@/stores/reminder.api'

/**
 * In-app alarm: queues every due (pending/snoozed, dueAt <= now) reminder and
 * hands the front of the queue to <ReminderAlarmSplash/> (mounted in
 * _authenticated.tsx) as a full-screen "alarm ringing" overlay — independent of
 * the server push scheduler, so it works even without a granted push permission.
 * Reads off the single shared useRemindersFeed() poll — see that file for why
 * this must not run its own separate useGetRemindersQuery subscription.
 *
 * Snoozing pushes dueAt into the future server-side; once that time re-arrives
 * the reminder naturally reappears in `active` with a fresh dueAt, so it queues
 * (and rings) again on its own — no separate "snoozed" bookkeeping needed here.
 */
export function useReminderWatchdog() {
  const { active } = useRemindersFeed()
  const user = useSelector((state: RootState) => state.auth.data?.user) as
    | { id?: string; _id?: string }
    | undefined
  const userId = user?.id || user?._id

  const [queueIds, setQueueIds] = useState<string[]>([])
  const [snoozeReminder] = useSnoozeReminderMutation()
  const [completeReminder] = useCompleteReminderMutation()

  // Queue newly-due reminders (and alert once per reminder as it first queues).
  useEffect(() => {
    if (!active.length) return
    const now = Date.now()
    const known = new Set(queueIds)
    const newlyDue: Reminder[] = []

    for (const reminder of active) {
      const id = reminder.id || reminder._id
      if (!id || known.has(id)) continue
      if (userId && reminder.assignedTo && reminder.assignedTo !== userId) continue
      if (new Date(reminder.dueAt).getTime() > now) continue
      newlyDue.push(reminder)
    }

    if (!newlyDue.length) return

    setQueueIds((prev) => [...prev, ...newlyDue.map((r) => (r.id || r._id) as string)])
    playBeep('alarm')

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      newlyDue.forEach((reminder) => {
        try {
          new Notification(`Reminder: ${reminder.title}`, {
            body: reminder.description || 'Tap to view details',
            tag: `reminder-${reminder.id || reminder._id}`,
          })
        } catch {
          // ignore — the splash screen already covers the alert
        }
      })
    }
  }, [active, userId, queueIds])

  // Drop anything from the queue that's no longer active (completed/cancelled/
  // deleted/edited elsewhere, e.g. from the Reminders page or another tab).
  useEffect(() => {
    setQueueIds((prev) => prev.filter((id) => active.some((r) => (r.id || r._id) === id)))
  }, [active])

  const currentId = queueIds[0] || null
  const current = currentId ? active.find((r) => (r.id || r._id) === currentId) || null : null

  const dismiss = (id: string) => setQueueIds((prev) => prev.filter((x) => x !== id))

  const snoozeCurrent = async (minutes: number) => {
    if (!current) return
    const id = (current.id || current._id) as string
    dismiss(id)
    try {
      const snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString()
      await snoozeReminder({ id, snoozedUntil }).unwrap()
    } catch {
      toast.error('Failed to snooze reminder')
    }
  }

  const completeCurrent = async () => {
    if (!current) return
    const id = (current.id || current._id) as string
    dismiss(id)
    try {
      await completeReminder(id).unwrap()
      toast.success('Reminder completed')
    } catch {
      toast.error('Failed to complete reminder')
    }
  }

  return { current, queueLength: queueIds.length, snoozeCurrent, completeCurrent }
}
