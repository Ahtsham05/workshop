import { StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOptionalNotepad } from '@/features/notepad/context/notepad-context'

/**
 * Header entry point for the global Notes window. Rendered next to the other header
 * tools; the keyboard shortcut (Ctrl+Alt+N) does the same thing without the trip
 * to the mouse.
 */
export function NotepadButton({ className }: { className?: string }) {
  const notepad = useOptionalNotepad()
  if (!notepad) return null

  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={() => (notepad.isOpen && !notepad.isMinimized ? notepad.closeNotepad() : notepad.openNotepad())}
      className={cn('relative rounded-full', className)}
      title='Notes (Ctrl+Alt+N)'
      aria-label='Open notes'
      aria-pressed={notepad.isOpen}
    >
      <StickyNote className={cn('size-[1.2rem]', notepad.isOpen && 'text-primary')} />
    </Button>
  )
}
