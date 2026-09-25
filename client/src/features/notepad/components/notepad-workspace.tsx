import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Cloud, Loader2, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsNarrower } from '@/hooks/use-element-width'
import { cn } from '@/lib/utils'
import { getNoteColor } from '../lib/note-colors'
import { useResizableWidth } from '../lib/use-resizable-width'
import { AiPanel } from './ai/ai-panel'
import { NoteActionBar } from './note-action-bar'
import { NoteEditor } from './note-editor'
import { NoteList } from './note-list'
import { ResizeHandle } from './resize-handle'
import type { NotepadController } from '../lib/use-notepad-notes'

const FONT_SIZE_KEY = 'notepad:font-size'

const readFontSize = (): number => {
  try {
    const raw = Number(localStorage.getItem(FONT_SIZE_KEY))
    return raw >= 12 && raw <= 26 ? raw : 15
  } catch {
    return 15
  }
}

interface SaveIndicatorProps {
  state: NotepadController['saveState']
}

/**
 * Tiny, always-visible reassurance that nothing typed here can be lost.
 *
 * "Saved on this device" is the honest label while a sync is pending: the text
 * really is already durable in localStorage, so the wording should not imply
 * the work is at risk just because the network write has not gone out yet.
 */
function SaveIndicator({ state }: SaveIndicatorProps) {
  if (state === 'saving') {
    return (
      <span className='flex items-center gap-1 text-[11px] text-muted-foreground'>
        <Loader2 className='size-3 animate-spin' />
        Saving…
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className='flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400'>
        <Check className='size-3' />
        Saved
      </span>
    )
  }
  if (state === 'dirty') {
    return (
      <span
        className='flex items-center gap-1 text-[11px] text-muted-foreground'
        title='Kept on this device — syncing shortly'
      >
        <Cloud className='size-3' />
        Saved on this device
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span
        className='flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400'
        title='Could not reach the server — your text is safe on this device and will sync automatically'
      >
        <AlertCircle className='size-3' />
        Offline — will sync
      </span>
    )
  }
  return null
}

export interface NotepadWorkspaceProps {
  controller: NotepadController
  /** Compact paddings + narrower sidebar, for the floating window. */
  dense?: boolean
  className?: string
  /** Extra chrome rendered at the end of the toolbar row (window buttons). */
  headerSlot?: React.ReactNode
  /** Phones render one pane at a time. */
  singlePane?: boolean
}

/**
 * List + editor, shared by the floating window and the full-page /notes view so
 * the two can never drift apart. The only differences between them are padding,
 * sidebar width and which pane is visible on a phone.
 */
