import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircleQuestion, Search, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  useRunNoteAiActionMutation,
  type Note,
  type NoteAiAction,
  type NoteAiActionOptions,
  type NoteAiActionResult,
} from '@/stores/note.api'
import { POPOVER_LAYER } from '../../lib/layers'
import { hasCodeBlock } from '../../lib/note-code'
import {
  ACTION_META_BY_KEY,
  CODE_ACTIONS,
  COMMON_LANGUAGES,
  CORE_ACTIONS,
  MEETING_ACTIONS,
  REWRITE_STYLES,
  SUMMARY_LENGTHS,
  type AiActionMeta,
} from '../../lib/note-ai'
import { clearAiHistory, pushAiHistory, readAiHistory, type AiHistoryEntry } from '../../lib/note-ai-history'
import type { NotepadController } from '../../lib/use-notepad-notes'
import { AiActionCard } from './ai-action-card'
import { AiCtaCard } from './ai-cta-card'
import { AiResultView } from './ai-result-view'
import { AskYourNotes } from './ask-your-notes'
import { OrganizeWithAi } from './organize-with-ai'
import { RecentAiActions } from './recent-ai-actions'
import { RelatedNotes } from './related-notes'

interface AiPanelProps {
  note: Note | null
  controller: NotepadController
  onOpenNote: (id: string) => void
  onClose: () => void
  className?: string
  style?: React.CSSProperties
}

interface LastRun {
  meta: AiActionMeta | null
  action: NoteAiAction
  options?: NoteAiActionOptions
}

/**
 * The AI Assistant panel: "Ask Your Notes" pinned at the top (searches the whole
 * library, works with no note open), then everything for the currently open note
 * below it. No tabs — both are visible together, same as the reference design.
 * Never touches the note itself: every result sits in AiResultView until the user
 * picks Insert/Replace/Apply.
 */
