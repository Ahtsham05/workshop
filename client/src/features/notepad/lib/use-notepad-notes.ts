import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import {
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useDuplicateNoteMutation,
  useEmptyNoteTrashMutation,
  useGetNoteTagsQuery,
  useGetNotesQuery,
  useRestoreNoteMutation,
  useUpdateNoteMutation,
  type Note,
  type NoteColor,
  type NoteRelatedType,
  type NoteView,
  type NoteVisibility,
  type UpdateNoteInput,
} from '@/stores/note.api'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  clearDraft,
  readCachedNotes,
  readDraft,
  readLastNoteId,
  writeCachedNotes,
  writeDraft,
  writeLastNoteId,
} from './notepad-local'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/** Quiet period after the last keystroke before a note is pushed to the server. */
const IDLE_SAVE_MS = 2500

/** Ceiling on unsaved time while someone types without pausing. */
const MAX_UNSAVED_MS = 20_000

export interface NotepadFilters {
  view: NoteView
  search: string
  tag: string | null
  color: NoteColor | null
}

const DEFAULT_FILTERS: NotepadFilters = { view: 'active', search: '', tag: null, color: null }

export interface NewNoteSeed {
  title?: string
  content?: string
  related?: { type: NoteRelatedType; id: string; label?: string }
}

/** `ownerId` arrives as a plain id or populated, depending on the endpoint. */
const ownerIdOf = (note: Note): string => {
  const owner = note.ownerId
  if (typeof owner === 'string') return owner
  return String(owner?.id || owner?._id || '')
}

/**
 * The signed-in user's id, from the cached `user` blob when the Redux slice has
 * not been populated yet. Ownership decides whether the editor is writable, and
 * an unknown id would hand the user an editable-looking note whose every save
 * the server rejects — the same localStorage fallback the authenticated layout
 * already uses for the school-role guards.
 */
const readStoredUserId = (): string | undefined => {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return undefined
    return JSON.parse(raw)?.id || undefined
  } catch {
    return undefined
  }
}

/**
 * All notepad data behaviour in one place, shared by the floating window and the
 * full-page view so the two can never drift apart.
 *
 * The important design points:
 *  - the list paints from a localStorage mirror on the first frame, so the
 *    window is usable before the network answers;
 *  - the editor owns its own title/content buffer and pushes to the server on a
 *    debounce, never the other way round while the user is typing;
 *  - every keystroke also lands in a localStorage draft, so a crash between two
 *    autosaves loses nothing.
 */
