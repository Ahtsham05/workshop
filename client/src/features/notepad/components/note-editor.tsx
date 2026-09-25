import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  CaseSensitive,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Code,
  Eraser,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Search,
  Sparkles,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useIsNarrower } from '@/hooks/use-element-width'
import { cn } from '@/lib/utils'
import {
  applyBlockFormat,
  clearFormatting,
  exec,
  findMatches,
  handleChecklistClick,
  insertDivider,
  insertTimestamp,
  isFormatActive,
  replaceAll as replaceAllMatches,
  replaceSelection,
  selectMatch,
  toggleChecklistLine,
  toggleList,
} from '../lib/editor-commands'
import { normalizeNoteHtml } from '../lib/note-html'
import { getNoteStats } from '../lib/note-text'

export interface NoteEditorProps {
  /**
   * Changes whenever the parent re-seeds its buffer from a different note. The
   * DOM is written from `content` only on this signal, never on every keystroke.
   */
  seedKey: number
  title: string
  content: string
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onRequestSave: () => void
  readOnly?: boolean
  /** Typography scale, persisted by the parent so it survives note switches. */
  fontSize: number
  onFontSizeChange: (size: number) => void
  className?: string
  /** Compact chrome for the small floating window. */
  dense?: boolean
  placeholder?: string
  /** Metadata + per-note actions, rendered between the title and the toolbar. */
  metaSlot?: React.ReactNode
  /** The pane is narrow — keep the toolbar and status bar to one line each. */
  compact?: boolean
  /** Opens the AI panel — the toolbar's Sparkles button is one of its entry points. */
  onOpenAi?: () => void
}

interface ToolButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

function ToolButton({ icon: Icon, label, active, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      type='button'
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // onMouseDown, not onClick: the default mousedown would blur the editor and
      // collapse the selection before the command could apply to it.
      onMouseDown={(event) => {
        event.preventDefault()
        if (!disabled) onClick()
      }}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      <Icon className='size-4' />
    </button>
  )
}

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 26

