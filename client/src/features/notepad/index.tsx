import { useMemo } from 'react'
import { StickyNote } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useIsPhone } from '@/hooks/use-mobile'
import { NotepadWorkspace } from './components/notepad-workspace'
import { useNotepadNotes } from './lib/use-notepad-notes'
import { useViewportHeight } from './lib/use-viewport-height'

/**
 * Full-page Notes at /notes.
 *
 * The floating window covers the "jot it down without leaving this screen" case;
 * this page is for the other half — sitting down with your notes, searching
 * across them and writing something long. Both render the same workspace and the
 * same data hook, so a change made in one shows up in the other.
 */
export default function NotepadPage() {
  const controller = useNotepadNotes()
  const isPhone = useIsPhone()
  // `Main` (the shared authenticated layout) only constrains itself through flex-basis, not a
  // hard height, so `min-h-0`/`flex-1` alone silently fail to cap this page — a long note just
  // grew the whole page instead of scrolling inside its own Card. Measuring the real available
  // height and applying it as an explicit style is what actually bounds it (same fix as
  // features/ai-assistant's chat page, which hit the identical problem).
  const { ref: pageRef, height: pageHeight } = useViewportHeight<HTMLDivElement>()

  const counts = useMemo(() => {
    const pinned = controller.notes.filter((note) => note.isPinned).length
    const shared = controller.notes.filter((note) => note.visibility !== 'private').length
    return { total: controller.notes.length, pinned, shared }
  }, [controller.notes])

  return (
    <div
      ref={pageRef}
      style={pageHeight ? { height: pageHeight } : undefined}
      className='flex min-h-0 flex-col gap-4'
    >
      <div className='flex flex-wrap items-center gap-3'>
        <div className='flex items-center gap-2'>
          <span className='flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary'>
            <StickyNote className='size-5' />
          </span>
          <div>
            <h1 className='text-xl font-bold tracking-tight'>Notes</h1>
            <p className='text-xs text-muted-foreground'>
              {counts.total} notes · {counts.pinned} pinned · {counts.shared} shared
            </p>
          </div>
        </div>
        <p className='ms-auto hidden text-xs text-muted-foreground lg:block'>
          Press <kbd className='rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]'>Ctrl + Alt + N</kbd> anywhere
          in the app to open the floating window.
        </p>
      </div>

      {/* min-h-0 all the way down so the list and editor scroll internally
          instead of stretching the page. */}
      <Card className='flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0 lg:min-h-[70vh]'>
        <NotepadWorkspace controller={controller} singlePane={isPhone} className='min-h-[60vh]' />
      </Card>
    </div>
  )
}
