import { forwardRef, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAskNotesMutation, type NoteAskResult } from '@/stores/note.api'

interface AskYourNotesProps {
  onOpenNote: (id: string) => void
}

interface QaEntry {
  question: string
  result: NoteAskResult | null
  error: string | null
}

/**
 * Retrieval-augmented Q&A over the whole note library, pinned at the top of the AI
 * panel (not a separate tab) — ephemeral by design, so nothing here is persisted
 * beyond this panel session.
 */
export const AskYourNotes = forwardRef<HTMLInputElement, AskYourNotesProps>(function AskYourNotes(
  { onOpenNote },
  ref,
) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<QaEntry[]>([])
  const [ask, { isLoading }] = useAskNotesMutation()

  const submit = () => {
    const trimmed = question.trim()
    if (!trimmed || isLoading) return
    setQuestion('')
    const entryIndex = history.length
    setHistory((current) => [...current, { question: trimmed, result: null, error: null }])
    void ask(trimmed)
      .unwrap()
      .then((result) => {
        setHistory((current) => current.map((entry, i) => (i === entryIndex ? { ...entry, result } : entry)))
      })
      .catch(() => {
        setHistory((current) =>
          current.map((entry, i) =>
            i === entryIndex ? { ...entry, error: "AI couldn't process this request. Please try again." } : entry,
          ),
        )
      })
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <Input
          ref={ref}
          showVoiceInput={false}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder='Ask a question about your notes…'
          className='h-10 rounded-xl text-[13px]'
        />
        <Button size='icon' className='size-10 shrink-0 rounded-full' disabled={!question.trim() || isLoading} onClick={submit}>
          {isLoading ? <Loader2 className='size-4 animate-spin' /> : <Send className='size-4' />}
        </Button>
      </div>

      {history.length > 0 && (
        <div className='space-y-3'>
          {history.map((entry, index) => (
            <div key={index} className='space-y-1.5'>
              <p className='rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary'>{entry.question}</p>

              {!entry.result && !entry.error && (
                <div className='flex items-center gap-1.5 px-1 text-xs text-muted-foreground'>
                  <Loader2 className='size-3 animate-spin' />
                  Searching your notes…
                </div>
              )}

              {entry.error && <p className='px-1 text-xs text-destructive'>{entry.error}</p>}

              {entry.result && (
                <div className='space-y-2 rounded-lg border bg-muted/30 p-2.5'>
                  <p className='flex items-start gap-1.5 text-[13px] leading-relaxed'>
                    <Sparkles
                      className={cn('mt-0.5 size-3.5 shrink-0', entry.result.found ? 'text-primary' : 'text-muted-foreground')}
                    />
                    <span>{entry.result.answer}</span>
                  </p>
                  {entry.result.sources.length > 0 && (
                    <div className='flex flex-wrap items-center gap-1 border-t pt-1.5'>
                      <span className='text-[10px] uppercase tracking-wide text-muted-foreground'>Sources:</span>
                      {entry.result.sources.map((source) => (
                        <button
                          key={source.id}
                          type='button'
                          onClick={() => onOpenNote(source.id)}
                          className='rounded-full bg-background px-2 py-0.5 text-[10.5px] font-medium text-foreground shadow-sm hover:bg-accent'
                        >
                          {source.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
