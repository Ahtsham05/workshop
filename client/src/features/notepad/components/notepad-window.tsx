import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Keyboard, Maximize2, Minimize2, Minus, StickyNote, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsPhone } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { useNotepad } from '../context/notepad-context'
import { POPOVER_LAYER, WINDOW_LAYER } from '../lib/layers'
import {
  readLastNoteId,
  readWindowState,
  writeWindowState,
  type NotepadWindowState,
} from '../lib/notepad-local'
import { useNotepadNotes } from '../lib/use-notepad-notes'
import { NotepadWorkspace } from './notepad-workspace'

const MIN_WIDTH = 420
const MIN_HEIGHT = 320
const EDGE_MARGIN = 8

const SHORTCUTS: [string, string][] = [
  ['Ctrl + Alt + N', 'Open / close Notes'],
  ['Ctrl + Alt + Shift + N', 'Open straight into a new note'],
  ['Ctrl + S', 'Save right now'],
  ['Ctrl + F', 'Find & replace inside the note'],
  ['Ctrl + B / I / U', 'Bold / italic / underline'],
  ['Ctrl + Shift + L', 'Turn the line into a checklist item'],
  ['Ctrl + Shift + H', 'Highlight the selection'],
  ['Ctrl + Shift + X', 'Strikethrough'],
  ['Tab / Shift + Tab', 'Indent / outdent'],
  ['Esc', 'Close the window'],
]

/** Keeps the window fully on screen after a resize, a zoom, or a monitor change. */
const clampToViewport = (state: NotepadWindowState): NotepadWindowState => {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - EDGE_MARGIN * 2)
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - EDGE_MARGIN * 2)
  const width = Math.min(Math.max(state.width, MIN_WIDTH), maxWidth)
  const height = Math.min(Math.max(state.height, MIN_HEIGHT), maxHeight)
  // -1 means "never positioned": centre it slightly low-right of the middle.
  const x =
    state.x < 0
      ? Math.max(EDGE_MARGIN, Math.round((window.innerWidth - width) / 2))
      : Math.min(Math.max(state.x, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN))
  const y =
    state.y < 0
      ? Math.max(EDGE_MARGIN, Math.round((window.innerHeight - height) / 2))
      : Math.min(Math.max(state.y, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN))
  return { ...state, x, y, width, height }
}

/**
 * The always-available floating notepad.
 *
 * It is a real window rather than a modal dialog on purpose: a modal would dim
 * and block the invoice, report or product screen underneath, and the entire
 * point is to jot something down *while* looking at that screen. Nothing behind
 * it is blocked, the page keeps its own scroll position, and closing the
 * notepad leaves the work exactly where it was.
 */
