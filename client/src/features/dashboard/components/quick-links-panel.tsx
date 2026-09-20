import { useMemo, useState } from 'react'
import { isPast, isToday } from 'date-fns'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Plus, X, RotateCcw, Check, Search, Zap } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLanguage } from '@/context/language-context'
import { useRemindersFeed } from '@/hooks/use-reminders-feed'
import { resolveQuickLinkIcon } from '@/lib/quick-link-icons'
import {
  useGetMyQuickLinksQuery,
  useGetQuickLinkActionsQuery,
  useUpdateQuickLinksMutation,
  useResetQuickLinksMutation,
  type QuickLinkAction,
} from '@/stores/quickLinks.api'

/** Dynamic per-action badge counts that can't live in the static server registry (e.g.
 *  "due today" count) — keyed by actionKey, resolved locally at render time. Reuses the
 *  one shared reminders poll (see reminders-nav-badge.tsx) — never call
 *  useGetRemindersQuery directly here, or this becomes a second independent poll timer. */
function useActionBadges(): Record<string, number | undefined> {
  const { active: activeReminders } = useRemindersFeed()
  const dueTodayCount = activeReminders.filter((r) => {
    const due = new Date(r.dueAt)
    return isToday(due) || isPast(due)
  }).length
  return { tasks_reminders: dueTodayCount > 0 ? dueTodayCount : undefined }
}

