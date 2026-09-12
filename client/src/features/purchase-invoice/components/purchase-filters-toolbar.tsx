import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/stores/store'
import { fetchSuppliers } from '@/stores/supplier.slice'
import { fetchCategories } from '@/stores/category.slice'
import { useGetUsersQuery } from '@/stores/users.api'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { normalizeSuppliersList } from '../utils/catalog-helpers'
import {
  QUICK_FILTERS,
  SEARCH_FIELD_OPTIONS,
  SORT_OPTIONS,
  isQuickFilterActive,
  type PurchaseFilters,
  type PurchaseSearchField,
  type SavedView,
} from '../hooks/use-purchase-filters'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Outstanding' },
  { value: 'partial', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
]

const PAYMENT_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit', label: 'Credit' },
  { value: 'wallet', label: 'Bank / Wallet' },
]

const DUE_STATUS_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_today', label: 'Due today' },
  { value: 'due_soon', label: 'Due within 7 days' },
  { value: 'not_due', label: 'Not due yet' },
  { value: 'no_due_date', label: 'No due date' },
  { value: 'settled', label: 'Settled' },
]

interface MultiSelectFilterProps {
  label: string
  placeholder: string
  options: { value: string; label: string; sublabel?: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  searchable?: boolean
}

/**
 * Checkbox multi-select in a popover. Built here rather than pulled from ui/ because the
 * repo's SearchableSelect is deliberately single-value — every advanced filter on this
 * toolbar needs "any of these".
 */
function MultiSelectFilter({ label, placeholder, options, selected, onChange, searchable = true }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const selectedLabels = options.filter((option) => selected.includes(option.value)).map((option) => option.label)

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])

  return (
    <div className='space-y-1.5'>
      <Label className='text-xs font-medium text-muted-foreground'>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant='outline' role='combobox' className='w-full justify-between font-normal'>
            <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
              {selected.length === 0
                ? placeholder
                : selected.length === 1
                  ? selectedLabels[0]
                  : `${selected.length} selected`}
            </span>
            <ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[--radix-popover-trigger-width] min-w-[240px] p-0' align='start'>
          <Command>
            {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />}
            <CommandList>
              <CommandEmpty>No match found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.value} value={option.label} onSelect={() => toggle(option.value)}>
                    <Checkbox checked={selected.includes(option.value)} className='mr-2' />
                    <div className='min-w-0'>
                      <p className='truncate text-sm'>{option.label}</p>
                      {option.sublabel && <p className='truncate text-xs text-muted-foreground'>{option.sublabel}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {selected.length > 0 && (
            <div className='border-t p-2'>
              <Button variant='ghost' size='sm' className='w-full' onClick={() => onChange([])}>
                Clear selection
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export interface PurchaseFiltersToolbarProps {
  filters: PurchaseFilters
  draft: PurchaseFilters
  activeFilterCount: number
  onPatchImmediate: (patch: Partial<PurchaseFilters>) => void
  onPatchDraft: (patch: Partial<PurchaseFilters>) => void
  onApplyDraft: () => void
  onReset: () => void
  onToggleQuickFilter: (id: string) => void
  savedViews: SavedView[]
  onSaveView: (name: string) => void
  onApplyView: (view: SavedView) => void
  onDeleteView: (id: string) => void
  onExportCsv: () => void
  onExportPdf: () => void
  isExporting?: boolean
}

export function PurchaseFiltersToolbar({
  filters,
  draft,
  activeFilterCount,
  onPatchImmediate,
  onPatchDraft,
  onApplyDraft,
  onReset,
  onToggleQuickFilter,
  savedViews,
  onSaveView,
  onApplyView,
  onDeleteView,
  onExportCsv,
  onExportPdf,
  isExporting,
}: PurchaseFiltersToolbarProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [saveViewOpen, setSaveViewOpen] = useState(false)

  const suppliersRaw = useSelector((state: RootState) => state.supplier.data)
  const categories = useSelector((state: RootState) => state.category.categories)
  const { data: usersData } = useGetUsersQuery({ limit: 200 })
  const { data: branches } = useGetMyBranchesQuery()

  // The pickers only need their lists once the panel is actually opened — filters are a
  // secondary action, so fetching suppliers/categories on every list render would be waste.
  useEffect(() => {
    if (!advancedOpen) return
    dispatch(fetchSuppliers({ page: 1, limit: 1000 }))
    dispatch(fetchCategories({ page: 1, limit: 500 }))
  }, [advancedOpen, dispatch])

  const supplierOptions = useMemo(
    () =>
      normalizeSuppliersList(suppliersRaw).map((supplier) => ({
        value: String((supplier as any).id || supplier._id),
        label: supplier.name,
        sublabel: supplier.phone,
      })),
    [suppliersRaw]
  )

  const userOptions = useMemo(
    () => (usersData?.results || []).map((user) => ({ value: user.id, label: user.name, sublabel: user.email })),
    [usersData]
  )

  const categoryOptions = useMemo(
    () => (categories || []).map((category) => ({ value: category.id, label: category.name })),
    [categories]
  )

  /** Applied filters, as removable pills — the "what am I actually looking at" line. */
  const activePills = useMemo(() => {
    const pills: { key: string; label: string; clear: () => void }[] = []
    const labelFor = (options: { value: string; label: string }[], values: string[]) =>
      values.map((value) => options.find((option) => option.value === value)?.label || value).join(', ')

    if (filters.supplier.length)
      pills.push({ key: 'supplier', label: `Supplier: ${labelFor(supplierOptions, filters.supplier)}`, clear: () => onPatchImmediate({ supplier: [] }) })
    if (filters.paymentStatus.length)
      pills.push({ key: 'paymentStatus', label: `Payment: ${labelFor(PAYMENT_STATUS_OPTIONS, filters.paymentStatus)}`, clear: () => onPatchImmediate({ paymentStatus: [] }) })
    if (filters.paymentType.length)
      pills.push({ key: 'paymentType', label: `Type: ${labelFor(PAYMENT_TYPE_OPTIONS, filters.paymentType)}`, clear: () => onPatchImmediate({ paymentType: [] }) })
    if (filters.dueStatus.length)
      pills.push({ key: 'dueStatus', label: `Due: ${labelFor(DUE_STATUS_OPTIONS, filters.dueStatus)}`, clear: () => onPatchImmediate({ dueStatus: [] }) })
    if (filters.createdBy.length)
      pills.push({ key: 'createdBy', label: `Created by: ${labelFor(userOptions, filters.createdBy)}`, clear: () => onPatchImmediate({ createdBy: [] }) })
    if (filters.invoiceStatus)
      pills.push({ key: 'invoiceStatus', label: `Invoice: ${filters.invoiceStatus}`, clear: () => onPatchImmediate({ invoiceStatus: '' }) })
    if (filters.category)
      pills.push({ key: 'category', label: `Category: ${categoryOptions.find((option) => option.value === filters.category)?.label || filters.category}`, clear: () => onPatchImmediate({ category: '' }) })
    if (filters.branch)
      pills.push({ key: 'branch', label: `Warehouse: ${(branches || []).find((branch) => branch.id === filters.branch)?.name || filters.branch}`, clear: () => onPatchImmediate({ branch: '' }) })
    if (filters.startDate || filters.endDate)
      pills.push({ key: 'date', label: `Date: ${filters.startDate || '…'} → ${filters.endDate || '…'}`, clear: () => onPatchImmediate({ startDate: '', endDate: '' }) })
    if (filters.minAmount !== '' || filters.maxAmount !== '')
      pills.push({ key: 'amount', label: `Amount: ${filters.minAmount || '0'} – ${filters.maxAmount || '∞'}`, clear: () => onPatchImmediate({ minAmount: '', maxAmount: '' }) })

    return pills
  }, [filters, supplierOptions, userOptions, categoryOptions, branches, onPatchImmediate])

  const closeAdvanced = () => setAdvancedOpen(false)

  /** Applying is the end of the interaction — commit the draft, then get the panel out of
   *  the way so the rows it just filtered are actually visible. */
  const handleApplyFilters = () => {
    onApplyDraft()
    closeAdvanced()
  }

  const handleSaveView = () => {
    onSaveView(viewName)
    setViewName('')
    setSaveViewOpen(false)
  }

  return (
    <Card className='overflow-hidden'>
      <CardContent className='space-y-4 p-4'>
        {/* Search + sort + actions */}
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
          <div className='flex flex-1 items-center gap-2'>
            <Select
              value={filters.searchBy}
              onValueChange={(value) => onPatchImmediate({ searchBy: value as PurchaseSearchField })}
            >
              <SelectTrigger className='w-[140px] shrink-0' aria-label={t('Search by')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_FIELD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className='relative flex-1'>
              <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={filters.search}
                onChange={(event) => onPatchImmediate({ search: event.target.value })}
                placeholder={t('Search invoices, suppliers, products, bills...')}
                className='pl-9 pr-9'
              />
              {filters.search && (
                <button
                  type='button'
                  onClick={() => onPatchImmediate({ search: '' })}
                  className='absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted'
                  aria-label={t('Clear search')}
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Select value={filters.sortKey} onValueChange={(value) => onPatchImmediate({ sortKey: value })}>
              <SelectTrigger className='w-[165px]' aria-label={t('Sort by')}>
                <SlidersHorizontal className='mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant='outline'
              size='icon'
              title={filters.sortOrder === 'asc' ? t('Ascending') : t('Descending')}
              onClick={() => onPatchImmediate({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
            >
              {filters.sortOrder === 'asc' ? <ArrowUpAZ className='h-4 w-4' /> : <ArrowDownAZ className='h-4 w-4' />}
            </Button>

            <Button variant={advancedOpen ? 'secondary' : 'outline'} onClick={() => setAdvancedOpen((open) => !open)}>
              <Filter className='mr-2 h-4 w-4' />
              {t('Filters')}
              {activeFilterCount > 0 && (
                <Badge className='ml-2 h-5 min-w-5 justify-center px-1 text-[11px]' variant='secondary'>
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline'>
                  <Bookmark className='mr-2 h-4 w-4' />
                  {t('Views')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-64'>
                <DropdownMenuLabel>{t('Saved views')}</DropdownMenuLabel>
                {savedViews.length === 0 && (
                  <p className='px-2 py-1.5 text-xs text-muted-foreground'>{t('No saved views yet')}</p>
                )}
                {savedViews.map((view) => (
                  <DropdownMenuItem key={view.id} onSelect={() => onApplyView(view)} className='justify-between'>
                    <span className='truncate'>{view.name}</span>
                    <button
                      type='button'
                      aria-label={t('Delete view')}
                      className='ml-2 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive'
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteView(view.id)
                      }}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className='p-2' onKeyDown={(event) => event.stopPropagation()}>
                  {saveViewOpen ? (
                    <div className='space-y-2'>
                      <Input
                        autoFocus
                        value={viewName}
                        onChange={(event) => setViewName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') handleSaveView()
                        }}
                        placeholder={t('View name')}
                        className='h-8'
                      />
                      <Button size='sm' className='w-full' onClick={handleSaveView} disabled={!viewName.trim()}>
                        {t('Save current filters')}
                      </Button>
                    </div>
                  ) : (
                    <Button variant='ghost' size='sm' className='w-full justify-start' onClick={() => setSaveViewOpen(true)}>
                      <BookmarkPlus className='mr-2 h-4 w-4' />
                      {t('Save view')}
                    </Button>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' disabled={isExporting}>
                  <Download className='mr-2 h-4 w-4' />
                  {t('Export')}
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

            <Button variant='ghost' onClick={onReset} title={t('Reset all filters')}>
              <RotateCcw className='mr-2 h-4 w-4' />
              {t('Reset')}
            </Button>
          </div>
        </div>

        {/* Quick filters */}
        <div className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-1'>
          {QUICK_FILTERS.map((quick) => {
            const active = isQuickFilterActive(quick.id, filters)
            return (
              <button
                key={quick.id}
                type='button'
                onClick={() => onToggleQuickFilter(quick.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {t(quick.label)}
              </button>
            )
          })}
        </div>

        {/* Applied filter pills */}
        {activePills.length > 0 && (
          <div className='flex flex-wrap items-center gap-2'>
            {activePills.map((pill) => (
              <Badge key={pill.key} variant='secondary' className='gap-1 pr-1 font-normal'>
                <span className='max-w-[260px] truncate'>{pill.label}</span>
                <button type='button' onClick={pill.clear} className='rounded-sm p-0.5 hover:bg-background/60' aria-label={t('Remove filter')}>
                  <X className='h-3 w-3' />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Advanced filters */}
        {advancedOpen && (
          <div
            role='region'
            aria-label={t('Advanced filters')}
            // Escape closes the panel like any other dismissible surface. It is inline
            // rather than a Radix popover/dialog, so that behaviour has to be wired here.
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                closeAdvanced()
              }
            }}
            className='rounded-lg border bg-muted/30 p-4'
          >
            <div className='mb-4 flex items-center justify-between gap-2'>
              <div>
                <h3 className='text-sm font-semibold'>{t('Advanced filters')}</h3>
                <p className='text-xs text-muted-foreground'>
                  {t('Nothing is applied until you press Apply Filters.')}
                </p>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='h-7 w-7 shrink-0'
                onClick={closeAdvanced}
                aria-label={t('Close filters')}
                title={t('Close filters')}
              >
                <X className='h-4 w-4' />
              </Button>
            </div>

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <MultiSelectFilter
                label={t('Supplier')}
                placeholder={t('All suppliers')}
                options={supplierOptions}
                selected={draft.supplier}
                onChange={(values) => onPatchDraft({ supplier: values })}
              />
              <MultiSelectFilter
                label={t('Payment Status')}
                placeholder={t('Any status')}
                options={PAYMENT_STATUS_OPTIONS}
                selected={draft.paymentStatus}
                onChange={(values) => onPatchDraft({ paymentStatus: values })}
                searchable={false}
              />
              <MultiSelectFilter
                label={t('Payment Type')}
                placeholder={t('Any type')}
                options={PAYMENT_TYPE_OPTIONS}
                selected={draft.paymentType}
                onChange={(values) => onPatchDraft({ paymentType: values })}
                searchable={false}
              />
              <MultiSelectFilter
                label={t('Due Status')}
                placeholder={t('Any due status')}
                options={DUE_STATUS_OPTIONS}
                selected={draft.dueStatus}
                onChange={(values) => onPatchDraft({ dueStatus: values })}
                searchable={false}
              />

              <div className='space-y-1.5'>
                <Label className='text-xs font-medium text-muted-foreground'>{t('Date Range')}</Label>
                <div className='flex items-center gap-2'>
                  <Input
                    type='date'
                    value={draft.startDate}
                    max={draft.endDate || undefined}
                    onChange={(event) => onPatchDraft({ startDate: event.target.value })}
                  />
                  <span className='text-muted-foreground'>–</span>
                  <Input
                    type='date'
                    value={draft.endDate}
                    min={draft.startDate || undefined}
                    onChange={(event) => onPatchDraft({ endDate: event.target.value })}
                  />
                </div>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs font-medium text-muted-foreground'>{t('Amount Range')}</Label>
                <div className='flex items-center gap-2'>
                  <Input
                    type='number'
                    min={0}
                    placeholder={t('Min')}
                    value={draft.minAmount}
                    onChange={(event) => onPatchDraft({ minAmount: event.target.value })}
                  />
                  <span className='text-muted-foreground'>–</span>
                  <Input
                    type='number'
                    min={0}
                    placeholder={t('Max')}
                    value={draft.maxAmount}
                    onChange={(event) => onPatchDraft({ maxAmount: event.target.value })}
                  />
                </div>
              </div>

              <MultiSelectFilter
                label={t('Created By')}
                placeholder={t('Anyone')}
                options={userOptions}
                selected={draft.createdBy}
                onChange={(values) => onPatchDraft({ createdBy: values })}
              />

              <div className='space-y-1.5'>
                <Label className='text-xs font-medium text-muted-foreground'>{t('Category')}</Label>
                <Select
                  value={draft.category || 'all'}
                  onValueChange={(value) => onPatchDraft({ category: value === 'all' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('All categories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>{t('All categories')}</SelectItem>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs font-medium text-muted-foreground'>{t('Warehouse')}</Label>
                <Select
                  value={draft.branch || 'all'}
                  onValueChange={(value) => onPatchDraft({ branch: value === 'all' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Current branch')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>{t('Current branch')}</SelectItem>
                    {(branches || []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs font-medium text-muted-foreground'>{t('Invoice Status')}</Label>
                <Select
                  value={draft.invoiceStatus || 'all'}
                  onValueChange={(value) => onPatchDraft({ invoiceStatus: value === 'all' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Any')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>{t('Any')}</SelectItem>
                    <SelectItem value='completed'>{t('Completed')}</SelectItem>
                    <SelectItem value='pending'>{t('Pending')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator className='my-4' />

            <div className='flex flex-wrap items-center justify-end gap-2'>
              <Button variant='ghost' onClick={onReset}>
                <RotateCcw className='mr-2 h-4 w-4' />
                {t('Reset')}
              </Button>
              <Button variant='outline' onClick={closeAdvanced}>
                {t('Cancel')}
              </Button>
              <Button onClick={handleApplyFilters}>
                <Filter className='mr-2 h-4 w-4' />
                {t('Apply Filters')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
