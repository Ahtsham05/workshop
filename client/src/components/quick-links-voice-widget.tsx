import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { IconArrowRightDashed } from '@tabler/icons-react'
import { Mic, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { VoiceOrb } from '@/features/ai-assistant/components/voice-mode/voice-orb'
import { useLanguage } from '@/context/language-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { resolveQuickLinkIcon } from '@/lib/quick-link-icons'
import { QUICK_LINK_CATEGORY_GROUPS, getQuickLinkCategoryGroupId } from '@/lib/quick-link-category-groups'
import { useQuickLinkVoiceCommand } from '@/hooks/use-quick-link-voice-command'
import { useGetMyQuickLinksQuery, useGetQuickLinkActionsQuery, type QuickLinkAction } from '@/stores/quickLinks.api'

const PILL_BASE =
  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap'
const PILL_ACTIVE = 'border-primary bg-primary text-primary-foreground shadow-sm'
const PILL_INACTIVE = 'border-border/80 bg-background text-foreground hover:bg-muted/80'

/**
 * Global floating "chat bubble"-style launcher — a fixed bottom-right button that
 * opens a Popover with a voice command orb plus a searchable/filterable catalog of
 * every Quick Link action, from any page. This is additive: the dashboard's own
 * Quick Links card (features/dashboard/components/quick-links-panel.tsx) is
 * unchanged and keeps its own mic button for pinned shortcuts specifically — this
 * widget is the app-wide, always-available counterpart covering the full registry.
 *
 * The list is built on the same cmdk `Command` primitive as the app's existing ⌘K
 * search (components/command-menu.tsx) rather than a hand-rolled input+button grid —
 * that gets auto-focus, arrow-key highlight navigation, Enter-to-select, and
 * type-to-filter for free, matching the exact keyboard UX already established there
 * instead of reinventing a second, subtly-different version of it.
 */
export function QuickLinksVoiceWidget() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('all')

  // Deliberately NOT skip-gated on `open` — this widget is mounted app-wide for the
  // whole authenticated session, so keeping the data warm in the background means
  // voice commands work correctly the instant the popover opens (auto-start below)
  // instead of racing an empty action list on the very first speech result.
  const { data: allActions = [] } = useGetQuickLinkActionsQuery()
  const { data: myLinks = [] } = useGetMyQuickLinksQuery()

  const voice = useQuickLinkVoiceCommand(allActions, { onNavigate: () => closeWidget() })

  // Opening starts listening immediately ("click to open, speak right away") and
  // closing stops it plus resets the filters — one shared pair used by the trigger
  // click, item selection, the global keyboard shortcut below, and Radix's own close
  // triggers (Escape, outside click), so all of them stay in sync instead of drifting.
  const openWidget = () => {
    setOpen(true)
    if (voice.isSupported) voice.startListening()
  }
  const closeWidget = () => {
    setOpen(false)
    voice.stopListening()
    setSearch('')
    setActiveGroup('all')
  }

  const handleSelect = (action: QuickLinkAction) => {
    navigate({ to: action.route, search: action.routeSearch })
    closeWidget()
  }

  // Refs holding the latest open/close functions and open state — the keydown
  // listener below is registered once (empty deps) and must never close over a
  // stale `open`/`voice`, the exact bug just fixed in use-voice-input.ts.
  const openRef = useRef(open)
  openRef.current = open
  const openWidgetRef = useRef(openWidget)
  openWidgetRef.current = openWidget
  const closeWidgetRef = useRef(closeWidget)
  closeWidgetRef.current = closeWidget

  // Global shortcut: Cmd/Ctrl+. — the same binding Intercom/Drift-style chat
  // launchers use, so it reads as a familiar convention rather than an arbitrary
  // key choice, and doesn't collide with the app's existing Cmd/Ctrl+K search.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (openRef.current) closeWidgetRef.current()
        else openWidgetRef.current()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const groupedByGroupId = useMemo(() => {
    const map = new Map<string, QuickLinkAction[]>()
    allActions.forEach((action) => {
      const groupId = getQuickLinkCategoryGroupId(action.category)
      const list = map.get(groupId) || []
      list.push(action)
      map.set(groupId, list)
    })
    return map
  }, [allActions])

  const availableGroups = useMemo(
    () => QUICK_LINK_CATEGORY_GROUPS.filter((group) => (groupedByGroupId.get(group.id)?.length ?? 0) > 0),
    [groupedByGroupId],
  )

  // Category pills narrow which actions are even in the list; cmdk's own built-in
  // fuzzy filtering (on each CommandItem's `value`) then handles the typed search on
  // top of that — no hand-rolled `.includes()` filtering needed.
  const visibleActions = useMemo(
    () =>
      activeGroup === 'all' ? allActions : allActions.filter((a) => getQuickLinkCategoryGroupId(a.category) === activeGroup),
    [allActions, activeGroup],
  )

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, QuickLinkAction[]>()
    visibleActions.forEach((action) => {
      const list = map.get(action.category) || []
      list.push(action)
      map.set(action.category, list)
    })
    return map
  }, [visibleActions])

  const suggestions = myLinks.slice(0, 3)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Radix calls this synchronously from within the actual trigger click (or
        // Escape/outside-click to close), so starting recognition here still runs
        // inside that original user gesture — same requirement the browser has for
        // microphone access on a plain click.
        if (next) openWidget()
        else closeWidget()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type='button'
          title={`${t('Quick links & voice assistant')} (⌘.)`}
          className='fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95'
          aria-label={t('Quick links & voice assistant')}
        >
          <Sparkles className='h-6 w-6' />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align='end'
        side='top'
        sideOffset={12}
        className='w-[380px] max-w-[calc(100vw-2.5rem)] p-0 sm:w-[400px]'
        onOpenAutoFocus={(e) => {
          // Radix's default here would focus the first tabbable inside. On a laptop we want
          // the search input focused instead, so typing to filter works the instant the
          // popover opens — same as clicking would, minus the extra click.
          // PopoverContent isn't ref-forwarding, but Radix dispatches this event ON
          // the content element itself, so currentTarget reaches it without one.
          e.preventDefault()
          const content = e.currentTarget as HTMLElement

          // On phones/tablets, focusing a text input pops the on-screen keyboard over
          // roughly half the panel the moment it opens — hiding the voice orb and the
          // list people opened it to see, and shoving the page around. So touch-first
          // devices get NO input focus (the panel wrapper takes it, which keeps screen
          // readers oriented without raising a keyboard) and tap the field when they
          // actually want to type. "Touch-first" = the app's own phone+tablet cutoff
          // (useIsMobile, < 1024px) OR a coarse primary pointer, which also catches
          // tablets >= 1024px wide (iPad landscape / Pro) that width alone would miss.
          const touchFirst = isMobile || window.matchMedia('(pointer: coarse)').matches
          if (touchFirst) {
            content.focus({ preventScroll: true })
            return
          }
          content.querySelector<HTMLInputElement>('[cmdk-input]')?.focus()
        }}
      >
        <div className='flex max-h-[75vh] flex-col'>
          <div className='flex items-start justify-between gap-2 border-b p-3.5'>
            <div className='min-w-0'>
              <p className='text-sm font-semibold'>{t('Voice Assistant')}</p>
              <p className='text-xs text-muted-foreground'>{t("Say what you need, I'll take you there.")}</p>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-7 w-7 shrink-0'
              onClick={closeWidget}
              aria-label={t('Close')}
            >
              <X className='h-4 w-4' />
            </Button>
          </div>

          <div className='flex flex-col items-center gap-2 border-b p-3'>
            {voice.isSupported ? (
              voice.isListening ? (
                <>
                  <VoiceOrb state='listening' onClick={voice.stopListening} />
                  <p className='text-xs font-medium text-primary'>{t('Listening…')}</p>
                </>
              ) : (
                <button
                  type='button'
                  onClick={voice.startListening}
                  title={t('Start voice command')}
                  aria-label={t('Start voice command')}
                  className='flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95'
                >
                  <Mic className='h-8 w-8' />
                </button>
              )
            ) : (
              <p className='text-xs text-muted-foreground'>{t('Voice commands are not supported in this browser')}</p>
            )}

            {suggestions.length > 0 && (
              <div className='flex flex-wrap justify-center gap-1.5'>
                <span className='text-[11px] text-muted-foreground'>{t('Try saying')}:</span>
                {suggestions.map((action) => (
                  <button
                    key={action.actionKey}
                    type='button'
                    onClick={() => handleSelect(action)}
                    className='rounded-full border border-border/80 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted'
                  >
                    "{t('Open')} {action.label}"
                  </button>
                ))}
              </div>
            )}
          </div>

          <Command className='min-h-0 flex-1 rounded-none bg-transparent' shouldFilter>
            <div className='p-3 pb-2'>
              <p className='mb-2 text-xs font-medium text-muted-foreground'>{t('Quick Links')}</p>
              <CommandInput placeholder={t('Search quick links…')} value={search} onValueChange={setSearch} />
            </div>

            {availableGroups.length > 1 && (
              <div className='relative'>
                <div className='flex gap-1.5 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
                  <button
                    type='button'
                    onClick={() => setActiveGroup('all')}
                    className={cn(PILL_BASE, activeGroup === 'all' ? PILL_ACTIVE : PILL_INACTIVE)}
                  >
                    {t('All')}
                  </button>
                  {availableGroups.map((group) => (
                    <button
                      key={group.id}
                      type='button'
                      onClick={() => setActiveGroup(group.id)}
                      className={cn(PILL_BASE, activeGroup === group.id ? PILL_ACTIVE : PILL_INACTIVE)}
                    >
                      {t(group.label)}
                    </button>
                  ))}
                </div>
                {/* Hints that the pill row scrolls further right, instead of it looking
                    like the list is simply cut off at the panel edge. */}
                <div className='pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-popover to-transparent' />
              </div>
            )}

            <CommandList className='max-h-none flex-1 border-t px-1 py-1'>
              <CommandEmpty className='p-6 text-xs text-muted-foreground'>{t('No actions match your search')}</CommandEmpty>
              {Array.from(groupedByCategory.entries()).map(([category, actions]) => (
                <CommandGroup key={category} heading={category}>
                  {actions.map((action) => {
                    const Icon = resolveQuickLinkIcon(action.iconKey)
                    return (
                      <CommandItem
                        key={action.actionKey}
                        value={`${action.label} ${action.category}`}
                        onSelect={() => handleSelect(action)}
                        className='gap-2.5 py-2'
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white ${action.color}`}
                        >
                          {/* CommandItem's own base styling forces any descendant svg
                              lacking its own text-* class to text-muted-foreground —
                              putting text-white directly on the icon (not just its
                              parent span) is what makes it win over that default. */}
                          <Icon className='h-4 w-4 text-white' />
                        </span>
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate text-sm font-medium'>{action.label}</span>
                        </span>
                        <IconArrowRightDashed className='size-3 shrink-0 text-muted-foreground/80' />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>

          <div className='flex items-center justify-center gap-1.5 border-t p-2 text-center text-[10px] text-muted-foreground'>
            <span>
              {t('Voice powered by AI')} · {t('Fast. Smart. Productive.')}
            </span>
            <kbd className='pointer-events-none hidden shrink-0 items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[9px] font-medium sm:inline-flex'>
              <span>⌘</span>.
            </kbd>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