function SortableLinkRow({ action, onRemove }: { action: QuickLinkAction; onRemove: () => void }) {
  const { attributes, listeners, isDragging, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
    id: action.actionKey,
  })
  const Icon = resolveQuickLinkIcon(action.iconKey)
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className='flex items-center gap-2 rounded-lg border bg-card p-2 pr-3'>
      <button
        type='button'
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className='cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing'
        aria-label='Drag to reorder'
      >
        <GripVertical className='h-4 w-4' />
      </button>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white ${action.color}`}>
        <Icon className='h-4 w-4' />
      </span>
      <span className='min-w-0 flex-1 truncate text-sm font-medium'>{action.label}</span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-6 w-6 shrink-0'
        onClick={onRemove}
        aria-label={`Remove ${action.label}`}
      >
        <X className='h-3.5 w-3.5' />
      </Button>
    </div>
  )
}

export function QuickLinksPanel() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { data: myLinks = [], isLoading } = useGetMyQuickLinksQuery()
  const { data: allActions = [] } = useGetQuickLinkActionsQuery()
  const [updateQuickLinks] = useUpdateQuickLinksMutation()
  const [resetQuickLinks] = useResetQuickLinksMutation()
  const badges = useActionBadges()

  const [isEditing, setIsEditing] = useState(false)
  const [draftLinks, setDraftLinks] = useState<QuickLinkAction[]>([])
  const [actionSearch, setActionSearch] = useState('')

  const availableToAdd = useMemo(() => {
    const query = actionSearch.trim().toLowerCase()
    return allActions.filter((a) => {
      if (draftLinks.some((d) => d.actionKey === a.actionKey)) return false
      if (!query) return true
      return a.label.toLowerCase().includes(query) || a.category.toLowerCase().includes(query)
    })
  }, [allActions, draftLinks, actionSearch])
  const groupedAvailable = useMemo(() => {
    const groups = new Map<string, QuickLinkAction[]>()
    availableToAdd.forEach((action) => {
      const list = groups.get(action.category) || []
      list.push(action)
      groups.set(action.category, list)
    })
    return groups
  }, [availableToAdd])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const openEditor = () => {
    setDraftLinks(myLinks)
    setActionSearch('')
    setIsEditing(true)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraftLinks((prev) => {
      const oldIndex = prev.findIndex((l) => l.actionKey === active.id)
      const newIndex = prev.findIndex((l) => l.actionKey === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleSave = async () => {
    await updateQuickLinks({
      links: draftLinks.map((l) => ({ actionKey: l.actionKey })),
      optimistic: draftLinks,
    })
    setIsEditing(false)
  }

  const handleReset = async () => {
    const result = await resetQuickLinks().unwrap()
    setDraftLinks(result)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <Skeleton className='h-9 w-9 shrink-0 rounded-lg' />
              <div className='flex flex-col gap-1.5'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-3 w-48' />
              </div>
            </div>
            <Skeleton className='h-8 w-24 shrink-0 rounded-md' />
          </div>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8'>
            {Array.from({ length: 16 }).map((_, i) => (
              <Skeleton key={i} className='min-h-24 w-full rounded-md' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-sm'>
                <Zap className='h-4 w-4' />
              </span>
              <div>
                <h2 className='text-sm font-semibold leading-tight'>{t('Quick Links')}</h2>
                <p className='text-xs text-muted-foreground'>{t('One-tap shortcuts to your most-used actions')}</p>
              </div>
            </div>
            <Button type='button' variant='outline' size='sm' onClick={openEditor} className='shrink-0 gap-1.5'>
              <Pencil className='h-3.5 w-3.5' />
              {t('Customize')}
            </Button>
          </div>

          {myLinks.length === 0 ? (
            <p className='py-4 text-center text-sm text-muted-foreground'>
              {t('No quick links pinned yet.')}{' '}
              <button type='button' onClick={openEditor} className='underline underline-offset-2'>
                {t('Add some')}
              </button>
            </p>
          ) : (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8'>
              {myLinks.map((action) => {
                const Icon = resolveQuickLinkIcon(action.iconKey)
                const badge = badges[action.actionKey]
                return (
                  <Button
                    key={action.actionKey}
                    onClick={() => navigate({ to: action.route, search: action.routeSearch })}
                    className={`h-auto min-h-24 w-full flex-col gap-2 py-3 text-white ${action.color}`}
                    variant='default'
                  >
                    <Icon className='h-5 w-5' />
                    <span className='flex items-center justify-center gap-1.5 text-wrap text-center text-sm font-medium'>
                      {action.label}
                      {!!badge && (
                        <Badge className='rounded-full border border-white/40 bg-red-500 px-1.5 py-0 text-[10px] font-semibold text-white hover:bg-red-500'>
                          {badge > 99 ? '99+' : badge}
                        </Badge>
                      )}
                    </span>
                  </Button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className='flex max-h-[85vh] max-w-2xl flex-col sm:max-w-3xl'>
          <DialogHeader className='shrink-0'>
            <DialogTitle>{t('Customize Quick Links')}</DialogTitle>
          </DialogHeader>

          <div className='grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2'>
            <div className='flex min-h-0 flex-col gap-2'>
              <p className='text-xs font-medium text-muted-foreground'>
                {t('Pinned')} ({draftLinks.length})
              </p>
              <ScrollArea className='min-h-0 flex-1 rounded-md border p-2'>
                {draftLinks.length === 0 ? (
                  <p className='p-4 text-center text-sm text-muted-foreground'>
                    {t('Nothing pinned — add some from the right')}
                  </p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={draftLinks.map((l) => l.actionKey)} strategy={verticalListSortingStrategy}>
                      <div className='flex flex-col gap-2'>
                        {draftLinks.map((action) => (
                          <SortableLinkRow
                            key={action.actionKey}
                            action={action}
                            onRemove={() => setDraftLinks((prev) => prev.filter((l) => l.actionKey !== action.actionKey))}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </ScrollArea>
            </div>

            <div className='flex min-h-0 flex-col gap-2'>
              <p className='text-xs font-medium text-muted-foreground'>{t('Available actions')}</p>
              <div className='relative shrink-0'>
                <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
                <Input
                  value={actionSearch}
                  onChange={(e) => setActionSearch(e.target.value)}
                  placeholder={t('Search actions…')}
                  className='h-8 pl-8 text-sm'
                />
              </div>
              <ScrollArea className='min-h-0 flex-1 rounded-md border p-2'>
                <div className='flex flex-col gap-3'>
                  {Array.from(groupedAvailable.entries()).map(([category, actions]) => (
                    <div key={category}>
                      <p className='mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                        {category}
                      </p>
                      <div className='flex flex-col gap-1'>
                        {actions.map((action) => {
                          const Icon = resolveQuickLinkIcon(action.iconKey)
                          return (
                            <button
                              key={action.actionKey}
                              type='button'
                              onClick={() => setDraftLinks((prev) => [...prev, action])}
                              className='flex items-center gap-2 rounded-md border border-transparent p-2 text-left text-sm hover:border-border hover:bg-muted'
                            >
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${action.color}`}>
                                <Icon className='h-3.5 w-3.5' />
                              </span>
                              <span className='min-w-0 flex-1 truncate'>{action.label}</span>
                              <Plus className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {groupedAvailable.size === 0 && (
                    <p className='p-4 text-center text-sm text-muted-foreground'>
                      {actionSearch.trim() ? t('No actions match your search') : t('Everything available is already pinned')}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className='shrink-0 sm:justify-between'>
            <Button type='button' variant='ghost' size='sm' onClick={handleReset} className='gap-1.5'>
              <RotateCcw className='h-3.5 w-3.5' />
              {t('Reset to defaults')}
            </Button>
            <div className='flex gap-2'>
              <Button type='button' variant='outline' onClick={() => setIsEditing(false)}>
                {t('Cancel')}
              </Button>
              <Button type='button' onClick={handleSave} className='gap-1.5'>
                <Check className='h-3.5 w-3.5' />
                {t('Save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
