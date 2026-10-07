import { useMemo, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import type {
  OrderFilterOptions,
  OrderSort,
  OrderType,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  PRIORITIES,
  PRIORITY_META,
  PRODUCTION_STATUSES,
  PRODUCT_TYPES,
  PRODUCT_TYPE_META,
  statusLabel,
} from '../lib/constants'
import {
  DATE_PRESETS,
  QUICK_FILTERS,
  SEARCH_FIELDS,
  SORT_OPTIONS,
  datePresetLabel,
  isQuickFilterActive,
  type DateFilter,
  type OrderFilters,
  type SavedView,
  type SearchField,
} from '../lib/order-filters'

interface Option {
  value: string
  label: string
  sublabel?: string
}

/** Checkbox multi-select in a popover — the same control the invoice filters use. */
function MultiSelectFilter({
  label,
  placeholder,
  options,
  selected,
  onChange,
  searchable = true,
}: {
  label: string
  placeholder: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  searchable?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const chosen = options.filter((o) => selected.includes(o.value))
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  return (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs font-medium'>
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-label={label}
            className='w-full justify-between font-normal'
          >
            <span
              className={cn(
                'truncate',
                selected.length === 0 && 'text-muted-foreground'
              )}
            >
              {selected.length === 0
                ? placeholder
                : selected.length === 1
                  ? chosen[0]?.label || selected[0]
                  : t('{{n}} selected').replace(
                      '{{n}}',
                      String(selected.length)
                    )}
            </span>
            <ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className='w-[--radix-popover-trigger-width] min-w-[240px] p-0'
          align='start'
        >
          <Command>
            {searchable && options.length > 6 && (
              <CommandInput placeholder={t('Search…')} />
            )}
            <CommandList>
              <CommandEmpty>{t('No match found.')}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.sublabel || ''}`}
                    onSelect={() => toggle(o.value)}
                  >
                    <Checkbox
                      checked={selected.includes(o.value)}
                      className='mr-2'
                      aria-hidden
                      tabIndex={-1}
                    />
                    <div className='min-w-0'>
                      <p className='truncate text-sm'>{o.label}</p>
                      {o.sublabel && (
                        <p className='text-muted-foreground truncate text-xs'>
                          {o.sublabel}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {selected.length > 0 && (
            <div className='border-t p-2'>
              <Button
                variant='ghost'
                size='sm'
                className='w-full'
                onClick={() => onChange([])}
              >
                {t('Clear selection')}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** A date field: preset list first (nobody fights a calendar for "this month"), custom behind it. */
function DateRangeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: DateFilter
  onChange: (value: DateFilter) => void
}) {
  const { t } = useLanguage()
  return (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs font-medium'>
        {label}
      </Label>
      <Select
        value={value.preset || 'any'}
        onValueChange={(v) =>
          onChange({
            preset: (v === 'any' ? '' : v) as DateFilter['preset'],
            from: v === 'custom' ? value.from : '',
            to: v === 'custom' ? value.to : '',
          })
        }
      >
        <SelectTrigger aria-label={label} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='any'>{t('Any date')}</SelectItem>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {t(p.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === 'custom' && (
        <div className='flex items-center gap-2'>
          <Input
            type='date'
            value={value.from}
            max={value.to || undefined}
            aria-label={`${label} ${t('from')}`}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <span className='text-muted-foreground'>–</span>
          <Input
            type='date'
            value={value.to}
            min={value.from || undefined}
            aria-label={`${label} ${t('to')}`}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}

function RangeField({
  label,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string
  min: string
  max: string
  onChange: (min: string, max: string) => void
  suffix?: string
}) {
  const { t } = useLanguage()
  return (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs font-medium'>
        {label}
        {suffix ? ` (${suffix})` : ''}
      </Label>
      <div className='flex items-center gap-2'>
        <Input
          type='number'
          min={0}
          placeholder={t('Min')}
          aria-label={`${label} ${t('minimum')}`}
          value={min}
          onChange={(e) => onChange(e.target.value, max)}
        />
        <span className='text-muted-foreground'>–</span>
        <Input
          type='number'
          min={0}
          placeholder={t('Max')}
          aria-label={`${label} ${t('maximum')}`}
          value={max}
          onChange={(e) => onChange(min, e.target.value)}
        />
      </div>
    </div>
  )
}

const FLAGS = [
  ['delayed', 'Delayed only'],
  ['overdue', 'Overdue only'],
  ['hasShortage', 'Has shortage'],
  ['hasQcIssue', 'Has QC issue'],
  ['hasScrap', 'Has scrap'],
  ['hasRework', 'Has rework'],
] as const

export interface OrderFiltersToolbarProps {
  orderType: OrderType
  filters: OrderFilters
  draft: OrderFilters
  activeCount: number
  options?: OrderFilterOptions
  onPatch: (patch: Partial<OrderFilters>) => void
  onPatchDraft: (patch: Partial<OrderFilters>) => void
  onApply: () => void
  onDiscard: () => void
  onReset: () => void
  onToggleQuick: (id: string) => void
  views: SavedView[]
  onSaveView: (name: string) => void
  onApplyView: (view: SavedView) => void
  onDeleteView: (id: string) => void
  onExportCsv: () => void
  onExportPdf: () => void
  onPrint: () => void
  exporting?: boolean
}

export function OrderFiltersToolbar({
  orderType,
  filters,
  draft,
  activeCount,
  options,
  onPatch,
  onPatchDraft,
  onApply,
  onDiscard,
  onReset,
  onToggleQuick,
  views,
  onSaveView,
  onApplyView,
  onDeleteView,
  onExportCsv,
  onExportPdf,
  onPrint,
  exporting,
}: OrderFiltersToolbarProps) {
  const { t } = useLanguage()
  const [panelOpen, setPanelOpen] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [viewName, setViewName] = useState('')

  const statusOptions: Option[] = PRODUCTION_STATUSES.filter((s) =>
    orderType === 'assembly' ? s !== 'planned' : s !== 'qc_pending'
  ).map((s) => ({ value: s, label: t(statusLabel(s, orderType)) }))
  const priorityOptions: Option[] = PRIORITIES.map((p) => ({
    value: p,
    label: t(PRIORITY_META[p].label),
  }))
  const typeOptions: Option[] = PRODUCT_TYPES.map((p) => ({
    value: p,
    label: t(PRODUCT_TYPE_META[p].label),
  }))
  const opts = useMemo(
    () => ({
      warehouse: (options?.warehouses || []).map((w) => ({
        value: w,
        label: w,
      })),
      workCenter: (options?.workCenters || []).map((w) => ({
        value: w,
        label: w,
      })),
      branch: (options?.branches || []).map((b) => ({
        value: b.id,
        label: b.name,
      })),
      bom: (options?.boms || []).map((b) => ({
        value: b.id,
        label: b.label,
        sublabel: b.productName,
      })),
      operator: (options?.operators || []).map((o) => ({
        value: o.id,
        label: o.name,
      })),
      createdBy: (options?.createdBy || []).map((u) => ({
        value: u.id,
        label: u.name,
        sublabel: u.email,
      })),
    }),
    [options]
  )

  /** What is applied right now, as removable pills — "what am I looking at". */
  const pills = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = []
    const names = (list: Option[], values: string[]) =>
      values.map((v) => list.find((o) => o.value === v)?.label || v).join(', ')
    const lists: [keyof OrderFilters, string, Option[]][] = [
      ['status', 'Status', statusOptions],
      ['priority', 'Priority', priorityOptions],
      ['warehouse', 'Warehouse', opts.warehouse],
      ['branch', 'Branch', opts.branch],
      ['bom', 'BOM', opts.bom],
      ['productType', 'Product type', typeOptions],
      ['workCenter', 'Work center', opts.workCenter],
      ['operator', 'Operator', opts.operator],
      ['createdBy', 'Created by', opts.createdBy],
    ]
    lists.forEach(([key, label, list]) => {
      const values = filters[key] as string[]
      if (values.length)
        out.push({
          key,
          label: `${t(label)}: ${names(list, values)}`,
          clear: () => onPatch({ [key]: [] }),
        })
    })
    ;(
      [
        ['production', 'Production date'],
        ['due', 'Due date'],
        ['completed', 'Completed'],
      ] as const
    ).forEach(([key, label]) => {
      if (filters[key].preset)
        out.push({
          key,
          label: `${t(label)}: ${t(datePresetLabel(filters[key]))}`,
          clear: () => onPatch({ [key]: { preset: '', from: '', to: '' } }),
        })
    })
    if (filters.quantityMin || filters.quantityMax)
      out.push({
        key: 'qty',
        label: `${t('Quantity')}: ${filters.quantityMin || '0'} – ${filters.quantityMax || '∞'}`,
        clear: () => onPatch({ quantityMin: '', quantityMax: '' }),
      })
    if (filters.completionMin || filters.completionMax)
      out.push({
        key: 'pct',
        label: `${t('Completion')}: ${filters.completionMin || '0'}% – ${filters.completionMax || '100'}%`,
        clear: () => onPatch({ completionMin: '', completionMax: '' }),
      })
    FLAGS.forEach(([key, label]) => {
      if (filters[key])
        out.push({
          key,
          label: t(label),
          clear: () => onPatch({ [key]: false }),
        })
    })
    return out
  }, [filters, opts, statusOptions, priorityOptions, typeOptions, onPatch, t])

  const closePanel = () => {
    onDiscard()
    setPanelOpen(false)
  }
  const applyPanel = () => {
    onApply()
    setPanelOpen(false)
  }
  const saveView = () => {
    onSaveView(viewName)
    setViewName('')
    setSavingView(false)
  }
  const sortMeta = SORT_OPTIONS.find((s) => s.value === filters.sort)

  return (
    <Card className='overflow-hidden py-0'>
      <CardContent className='space-y-4 p-4 max-sm:p-3'>
        {/* Search + sort + actions */}
        <div className='flex flex-col gap-3 xl:flex-row xl:items-center'>
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            <Select
              value={filters.searchBy}
              onValueChange={(v) => onPatch({ searchBy: v as SearchField })}
            >
              <SelectTrigger
                className='w-[130px] shrink-0'
                aria-label={t('Search by')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {t(f.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className='relative min-w-0 flex-1'>
              <Search
                className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2'
                aria-hidden
              />
              <Input
                value={filters.search}
                onChange={(e) => onPatch({ search: e.target.value })}
                placeholder={
                  filters.searchBy === 'order'
                    ? t('Search production order number')
                    : filters.searchBy === 'product'
                      ? t('Search product name or SKU')
                      : t('Search orders')
                }
                aria-label={t('Search orders')}
                showVoiceInput={false}
                className='pr-9 pl-9'
              />
              {filters.search && (
                <button
                  type='button'
                  onClick={() => onPatch({ search: '' })}
                  className='text-muted-foreground hover:bg-muted absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1'
                  aria-label={t('Clear search')}
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Select
              value={filters.sort}
              onValueChange={(v) =>
                onPatch({
                  sort: v as OrderSort,
                  dir: SORT_OPTIONS.find((s) => s.value === v)?.dir || 'desc',
                })
              }
            >
              <SelectTrigger className='w-[160px]' aria-label={t('Sort by')}>
                <SlidersHorizontal className='text-muted-foreground mr-2 h-3.5 w-3.5 shrink-0' />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {t(s.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant='outline'
              size='icon'
              aria-label={
                filters.dir === 'asc'
                  ? t('Ascending — switch to descending')
                  : t('Descending — switch to ascending')
              }
              title={filters.dir === 'asc' ? t('Ascending') : t('Descending')}
              onClick={() =>
                onPatch({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })
              }
              disabled={
                sortMeta?.value === 'newest' || sortMeta?.value === 'oldest'
              }
            >
              {filters.dir === 'asc' ? (
                <ArrowUpNarrowWide className='h-4 w-4' />
              ) : (
                <ArrowDownWideNarrow className='h-4 w-4' />
              )}
            </Button>

            <Button
              variant={panelOpen ? 'secondary' : 'outline'}
              onClick={() => (panelOpen ? closePanel() : setPanelOpen(true))}
              aria-expanded={panelOpen}
            >
              <Filter className='mr-2 h-4 w-4' />
              {t('Filters')}
              {activeCount > 0 && (
                <Badge
                  className='ml-2 h-5 min-w-5 justify-center px-1 text-[11px]'
                  variant='secondary'
                >
                  {activeCount}
                </Badge>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline'>
                  <Bookmark className='h-4 w-4 sm:mr-2' />
                  <span className='max-sm:sr-only'>{t('Views')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-72'>
                <DropdownMenuLabel>{t('Saved views')}</DropdownMenuLabel>
                {views.map((view) => (
                  <DropdownMenuItem
                    key={view.id}
                    onSelect={() => onApplyView(view)}
                    className='justify-between'
                  >
                    <span className='truncate'>{t(view.name)}</span>
                    {view.builtIn ? (
                      <span className='text-muted-foreground ml-2 shrink-0 text-[10px] tracking-wide uppercase'>
                        {t('Preset')}
                      </span>
                    ) : (
                      <button
                        type='button'
                        aria-label={t('Delete view {{n}}').replace(
                          '{{n}}',
                          view.name
                        )}
                        className='text-muted-foreground hover:text-destructive ml-2 shrink-0 rounded-sm p-0.5'
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteView(view.id)
                        }}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </button>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className='p-2' onKeyDown={(e) => e.stopPropagation()}>
                  {savingView ? (
                    <div className='space-y-2'>
                      <Input
                        autoFocus
                        value={viewName}
                        onChange={(e) => setViewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveView()
                        }}
                        placeholder={t('View name, e.g. My delayed orders')}
                        aria-label={t('View name')}
                        showVoiceInput={false}
                        className='h-8'
                      />
                      <Button
                        size='sm'
                        className='w-full'
                        onClick={saveView}
                        disabled={!viewName.trim()}
                      >
                        {t('Save current filters')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='w-full justify-start'
                      onClick={() => setSavingView(true)}
                    >
                      <BookmarkPlus className='mr-2 h-4 w-4' />
                      {t('Save current view')}
                    </Button>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' disabled={exporting}>
                  <Download className='h-4 w-4 sm:mr-2' />
                  <span className='max-sm:sr-only'>
                    {exporting ? t('Exporting…') : t('Export')}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onSelect={onExportCsv}>
                  <FileSpreadsheet className='mr-2 h-4 w-4' />
                  {t('Export CSV')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onExportPdf}>
                  <FileText className='mr-2 h-4 w-4' />
                  {t('Export PDF')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant='outline' onClick={onPrint} disabled={exporting}>
              <Printer className='h-4 w-4 sm:mr-2' />
              <span className='max-sm:sr-only'>{t('Print')}</span>
            </Button>

            <Button
              variant='ghost'
              onClick={onReset}
              title={t('Reset all filters')}
            >
              <RotateCcw className='h-4 w-4 sm:mr-2' />
              <span className='max-sm:sr-only'>{t('Reset')}</span>
            </Button>
          </div>
        </div>

        {/* Quick filters */}
        <div
          className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]'
          role='group'
          aria-label={t('Quick filters')}
        >
          {QUICK_FILTERS.map((q) => {
            const active = isQuickFilterActive(q.id, filters)
            return (
              <button
                key={q.id}
                type='button'
                aria-pressed={active}
                onClick={() => onToggleQuick(q.id)}
                className={cn(
                  'focus-visible:ring-ring h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 max-sm:h-9',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {t(q.label)}
              </button>
            )
          })}
        </div>

        {/* Applied filters */}
        {pills.length > 0 && (
          <div className='flex flex-wrap items-center gap-2'>
            {pills.map((pill) => (
              <Badge
                key={pill.key}
                variant='secondary'
                className='gap-1 pr-1 font-normal'
              >
                <span className='max-w-[280px] truncate'>{pill.label}</span>
                <button
                  type='button'
                  onClick={pill.clear}
                  className='hover:bg-background/60 rounded-sm p-0.5'
                  aria-label={t('Remove filter {{f}}').replace(
                    '{{f}}',
                    pill.label
                  )}
                >
                  <X className='h-3 w-3' />
                </button>
              </Badge>
            ))}
            <Button
              variant='link'
              size='sm'
              className='h-auto px-1 text-xs'
              onClick={onReset}
            >
              {t('Clear all')}
            </Button>
          </div>
        )}

        {/* Advanced filters */}
        {panelOpen && (
          <div
            role='region'
            aria-label={t('Advanced filters')}
            onKeyDown={(e) => {
              // Popovers inside the panel render in a portal, but React still bubbles
              // their key events here — only an Escape pressed in the panel itself
              // should close it (the popover's own Escape just closes the popover).
              if (
                e.key === 'Escape' &&
                e.currentTarget.contains(e.target as Node)
              ) {
                e.stopPropagation()
                closePanel()
              }
            }}
            className='bg-muted/30 rounded-lg border p-4'
          >
            <div className='mb-4 flex items-center justify-between gap-2'>
              <div>
                <h3 className='text-sm font-semibold'>
                  {t('Advanced filters')}
                </h3>
                <p className='text-muted-foreground text-xs'>
                  {t('Nothing is applied until you press Apply filters.')}
                </p>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='h-7 w-7 shrink-0'
                onClick={closePanel}
                aria-label={t('Close filters')}
              >
                <X className='h-4 w-4' />
              </Button>
            </div>

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <MultiSelectFilter
                label={t('Status')}
                placeholder={t('Any status')}
                options={statusOptions}
                selected={draft.status}
                onChange={(v) => onPatchDraft({ status: v })}
                searchable={false}
              />
              <MultiSelectFilter
                label={t('Priority')}
                placeholder={t('Any priority')}
                options={priorityOptions}
                selected={draft.priority}
                onChange={(v) => onPatchDraft({ priority: v })}
                searchable={false}
              />
              <DateRangeField
                label={t('Production date')}
                value={draft.production}
                onChange={(v) => onPatchDraft({ production: v })}
              />
              <DateRangeField
                label={t('Due date')}
                value={draft.due}
                onChange={(v) => onPatchDraft({ due: v })}
              />
              <MultiSelectFilter
                label={t('Warehouse')}
                placeholder={t('Any warehouse')}
                options={opts.warehouse}
                selected={draft.warehouse}
                onChange={(v) => onPatchDraft({ warehouse: v })}
              />
              <MultiSelectFilter
                label={t('Branch')}
                placeholder={t('Current branch')}
                options={opts.branch}
                selected={draft.branch}
                onChange={(v) => onPatchDraft({ branch: v })}
              />
              <MultiSelectFilter
                label={t('BOM')}
                placeholder={t('Any BOM')}
                options={opts.bom}
                selected={draft.bom}
                onChange={(v) => onPatchDraft({ bom: v })}
              />
              <MultiSelectFilter
                label={t('Product type')}
                placeholder={t('Any type')}
                options={typeOptions}
                selected={draft.productType}
                onChange={(v) => onPatchDraft({ productType: v })}
                searchable={false}
              />
              <MultiSelectFilter
                label={t('Work center')}
                placeholder={t('Any work center')}
                options={opts.workCenter}
                selected={draft.workCenter}
                onChange={(v) => onPatchDraft({ workCenter: v })}
              />
              <MultiSelectFilter
                label={t('Operator')}
                placeholder={t('Anyone')}
                options={opts.operator}
                selected={draft.operator}
                onChange={(v) => onPatchDraft({ operator: v })}
              />
              <MultiSelectFilter
                label={t('Created by')}
                placeholder={t('Anyone')}
                options={opts.createdBy}
                selected={draft.createdBy}
                onChange={(v) => onPatchDraft({ createdBy: v })}
              />
              <DateRangeField
                label={t('Completion date')}
                value={draft.completed}
                onChange={(v) => onPatchDraft({ completed: v })}
              />
              <RangeField
                label={t('Quantity')}
                min={draft.quantityMin}
                max={draft.quantityMax}
                onChange={(quantityMin, quantityMax) =>
                  onPatchDraft({ quantityMin, quantityMax })
                }
              />
              <RangeField
                label={t('Completion')}
                suffix='%'
                min={draft.completionMin}
                max={draft.completionMax}
                onChange={(completionMin, completionMax) =>
                  onPatchDraft({ completionMin, completionMax })
                }
              />
            </div>

            <fieldset className='mt-4'>
              <legend className='text-muted-foreground mb-2 text-xs font-medium'>
                {t('Only show orders that…')}
              </legend>
              <div className='grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6'>
                {FLAGS.map(([key, label]) => (
                  <label
                    key={key}
                    className='hover:bg-muted/60 flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm'
                  >
                    <Checkbox
                      checked={draft[key]}
                      onCheckedChange={(v) => onPatchDraft({ [key]: !!v })}
                    />
                    {t(label)}
                  </label>
                ))}
              </div>
            </fieldset>

            <Separator className='my-4' />

            <div className='flex flex-wrap items-center justify-end gap-2'>
              <Button variant='ghost' onClick={onReset}>
                <RotateCcw className='mr-2 h-4 w-4' />
                {t('Reset')}
              </Button>
              <Button variant='outline' onClick={closePanel}>
                {t('Cancel')}
              </Button>
              <Button onClick={applyPanel}>
                <Filter className='mr-2 h-4 w-4' />
                {t('Apply filters')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
