import { useEffect, useState } from 'react'
import { History, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDraftAge } from '@/lib/form-draft'
import { cn } from '@/lib/utils'
import type { FormDraftControls } from '@/hooks/use-form-draft'

/**
 * Slim banner shown at the top of a create form when an unsaved draft was put back:
 * "Unsaved draft restored · saved 4 min ago   [Start over] [✕]". Renders nothing otherwise.
 */
export function FormDraftNotice({ draft, className }: { draft: FormDraftControls; className?: string }) {
  const [hidden, setHidden] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    setHidden(false)
    if (!draft.restoredAt) return
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [draft.restoredAt])

  if (!draft.restoredAt || hidden) return null

  return (
    <div
      role='status'
      className={cn(
        'flex items-center gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
        className,
      )}
    >
      <History className='h-4 w-4 shrink-0' aria-hidden />
      <p className='min-w-0 flex-1 leading-snug'>
        <span className='font-medium'>Unsaved draft restored</span>
        <span className='text-amber-800/80 dark:text-amber-100/70'> · saved {formatDraftAge(draft.restoredAt)}</span>
      </p>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='h-7 shrink-0 px-2 text-amber-900 hover:bg-amber-100 hover:text-amber-950 dark:text-amber-100 dark:hover:bg-amber-500/20'
        onClick={draft.discard}
      >
        Start over
      </Button>
      <button
        type='button'
        aria-label='Hide notice'
        className='shrink-0 rounded p-1 text-amber-800/70 hover:bg-amber-100 hover:text-amber-950 dark:text-amber-100/70 dark:hover:bg-amber-500/20'
        onClick={() => setHidden(true)}
      >
        <X className='h-3.5 w-3.5' />
      </button>
    </div>
  )
}
