import { Check, Copy, RotateCcw, TextCursorInput, Type } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { NoteAiActionResult } from '@/stores/note.api'
import { ACTION_META_BY_KEY } from '../../lib/note-ai'
import { resultToHtml, resultToPlainText } from '../../lib/note-ai-insert'

interface AiResultViewProps {
  result: NoteAiActionResult | null
  isLoading: boolean
  error: string | null
  onInsert: (html: string) => void
  onReplace: (html: string) => void
  onRegenerate: () => void
  onApplyTitle?: (title: string) => void
  readOnly?: boolean
}

/**
 * Renders one AI action's result and never touches the note itself until the
 * user explicitly asks it to — Insert appends, Replace overwrites, Copy is
 * clipboard-only, Regenerate reruns the same action. The AI never gets to
 * silently overwrite what someone wrote.
 */
export function AiResultView({
  result,
  isLoading,
  error,
  onInsert,
  onReplace,
  onRegenerate,
  onApplyTitle,
  readOnly = false,
}: AiResultViewProps) {
  if (isLoading) {
    return (
      <div className='space-y-2 rounded-lg border bg-muted/30 p-3'>
        <Skeleton className='h-3 w-3/4' />
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-5/6' />
      </div>
    )
  }

  if (error) {
    return (
      <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive'>
        {error}
      </div>
    )
  }

  if (!result) return null

  const meta = ACTION_META_BY_KEY[result.action]
  const isTitle = result.action === 'generateTitle'
  const plainText = resultToPlainText(result)
  const html = resultToHtml(result, meta?.checklist)

  return (
    <div className='space-y-2 rounded-lg border bg-muted/30 p-3'>
      {'result' in result && (
        <p className='whitespace-pre-wrap text-[13px] leading-relaxed'>{result.result || 'No result.'}</p>
      )}
      {'items' in result && (
        <ul className='space-y-1 text-[13px]'>
          {result.items.length === 0 && <li className='text-muted-foreground italic'>Nothing found.</li>}
          {result.items.map((item, index) => (
            <li key={index} className='flex gap-1.5'>
              <span className='text-muted-foreground'>{meta?.checklist ? '☐' : '•'}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {'summary' in result && (
        <div className='space-y-2 text-[13px]'>
          {result.summary && <p>{result.summary}</p>}
          {result.decisions.length > 0 && (
            <div>
              <p className='font-medium'>Decisions</p>
              <ul className='space-y-0.5'>
                {result.decisions.map((d) => (
                  <li key={d}>• {d}</li>
                ))}
              </ul>
            </div>
          )}
          {result.actionItems.length > 0 && (
            <div>
              <p className='font-medium'>Action Items</p>
              <ul className='space-y-0.5'>
                {result.actionItems.map((item) => (
                  <li key={item}>☐ {item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.followUp && (
            <div>
              <p className='font-medium'>Follow-up</p>
              <p className='whitespace-pre-wrap'>{result.followUp}</p>
            </div>
          )}
        </div>
      )}

      <div className='flex flex-wrap items-center gap-1.5 border-t pt-2'>
        {isTitle && onApplyTitle ? (
          <Button
            size='sm'
            className='h-7 gap-1 px-2 text-xs'
            disabled={readOnly || !plainText}
            onClick={() => {
              onApplyTitle(plainText)
              toast.success('Title applied')
            }}
          >
            <Type className='size-3.5' />
            Apply as title
          </Button>
        ) : (
          <>
            <Button
              size='sm'
              variant='secondary'
              className='h-7 gap-1 px-2 text-xs'
              disabled={readOnly || !html}
              onClick={() => onInsert(html)}
            >
              <TextCursorInput className='size-3.5' />
              Insert
            </Button>
            <Button
              size='sm'
              variant='secondary'
              className='h-7 gap-1 px-2 text-xs'
              disabled={readOnly || !html}
              onClick={() => onReplace(html)}
            >
              <Check className='size-3.5' />
              Replace
            </Button>
          </>
        )}
        <Button
          size='sm'
          variant='ghost'
          className='h-7 gap-1 px-2 text-xs'
          disabled={!plainText}
          onClick={() => {
            void navigator.clipboard
              .writeText(plainText)
              .then(() => toast.success('Copied'))
              .catch(() => toast.error('Could not copy'))
          }}
        >
          <Copy className='size-3.5' />
          Copy
        </Button>
        <Button size='sm' variant='ghost' className='ms-auto h-7 gap-1 px-2 text-xs' onClick={onRegenerate}>
          <RotateCcw className='size-3.5' />
          Regenerate
        </Button>
      </div>
    </div>
  )
}
