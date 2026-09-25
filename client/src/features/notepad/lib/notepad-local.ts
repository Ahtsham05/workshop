import type { Note } from '@/stores/note.api'

/**
 * Local-first layer for the notepad.
 *
 * The whole promise of this feature is "opens as fast as Windows Notepad", so
 * the window must paint real content on the very first frame — before any
 * network request resolves. Everything here is a per-user localStorage mirror
 * of what the server already returned, plus the window's own chrome state.
 *
 * Every accessor is try/catch'd: Safari private mode, cleared site data and
 * storage-blocked embeds all throw on access rather than returning null.
 */

const NOTES_CACHE_KEY = 'notepad:notes-cache:v1'
const WINDOW_STATE_KEY = 'notepad:window:v1'
const LAST_NOTE_KEY = 'notepad:last-note-id'
const DRAFT_PREFIX = 'notepad:draft:'

export interface NotepadWindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export const DEFAULT_WINDOW_STATE: NotepadWindowState = {
  x: -1, // -1 = "not positioned yet", resolved against the viewport on first open
  y: -1,
  width: 880,
  height: 560,
  maximized: false,
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — the server copy is still authoritative */
  }
}

const remove = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Notes shown instantly on open, replaced as soon as the list query resolves. */
export const readCachedNotes = (): Note[] => {
  const cached = read<Note[]>(NOTES_CACHE_KEY, [])
  return Array.isArray(cached) ? cached : []
}

export const writeCachedNotes = (notes: Note[]) => {
  // Cap the mirror: a heavy user with hundreds of long notes would otherwise
  // blow the ~5 MB localStorage budget and start throwing on every save.
  write(NOTES_CACHE_KEY, notes.slice(0, 60))
}

export const readWindowState = (): NotepadWindowState => {
  const state = read<NotepadWindowState>(WINDOW_STATE_KEY, DEFAULT_WINDOW_STATE)
  return { ...DEFAULT_WINDOW_STATE, ...state }
}

export const writeWindowState = (state: NotepadWindowState) => write(WINDOW_STATE_KEY, state)

/** Reopening the notepad lands on the note you were last writing in. */
export const readLastNoteId = (): string | null => {
  try {
    return localStorage.getItem(LAST_NOTE_KEY)
  } catch {
    return null
  }
}

export const writeLastNoteId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LAST_NOTE_KEY, id)
    else localStorage.removeItem(LAST_NOTE_KEY)
  } catch {
    /* ignore */
  }
}

export interface NoteDraft {
  title: string
  content: string
  savedAt: number
}

/**
 * Unsaved keystrokes. Written synchronously on every change so a crash, a
 * refresh or a dropped connection between two autosaves never loses text; the
 * draft is cleared the moment the server confirms the same content.
 */
export const readDraft = (noteId: string): NoteDraft | null =>
  read<NoteDraft | null>(`${DRAFT_PREFIX}${noteId}`, null)

export const writeDraft = (noteId: string, draft: NoteDraft) =>
  write(`${DRAFT_PREFIX}${noteId}`, draft)

export const clearDraft = (noteId: string) => remove(`${DRAFT_PREFIX}${noteId}`)

/** Drops every notepad key — called on sign-out so the next user starts clean. */
export const clearNotepadStorage = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('notepad:'))
      .forEach((key) => localStorage.removeItem(key))
  } catch {
    /* ignore */
  }
}
