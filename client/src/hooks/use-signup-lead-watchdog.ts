import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { playBeep } from '@/features/fast-billing/utils/beep'
import { LEAD_ALERTS_POLL_OPTIONS, useAdminGetLeadAlertsQuery } from '@/stores/admin-leads.api'

const STORAGE_KEY = 'signup-lead-alerted'
const MAX_KEYS = 300

function readAlerted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}
function writeAlerted(keys: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys].slice(-MAX_KEYS)))
  } catch {
    // storage blocked — alerts may repeat after a reload, which is acceptable
  }
}

function notify(title: string, body: string, tag: string, onClick: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, tag })
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
  } catch {
    // some mobile browsers only allow notifications via the service worker
  }
}

export const useIsPlatformAdmin = () =>
  useSelector((s: RootState) => (s.auth.data?.user as { systemRole?: string } | undefined)?.systemRole === 'system_admin')

/**
 * Platform-admin alarm for the trial sales pipeline: a toast + beep + desktop notification
 * the moment a new business signs up, and again whenever a lead's follow-up time arrives.
 * Works with only the app open (no push permission needed); the server scheduler sends real
 * push notifications for a closed tab. Each signup / follow-up time alerts once per browser
 * (remembered in localStorage) — snoozing gives the follow-up a new time, which re-arms it.
 */
export function useSignupLeadWatchdog() {
  const isAdmin = useIsPlatformAdmin()
  const navigate = useNavigate()
  const { data } = useAdminGetLeadAlertsQuery(undefined, { ...LEAD_ALERTS_POLL_OPTIONS, skip: !isAdmin })
  const firstRun = useRef(true)

  useEffect(() => {
    if (!data) return
    const alerted = readAlerted()
    const openLead = (orgId: string) => navigate({ to: '/admin', search: { tab: 'leads', lead: orgId } })

    const fresh = data.newSignups.filter((s) => !alerted.has(`signup:${s.organizationId}`))
    const freshIds = new Set(data.newSignups.map((s) => s.organizationId))
    // A brand-new signup's due welcome call is the same alert as the signup itself.
    const due = data.dueFollowUps.filter((f) => !freshIds.has(f.organizationId) && !alerted.has(`due:${f.organizationId}:${f.dueAt}`))
    // On the very first load, a backlog of old due follow-ups becomes one summary toast
    // instead of a burst; new signups always get their own alert.
    const summarizeDue = firstRun.current && due.length > 2
    firstRun.current = false
    if (!fresh.length && !due.length) return

    fresh.forEach((s) => {
      toast.success(`New trial signup: ${s.name}`, {
        description: [s.ownerName, s.businessType?.replace(/_/g, ' '), s.phone].filter(Boolean).join(' · ') + ' — call within the hour.',
        duration: 30_000,
        action: { label: 'Open lead', onClick: () => openLead(s.organizationId) },
      })
      notify(`🎉 New trial signup: ${s.name}`, [s.ownerName, s.phone].filter(Boolean).join(' · '), `signup-${s.organizationId}`, () =>
        openLead(s.organizationId),
      )
      alerted.add(`signup:${s.organizationId}`)
    })

    if (summarizeDue) {
      toast.warning(`${due.length} lead follow-ups are due`, {
        description: 'Open the follow-up queue to work through them.',
        duration: 20_000,
        action: { label: 'Open queue', onClick: () => navigate({ to: '/admin', search: { tab: 'leads' } }) },
      })
    } else {
      due.forEach((f) => {
        toast.warning(`Follow up: ${f.name}`, {
          description: [f.note || 'Follow-up due', f.phone].filter(Boolean).join(' · '),
          duration: 20_000,
          action: { label: 'Open', onClick: () => openLead(f.organizationId) },
        })
        notify(`⏰ Follow up: ${f.name}`, f.note || 'Follow-up due', `lead-followup-${f.organizationId}`, () => openLead(f.organizationId))
      })
    }
    due.forEach((f) => alerted.add(`due:${f.organizationId}:${f.dueAt}`))

    playBeep('alarm')
    writeAlerted(alerted)
  }, [data, navigate])
}

/** Mount-once wrapper so the layout can render it unconditionally. */
export function SignupLeadWatchdog() {
  useSignupLeadWatchdog()
  return null
}
