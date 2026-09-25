import { useState } from 'react'
import {
  Archive,
  CalendarDays,
  ArchiveRestore,
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  Lock,
  MoreHorizontal,
  Palette,
  Pin,
  PinOff,
  Printer,
  RotateCcw,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Note, NoteVisibility } from '@/stores/note.api'
import { POPOVER_LAYER } from '../lib/layers'
import { formatNoteEdited } from '../lib/note-time'
import { NOTE_COLORS, getNoteColor } from '../lib/note-colors'
import { copyNoteToClipboard, downloadNoteAsHtml, downloadNoteAsTxt, printNote } from '../lib/note-export'
import type { NotepadController } from '../lib/use-notepad-notes'

const VISIBILITY_OPTIONS: {
  id: NoteVisibility
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'private', label: 'Private', hint: 'Only you can see this note', icon: Lock },
  { id: 'branch', label: 'This branch', hint: 'Everyone working in this branch', icon: Users },
  { id: 'organization', label: 'Whole company', hint: 'Everyone in your organization', icon: Globe },
]

interface NoteActionBarProps {
  controller: NotepadController
  note: Note
  dense?: boolean
}

/** Pin, colour, tags, sharing and the export menu for the open note. */
export function NoteActionBar({ controller, note, dense = false }: NoteActionBarProps) {
  const {
    togglePin,
    setColor,
    setTags,
    setVisibility,
    archiveNote,
    trashNote,
    duplicateNote,
    restoreNote,
    deleteForever,
    isReadOnly,
    isOwnNote,
  } = controller
  const [tagDraft, setTagDraft] = useState('')

  const color = getNoteColor(note.color)
  const visibility = VISIBILITY_OPTIONS.find((option) => option.id === note.visibility) ?? VISIBILITY_OPTIONS[0]
  const VisibilityIcon = visibility.icon
  const author =
    !isOwnNote(note) && typeof note.ownerId === 'object' && note.ownerId
      ? note.ownerId.name || note.ownerId.email || null
      : null

  const addTag = () => {
    const tag = tagDraft.trim()
    if (!tag) return
    if (note.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTagDraft('')
      return
    }
    void setTags(note, [...note.tags, tag])
    setTagDraft('')
  }

  // Notes in the trash only get "restore" and "delete forever" — editing a
  // deleted note would silently resurrect it.
  if (note.isTrashed) {
    return (
      <div className='flex items-center gap-2 border-b bg-muted/40 px-2 py-1.5'>
        <span className='text-[11px] text-muted-foreground'>This note is in the trash.</span>
        <Button size='sm' variant='ghost' className='ms-auto h-7 gap-1.5 px-2 text-xs' onClick={() => restoreNote(note)}>
          <RotateCcw className='size-3.5' />
          Restore
        </Button>
        <Button
          size='sm'
          variant='ghost'
          className='h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive'
          onClick={() => deleteForever(note)}
        >
          <Trash2 className='size-3.5' />
          Delete forever
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('px-3 pb-1.5', dense ? 'pt-1' : 'px-4 pt-1.5')}>
      {/* Metadata line: when the note was touched, who wrote it, what it is
          tagged with — the context you want before you start reading. */}
      <div className='flex flex-nowrap items-center gap-x-3 overflow-hidden text-[11px] whitespace-nowrap text-muted-foreground'>
        <span className='inline-flex shrink-0 items-center gap-1'>
          <CalendarDays className='size-3' />
          {formatNoteEdited(note.updatedAt)}
        </span>
        {author && (
          <span className='inline-flex items-center gap-1'>
            <User className='size-3' />
            {author}
          </span>
        )}
        <span className='inline-flex min-w-0 shrink items-center gap-1'>
          <Tag className='size-3 shrink-0' />
          <span className='truncate'>{note.tags.length ? note.tags.join(', ') : 'No tags'}</span>
        </span>
        <span className={cn('inline-flex shrink-0 items-center gap-1', note.color === 'default' && 'hidden')}>
          <span className={cn('size-2 rounded-full', color.swatch)} aria-hidden />
          {color.label}
        </span>
      </div>

    <div className={cn('-mx-1 mt-0.5 flex items-center gap-1')}>
      {/* Pin */}
      <Button
        size='icon'
        variant='ghost'
        className='size-7'
        disabled={isReadOnly}
        onClick={() => togglePin(note)}
        title={note.isPinned ? 'Unpin note' : 'Pin to top'}
        aria-label={note.isPinned ? 'Unpin note' : 'Pin to top'}
      >
        {note.isPinned ? <PinOff className='size-4' /> : <Pin className='size-4' />}
      </Button>

      {/* Colour */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size='icon' variant='ghost' className='size-7' disabled={isReadOnly} title='Note colour' aria-label='Note colour'>
            <Palette className='size-4' />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className={cn('w-auto p-2', POPOVER_LAYER)}>
          <div className='grid grid-cols-4 gap-1.5'>
            {NOTE_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type='button'
                title={swatch.label}
                aria-label={swatch.label}
                onClick={() => setColor(note, swatch.id)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border transition-transform hover:scale-110',
                  swatch.swatch,
                  note.color === swatch.id ? 'ring-2 ring-primary ring-offset-1' : 'border-transparent',
                )}
              >
                {note.color === swatch.id && <Check className='size-3.5 text-white drop-shadow' />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Tags */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size='icon' variant='ghost' className='size-7' disabled={isReadOnly} title='Tags' aria-label='Tags'>
            <Tag className='size-4' />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className={cn('w-64 p-2', POPOVER_LAYER)}>
          <p className='mb-2 text-xs font-medium'>Tags</p>
          <div className='mb-2 flex flex-wrap gap-1'>
            {note.tags.length === 0 && <span className='text-[11px] text-muted-foreground'>No tags yet</span>}
            {note.tags.map((tag) => (
              <span
                key={tag}
                className='inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]'
              >
                {tag}
                <button
                  type='button'
                  aria-label={`Remove ${tag}`}
                  onClick={() => setTags(note, note.tags.filter((item) => item !== tag))}
                  className='text-muted-foreground hover:text-destructive'
                >
                  <X className='size-3' />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addTag()
              }
            }}
            placeholder='Add a tag and press Enter'
            className='h-8 text-xs'
          />
        </PopoverContent>
      </Popover>

      {/* Sharing */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 gap-1.5 px-2 text-[11px]'
            disabled={isReadOnly}
            title='Who can see this note'
          >
            <VisibilityIcon className='size-3.5' />
            <span className='hidden sm:inline'>{visibility.label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className={cn('w-60 p-1', POPOVER_LAYER)}>
          {VISIBILITY_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.id}
                type='button'
                onClick={() => setVisibility(note, option.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start transition-colors hover:bg-accent',
                  note.visibility === option.id && 'bg-accent',
                )}
              >
                <Icon className='mt-0.5 size-3.5 shrink-0 text-muted-foreground' />
                <span className='min-w-0'>
                  <span className='block text-xs font-medium'>{option.label}</span>
                  <span className='block text-[11px] text-muted-foreground'>{option.hint}</span>
                </span>
                {note.visibility === option.id && <Check className='ms-auto mt-0.5 size-3.5' />}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>

      {/* Overflow */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size='icon' variant='ghost' className='ms-auto size-7' title='More actions' aria-label='More actions'>
            <MoreHorizontal className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className={cn('w-52', POPOVER_LAYER)}>
          <DropdownMenuLabel className='text-[11px] text-muted-foreground'>Note</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => duplicateNote(note)}>
            <Copy className='size-4' />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void copyNoteToClipboard(note)
                .then(() => toast.success('Note copied to clipboard'))
                .catch(() => toast.error('Could not copy the note'))
            }}
          >
            <FileText className='size-4' />
            Copy text
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className='text-[11px] text-muted-foreground'>Export</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => downloadNoteAsTxt(note)}>
            <Download className='size-4' />
            Download .txt
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadNoteAsHtml(note)}>
            <Download className='size-4' />
            Download .html
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => printNote(note)}>
            <Printer className='size-4' />
            Print
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={isReadOnly} onClick={() => archiveNote(note)}>
            {note.isArchived ? <ArchiveRestore className='size-4' /> : <Archive className='size-4' />}
            {note.isArchived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isReadOnly}
            variant='destructive'
            onClick={() => trashNote(note)}
          >
            <Trash2 className='size-4' />
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    </div>
  )
}
