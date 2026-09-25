import { useState } from 'react'
import { FolderTree, Loader2, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useOrganizeNoteWithAiMutation, type Note } from '@/stores/note.api'
import type { NotepadController } from '../../lib/use-notepad-notes'
import { AiCtaCard } from './ai-cta-card'

interface OrganizeWithAiProps {
  note: Note
  controller: NotepadController
  readOnly?: boolean
  /** Fired once the suggestion actually comes back — the panel logs it to Recent AI Actions. */
  onOrganized?: () => void
  /**
   * Hands the panel a direct reference to this component's own `run` function —
   * called during render (not an effect), same "callback registry" pattern used
   * elsewhere in this app for a parent to trigger a child-owned action without a
   * DOM `.focus()`/`.click()` proxy. Lets a Recent AI Actions "organize" entry
   * re-run this exact flow instead of duplicating it.
   */
  registerTrigger?: (run: () => void) => void
}

/** "Organize with AI" — suggests title/category/tags, applies nothing until the user confirms. */
export function OrganizeWithAi({ note, controller, readOnly = false, onOrganized, registerTrigger }: OrganizeWithAiProps) {
  const [organize, { isLoading }] = useOrganizeNoteWithAiMutation()
  const [suggestion, setSuggestion] = useState<{ title: string; category: string; tags: string[] } | null>(null)

  const run = () => {
    if (readOnly || isLoading) return
    setSuggestion(null)
    void organize(note.id)
      .unwrap()
      .then((result) => {
        setSuggestion(result)
        onOrganized?.()
      })
      .catch(() => toast.error("AI couldn't process this request. Please try again."))
  }

  registerTrigger?.(run)

  const apply = () => {
    if (!suggestion) return
    if (suggestion.title) controller.changeTitle(suggestion.title)
    if (suggestion.category) void controller.setCategory(note, suggestion.category)
    if (suggestion.tags.length) {
      const merged = [...new Set([...note.tags, ...suggestion.tags])]
      void controller.setTags(note, merged)
    }
    toast.success('Note organized')
    setSuggestion(null)
  }

  return (
    <div className='space-y-2'>
      {isLoading ? (
        <div className='flex w-full items-center gap-3 rounded-lg border border-border/70 bg-background p-3 text-[13px] font-semibold text-muted-foreground'>
          <Loader2 className='size-4 shrink-0 animate-spin' />
          Organizing…
        </div>
      ) : (
        <AiCtaCard
          icon={FolderTree}
          color='teal'
          title='Organize with AI'
          description='Get a suggested title, category and tags for this note'
          onClick={run}
          disabled={readOnly}
        />
      )}

      {suggestion && (
        <div className='space-y-2 rounded-lg border bg-muted/30 p-3 text-xs'>
          <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
            Suggested organization
          </p>
          {suggestion.title && (
            <p>
              <span className='text-muted-foreground'>Title: </span>
              {suggestion.title}
            </p>
          )}
          {suggestion.category && (
            <p>
              <span className='text-muted-foreground'>Category: </span>
              {suggestion.category}
            </p>
          )}
          {suggestion.tags.length > 0 && (
            <div className='flex flex-wrap items-center gap-1'>
              <Tag className='size-3 text-muted-foreground' />
              {suggestion.tags.map((tag) => (
                <span key={tag} className='rounded bg-background px-1.5 py-px'>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className='flex items-center gap-1.5 pt-1'>
            <Button size='sm' className='h-6 px-2 text-[11px]' disabled={readOnly} onClick={apply}>
              Apply
            </Button>
            <Button size='sm' variant='ghost' className='h-6 px-2 text-[11px]' onClick={() => setSuggestion(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