export function NotepadWorkspace({
  controller,
  dense = false,
  className,
  headerSlot,
  singlePane = false,
}: NotepadWorkspaceProps) {
  const {
    selectedNote,
    title,
    content,
    bufferKey,
    saveState,
    isReadOnly,
    isCreating,
    changeTitle,
    changeContent,
    selectNote,
    flushSave,
    createNote,
    notes,
  } = controller

  const [showList, setShowList] = useState(true)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [fontSize, setFontSize] = useState(readFontSize)
  // On phones the list, editor and AI panel share the screen — picking one swaps panes.
  const [mobilePane, setMobilePane] = useState<'list' | 'editor' | 'ai'>('list')

  // The floating window is resizable, so its own box — not the viewport — decides
  // whether both panes fit. A `sm:` breakpoint would keep showing the two-pane
  // layout in a 440px window on a 1440px screen, squeezing the editor to a strip
  // and wrapping the toolbar into four rows.
  const rootRef = useRef<HTMLDivElement>(null)
  const isCramped = useIsNarrower(rootRef, 640)
  const isTight = useIsNarrower(rootRef, 820)

  // Resizable only in the full, multi-pane layout (not the floating window, not the
  // single-pane phone/narrow-window layout) — dragging a divider in a box too small
  // for three panes in the first place would just fight the one-pane-at-a-time mode.
  const listResize = useResizableWidth({ storageKey: 'notepad:list-width', defaultWidth: 304, min: 200, max: 420 })
  const aiPanelResize = useResizableWidth({
    storageKey: 'notepad:ai-panel-width',
    defaultWidth: 320,
    min: 280,
    max: 520,
    direction: 'rtl',
  })

  useEffect(() => {
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(fontSize))
    } catch {
      /* ignore */
    }
  }, [fontSize])

  const handleNewNote = useCallback(() => {
    void createNote().then((created) => {
      if (created) setMobilePane('editor')
    })
  }, [createNote])

  // Below 640px the two panes stop fitting side by side, so the window behaves
  // like the phone layout: one pane at a time, with a way back to the list.
  const onePane = singlePane || isCramped
  const listVisible = onePane ? mobilePane === 'list' : showList
  const editorVisible = onePane ? mobilePane === 'editor' : true
  const aiVisible = onePane ? mobilePane === 'ai' : showAiPanel

  const toggleAiPanel = useCallback(() => {
    if (onePane) {
      setMobilePane((pane) => (pane === 'ai' ? 'editor' : 'ai'))
      return
    }
    setShowAiPanel((open) => !open)
  }, [onePane])

  const handleOpenNoteFromAi = useCallback(
    (id: string) => {
      selectNote(id)
      if (onePane) setMobilePane('editor')
    },
    [onePane, selectNote],
  )

  // Scoped to this workspace instance (via rootRef) so the floating window and the
  // full /notes page, if both are ever mounted, don't fight over the same shortcut.
  //   Ctrl/Cmd + Shift + A → toggle the AI panel
  //   Ctrl/Cmd + K         → focus the note search box
  //   Escape                → close the AI panel (ignored while a popover/select is open)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!rootRef.current?.contains(event.target as Node | null)) return
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        toggleAiPanel()
        return
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        rootRef.current?.querySelector<HTMLInputElement>('[data-note-search-input]')?.focus()
        return
      }
      if (event.key === 'Escape' && aiVisible) {
        const target = event.target as HTMLElement | null
        // A popover/select's own Escape handling closes just itself — let it,
        // rather than also collapsing the whole AI panel underneath it.
        if (target?.closest('[data-radix-popper-content-wrapper], [role="listbox"]')) return
        if (onePane) setMobilePane('editor')
        else setShowAiPanel(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [aiVisible, onePane, toggleAiPanel])

  return (
    <div ref={rootRef} className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}>
      {/* Top bar */}
      <div className='flex items-center gap-2 border-b px-2 py-1.5'>
        {!onePane && (
          <Button
            size='icon'
            variant='ghost'
            className='size-7'
            onClick={() => setShowList((visible) => !visible)}
            title={showList ? 'Hide note list (focus mode)' : 'Show note list'}
            aria-label={showList ? 'Hide note list' : 'Show note list'}
          >
            {showList ? <PanelLeftClose className='size-4' /> : <PanelLeftOpen className='size-4' />}
          </Button>
        )}
        {onePane && mobilePane === 'editor' && (
          <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={() => setMobilePane('list')}>
            All notes
          </Button>
        )}
        {onePane && mobilePane === 'ai' && (
          <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={() => setMobilePane('editor')}>
            Back
          </Button>
        )}

        {/* Only when the list (and its New note button) is hidden. */}
        {!listVisible && mobilePane !== 'ai' && (
          <Button size='sm' variant='ghost' className='h-7 gap-1.5 px-2 text-xs' onClick={handleNewNote} disabled={isCreating}>
            <Plus className='size-3.5' />
            New note
          </Button>
        )}

        <div className='ms-auto flex items-center gap-2'>
          <SaveIndicator state={saveState} />
          <Button
            size='icon'
            variant={aiVisible ? 'secondary' : 'ghost'}
            className='size-7'
            onClick={toggleAiPanel}
            title='AI Assistant (Ctrl+Shift+A)'
            aria-label='Toggle AI Assistant'
            aria-pressed={aiVisible}
          >
            <Sparkles className='size-4' />
          </Button>
          {headerSlot}
        </div>
      </div>

      {/* Panes */}
      <div className='flex min-h-0 flex-1'>
        {listVisible && (
          <NoteList
            controller={controller}
            dense={dense}
            className={cn(onePane ? 'w-full' : isTight ? 'w-56 shrink-0' : undefined)}
            style={!onePane && !isTight ? { width: listResize.width, flexShrink: 0 } : undefined}
            onNoteOpened={() => onePane && setMobilePane('editor')}
            onNewNote={handleNewNote}
            isCreating={isCreating}
          />
        )}
        {listVisible && !onePane && !isTight && (
          <ResizeHandle label='Resize note list' isResizing={listResize.isResizing} {...listResize.handleProps} />
        )}

        {editorVisible && (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col transition-colors',
              getNoteColor(selectedNote?.color).surface,
            )}
          >
            {selectedNote ? (
              <>
                <NoteEditor
                  metaSlot={<NoteActionBar controller={controller} note={selectedNote} dense={dense} />}
                  seedKey={bufferKey}
                  title={title}
                  content={content}
                  onTitleChange={changeTitle}
                  onContentChange={changeContent}
                  onRequestSave={() => void flushSave()}
                  readOnly={isReadOnly}
                  fontSize={fontSize}
                  onFontSizeChange={setFontSize}
                  dense={dense}
                  compact={isTight}
                  onOpenAi={toggleAiPanel}
                />
              </>
            ) : (
              <div className='flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center'>
                <StickyNote className='size-8 text-muted-foreground/40' />
                <div>
                  <p className='text-sm font-medium'>
                    {notes.length ? 'Pick a note to open it' : 'No notes yet'}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Everything you type here saves by itself and follows you to every device.
                  </p>
                </div>
                <Button size='sm' onClick={handleNewNote} disabled={isCreating} className='gap-1.5'>
                  <Plus className='size-4' />
                  Write your first note
                </Button>
              </div>
            )}
          </div>
        )}

        {aiVisible && !onePane && !isTight && (
          <ResizeHandle label='Resize AI Assistant panel' isResizing={aiPanelResize.isResizing} {...aiPanelResize.handleProps} />
        )}
        {aiVisible && (
          <AiPanel
            note={selectedNote}
            controller={controller}
            onOpenNote={handleOpenNoteFromAi}
            onClose={() => (onePane ? setMobilePane('editor') : setShowAiPanel(false))}
            className={cn('border-s', onePane ? 'w-full flex-1 border-s-0' : isTight ? 'w-80 shrink-0' : 'shrink-0')}
            style={!onePane && !isTight ? { width: aiPanelResize.width } : undefined}
          />
        )}
      </div>
    </div>
  )
}
