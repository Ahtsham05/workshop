import { FileText, Network } from 'lucide-react'
import { useGetRelatedNotesQuery } from '@/stores/note.api'
import { cn } from '@/lib/utils'
import { getNoteColor } from '../../lib/note-colors'

interface RelatedNotesProps {
  noteId: string
  onOpenNote: (id: string) => void
}

/** No AI call — instant tag/keyword scoring, so it can run every time a note opens. */
export function RelatedNotes({ noteId, onOpenNote }: RelatedNotesProps) {
  const { data, isFetching } = useGetRelatedNotesQuery(noteId)
  const results = data?.results ?? []

  if (!isFetching && results.length === 0) return null

  return (
    <div className='space-y-1.5'>
      <p className='flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
        <Network className='size-3' />
        Related notes
      </p>
      {isFetching && <p className='text-[11px] text-muted-foreground'>Looking…</p>}
      <ul className='space-y-1'>
        {results.map((related) => {
          const color = getNoteColor(related.color)
          return (
            <li key={related.id}>
              <button
                type='button'
                onClick={() => onOpenNote(related.id)}
                className='flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-start text-xs transition-colors hover:bg-accent'
              >
                <FileText className={cn('size-3.5 shrink-0', color.tileText)} />
                <span className='truncate'>{related.title || 'Untitled note'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
