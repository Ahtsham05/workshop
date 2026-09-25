import type { NoteAiAction } from '@/stores/note.api'

const HISTORY_KEY = 'notepad:ai-history:v1'
const MAX_ENTRIES = 12

export interface AiHistoryEntry {
  id: string
  action: NoteAiAction | 'organize'
  label: string
  noteId: string
  noteTitle: string
  at: number
}

const read = (): AiHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const write = (entries: AiHistoryEntry[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    /* storage full or blocked — history just won't persist this run */
  }
}

export const readAiHistory = (): AiHistoryEntry[] => read()

export const pushAiHistory = (entry: Omit<AiHistoryEntry, 'id' | 'at'>): AiHistoryEntry[] => {
  const next: AiHistoryEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() }
  const entries = [next, ...read()].slice(0, MAX_ENTRIES)
  write(entries)
  return entries
}

export const clearAiHistory = (): AiHistoryEntry[] => {
  write([])
  return []
}

/** "Just now" / "5m ago" / "3h ago" / "2d ago" — a short-lived action log, unlike note timestamps elsewhere, is exactly where relative time reads better than a clock time. */
export const formatRelativeTime = (at: number): string => {
  const diffMs = Date.now() - at
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
