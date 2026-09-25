import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { NoteRelatedType } from '@/stores/note.api'

export interface NotepadOpenOptions {
  /** Jump straight to a specific note. */
  noteId?: string
  /** Start a blank note immediately (what the Ctrl+Alt+N shortcut does). */
  newNote?: boolean
  /** Seed a brand new note with text — used by "Take a note about this". */
  initialContent?: string
  /** Attach the new note to the record the user was looking at. */
  related?: { type: NoteRelatedType; id: string; label?: string }
}

interface NotepadContextValue {
  isOpen: boolean
  isMinimized: boolean
  /**
   * Increments on every openNotepad() call, including while the window is
   * already open. The window watches it to know a *fresh* request arrived and
   * to pick up the options that came with it.
   */
  openSeq: number
  /** Reads and clears the options passed to the most recent openNotepad(). */
  consumePendingOptions: () => NotepadOpenOptions | null
  openNotepad: (options?: NotepadOpenOptions) => void
  closeNotepad: () => void
  toggleNotepad: () => void
  minimizeNotepad: () => void
  restoreNotepad: () => void
}

const NotepadContext = createContext<NotepadContextValue | null>(null)

/**
 * Typing inside a text field must not trigger the notepad shortcut — but the
 * notepad's own editor is a contentEditable, and Escape from there still has to
 * close the window, so the guard only applies to the open shortcut.
 */
const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

/**
 * App-wide notepad state.
 *
 * Mounted once in the authenticated layout so the notepad is reachable from
 * every page without a route change — opening it never unmounts the screen the
 * user is working on, which is the whole point of "faster than alt-tabbing to
 * Windows Notepad".
 */
export function NotepadProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [openSeq, setOpenSeq] = useState(0)
  // A ref, not state: reading-and-clearing inside a state updater would be an
  // impure update and would fire twice under StrictMode, losing the options.
  const pendingRef = useRef<NotepadOpenOptions | null>(null)

  const openNotepad = useCallback((options?: NotepadOpenOptions) => {
    pendingRef.current = options ?? null
    setIsMinimized(false)
    setIsOpen(true)
    setOpenSeq((seq) => seq + 1)
  }, [])

  const closeNotepad = useCallback(() => {
    setIsOpen(false)
    setIsMinimized(false)
  }, [])

  const consumePendingOptions = useCallback(() => {
    const taken = pendingRef.current
    pendingRef.current = null
    return taken
  }, [])

  // Refs so the single global keydown listener below never closes over stale state.
  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen
  const isMinimizedRef = useRef(isMinimized)
  isMinimizedRef.current = isMinimized

  const toggleNotepad = useCallback(() => {
    if (isOpenRef.current && !isMinimizedRef.current) closeNotepad()
    else openNotepad()
  }, [closeNotepad, openNotepad])

  const minimizeNotepad = useCallback(() => setIsMinimized(true), [])
  const restoreNotepad = useCallback(() => setIsMinimized(false), [])

  // Global shortcuts, registered once for the whole session:
  //   Ctrl/Cmd + Alt + N → open the notepad (or focus it if minimized)
  //   Ctrl/Cmd + Alt + Shift + N → open it on a brand new blank note
  // Alt is in the combination deliberately: plain Ctrl+N is the browser's own
  // "new window" and Ctrl+Shift+N is its incognito window — neither is
  // interceptable, so a binding that used them would silently do nothing.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !(event.ctrlKey || event.metaKey)) return
      if (event.key?.toLowerCase() !== 'n') return
      // Only skip when typing somewhere *outside* the notepad — the editor
      // itself should still accept the shortcut for a quick second note.
      if (isTypingTarget(event.target) && !isOpenRef.current) return

      event.preventDefault()
      if (event.shiftKey) {
        openNotepad({ newNote: true })
        return
      }
      if (isOpenRef.current && isMinimizedRef.current) {
        restoreNotepad()
        return
      }
      toggleNotepad()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openNotepad, restoreNotepad, toggleNotepad])

  const value = useMemo<NotepadContextValue>(
    () => ({
      isOpen,
      isMinimized,
      openSeq,
      consumePendingOptions,
      openNotepad,
      closeNotepad,
      toggleNotepad,
      minimizeNotepad,
      restoreNotepad,
    }),
    [
      isOpen,
      isMinimized,
      openSeq,
      consumePendingOptions,
      openNotepad,
      closeNotepad,
      toggleNotepad,
      minimizeNotepad,
      restoreNotepad,
    ],
  )

  return <NotepadContext.Provider value={value}>{children}</NotepadContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotepad(): NotepadContextValue {
  const ctx = useContext(NotepadContext)
  if (!ctx) throw new Error('useNotepad must be used inside <NotepadProvider>')
  return ctx
}

/**
 * Same API, but safe outside the provider — lets shared components (a header
 * button rendered in the portal shell, for example) offer a notepad entry point
 * without crashing on screens where the provider is not mounted.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalNotepad(): NotepadContextValue | null {
  return useContext(NotepadContext)
}