export function AiPanel({ note, controller, onOpenNote, onClose, className, style: panelStyle }: AiPanelProps) {
  const [pendingMeta, setPendingMeta] = useState<AiActionMeta | null>(null)
  const [rewriteStyle, setRewriteStyle] = useState<NonNullable<NoteAiActionOptions['style']>>('professional')
  const [length, setLength] = useState<NonNullable<NoteAiActionOptions['length']>>('medium')
  const [targetLanguage, setTargetLanguage] = useState('English')
  const [lastRun, setLastRun] = useState<LastRun | null>(null)
  const [result, setResult] = useState<NoteAiActionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runAction, { isLoading }] = useRunNoteAiActionMutation()
  const [history, setHistory] = useState<AiHistoryEntry[]>(() => readAiHistory())
  const askInputRef = useRef<HTMLInputElement>(null)
  const organizeTriggerRef = useRef<(() => void) | null>(null)

  const readOnly = note ? controller.isReadOnly : true
  const showCode = Boolean(note && hasCodeBlock(note.content))
  const showMeeting = note?.noteType === 'meeting'

  // A different note might have a different code/meeting-action set available —
  // an in-flight result for the previous note shouldn't linger under the new one.
  useEffect(() => {
    setResult(null)
    setError(null)
    setPendingMeta(null)
    setLastRun(null)
  }, [note?.id])

  const logHistory = (entry: Omit<AiHistoryEntry, 'id' | 'at'>) => setHistory(pushAiHistory(entry))

  const buildOptions = (meta: AiActionMeta): NoteAiActionOptions | undefined => {
    if (meta.needsOption === 'style') return { style: rewriteStyle }
    if (meta.needsOption === 'length') return { length }
    if (meta.needsOption === 'targetLanguage') return { targetLanguage }
    return undefined
  }

  const execute = (action: NoteAiAction, options: NoteAiActionOptions | undefined, meta: AiActionMeta | null) => {
    if (!note) return
    setPendingMeta(null)
    setLastRun({ meta, action, options })
    setResult(null)
    setError(null)
    void runAction({ id: note.id, action, options })
      .unwrap()
      .then((response) => {
        setResult(response)
        logHistory({ action, label: meta?.label ?? 'Ask about this note', noteId: note.id, noteTitle: note.title })
      })
      .catch((err: { data?: { message?: string }; status?: number }) => {
        if (err?.status === 429) {
          setError('AI is busy right now — please try again in a little while.')
        } else {
          setError(err?.data?.message || "AI couldn't process this request. Please try again.")
        }
      })
  }

  const handleCardClick = (meta: AiActionMeta) => {
    if (meta.needsOption) {
      setPendingMeta(meta)
      setResult(null)
      setError(null)
      return
    }
    execute(meta.action, undefined, meta)
  }

  const runPending = () => {
    if (!pendingMeta) return
    execute(pendingMeta.action, buildOptions(pendingMeta), pendingMeta)
  }

  const handleRegenerate = () => {
    if (!lastRun) return
    execute(lastRun.action, lastRun.options, lastRun.meta)
  }

  const handleInsert = (html: string) => {
    if (!html) return
    controller.applyContent(`${controller.content}${html}`)
  }

  const handleReplace = (html: string) => {
    if (!html) return
    controller.applyContent(html)
  }

  const focusAskInput = () => {
    askInputRef.current?.focus()
    askInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleHistorySelect = (entry: AiHistoryEntry) => {
    if (!note) return
    if (entry.action === 'organize') {
      organizeTriggerRef.current?.()
      return
    }
    const meta = ACTION_META_BY_KEY[entry.action] ?? null
    execute(entry.action as NoteAiAction, undefined, meta)
  }

  const actionGroups = useMemo(() => {
    const groups: { label: string; actions: AiActionMeta[] }[] = [{ label: 'Write', actions: CORE_ACTIONS }]
    if (showCode) groups.push({ label: 'Code', actions: CODE_ACTIONS })
    if (showMeeting) groups.push({ label: 'Meeting', actions: MEETING_ACTIONS })
    return groups
  }, [showCode, showMeeting])

  // No flex-1/flex-shrink baked in here — the caller's className controls sizing: full-width
  // and growing in the single-pane phone/narrow layout, a fixed/resizable width (via
  // `style`) that must NOT also grow in the multi-pane layout.
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col bg-muted/10', className)} style={panelStyle}>
      <div className='flex items-start gap-2 border-b px-3 py-2.5'>
        <span className='mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary'>
          <Sparkles className='size-4' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-semibold leading-tight'>AI Assistant</p>
          <p className='truncate text-[11px] text-muted-foreground'>Ask anything about your notes</p>
        </div>
        <Button size='icon' variant='ghost' className='size-7 shrink-0' onClick={onClose} aria-label='Close AI panel'>
          <X className='size-4' />
        </Button>
      </div>

      <div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-3'>
        <AskYourNotes ref={askInputRef} onOpenNote={onOpenNote} />

        {!note ? (
          <p className='py-6 text-center text-xs text-muted-foreground'>
            Open a note to summarize, rewrite, or organize it with AI.
          </p>
        ) : (
          <>
            {readOnly && (
              <p className='rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400'>
                Shared note — AI can summarize or explain it, but Insert/Replace/Organize are off since you can't edit it.
              </p>
            )}

            {actionGroups.map((group) => (
              <div key={group.label} className='space-y-1.5'>
                <p className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'>{group.label}</p>
                <div className='grid grid-cols-2 gap-1.5'>
                  {group.actions.map((meta) => (
                    <AiActionCard
                      key={meta.action}
                      icon={meta.icon}
                      label={meta.label}
                      color={meta.color}
                      disabled={isLoading}
                      active={pendingMeta?.action === meta.action || lastRun?.action === meta.action}
                      onClick={() => handleCardClick(meta)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {pendingMeta && (
              <div className='flex items-center gap-1.5 rounded-md border bg-background p-2'>
                {pendingMeta.needsOption === 'style' && (
                  <Select
                    value={rewriteStyle}
                    onValueChange={(value) => setRewriteStyle(value as NonNullable<NoteAiActionOptions['style']>)}
                  >
                    <SelectTrigger size='sm' className='h-7 flex-1 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={POPOVER_LAYER}>
                      {REWRITE_STYLES.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {pendingMeta.needsOption === 'length' && (
                  <Select
                    value={length}
                    onValueChange={(value) => setLength(value as NonNullable<NoteAiActionOptions['length']>)}
                  >
                    <SelectTrigger size='sm' className='h-7 flex-1 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={POPOVER_LAYER}>
                      {SUMMARY_LENGTHS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {pendingMeta.needsOption === 'targetLanguage' && (
                  <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                    <SelectTrigger size='sm' className='h-7 flex-1 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={POPOVER_LAYER}>
                      {COMMON_LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>
                          {lang}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size='sm' className='h-7 px-2 text-xs' onClick={runPending}>
                  Generate
                </Button>
              </div>
            )}

            <AiResultView
              result={result}
              isLoading={isLoading}
              error={error}
              readOnly={readOnly}
              onInsert={handleInsert}
              onReplace={handleReplace}
              onRegenerate={handleRegenerate}
              onApplyTitle={controller.changeTitle}
            />

            <OrganizeWithAi
              note={note}
              controller={controller}
              readOnly={readOnly}
              onOrganized={() => logHistory({ action: 'organize', label: 'Organize with AI', noteId: note.id, noteTitle: note.title })}
              registerTrigger={(run) => {
                organizeTriggerRef.current = run
              }}
            />

            <AiCtaCard
              icon={MessageCircleQuestion}
              tone='highlight'
              title='Ask Your Notes'
              description='Search across all your notes and get answers from your knowledge base'
              onClick={focusAskInput}
            />

            {history.length > 0 && (
              <div className='border-t pt-3'>
                <RecentAiActions entries={history} onSelect={handleHistorySelect} onClear={() => setHistory(clearAiHistory())} />
              </div>
            )}

            <div className='border-t pt-3'>
              <RelatedNotes noteId={note.id} onOpenNote={onOpenNote} />
            </div>
          </>
        )}

        <AiCtaCard
          icon={Search}
          tone='highlight'
          title='AI works with your entire note library'
          description='Ask questions, find information, and get answers from all your notes.'
          onClick={focusAskInput}
        />
      </div>
    </div>
  )
}