export function NotepadWindow() {
  const { isOpen, isMinimized, openSeq, consumePendingOptions, closeNotepad, minimizeNotepad, restoreNotepad } =
    useNotepad()
  const isPhone = useIsPhone()
  const controller = useNotepadNotes()

  const [geometry, setGeometry] = useState<NotepadWindowState>(() => readWindowState())
  const windowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const resizeRef = useRef<{ pointerId: number; startX: number; startY: number; width: number; height: number } | null>(
    null,
  )

  // ── Open requests ─────────────────────────────────────────────────────────
  // Each openNotepad() call bumps openSeq; the options it carried are consumed
  // exactly once here.
  //
  // This window and the full /notes page each run their own useNotepadNotes()
  // instance, so `selectedId` is independent per instance — only the note DATA
  // is shared (same RTK Query cache). Two separate staleness traps to cover:
  //
  //  1. Which note is selected — this window keeps whatever it selected the
  //     first time it ever mounted unless told otherwise, so a bare open (no
  //     explicit noteId/newNote target) follows `readLastNoteId()`, the one
  //     piece of "which note was I just looking at" state both instances keep
  //     in sync via writeLastNoteId.
  //  2. Stale content for a note that WAS already selected — this hook runs
  //     continuously in the background even while the window is closed, so
  //     its own "auto-select the first note" effect can select and hydrate a
  //     note the moment it's created, long before the window ever opens. If
  //     that note is then edited elsewhere (the page), this instance's
  //     hydration guard still thinks it's already loaded and never picks up
  //     the change — see resyncFromServer's docs. Covered below by resyncing
  //     whenever the target note turns out to already be selected.
  useEffect(() => {
    if (!isOpen || openSeq === 0) return
    const options = consumePendingOptions()
    if (options?.noteId) {
      if (controller.selectedId === options.noteId) controller.resyncFromServer()
      else controller.selectNote(options.noteId)
      return
    }
    if (options?.newNote || options?.initialContent || options?.related) {
      void controller.createNote({
        content: options.initialContent,
        related: options.related,
      })
      return
    }
    const lastId = readLastNoteId()
    if (!lastId) return
    if (lastId === controller.selectedId) controller.resyncFromServer()
    else controller.selectNote(lastId)
    // controller identity changes on every render — depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSeq, isOpen])

  // Position the window the first time it is shown, and keep it on screen when
  // the viewport changes.
  useEffect(() => {
    if (!isOpen) return
    setGeometry((current) => clampToViewport(current))
    const handleResize = () => setGeometry((current) => clampToViewport(current))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    writeWindowState(geometry)
  }, [geometry, isOpen])

  // ── Dragging ──────────────────────────────────────────────────────────────
  // Pointer events + setPointerCapture rather than document-level mousemove:
  // capture keeps the drag alive when the cursor outruns the window or crosses
  // an iframe, and it covers touch and pen without a second code path.
  const handleDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (geometry.maximized || isPhone) return
      // Only a bare left-button press on the bar itself starts a drag.
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('button, input, [role="button"]')) return
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - geometry.x,
        offsetY: event.clientY - geometry.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [geometry.maximized, geometry.x, geometry.y, isPhone],
  )

  const handleDragPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    setGeometry((current) =>
      clampToViewport({ ...current, x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }),
    )
  }, [])

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  // ── Resizing ──────────────────────────────────────────────────────────────
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (geometry.maximized || isPhone) return
      event.preventDefault()
      event.stopPropagation()
      resizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: geometry.width,
        height: geometry.height,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [geometry.height, geometry.maximized, geometry.width, isPhone],
  )

  const handleResizePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    setGeometry((current) =>
      clampToViewport({
        ...current,
        width: resize.width + (event.clientX - resize.startX),
        height: resize.height + (event.clientY - resize.startY),
      }),
    )
  }, [])

  const endResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  // ── Close ─────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    // Never close on top of an unsaved keystroke.
    void controller.flushSave().finally(() => closeNotepad())
  }, [closeNotepad, controller])

  const handleWindowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape') return
      // React dispatches events through the COMPONENT tree, not the DOM tree, so
      // a keydown inside a Radix popover — whose DOM node is portaled to <body>,
      // outside this element — still bubbles to this handler. Without the
      // containment check, Escape to dismiss the colour picker closed the whole
      // window with it.
      if (!windowRef.current?.contains(event.target as Node)) return
      event.stopPropagation()
      handleClose()
    },
    [handleClose],
  )

  if (!isOpen) return null

  // Minimized: a slim taskbar pill, so a long note stays one click away while
  // the user reads the page underneath.
  if (isMinimized) {
    return createPortal(
      <button
        type='button'
        onClick={restoreNotepad}
        className={cn(
          'fixed bottom-4 start-4 flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium shadow-lg transition-transform hover:scale-105',
          WINDOW_LAYER,
        )}
      >
        <StickyNote className='size-4 text-primary' />
        Notes
        <span className='text-muted-foreground'>({controller.notes.length})</span>
      </button>,
      document.body,
    )
  }

  const isFullBleed = isPhone || geometry.maximized

  const frameStyle: React.CSSProperties = isFullBleed
    ? { inset: isPhone ? 0 : EDGE_MARGIN }
    : { left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }

  return createPortal(
    <div
      ref={windowRef}
      role='dialog'
      aria-label='Notes'
      onKeyDown={handleWindowKeyDown}
      style={frameStyle}
      className={cn(
        'fixed flex flex-col overflow-hidden border bg-card shadow-2xl',
        WINDOW_LAYER,
        isPhone ? 'rounded-none' : 'rounded-xl',
        'animate-in fade-in zoom-in-95 duration-150',
      )}
    >
      {/* Title bar — the drag handle */}
      <div
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => !isPhone && setGeometry((current) => ({ ...current, maximized: !current.maximized }))}
        className={cn(
          'flex select-none items-center gap-2 border-b bg-muted/60 px-3 py-2',
          !isFullBleed && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <StickyNote className='size-4 text-primary' />
        <span className='text-xs font-semibold'>Notes</span>

        <div className='ms-auto flex items-center gap-0.5'>
          <Popover>
            <PopoverTrigger asChild>
              <Button size='icon' variant='ghost' className='size-7' title='Keyboard shortcuts' aria-label='Keyboard shortcuts'>
                <Keyboard className='size-4' />
              </Button>
            </PopoverTrigger>
            <PopoverContent align='end' className={cn('w-80 p-3', POPOVER_LAYER)}>
              <p className='mb-2 text-xs font-semibold'>Keyboard shortcuts</p>
              <dl className='space-y-1'>
                {SHORTCUTS.map(([keys, description]) => (
                  <div key={keys} className='flex items-baseline justify-between gap-3'>
                    <dt className='shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]'>{keys}</dt>
                    <dd className='text-end text-[11px] text-muted-foreground'>{description}</dd>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>

          <Button
            size='icon'
            variant='ghost'
            className='size-7'
            onClick={() => {
              void controller.flushSave()
              minimizeNotepad()
            }}
            title='Minimize'
            aria-label='Minimize'
          >
            <Minus className='size-4' />
          </Button>
          {!isPhone && (
            <Button
              size='icon'
              variant='ghost'
              className='size-7'
              onClick={() => setGeometry((current) => ({ ...current, maximized: !current.maximized }))}
              title={geometry.maximized ? 'Restore down' : 'Maximize'}
              aria-label={geometry.maximized ? 'Restore down' : 'Maximize'}
            >
              {geometry.maximized ? <Minimize2 className='size-4' /> : <Maximize2 className='size-4' />}
            </Button>
          )}
          <Button
            size='icon'
            variant='ghost'
            className='size-7 hover:bg-destructive hover:text-white'
            onClick={handleClose}
            title='Close (Esc)'
            aria-label='Close notes'
          >
            <X className='size-4' />
          </Button>
        </div>
      </div>

      <NotepadWorkspace controller={controller} dense singlePane={isPhone} />

      {/* Resize grip */}
      {!isFullBleed && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className='absolute bottom-0 end-0 size-4 cursor-nwse-resize'
          aria-hidden
        >
          <span className='absolute bottom-1 end-1 block size-2 rounded-sm border-b-2 border-e-2 border-muted-foreground/40' />
        </div>
      )}
    </div>,
    document.body,
  )
}
