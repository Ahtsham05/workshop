import { BUSINESS_TIMEZONE, formatBusinessDate, toBusinessCalendarDate } from '@/lib/business-timezone'
import { formatNoteStamp, formatNoteTime } from '@/features/notepad/lib/note-time'
import type { ChatConversation } from '@/stores/chat.api'

/** Chat timestamps follow business time (Asia/Karachi) and 12-hour AM/PM, like the header clock. */

export const formatChatTime = formatNoteTime
export const formatChatStamp = formatNoteStamp

/** "Today", "Yesterday" or the date — the separator between days in a thread. */
export function chatDayLabel(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  const today = toBusinessCalendarDate(new Date())
  const day = toBusinessCalendarDate(date)
  if (day === today) return 'Today'
  if (daysBetween(day, today) === 1) return 'Yesterday'
  return formatBusinessDate(date)
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: BUSINESS_TIMEZONE })

/**
 * WhatsApp's wording: "last seen today at 10:43 PM", "… yesterday at 9:12 PM",
 * "… Monday at 9:12 PM" within the week, then "… 14/10/2026" (the app's date format).
 */
export function formatLastSeen(value: string | Date, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const days = daysBetween(toBusinessCalendarDate(date), toBusinessCalendarDate(now))
  const at = formatChatTime(date)
  if (days <= 0) return `last seen today at ${at}`
  if (days === 1) return `last seen yesterday at ${at}`
  if (days < 7) return `last seen ${weekday.format(date)} at ${at}`
  return `last seen ${formatBusinessDate(date)}`
}

/** "online", "last seen …", or "offline" when they have never been on chat. */
export function presenceLabel(online: boolean, lastSeenAt: string | null | undefined): string {
  if (online) return 'online'
  return lastSeenAt ? formatLastSeen(lastSeenAt) : 'offline'
}

export const chatDayKey = (value: string | Date) => toBusinessCalendarDate(value instanceof Date ? value : new Date(value))

export function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Splits text so URLs can be rendered as links (never as HTML). */
export function linkify(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = []
  const re = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/gi
  let last = 0
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: text.slice(last, index) })
    parts.push({ text: match[0], href: match[0] })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

export function conversationSubtitle(conversation: ChatConversation): string {
  if (conversation.type === 'organization') return 'Everyone, every branch'
  if (conversation.type === 'branch') return 'Branch channel'
  if (conversation.type === 'group') return `Group · ${conversation.participantIds.length} people`
  return 'Direct message'
}
