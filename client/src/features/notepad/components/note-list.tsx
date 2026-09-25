import { useMemo } from 'react'
import { FileText, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Note, NoteView } from '@/stores/note.api'
import { getNoteColor } from '../lib/note-colors'
import { getNotePreview, getNoteTitle } from '../lib/note-text'
import { formatNoteStamp } from '../lib/note-time'
import type { NotepadController } from '../lib/use-notepad-notes'

const VIEW_TABS: { id: NoteView; label: string }[] = [
  { id: 'active', label: 'Notes' },
  { id: 'archived', label: 'Archive' },
  { id: 'trash', label: 'Trash' },
]

interface NoteListProps {
  controller: NotepadController
  className?: string
  style?: React.CSSProperties
  /** Narrow chrome for the floating window's sidebar. */
  dense?: boolean
  /** Called after a row is picked — the mobile sheet uses it to show the editor. */
  onNoteOpened?: (note: Note) => void
  onNewNote: () => void
  isCreating?: boolean
}

/** Display name of whoever wrote the note, or null when it is the reader's own. */
function ownerName(note: Note, isOwn: boolean): string | null {
  if (isOwn) return null
  if (typeof note.ownerId !== 'object' || !note.ownerId) return null
  return (note.ownerId.name || note.ownerId.email || '').trim() || null
}

interface NoteRowProps {
  note: Note
  isSelected: boolean
  onSelect: () => void
  onTogglePin: () => void
  onTrash: () => void
  canEdit: boolean
  inTrash: boolean
}

function NoteRow({ note, isSelected, onSelect, onTogglePin, onTrash, canEdit, inTrash }: NoteRowProps) {
  const color = getNoteColor(note.color)
  const preview = getNotePreview(note, 110)
  const sharedBy = ownerName(note, canEdit)

  return (
    <li className='group/row relative'>
      <button
        type='button'
        onClick={onSelect}
        className={cn(
          'w-full rounded-lg px-3 py-2.5 text-start transition-colors',
          isSelected ? 'bg-primary/10' : 'hover:bg-foreground/[0.04]',
        )}
      >
        {/* Colour lives in a 3px rail rather than a tinted card: a full-width
            pastel block per row is what makes a list look like a template. */}
        <span
          className={cn(
            'absolute inset-y-2 start-0 w-[3px] rounded-full transition-opacity',
            note.color === 'default' ? 'opacity-0' : 'opacity-100',
            color.swatch,
          )}
          aria-hidden
        />

        <div className='flex gap-2.5'>
          {/* Leading tile, tinted with the note's colour — carries the colour
              without washing the whole row in pastel. */}
          <span
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
              note.color === 'default' ? 'bg-muted text-muted-foreground' : cn(color.tile, color.tileText),
            )}
            aria-hidden
          >
            <FileText className='size-3.5' />
          </span>

          <span className='min-w-0 flex-1'>
            <span className='flex items-center gap-1.5'>
              {note.isPinned && <Pin className='size-3 shrink-0 fill-amber-500 text-amber-500' />}
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px] leading-5',
                  isSelected ? 'font-semibold text-foreground' : 'font-medium',
                )}
              >
                {getNoteTitle(note)}
              </span>
              <span className='shrink-0 text-[10px] tabular-nums text-muted-foreground/70'>
                {formatNoteStamp(note.updatedAt)}
              </span>
            </span>

            {preview ? (
              <span className='mt-0.5 line-clamp-2 text-[11.5px] leading-[1.45] text-muted-foreground'>{preview}</span>
            ) : (
              <span className='mt-0.5 block text-[11.5px] italic leading-[1.45] text-muted-foreground/50'>
                Empty note
              </span>
            )}

            {(note.tags.length > 0 || sharedBy) && (
              <span className='mt-1.5 flex items-center gap-1'>
                {sharedBy && (
                  <span className='truncate rounded bg-primary/10 px-1.5 py-px text-[9.5px] font-medium text-primary'>
                    {sharedBy}
                  </span>
                )}
                {note.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className='truncate rounded bg-muted px-1.5 py-px text-[9.5px] font-medium text-muted-foreground'
                  >
                    {tag}
                  </span>
                ))}
                {note.tags.length > 3 && (
                  <span className='text-[9.5px] text-muted-foreground/70'>+{note.tags.length - 3}</span>
                )}
              </span>
            )}
          </span>
        </div>
      </button>

      {/* Row actions: revealed on hover, always present for keyboard users. */}
      {canEdit && !inTrash && (
        <div className='absolute end-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100'>
          <button
            type='button'
            onClick={onTogglePin}
            title={note.isPinned ? 'Unpin' : 'Pin to top'}
            aria-label={note.isPinned ? 'Unpin note' : 'Pin note to top'}
            className='rounded bg-background/90 p-1 text-muted-foreground shadow-sm hover:text-foreground'
          >
            {note.isPinned ? <PinOff className='size-3' /> : <Pin className='size-3' />}
          </button>
          <button
            type='button'
            onClick={onTrash}
            title='Move to trash'
            aria-label='Move note to trash'
            className='rounded bg-background/90 p-1 text-muted-foreground shadow-sm hover:text-destructive'
          >
            <Trash2 className='size-3' />
          </button>
        </div>
      )}
    </li>
  )
}