export function useNotepadNotes() {
  const reduxUserId = useSelector((state: RootState) => state.auth.data?.user?.id)
  const currentUserId = reduxUserId ?? readStoredUserId()
  const [filters, setFilters] = useState<NotepadFilters>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(() => readLastNoteId())
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  // Bumped every time the buffer is re-seeded from a note. The editor writes to
  // its contentEditable only when this changes — watching `content` instead
  // would re-seed on every keystroke and throw the caret back to the top, and
  // watching the note id alone would seed with the previous note's text (the id
  // prop updates one render before the hydration effect below runs).
  const [bufferKey, setBufferKey] = useState(0)

  // Searching hits the server, so let the user finish the word first.
  const debouncedSearch = useDebouncedValue(filters.search, 300)

  const queryArgs = useMemo(
    () => ({
      view: filters.view,
      search: debouncedSearch || undefined,
      tag: filters.tag || undefined,
      color: filters.color || undefined,
      limit: 100,
    }),
    [filters.view, filters.tag, filters.color, debouncedSearch],
  )

  const { data, isLoading, isFetching, refetch } = useGetNotesQuery(queryArgs)
  const { data: tagCounts = [] } = useGetNoteTagsQuery()

  const [createNoteMutation, { isLoading: isCreating }] = useCreateNoteMutation()
  const [updateNoteMutation] = useUpdateNoteMutation()
  const [deleteNoteMutation] = useDeleteNoteMutation()
  const [restoreNoteMutation] = useRestoreNoteMutation()
  const [duplicateNoteMutation] = useDuplicateNoteMutation()
  const [emptyTrashMutation] = useEmptyNoteTrashMutation()

  // First paint comes from the cache; once the query resolves the server wins.
  const [cachedNotes] = useState<Note[]>(() => readCachedNotes())
  const serverNotes = data?.results
  const isUnfilteredActiveView =
    filters.view === 'active' && !debouncedSearch && !filters.tag && !filters.color

  const notes = useMemo<Note[]>(() => {
    if (serverNotes) return serverNotes
    // Only the plain "my notes" view can be answered from the cache — a filtered
    // or searched list would otherwise show results that don't match the filter.
    return isUnfilteredActiveView ? cachedNotes : []
  }, [serverNotes, cachedNotes, isUnfilteredActiveView])

  // Keep the instant-open mirror fresh whenever the unfiltered list comes back.
  useEffect(() => {
    if (serverNotes && isUnfilteredActiveView) writeCachedNotes(serverNotes)
  }, [serverNotes, isUnfilteredActiveView])

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  )

  /**
   * The list endpoint populates `ownerId` on every row, mine included, so the
   * shape of the field says nothing about who wrote it — only this comparison
   * does. The list uses it to decide whose name to show and which rows offer
   * edit actions.
   */
  const isOwnNote = useCallback(
    (note: Note) => {
      const owner = ownerIdOf(note)
      if (!owner) return true
      return !currentUserId || owner === currentUserId
    },
    [currentUserId],
  )

  /**
   * A note someone else shared to the branch is read-only: the server only lets
   * the owner write, so the editor is disabled rather than accepting keystrokes
   * that would fail to save. Notes in the trash are frozen too, until restored.
   */
  const isReadOnly = Boolean(
    selectedNote &&
      ((currentUserId && ownerIdOf(selectedNote) && ownerIdOf(selectedNote) !== currentUserId) ||
        selectedNote.isTrashed),
  )

  // Unknown identity with a note that is not demonstrably mine: treat it as
  // read-only rather than letting keystrokes pile up against a write the server
  // will refuse.
  const isLocked =
    isReadOnly || Boolean(selectedNote && !currentUserId && selectedNote.visibility !== 'private')

  // ── Editor buffer hydration ───────────────────────────────────────────────
  // Load the note's text into the buffer when the *selection* changes, never on
  // a server echo of what is being typed — that would fight the caret.
  const hydratedIdRef = useRef<string | null>(null)
  /**
   * What the server last acknowledged, per note. Seeded on hydration so opening
   * a note and typing a character then undoing it sends nothing at all, and so
   * the save engine can skip a write whose payload matches what is already
   * stored. Declared here because the hydration effect below seeds it.
   */
  const confirmedRef = useRef(new Map<string, { title: string; content: string }>())

  /**
   * Loads `note` into the title/content buffer. Shared by the natural
   * selection-change effect below and `resyncFromServer` (see its own docs) —
   * both need the exact same draft-vs-server logic, just triggered differently.
   */
  const hydrateFrom = useCallback((note: Note) => {
    hydratedIdRef.current = note.id
    // Prefer an unsaved draft newer than the server copy (crash / refresh case).
    const draft = readDraft(note.id)
    const serverAt = new Date(note.updatedAt).getTime()
    // Whatever is on the server right now is the baseline either way.
    confirmedRef.current.set(note.id, { title: note.title || '', content: note.content || '' })

    if (draft && draft.savedAt > serverAt) {
      setTitle(draft.title)
      setContent(draft.content)
      setSaveState('dirty')
      toast.info('Recovered unsaved changes from your last session')
    } else {
      if (draft) clearDraft(note.id)
      setTitle(note.title || '')
      setContent(note.content || '')
      setSaveState('idle')
    }
    setBufferKey((key) => key + 1)
  }, [])

  useEffect(() => {
    if (!selectedNote) {
      if (selectedId === null && hydratedIdRef.current !== null) {
        hydratedIdRef.current = null
        setTitle('')
        setContent('')
        setBufferKey((key) => key + 1)
      }
      return
    }
    if (hydratedIdRef.current === selectedNote.id) return
    hydrateFrom(selectedNote)
  }, [selectedNote, selectedId, hydrateFrom])

  /**
   * Forces a re-hydration of whatever note is currently selected, even though
   * `hydratedIdRef` already marks it as loaded.
   *
   * This hook instance keeps running in the background whenever it's mounted —
   * in particular, the floating window's own `useNotepadNotes()` call is alive
   * even while the window is closed, so its "select the first note when
   * nothing is selected" effect below can auto-select and hydrate a note the
   * moment it's created, long before the window is ever opened. If that note
   * is then edited from somewhere else (the /notes page, in the same shared
   * RTK Query cache), `hydratedIdRef` still says "already loaded" for that id
   * and blocks the normal effect from picking up the new title/content —
   * exactly the trap the guard is *supposed* to set (never stomp on a caret
   * mid-edit), just triggered by a surface that was never actually being
   * typed into. Call this right when a surface becomes visible/active (the
   * window opening) to intentionally re-sync from whatever the server has now.
   */
  const resyncFromServer = useCallback(() => {
    if (selectedNote) hydrateFrom(selectedNote)
  }, [selectedNote, hydrateFrom])

  // Selecting nothing while notes exist: fall back to the first one so the
  // editor is never pointlessly blank on open.
  useEffect(() => {
    if (selectedId || notes.length === 0) return
    setSelectedId(notes[0].id)
  }, [notes, selectedId])

  // A note that was just created is selected before the list query has refetched,
  // so for a moment it is legitimately absent from `serverNotes`. Without this
  // ref the fallback below would treat it as deleted and bounce the user back to
  // the first note in the list the instant they clicked "New note".
  const awaitingIdRef = useRef<string | null>(null)

  // A selected note that no longer exists (deleted, filtered out) must not leave
  // the editor pointing at nothing.
  useEffect(() => {
    if (!selectedId || !serverNotes) return
    if (serverNotes.some((note) => note.id === selectedId)) {
      if (awaitingIdRef.current === selectedId) awaitingIdRef.current = null
      return
    }
    // Still in flight: the list simply has not caught up yet.
    if (awaitingIdRef.current === selectedId || isFetching) return
    setSelectedId(serverNotes.length ? serverNotes[0].id : null)
  }, [serverNotes, selectedId, isFetching])

  useEffect(() => {
    writeLastNoteId(selectedId)
  }, [selectedId])

  // ── Save engine ───────────────────────────────────────────────────────────
  //
  // Local-first, like every editor that has to survive a dropped connection:
  //
  //   every keystroke  → localStorage draft, synchronously. This is the
  //                      durability guarantee, and it costs no network.
  //   quiet for 2.5s   → one PATCH carrying everything typed since the last one
  //   still typing     → a forced PATCH every 20s, so a long session cannot
  //                      accumulate unbounded unsaved work
  //   boundaries       → PATCH immediately: switching notes, closing or
  //                      minimizing the window, leaving the editor, hiding the
  //                      tab, and Ctrl+S
  //
  // Writes are coalesced (never two in flight for the same note, and edits made
  // during a request are folded into one follow-up) and skipped entirely when
  // the text already matches what the server last confirmed. The previous
  // version fired on every 700ms pause with no dedupe, which is what made a
  // paragraph of typing look like a flood of requests.

  /** Latest values not yet confirmed by the server. */
  const pendingRef = useRef<{ id: string; title: string; content: string } | null>(null)
  const idleTimerRef = useRef<number | null>(null)
  const maxWaitTimerRef = useRef<number | null>(null)
  const retryTimerRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)
  const retryCountRef = useRef(0)

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    if (maxWaitTimerRef.current) window.clearTimeout(maxWaitTimerRef.current)
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
    idleTimerRef.current = null
    maxWaitTimerRef.current = null
    retryTimerRef.current = null
  }, [])

  /** Sends whatever is pending. Safe to call from anywhere, any number of times. */
  const pushPending = useCallback(async () => {
    if (inFlightRef.current) return
    const pending = pendingRef.current
    if (!pending) return

    const confirmed = confirmedRef.current.get(pending.id)
    if (confirmed && confirmed.title === pending.title && confirmed.content === pending.content) {
      // Nothing actually changed — e.g. the user typed a character and undid it.
      pendingRef.current = null
      clearDraft(pending.id)
      return
    }

    inFlightRef.current = true
    pendingRef.current = null
    clearTimers()
    setSaveState('saving')
    try {
      await updateNoteMutation({ id: pending.id, title: pending.title, content: pending.content }).unwrap()
      confirmedRef.current.set(pending.id, { title: pending.title, content: pending.content })
      retryCountRef.current = 0
      // Only drop the draft if nothing new was typed while the request was out.
      if (!pendingRef.current) clearDraft(pending.id)
      setSaveState(pendingRef.current ? 'dirty' : 'saved')
    } catch {
      // Put it back and keep the draft: it is the only copy until this lands.
      pendingRef.current = pendingRef.current ?? pending
      setSaveState('error')
      // Back off 2s, 4s, 8s… capped, rather than hammering a server that is down.
      const delay = Math.min(30_000, 2000 * 2 ** retryCountRef.current)
      retryCountRef.current += 1
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null
        void pushPending()
      }, delay)
    } finally {
      inFlightRef.current = false
    }

    // Edits that arrived mid-request get their own pass.
    if (pendingRef.current && !retryTimerRef.current) void pushPending()
  }, [clearTimers, updateNoteMutation])

  const scheduleSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      const id = hydratedIdRef.current
      if (!id) return

      // The durable write, on every single change, before anything else.
      writeDraft(id, { title: nextTitle, content: nextContent, savedAt: Date.now() })

      const confirmed = confirmedRef.current.get(id)
      if (confirmed && confirmed.title === nextTitle && confirmed.content === nextContent) {
        pendingRef.current = null
        clearTimers()
        clearDraft(id)
        setSaveState('saved')
        return
      }

      pendingRef.current = { id, title: nextTitle, content: nextContent }
      setSaveState('dirty')

      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null
        void pushPending()
      }, IDLE_SAVE_MS)

      // Started on the first unsaved edit and left to run: without it, someone
      // typing steadily for ten minutes would never hit a quiet 2.5s window.
      if (!maxWaitTimerRef.current) {
        maxWaitTimerRef.current = window.setTimeout(() => {
          maxWaitTimerRef.current = null
          void pushPending()
        }, MAX_UNSAVED_MS)
      }
    },
    [clearTimers, pushPending],
  )

  /** Write anything outstanding right now — on close, on Ctrl+S, on note switch. */
  const flushSave = useCallback(async () => {
    clearTimers()
    await pushPending()
  }, [clearTimers, pushPending])

  const changeTitle = useCallback(
    (value: string) => {
      setTitle(value)
      scheduleSave(value, content)
    },
    [content, scheduleSave],
  )

  const changeContent = useCallback(
    (value: string) => {
      setContent(value)
      scheduleSave(title, value)
    },
    [title, scheduleSave],
  )

  /**
   * Like `changeContent`, but also bumps `bufferKey` — for writes that happen
   * outside the editor's own contentEditable (an AI panel's Insert/Replace).
   * `changeContent` alone only updates the `content` state; the editor's DOM is
   * written from that state solely on a `seedKey` change (see NoteEditor's
   * seeding effect), so skipping this would save the new text but leave the
   * visible note unchanged until the next note switch.
   */
  const applyContent = useCallback(
    (value: string) => {
      setContent(value)
      scheduleSave(title, value)
      setBufferKey((key) => key + 1)
    },
    [title, scheduleSave],
  )

  // Switching notes with unsaved keystrokes must not drop them.
  const selectNote = useCallback(
    (id: string | null) => {
      if (pendingRef.current) void flushSave()
      setSelectedId(id)
    },
    [flushSave],
  )

  // Boundary flushes. `visibilitychange` is the one that matters in practice —
  // it fires when the tab is hidden, the window is minimized or the machine
  // sleeps, and unlike `beforeunload` it is reliable on mobile.
  useEffect(() => {
    const flushNow = () => {
      if (pendingRef.current) void pushPending()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', flushNow)
    window.addEventListener('beforeunload', flushNow)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', flushNow)
      window.removeEventListener('beforeunload', flushNow)
      clearTimers()
    }
  }, [clearTimers, pushPending])

  // ── Actions ───────────────────────────────────────────────────────────────
  const createNote = useCallback(
    async (seed?: NewNoteSeed) => {
      if (pendingRef.current) await flushSave()
      try {
        const created = await createNoteMutation({
          title: seed?.title ?? '',
          content: seed?.content ?? '',
          relatedType: seed?.related?.type,
          relatedId: seed?.related?.id,
          relatedLabel: seed?.related?.label,
        }).unwrap()
        // Hydrate straight from the response so the editor is ready before the
        // list refetch lands.
        hydratedIdRef.current = created.id
        awaitingIdRef.current = created.id
        confirmedRef.current.set(created.id, { title: created.title || '', content: created.content || '' })
        setTitle(created.title || '')
        setContent(created.content || '')
        setBufferKey((key) => key + 1)
        setSaveState('idle')
        setSelectedId(created.id)
        setFilters((current) => ({ ...current, view: 'active', search: '', tag: null, color: null }))
        return created
      } catch {
        toast.error('Could not create the note')
        return null
      }
    },
    [createNoteMutation, flushSave],
  )

  const patchNote = useCallback(
    async (id: string, patch: UpdateNoteInput, successMessage?: string) => {
      try {
        await updateNoteMutation({ id, ...patch }).unwrap()
        if (successMessage) toast.success(successMessage)
      } catch {
        toast.error('Could not update the note')
      }
    },
    [updateNoteMutation],
  )

  const togglePin = useCallback(
    (note: Note) => patchNote(note.id, { isPinned: !note.isPinned }),
    [patchNote],
  )

  const setColor = useCallback(
    (note: Note, color: NoteColor) => patchNote(note.id, { color }),
    [patchNote],
  )

  const setVisibility = useCallback(
    (note: Note, visibility: NoteVisibility) =>
      patchNote(
        note.id,
        { visibility },
        visibility === 'private' ? 'Note is private again' : 'Note shared with your team',
      ),
    [patchNote],
  )

  const setTags = useCallback((note: Note, tags: string[]) => patchNote(note.id, { tags }), [patchNote])

  const setCategory = useCallback(
    (note: Note, category: string) => patchNote(note.id, { category }),
    [patchNote],
  )

  const setNoteType = useCallback(
    (note: Note, noteType: Note['noteType']) => patchNote(note.id, { noteType }),
    [patchNote],
  )

  const archiveNote = useCallback(
    (note: Note) =>
      patchNote(
        note.id,
        { isArchived: !note.isArchived },
        note.isArchived ? 'Note restored from archive' : 'Note archived',
      ),
    [patchNote],
  )

  const trashNote = useCallback(
    async (note: Note) => {
      try {
        await deleteNoteMutation({ id: note.id }).unwrap()
        clearDraft(note.id)
        toast.success('Note moved to trash', {
          action: {
            label: 'Undo',
            onClick: () => {
              void restoreNoteMutation(note.id).unwrap().catch(() => toast.error('Could not restore the note'))
            },
          },
        })
      } catch {
        toast.error('Could not delete the note')
      }
    },
    [deleteNoteMutation, restoreNoteMutation],
  )

  const deleteForever = useCallback(
    async (note: Note) => {
      try {
        await deleteNoteMutation({ id: note.id, permanent: true }).unwrap()
        clearDraft(note.id)
        toast.success('Note deleted permanently')
      } catch {
        toast.error('Could not delete the note')
      }
    },
    [deleteNoteMutation],
  )

  const restoreNote = useCallback(
    async (note: Note) => {
      try {
        await restoreNoteMutation(note.id).unwrap()
        toast.success('Note restored')
      } catch {
        toast.error('Could not restore the note')
      }
    },
    [restoreNoteMutation],
  )

  const duplicateNote = useCallback(
    async (note: Note) => {
      try {
        const copy = await duplicateNoteMutation(note.id).unwrap()
        setSelectedId(copy.id)
        toast.success('Note duplicated')
      } catch {
        toast.error('Could not duplicate the note')
      }
    },
    [duplicateNoteMutation],
  )

  const emptyTrash = useCallback(async () => {
    try {
      const result = await emptyTrashMutation().unwrap()
      toast.success(
        result.deletedCount ? `Trash emptied (${result.deletedCount} notes)` : 'Trash is already empty',
      )
    } catch {
      toast.error('Could not empty the trash')
    }
  }, [emptyTrashMutation])

  return {
    // data
    notes,
    tagCounts,
    selectedNote,
    selectedId,
    title,
    content,
    saveState,
    bufferKey,
    isLoading: isLoading && !notes.length,
    isFetching,
    isCreating,
    isReadOnly: isLocked,
    currentUserId,
    isOwnNote,
    filters,
    // state setters
    setFilters,
    selectNote,
    resyncFromServer,
    changeTitle,
    changeContent,
    applyContent,
    flushSave,
    refetch,
    // actions
    createNote,
    togglePin,
    setColor,
    setVisibility,
    setTags,
    setCategory,
    setNoteType,
    archiveNote,
    trashNote,
    deleteForever,
    restoreNote,
    duplicateNote,
    emptyTrash,
  }
}

export type NotepadController = ReturnType<typeof useNotepadNotes>
