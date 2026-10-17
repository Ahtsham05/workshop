import { formatBusinessDate, toBusinessCalendarDate } from '@/lib/business-timezone'
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
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)
  if (diff === 1) return 'Yesterday'
  return formatBusinessDate(date)
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
