import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Ban,
  Check,
  ChevronDown,
  CornerDownRight,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { usePermissions } from '@/context/permission-context'
import { ARRANGE_AUTOSCROLL, useArrangeSensors } from '@/features/dashboard/lib/arrange'
import { useManufacturingAccess } from '@/hooks/use-manufacturing-access'
import { useWarehouseSettings } from '@/hooks/use-warehouse-settings'
import { BUSINESS_TYPE_OPTIONS, normalizeBusinessType } from '@/lib/business-types'
import { groupKey, pageKey, sectionKey } from '@/lib/menu-layout'
import { cn } from '@/lib/utils'
import { useGetMyOrganizationQuery, useUpdateMenuVisibilityMutation } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import ContentSection from '../components/content-section'
import {
  type Draft,
  type Entry,
  type Group,
  type PageInfo,
  type PageState,
  LOCKED_URLS,
  buildTree,
  containerOf,
  initialDraft,
  movePage,
  serialize,
} from './menu-tree'

// Drag ids: groups 'grp:<id>', sub-menus 'sec:<id>', pages 'pg:<url>'; drop areas 'c:<container>'.
const GRP = 'grp:'
const SEC = 'sec:'
const PG = 'pg:'
const CONT = 'c:'

/** Pages: the innermost thing under the pointer (a page row, else the deepest list). */
const collision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const only = (...prefixes: string[]) =>
    args.droppableContainers.filter((c) => prefixes.some((p) => String(c.id).startsWith(p)))
  if (activeId.startsWith(GRP)) return closestCenter({ ...args, droppableContainers: only(GRP) })
  if (activeId.startsWith(SEC)) return closestCenter({ ...args, droppableContainers: only(SEC) })
  const hits = pointerWithin({ ...args, droppableContainers: only(PG, SEC, CONT) })
  const page = hits.find((h) => String(h.id).startsWith(PG))
  if (page) return [page]
  const section = hits.find((h) => String(h.id).startsWith(`${CONT}s:`))
  if (section) return [section]
  const other = hits.find((h) => String(h.id).startsWith(SEC) || String(h.id).startsWith(CONT))
  if (other) return [other]
  return closestCenter({ ...args, droppableContainers: only(PG, CONT) })
}

/**
 * Settings → Menu & Pages: the whole sidebar for this business, editable — rename any
 * group, sub-menu or page, drag to reorder (and drag pages into / out of sub-menus), and
 * give each page one of three states: shown, hidden in the menu (still opens from links,
 * search and Quick Links) or off (gone everywhere, link blocked). Saved for the whole
 * organization (Organization.menuVisibility + menuLayout).
 */
