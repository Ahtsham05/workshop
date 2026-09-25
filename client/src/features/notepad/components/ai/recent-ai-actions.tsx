import { FolderTree, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime, type AiHistoryEntry } from '../../lib/note-ai-history'
import { ACTION_META_BY_KEY, AI_COLOR_STYLES } from '../../lib/note-ai'

interface RecentAiActionsProps {
  entries: AiHistoryEntry[]
  onSelect: (entry: AiHistoryEntry) => void
  onClear: () => void
}

/** Local, per-browser log of AI actions run — nothing server-side, purely "what did I just do". */
export function RecentAiActions({ entries, onSelect, onClear }: RecentAiActionsProps) {
  if (entries.length === 0) return null

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between'>
        <p className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'>Recent AI Actions</p>
        <button
          type='button'
          onClick={onClear}
          className='text-[10.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
        >
          Clear
        </button>
      </div>
      <ul className='space-y-0.5'>
        {entries.map((entry) => {
          const meta = ACTION_META_BY_KEY[entry.action]
          const Icon = meta?.icon ?? (entry.action === 'organize' ? FolderTree : Sparkles)
          const palette = AI_COLOR_STYLES[meta?.color ?? 'teal']
          return (
            <li key={entry.id}>
              <button
                type='button'
                title={`Run “${entry.label}” again on “${entry.noteTitle || 'this note'}”`}
                onClick={() => onSelect(entry)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[12px] transition-colors',
                  'hover:bg-accent',
                )}
              >
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded', palette.tile, palette.icon)}>
                  <Icon className='size-3' />
                </span>
                <span className='min-w-0 flex-1 truncate'>{entry.label}</span>
                <span className='shrink-0 text-[10.5px] text-muted-foreground/70'>{formatRelativeTime(entry.at)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