export function NoteList({
  controller,
  className,
  style,
  dense = false,
  onNoteOpened,
  onNewNote,
  isCreating,
}: NoteListProps) {
  const {
    notes,
    filters,
    setFilters,
    selectedId,
    selectNote,
    tagCounts,
    isLoading,
    emptyTrash,
    togglePin,
    trashNote,
    isOwnNote,
  } = controller

  // Pinned notes are hoisted server-side too, but the client re-sorts so an
  // optimistic pin toggle reorders the row immediately instead of after a refetch.
  const { pinned, others } = useMemo(() => {
    const sorted = [...notes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    return {
      pinned: sorted.filter((note) => note.isPinned),
      others: sorted.filter((note) => !note.isPinned),
    }
  }, [notes])

  const inTrash = filters.view === 'trash'
  const hasFilters = Boolean(filters.tag || filters.color)

  const renderSection = (label: string, rows: Note[]) =>
    rows.length === 0 ? null : (
      <section key={label}>
        {pinned.length > 0 && (
          <h3 className='px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60'>
            {label}
          </h3>
        )}
        <ul className='space-y-px'>
          {rows.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              isSelected={note.id === selectedId}
              inTrash={inTrash}
              canEdit={isOwnNote(note)}
              onSelect={() => {
                selectNote(note.id)
                onNoteOpened?.(note)
              }}
              onTogglePin={() => togglePin(note)}
              onTrash={() => trashNote(note)}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <div className={cn('flex min-h-0 flex-col border-e bg-muted/20', className)} style={style}>
      {/* New note — the primary action lives with the notes it creates, not in
          the window chrome, so it is in the same place on the page and in the
          floating window. */}
      <div className={cn('px-2.5', dense ? 'pt-2.5' : 'pt-3')}>
        <Button size='sm' className='h-8 w-full gap-1.5 text-xs' onClick={onNewNote} disabled={isCreating}>
          <Plus className='size-3.5' />
          New note
        </Button>
      </div>

      {/* Search */}
      <div className='mt-2 px-2.5'>
        <div className='relative'>
          <Search className='pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          {/* showVoiceInput={false}: the shared Input otherwise renders a mic
              inside a wrapper div and forwards layout classes to that wrapper,
              which double-pads the field and pushes the magnifier and the clear
              button out of alignment. A notes filter does not need dictation —
              the app already has a global voice widget. */}
          <Input
            data-note-search-input
            showVoiceInput={false}
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder='Search notes'
            className='h-8 w-full rounded-lg border-transparent bg-background ps-8 pe-7 text-xs shadow-none focus-visible:border-input'
          />
          {filters.search && (
            <button
              type='button'
              onClick={() => setFilters((current) => ({ ...current, search: '' }))}
              className='absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
              aria-label='Clear search'
            >
              <X className='size-3.5' />
            </button>
          )}
        </div>
      </div>

      {/* View switch — a segmented control, so the three views read as one choice */}
      <div className='mx-2.5 mt-2 flex rounded-lg bg-muted p-0.5'>
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type='button'
            onClick={() => setFilters((current) => ({ ...current, view: tab.id }))}
            className={cn(
              'flex-1 rounded-md py-1 text-[11px] font-medium transition-colors',
              filters.view === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {tagCounts.length > 0 && !inTrash && (
        <div className='mt-2 flex flex-wrap items-center gap-1 px-2.5'>
          {tagCounts.slice(0, 6).map(({ tag, count }) => (
            <button
              key={tag}
              type='button'
              onClick={() => setFilters((current) => ({ ...current, tag: current.tag === tag ? null : tag }))}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                filters.tag === tag
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {tag}
              <span className='ms-1 opacity-60'>{count}</span>
            </button>
          ))}
          {hasFilters && (
            <button
              type='button'
              onClick={() => setFilters((current) => ({ ...current, tag: null, color: null }))}
              className='text-[10px] text-muted-foreground underline-offset-2 hover:underline'
            >
              clear
            </button>
          )}
        </div>
      )}

      {inTrash && notes.length > 0 && (
        <div className='mt-2 px-2.5'>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 w-full px-2 text-[11px] text-destructive hover:text-destructive'
            onClick={() => emptyTrash()}
          >
            Empty trash ({notes.length})
          </Button>
        </div>
      )}

      {/* Rows */}
      <div className='mt-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2'>
        {isLoading && (
          <div className='space-y-1.5 px-1.5 pt-1'>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className='space-y-1.5 rounded-lg p-2'>
                <div className='h-3 w-2/3 animate-pulse rounded bg-muted' />
                <div className='h-2.5 w-full animate-pulse rounded bg-muted/70' />
                <div className='h-2.5 w-4/5 animate-pulse rounded bg-muted/70' />
              </div>
            ))}
          </div>
        )}

        {!isLoading && notes.length === 0 && (
          <div className='flex flex-col items-center justify-center gap-1 px-4 py-12 text-center'>
            <p className='text-xs font-medium text-muted-foreground'>
              {filters.search
                ? `Nothing matches “${filters.search}”`
                : inTrash
                  ? 'Trash is empty'
                  : filters.view === 'archived'
                    ? 'Nothing archived yet'
                    : 'No notes yet'}
            </p>
            {!filters.search && filters.view === 'active' && (
              <p className='text-[11px] text-muted-foreground/70'>
                Press <kbd className='rounded border bg-muted px-1 font-mono text-[10px]'>Ctrl+Alt+Shift+N</kbd> for a
                new note
              </p>
            )}
          </div>
        )}

        {renderSection('Pinned', pinned)}
        {renderSection(pinned.length ? 'Others' : 'All notes', others)}
      </div>
    </div>
  )
}