export default function MenuVisibilitySettings() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org, isLoading } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const [saveMenu, { isLoading: isSaving }] = useUpdateMenuVisibilityMutation()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission('manageBusinessProfile')
  const { available: manufacturingOn } = useManufacturingAccess()
  const { enabled: warehousesOn } = useWarehouseSettings()
  const sensors = useArrangeSensors()

  const businessType = normalizeBusinessType(org?.businessType || user?.businessType)
  const typeLabel = BUSINESS_TYPE_OPTIONS.find((o) => o.value === businessType)?.label ?? businessType
  const savedVisibility = useMemo(() => org?.menuVisibility ?? {}, [org?.menuVisibility])
  const savedLayout = useMemo(() => org?.menuLayout ?? null, [org?.menuLayout])
  const ctx = useMemo(
    () => ({ businessType, email: user?.email, manufacturingOn, warehousesOn }),
    [businessType, user?.email, manufacturingOn, warehousesOn],
  )

  const defaults = useMemo(() => buildTree(ctx, null), [ctx])
  const saved = useMemo(() => buildTree(ctx, savedLayout), [ctx, savedLayout])
  const pages = defaults.pages
  const pageUrls = useMemo(() => [...pages.keys()], [pages])

  const savedDraft = useMemo(
    () => initialDraft(saved.groups, pageUrls, businessType, savedVisibility, savedLayout),
    [saved.groups, pageUrls, businessType, savedVisibility, savedLayout],
  )
  const defaultDraft = useMemo(
    () => initialDraft(defaults.groups, pageUrls, businessType, {}, null),
    [defaults.groups, pageUrls, businessType],
  )

  const [draft, setDraft] = useState<Draft>(savedDraft)
  useEffect(() => setDraft(savedDraft), [savedDraft])
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)

  const savedPayload = { visibility: savedVisibility, layout: savedLayout }
  const toPayload = (d: Draft) => serialize(d, defaults.groups, pageUrls, businessType, savedPayload)
  const dirty = JSON.stringify(toPayload(draft)) !== JSON.stringify(toPayload(savedDraft))
  const atDefaults = JSON.stringify(toPayload(draft)) === JSON.stringify(toPayload(defaultDraft))

  const stateOf = (url: string): PageState => draft.states[url] ?? 'shown'
  const onCount = pageUrls.filter((u) => stateOf(u) !== 'off').length
  const hiddenCount = pageUrls.filter((u) => stateOf(u) === 'menuHidden').length

  const labelOf = (key: string, fallback: string) => draft.labels[key]?.trim() || fallback
  const setLabel = (key: string, original: string, value: string) =>
    setDraft((d) => {
      const labels = { ...d.labels }
      const v = value.trim()
      if (!v || v === original) delete labels[key]
      else labels[key] = v
      return { ...d, labels }
    })
  const setStates = (urls: string[], state: PageState) =>
    setDraft((d) => {
      const states = { ...d.states }
      urls.forEach((url) => {
        if (state === 'off' && LOCKED_URLS.has(url)) return
        states[url] = state
      })
      return { ...d, states }
    })
  /** Group / sub-menu switch: on brings switched-off pages back (hidden-in-menu ones stay so). */
  const setOn = (urls: string[], on: boolean) =>
    setDraft((d) => {
      const states = { ...d.states }
      urls.forEach((url) => {
        if (on && states[url] === 'off') states[url] = 'shown'
        if (!on && !LOCKED_URLS.has(url)) states[url] = 'off'
      })
      return { ...d, states }
    })
  const setGroups = (fn: (groups: Group[]) => Group[]) => setDraft((d) => ({ ...d, groups: fn(d.groups) }))

  // ── Drag and drop ────────────────────────────────────────────────────────────
  const listOf = (groups: Group[], container: string): string[] => {
    for (const g of groups) {
      if (container === groupKey(g.id)) return g.entries.map((e) => (e.kind === 'page' ? PG + e.url : SEC + e.id))
      for (const e of g.entries) if (e.kind === 'section' && container === sectionKey(e.id)) return e.pages.map((u) => PG + u)
    }
    return []
  }
  const locate = (groups: Group[], id: string): { container: string; index: number } | null => {
    if (id.startsWith(CONT)) {
      const container = id.slice(CONT.length)
      return { container, index: listOf(groups, container).length }
    }
    if (id.startsWith(PG)) {
      const container = containerOf(groups, id.slice(PG.length))
      return container ? { container, index: listOf(groups, container).indexOf(id) } : null
    }
    if (id.startsWith(SEC)) {
      const group = groups.find((g) => g.entries.some((e) => e.kind === 'section' && e.id === id.slice(SEC.length)))
      if (!group) return null
      const container = groupKey(group.id)
      return { container, index: listOf(groups, container).indexOf(id) }
    }
    return null
  }

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const id = String(active.id)
    if (!over || !id.startsWith(PG)) return
    setGroups((groups) => {
      const from = locate(groups, id)
      const to = locate(groups, String(over.id))
      if (!from || !to || from.container === to.container) return groups
      return movePage(groups, id.slice(PG.length), to.container, to.index)
    })
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return
    const a = String(active.id)
    const o = String(over.id)
    if (a === o) return
    if (a.startsWith(GRP)) {
      setGroups((groups) => {
        const from = groups.findIndex((g) => GRP + g.id === a)
        const to = groups.findIndex((g) => GRP + g.id === o)
        return from < 0 || to < 0 ? groups : arrayMove(groups, from, to)
      })
      return
    }
    setGroups((groups) => {
      const from = locate(groups, a)
      const to = locate(groups, o)
      if (!from || !to || from.container !== to.container || from.index === to.index || to.index < 0) return groups
      return groups.map((g) => {
        if (from.container === groupKey(g.id)) return { ...g, entries: arrayMove(g.entries, from.index, to.index) }
        return {
          ...g,
          entries: g.entries.map((e) =>
            e.kind === 'section' && from.container === sectionKey(e.id) ? { ...e, pages: arrayMove(e.pages, from.index, to.index) } : e,
          ),
        }
      })
    })
  }

  /** "Move to…" targets: every group's top level and every sub-menu. */
  const targets = draft.groups.flatMap((g) => [
    { key: groupKey(g.id), label: labelOf(groupKey(g.id), g.title), sub: false },
    ...g.entries
      .filter((e): e is Extract<Entry, { kind: 'section' }> => e.kind === 'section')
      .map((e) => ({ key: sectionKey(e.id), label: labelOf(sectionKey(e.id), e.title), sub: true })),
  ])

  const save = async () => {
    if (!org?.id) return
    try {
      await saveMenu({ orgId: org.id, ...toPayload(draft) }).unwrap()
      toast.success('Menu saved — everyone in your organization now sees it')
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Could not save the menu')
    }
  }

  // ── Search: a filtered, non-draggable view ───────────────────────────────────
  const query = search.trim().toLowerCase()
  const matches = (text: string) => text.toLowerCase().includes(query)
  const pageMatches = (url: string) => {
    const p = pages.get(url)
    return !!p && (matches(p.title) || matches(labelOf(pageKey(url), p.title)))
  }

  if (isLoading) {
    return (
      <ContentSection title='Menu & Pages' desc='Arrange and name your sidebar, and choose which pages your organization uses.'>
        <div className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
          <Loader2 className='size-4 animate-spin' /> Loading menu…
        </div>
      </ContentSection>
    )
  }

  const rowProps = {
    pages,
    canEdit,
    dragDisabled: !canEdit || !!query,
    typeLabel,
    defaultStates: defaultDraft.states,
    stateOf,
    setStates,
    labelOf,
    setLabel,
    targets,
    containerOfPage: (url: string) => containerOf(draft.groups, url),
    moveTo: (url: string, container: string) => setGroups((groups) => movePage(groups, url, container)),
  }

  const activeLabel = (() => {
    if (!activeId) return null
    if (activeId.startsWith(GRP)) {
      const g = draft.groups.find((x) => GRP + x.id === activeId)
      return g ? labelOf(groupKey(g.id), g.title) : null
    }
    if (activeId.startsWith(SEC)) {
      for (const g of draft.groups)
        for (const e of g.entries) if (e.kind === 'section' && SEC + e.id === activeId) return labelOf(sectionKey(e.id), e.title)
      return null
    }
    const p = pages.get(activeId.slice(PG.length))
    return p ? labelOf(pageKey(p.url), p.title) : null
  })()

  return (
    <ContentSection
      title='Menu & Pages'
      desc='Rename, reorder and organize your sidebar, and choose which pages your organization uses. Changes apply to everyone in your organization. No data is ever deleted.'
    >
      {/* contain: inline-size — long one-line page names (truncated with …) must not
          widen the settings column on phones; the list takes the width it is given. */}
      <div className='space-y-4 [contain:inline-size]'>
        {/* Toolbar — stays on top while the list scrolls */}
        <div className='sticky top-0 z-10 -mx-1.5 space-y-2 border-b bg-background px-1.5 pb-3 pt-1'>
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search pages…'
              className='pl-8 pr-8'
              aria-label='Search pages'
            />
            {search && (
              <button
                type='button'
                onClick={() => setSearch('')}
                className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                aria-label='Clear search'
              >
                <X className='size-4' />
              </button>
            )}
          </div>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-xs text-muted-foreground'>
              <span className='font-medium text-foreground tabular-nums'>{onCount}</span> of {pageUrls.length} pages on
              {hiddenCount > 0 && <> · {hiddenCount} hidden in menu</>}
              {dirty && <span className='ml-1.5 text-amber-600 dark:text-amber-400'>· unsaved changes</span>}
            </p>
            {canEdit ? (
              <div className='flex flex-wrap items-center gap-1.5'>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={atDefaults || isSaving}
                  onClick={() => setDraft(defaultDraft)}
                  title={`Back to the standard menu for ${typeLabel} — names, order and pages`}
                >
                  <RotateCcw className='mr-1 size-3.5' /> Defaults
                </Button>
                {dirty && (
                  <Button variant='outline' size='sm' disabled={isSaving} onClick={() => setDraft(savedDraft)}>
                    Discard
                  </Button>
                )}
                <Button size='sm' disabled={!dirty || isSaving} onClick={save}>
                  {isSaving && <Loader2 className='mr-1 size-3.5 animate-spin' />}
                  Save changes
                </Button>
              </div>
            ) : (
              <Badge variant='outline' className='gap-1 font-normal'>
                <Lock className='size-3' /> Only an admin can change this
              </Badge>
            )}
          </div>
          {canEdit && !query && (
            <p className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground'>
              <span className='inline-flex items-center gap-1'><GripVertical className='size-3' /> drag to reorder or move into / out of a sub-menu</span>
              <span className='inline-flex items-center gap-1'><Eye className='size-3' /> shown</span>
              <span className='inline-flex items-center gap-1'><EyeOff className='size-3' /> hidden in menu, still opens</span>
              <span className='inline-flex items-center gap-1'><Ban className='size-3' /> off</span>
            </p>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          autoScroll={ARRANGE_AUTOSCROLL}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={draft.groups.map((g) => GRP + g.id)} strategy={verticalListSortingStrategy}>
            {draft.groups.map((group) => {
              const urls = group.entries.flatMap((e) => (e.kind === 'page' ? [e.url] : e.pages))
              const visibleEntries = query
                ? group.entries
                    .map((e) =>
                      e.kind === 'section'
                        ? { ...e, pages: matches(labelOf(sectionKey(e.id), e.title)) ? e.pages : e.pages.filter(pageMatches) }
                        : e,
                    )
                    .filter((e) => (e.kind === 'page' ? pageMatches(e.url) : e.pages.length > 0))
                : group.entries
              if (query && !matches(labelOf(groupKey(group.id), group.title)) && visibleEntries.length === 0) return null
              const entries = query && matches(labelOf(groupKey(group.id), group.title)) ? group.entries : visibleEntries
              return (
                <SortableGroup
                  key={group.id}
                  group={group}
                  entries={entries}
                  urls={urls}
                  collapsed={!query && collapsed.has(group.id)}
                  onToggleCollapsed={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev)
                      if (next.has(group.id)) next.delete(group.id)
                      else next.add(group.id)
                      return next
                    })
                  }
                  setOn={setOn}
                  {...rowProps}
                />
              )
            })}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeLabel && (
              <div className='flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-lg'>
                <GripVertical className='size-4 text-muted-foreground' /> {activeLabel}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {query && !draft.groups.some((g) => g.entries.some((e) => (e.kind === 'page' ? pageMatches(e.url) : e.pages.some(pageMatches)))) && (
          <p className='py-8 text-center text-sm text-muted-foreground'>No pages match “{search}”.</p>
        )}
      </div>
    </ContentSection>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

interface RowProps {
  pages: Map<string, PageInfo>
  canEdit: boolean
  dragDisabled: boolean
  typeLabel: string
  defaultStates: Record<string, PageState>
  stateOf: (url: string) => PageState
  setStates: (urls: string[], state: PageState) => void
  labelOf: (key: string, fallback: string) => string
  setLabel: (key: string, original: string, value: string) => void
  targets: { key: string; label: string; sub: boolean }[]
  containerOfPage: (url: string) => string | null
  moveTo: (url: string, container: string) => void
}

function DragHandle({ disabled, label, ...props }: { disabled: boolean; label: string } & React.HTMLAttributes<HTMLButtonElement>) {
  if (disabled) return null
  return (
    <button
      type='button'
      aria-label={`Drag ${label}`}
      className='-ml-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing'
      {...props}
    >
      <GripVertical className='size-4' />
    </button>
  )
}

/** A title that turns into a text box on the pencil (Enter saves, Esc cancels, empty = original). */
function EditableTitle({
  value,
  original,
  canEdit,
  onSave,
  className,
}: {
  value: string
  original: string
  canEdit: boolean
  onSave: (value: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  const renamed = value !== original
  if (editing) {
    return (
      <Input
        autoFocus
        value={text}
        maxLength={60}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          onSave(text)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(text)
            setEditing(false)
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder={original}
        aria-label={`Name for ${original}`}
        className='h-7 min-w-0 flex-1 text-sm'
      />
    )
  }
  return (
    <span className='flex min-w-0 flex-1 items-center gap-1.5'>
      <span className={cn('truncate', className)} title={renamed ? `Originally “${original}”` : undefined}>
        {value}
      </span>
      {renamed && <span className='hidden shrink-0 truncate text-[10px] text-muted-foreground sm:inline'>({original})</span>}
      {canEdit && (
        <button
          type='button'
          onClick={() => {
            setText(value)
            setEditing(true)
          }}
          className='shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100'
          aria-label={`Rename ${value}`}
          title='Rename'
        >
          <Pencil className='size-3' />
        </button>
      )}
    </span>
  )
}

const STATES: { value: PageState; label: string; icon: React.ElementType }[] = [
  { value: 'shown', label: 'Shown in menu', icon: Eye },
  { value: 'menuHidden', label: 'Hidden in menu — still opens from links, search and Quick Links', icon: EyeOff },
  { value: 'off', label: 'Off — hidden everywhere, link blocked', icon: Ban },
]

function StateControl({ url, state, canEdit, onChange }: { url: string; state: PageState; canEdit: boolean; onChange: (s: PageState) => void }) {
  return (
    <div role='radiogroup' aria-label='Page state' className='flex shrink-0 items-center rounded-md border p-0.5'>
      {STATES.map(({ value, label, icon: Icon }) => {
        const active = state === value
        const disabled = !canEdit || (value === 'off' && LOCKED_URLS.has(url))
        return (
          <button
            key={value}
            type='button'
            role='radio'
            aria-checked={active}
            aria-label={label}
            title={value === 'off' && LOCKED_URLS.has(url) ? 'This page is always available' : label}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={cn(
              'flex size-6 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? value === 'shown'
                  ? 'bg-primary text-primary-foreground'
                  : value === 'menuHidden'
                    ? 'bg-amber-500 text-white'
                    : 'bg-muted-foreground text-background'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className='size-3.5' />
          </button>
        )
      })}
    </div>
  )
}

function SortableGroup({
  group,
  entries,
  urls,
  collapsed,
  onToggleCollapsed,
  setOn,
  ...row
}: RowProps & {
  group: Group
  entries: Entry[]
  urls: string[]
  collapsed: boolean
  onToggleCollapsed: () => void
  setOn: (urls: string[], on: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: GRP + group.id,
    disabled: row.dragDisabled,
  })
  const { setNodeRef: setDropRef } = useDroppable({ id: CONT + groupKey(group.id), disabled: row.dragDisabled })
  const on = urls.filter((u) => row.stateOf(u) !== 'off').length
  const title = row.labelOf(groupKey(group.id), group.title)
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('mb-4 overflow-hidden rounded-lg border bg-background', isDragging && 'opacity-40')}
    >
      <header className='flex items-center gap-2 bg-muted/40 px-3 py-2.5'>
        <DragHandle disabled={row.dragDisabled} label={title} {...attributes} {...listeners} />
        <button
          type='button'
          onClick={onToggleCollapsed}
          className='shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted'
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
        >
          <ChevronDown className={cn('size-4 transition-transform', collapsed && '-rotate-90')} />
        </button>
        <div className='min-w-0 flex-1'>
          <EditableTitle
            value={title}
            original={group.title}
            canEdit={row.canEdit}
            onSave={(v) => row.setLabel(groupKey(group.id), group.title, v)}
            className='text-sm font-semibold'
          />
          <p className='text-[11px] text-muted-foreground tabular-nums'>
            {on} of {urls.length} on
          </p>
        </div>
        <Switch
          checked={urls.length > 0 && on === urls.length}
          onCheckedChange={(v) => setOn(urls, v)}
          disabled={!row.canEdit}
          aria-label={`All ${title} pages on`}
        />
      </header>
      {!collapsed && (
        <SortableContext
          items={entries.map((e) => (e.kind === 'page' ? PG + e.url : SEC + e.id))}
          strategy={verticalListSortingStrategy}
        >
          <div ref={setDropRef} className='min-h-8 divide-y'>
            {entries.map((entry) =>
              entry.kind === 'page' ? (
                <SortablePage key={entry.url} url={entry.url} {...row} />
              ) : (
                <SortableSection key={entry.id} section={entry} setOn={setOn} {...row} />
              ),
            )}
          </div>
        </SortableContext>
      )}
    </section>
  )
}

function SortableSection({
  section,
  setOn,
  ...row
}: RowProps & { section: Extract<Entry, { kind: 'section' }>; setOn: (urls: string[], on: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: SEC + section.id,
    disabled: row.dragDisabled,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: CONT + sectionKey(section.id), disabled: row.dragDisabled })
  const on = section.pages.filter((u) => row.stateOf(u) !== 'off').length
  const title = row.labelOf(sectionKey(section.id), section.title)
  const Icon = section.icon
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && 'opacity-40')}>
      <div className='flex items-center gap-2 px-3 py-2'>
        <DragHandle disabled={row.dragDisabled} label={title} {...attributes} {...listeners} />
        {Icon && <Icon className='size-4 shrink-0 text-muted-foreground' />}
        <EditableTitle
          value={title}
          original={section.title}
          canEdit={row.canEdit}
          onSave={(v) => row.setLabel(sectionKey(section.id), section.title, v)}
          className='text-sm font-medium'
        />
        <span className='shrink-0 text-[11px] text-muted-foreground tabular-nums'>
          {on}/{section.pages.length}
        </span>
        <Switch
          checked={section.pages.length > 0 && on === section.pages.length}
          onCheckedChange={(v) => setOn(section.pages, v)}
          disabled={!row.canEdit || section.pages.length === 0}
          aria-label={`All ${title} pages on`}
        />
      </div>
      <SortableContext items={section.pages.map((u) => PG + u)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setDropRef}
          className={cn('ml-5 min-h-8 border-l-2 border-muted transition-colors', isOver && 'border-primary bg-primary/5')}
        >
          {section.pages.length === 0 && (
            <li className='px-3 py-2 text-xs italic text-muted-foreground'>Empty — drag pages here</li>
          )}
          {section.pages.map((url) => (
            <SortablePage key={url} url={url} {...row} />
          ))}
        </ul>
      </SortableContext>
    </div>
  )
}