export function NoteEditor({
  seedKey,
  title,
  content,
  onTitleChange,
  onContentChange,
  onRequestSave,
  readOnly = false,
  fontSize,
  onFontSizeChange,
  className,
  dense = false,
  placeholder = 'Start typing…',
  metaSlot,
  compact: compactProp = false,
  onOpenAi,
}: NoteEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  // The editor measures its OWN pane, not the window: with the list open, a
  // 1000px window still leaves the editor ~740px, which is not enough for the
  // full toolbar plus the type-size stepper.
  const isNarrowPane = useIsNarrower(rootRef, 720)
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({})
  const [findOpen, setFindOpen] = useState(false)
  const [findTerm, setFindTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [matchIndex, setMatchIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)

  const compact = compactProp || isNarrowPane

  const stats = useMemo(() => getNoteStats(content), [content])

  // ── Seeding ───────────────────────────────────────────────────────────────
  // Writing innerHTML while the user types would reset the caret to the top, so
  // the DOM is written only when `seedKey` says a different note was loaded.
  // `content` is read through a ref so it is always the freshly-hydrated value
  // without making it an effect dependency.
  const contentRef = useRef(content)
  contentRef.current = content
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const raw = contentRef.current || ''
    const healed = normalizeNoteHtml(raw)
    editor.innerHTML = healed
    // A note damaged by the old formatBlock toolbar repairs itself on open —
    // but only report the change when there was one, so merely opening a note
    // never counts as an edit.
    if (healed !== raw) onContentChangeRef.current(healed)
  }, [seedKey])

  const syncFromEditor = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const html = editor.innerHTML
    onContentChange(html === '<br>' || html === '<div><br></div>' ? '' : html)
  }, [onContentChange])

  const refreshActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: isFormatActive('bold'),
      italic: isFormatActive('italic'),
      underline: isFormatActive('underline'),
      strikeThrough: isFormatActive('strikeThrough'),
      insertUnorderedList: isFormatActive('insertUnorderedList'),
      insertOrderedList: isFormatActive('insertOrderedList'),
    })
  }, [])

  // Toolbar state follows the caret, so the buttons show what is under it.
  useEffect(() => {
    const handler = () => {
      const editor = editorRef.current
      const selection = window.getSelection()
      if (!editor || !selection || selection.rangeCount === 0) return
      if (!editor.contains(selection.anchorNode)) return
      refreshActiveFormats()
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [refreshActiveFormats])

  const runCommand = useCallback(
    (fn: () => void) => {
      if (readOnly) return
      editorRef.current?.focus()
      fn()
      refreshActiveFormats()
      syncFromEditor()
    },
    [readOnly, refreshActiveFormats, syncFromEditor],
  )

  // ── Checklist ticking ─────────────────────────────────────────────────────
  const handleEditorClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const editor = editorRef.current
      if (!editor || readOnly) return
      if (handleChecklistClick(event.nativeEvent, editor)) {
        event.preventDefault()
        syncFromEditor()
      }
    },
    [readOnly, syncFromEditor],
  )

  // ── Paste ─────────────────────────────────────────────────────────────────
  // Pasting from Word/Excel/a website drags in fonts, colours and tables that
  // break the note's look. Plain text keeps the note consistent — the one thing
  // people actually like about Windows Notepad.
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (readOnly) return
      const text = event.clipboardData.getData('text/plain')
      if (!text) return
      event.preventDefault()
      exec('insertText', text)
      syncFromEditor()
    },
    [readOnly, syncFromEditor],
  )

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) {
        // Tab indents instead of leaving the editor — expected in a notepad.
        if (event.key === 'Tab') {
          event.preventDefault()
          runCommand(() => exec(event.shiftKey ? 'outdent' : 'indent'))
        }
        return
      }

      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        onRequestSave()
        return
      }
      if (key === 'f') {
        event.preventDefault()
        setFindOpen(true)
        return
      }
      if (event.shiftKey && key === 'l') {
        event.preventDefault()
        runCommand(() => toggleChecklistLine(editorRef.current!))
        return
      }
      if (event.shiftKey && key === 'x') {
        event.preventDefault()
        runCommand(() => exec('strikeThrough'))
        return
      }
      if (event.shiftKey && key === 'h') {
        event.preventDefault()
        runCommand(() => exec('hiliteColor', '#fde68a'))
      }
    },
    [onRequestSave, runCommand],
  )

  // ── Find & replace ────────────────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !findOpen) return
    const matches = findMatches(editor, findTerm, matchCase)
    setMatchCount(matches.length)
    setMatchIndex(matches.length ? 1 : 0)
    if (matches.length) selectMatch(matches[0])
  }, [findTerm, matchCase, findOpen])

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      const editor = editorRef.current
      if (!editor) return
      const matches = findMatches(editor, findTerm, matchCase)
      setMatchCount(matches.length)
      if (!matches.length) return
      const next = ((matchIndex - 1 + direction) % matches.length + matches.length) % matches.length
      setMatchIndex(next + 1)
      selectMatch(matches[next])
    },
    [findTerm, matchCase, matchIndex],
  )

  const handleReplaceOne = useCallback(() => {
    if (readOnly || !findTerm) return
    const selection = window.getSelection()
    const selected = selection?.toString() ?? ''
    const isOnMatch = matchCase ? selected === findTerm : selected.toLowerCase() === findTerm.toLowerCase()
    if (!isOnMatch) {
      goToMatch(1)
      return
    }
    replaceSelection(replaceTerm)
    syncFromEditor()
    goToMatch(1)
  }, [findTerm, goToMatch, matchCase, readOnly, replaceTerm, syncFromEditor])

  const handleReplaceAll = useCallback(() => {
    const editor = editorRef.current
    if (!editor || readOnly || !findTerm) return
    const replaced = replaceAllMatches(editor, findTerm, replaceTerm, matchCase)
    if (replaced) {
      syncFromEditor()
      setMatchCount(0)
      setMatchIndex(0)
    }
  }, [findTerm, matchCase, readOnly, replaceTerm, syncFromEditor])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindTerm('')
    setReplaceTerm('')
    setMatchCount(0)
    setMatchIndex(0)
    editorRef.current?.focus()
  }, [])

  const isEmpty = !content || content === '<br>' || content === '<div><br></div>'

  return (
    <div ref={rootRef} className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}>
      {/* Title */}
      <div className={cn('flex items-center gap-2 px-3', dense ? 'pt-2.5' : 'px-4 pt-3.5')}>
        <input
          ref={titleRef}
          value={title}
          disabled={readOnly}
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter in the title drops into the body, like a document header.
            if (event.key === 'Enter') {
              event.preventDefault()
              editorRef.current?.focus()
            }
          }}
          placeholder='Untitled note'
          className={cn(
            'w-full min-w-0 border-0 bg-transparent p-0 font-semibold tracking-tight outline-none',
            'placeholder:text-muted-foreground/60 disabled:opacity-70',
            dense ? 'text-[15px]' : 'text-lg',
          )}
        />
      </div>

      {metaSlot}

      {/* Toolbar */}
      {/* One row, always. Wrapping turned this into a four-row wall in a narrow
          window, pushing the writing area off screen, and the row count changed
          as the window was resized. Overflowing horizontally keeps the writing
          area put and every control still reachable. */}
      <div
        className={cn(
          'flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b px-2 py-1.5',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          dense ? 'mt-0' : 'mt-1',
        )}
      >
        <ToolButton icon={Undo2} label='Undo (Ctrl+Z)' disabled={readOnly} onClick={() => runCommand(() => exec('undo'))} />
        <ToolButton icon={Redo2} label='Redo (Ctrl+Y)' disabled={readOnly} onClick={() => runCommand(() => exec('redo'))} />
        <Separator orientation='vertical' className='mx-1 h-5' />
        <ToolButton icon={Bold} label='Bold (Ctrl+B)' active={activeFormats.bold} disabled={readOnly} onClick={() => runCommand(() => exec('bold'))} />
        <ToolButton icon={Italic} label='Italic (Ctrl+I)' active={activeFormats.italic} disabled={readOnly} onClick={() => runCommand(() => exec('italic'))} />
        <ToolButton icon={Underline} label='Underline (Ctrl+U)' active={activeFormats.underline} disabled={readOnly} onClick={() => runCommand(() => exec('underline'))} />
        <ToolButton icon={Strikethrough} label='Strikethrough (Ctrl+Shift+X)' active={activeFormats.strikeThrough} disabled={readOnly} onClick={() => runCommand(() => exec('strikeThrough'))} />
        <ToolButton icon={Highlighter} label='Highlight (Ctrl+Shift+H)' disabled={readOnly} onClick={() => runCommand(() => exec('hiliteColor', '#fde68a'))} />
        <Separator orientation='vertical' className='mx-1 h-5' />
        <ToolButton icon={Heading1} label='Heading' disabled={readOnly} onClick={() => runCommand(() => applyBlockFormat(editorRef.current!, 'H1'))} />
        <ToolButton icon={Heading2} label='Subheading' disabled={readOnly} onClick={() => runCommand(() => applyBlockFormat(editorRef.current!, 'H2'))} />
        <ToolButton icon={List} label='Bullet list' active={activeFormats.insertUnorderedList} disabled={readOnly} onClick={() => runCommand(() => toggleList(editorRef.current!, 'insertUnorderedList'))} />
        <ToolButton icon={ListOrdered} label='Numbered list' active={activeFormats.insertOrderedList} disabled={readOnly} onClick={() => runCommand(() => toggleList(editorRef.current!, 'insertOrderedList'))} />
        <ToolButton icon={CheckSquare} label='Checklist (Ctrl+Shift+L)' disabled={readOnly} onClick={() => runCommand(() => toggleChecklistLine(editorRef.current!))} />
        <ToolButton icon={Quote} label='Quote' disabled={readOnly} onClick={() => runCommand(() => applyBlockFormat(editorRef.current!, 'BLOCKQUOTE'))} />
        <ToolButton icon={Code} label='Code block' disabled={readOnly} onClick={() => runCommand(() => applyBlockFormat(editorRef.current!, 'PRE'))} />
        <Separator orientation='vertical' className='mx-1 h-5' />
        <ToolButton icon={Clock} label='Insert date & time' disabled={readOnly} onClick={() => runCommand(() => insertTimestamp())} />
        <ToolButton icon={Minus} label='Divider' disabled={readOnly} onClick={() => runCommand(() => insertDivider(editorRef.current!))} />
        <ToolButton icon={Eraser} label='Clear formatting' disabled={readOnly} onClick={() => runCommand(() => clearFormatting(editorRef.current!))} />
        <Separator orientation='vertical' className='mx-1 h-5' />
        <ToolButton icon={Search} label='Find & replace (Ctrl+F)' active={findOpen} onClick={() => setFindOpen((open) => !open)} />
        {onOpenAi && (
          <>
            <Separator orientation='vertical' className='mx-1 h-5' />
            <ToolButton icon={Sparkles} label='AI Assistant (Ctrl+Shift+A)' onClick={onOpenAi} />
          </>
        )}

        <div className={cn('ms-auto flex shrink-0 items-center gap-0.5', compact && 'hidden')}>
          <ToolButton
            icon={CaseSensitive}
            label='Smaller text'
            disabled={fontSize <= MIN_FONT_SIZE}
            onClick={() => onFontSizeChange(Math.max(MIN_FONT_SIZE, fontSize - 1))}
          />
          <span className='w-7 text-center text-[11px] tabular-nums text-muted-foreground'>{fontSize}</span>
          <ToolButton
            icon={CaseSensitive}
            label='Bigger text'
            disabled={fontSize >= MAX_FONT_SIZE}
            onClick={() => onFontSizeChange(Math.min(MAX_FONT_SIZE, fontSize + 1))}
          />
        </div>
      </div>

      {/* Find & replace bar */}
      {findOpen && (
        <div
          className={cn(
            'flex flex-nowrap items-center gap-2 overflow-x-auto border-b bg-muted/40 px-2 py-1.5',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          <Input
            autoFocus
            value={findTerm}
            onChange={(event) => setFindTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                goToMatch(event.shiftKey ? -1 : 1)
              }
              if (event.key === 'Escape') closeFind()
            }}
            placeholder='Find'
            className='h-7 w-36 text-xs'
          />
          <span className='min-w-14 text-[11px] tabular-nums text-muted-foreground'>
            {matchCount ? `${matchIndex}/${matchCount}` : findTerm ? 'none' : ''}
          </span>
          <ToolButton icon={ChevronUp} label='Previous match' onClick={() => goToMatch(-1)} />
          <ToolButton icon={ChevronDown} label='Next match' onClick={() => goToMatch(1)} />
          <Input
            value={replaceTerm}
            onChange={(event) => setReplaceTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeFind()
            }}
            placeholder='Replace with'
            disabled={readOnly}
            className='h-7 w-36 text-xs'
          />
          <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' disabled={readOnly || !findTerm} onClick={handleReplaceOne}>
            Replace
          </Button>
          <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' disabled={readOnly || !findTerm} onClick={handleReplaceAll}>
            All
          </Button>
          <button
            type='button'
            onClick={() => setMatchCase((value) => !value)}
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
              matchCase ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
            title='Match case'
          >
            Aa
          </button>
          <Button size='icon' variant='ghost' className='ml-auto size-7' onClick={closeFind} aria-label='Close find'>
            <X className='size-3.5' />
          </Button>
        </div>
      )}

      {/* Body */}
      <div className='relative min-h-0 flex-1 overflow-auto'>
        {isEmpty && (
          <p
            className='pointer-events-none absolute select-none text-muted-foreground/50'
            style={{ top: dense ? 12 : 16, left: dense ? 14 : 18, fontSize }}
          >
            {placeholder}
          </p>
        )}
        <div
          ref={editorRef}
          role='textbox'
          aria-multiline='true'
          aria-label='Note body'
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck
          onInput={syncFromEditor}
          onBlur={() => {
            syncFromEditor()
            // Leaving the writing area is a boundary: push now instead of
            // waiting out the idle timer.
            onRequestSave()
          }}
          onClick={handleEditorClick}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className={cn(
            'notepad-content min-h-full w-full outline-none',
            dense ? 'px-3 py-3' : 'px-4 py-4',
            readOnly && 'cursor-default opacity-90',
          )}
          style={{ fontSize, lineHeight: 1.65 }}
        />
      </div>

      {/* Status bar — one line, always. `sm:`/`md:` here measured the viewport,
          so in a narrow window on a wide screen every counter stayed visible and
          the row wrapped into a four-line stack. */}
      <div className='flex items-center gap-3 overflow-hidden border-t px-3 py-1 text-[11px] whitespace-nowrap text-muted-foreground'>
        <span className='tabular-nums'>{stats.words} words</span>
        <span className='tabular-nums'>{stats.characters} chars</span>
        {!compact && <span className='tabular-nums'>{stats.lines} lines</span>}
        {!compact && stats.readingMinutes > 0 && (
          <span className='tabular-nums'>{stats.readingMinutes} min read</span>
        )}
        {readOnly && (
          <span className='ms-auto truncate font-medium'>
            {compact ? 'Read only' : 'Read only — shared by a teammate'}
          </span>
        )}
      </div>
    </div>
  )
}