function SortablePage({ url, ...row }: RowProps & { url: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: PG + url,
    disabled: row.dragDisabled,
  })
  const page = row.pages.get(url)
  if (!page) return null
  const Icon = page.icon
  const state = row.stateOf(url)
  const title = row.labelOf(pageKey(url), page.title)
  const offByDefault = row.defaultStates[url] === 'off'
  const here = row.containerOfPage(url)
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex list-none items-center gap-2 bg-background px-3 py-2',
        state !== 'shown' && 'bg-muted/20',
        isDragging && 'opacity-40',
      )}
    >
      <DragHandle disabled={row.dragDisabled} label={title} {...attributes} {...listeners} />
      {Icon && <Icon className={cn('size-4 shrink-0 opacity-70', state === 'off' && 'opacity-40')} />}
      <div className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-sm', state === 'off' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
        <EditableTitle value={title} original={page.title} canEdit={row.canEdit} onSave={(v) => row.setLabel(pageKey(url), page.title, v)} />
        {offByDefault && state === 'off' && (
          <Badge variant='outline' className='hidden h-5 shrink-0 px-1.5 text-[10px] font-normal no-underline sm:inline-flex'>
            Off for {row.typeLabel}
          </Badge>
        )}
      </div>
      <StateControl url={url} state={state} canEdit={row.canEdit} onChange={(s) => row.setStates([url], s)} />
      {row.canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type='button' className='shrink-0 rounded p-1 text-muted-foreground hover:bg-muted' aria-label={`More for ${title}`}>
              <MoreHorizontal className='size-4' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='max-h-80 w-64 overflow-y-auto'>
            <DropdownMenuLabel className='text-xs font-normal text-muted-foreground'>Move “{title}” to</DropdownMenuLabel>
            {row.targets.map((t) => (
              <DropdownMenuItem
                key={t.key}
                disabled={t.key === here}
                onSelect={() => row.moveTo(url, t.key)}
                className={cn('gap-2', t.sub && 'pl-6')}
              >
                {t.key === here ? <Check className='size-3.5' /> : t.sub ? <CornerDownRight className='size-3.5 opacity-50' /> : <span className='size-3.5' />}
                <span className='truncate'>{t.sub ? t.label : `${t.label} — main menu`}</span>
              </DropdownMenuItem>
            ))}
            {title !== page.title && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => row.setLabel(pageKey(url), page.title, '')}>
                  <RotateCcw className='mr-2 size-3.5' /> Use original name “{page.title}”
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}
